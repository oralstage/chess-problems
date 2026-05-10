/**
 * GET /api/my-snapshot?sessionId=xxx&dev=0|1
 *
 * Returns ALL synced data for the given session in one response:
 *   - rating: reconstructed Glicko-2 from rating_events
 *   - progress: latest solve_event per problem (status + timestamps)
 *   - bookmarks: per-genre arrays
 *   - reviewQueue: FSRS state per problem
 *
 * Used by the Sync feature to mirror an account onto a new device.
 */

import { updateRating } from '../utils/glicko2';

interface SolveProgressRow {
  problem_id: number;
  correct: number;
  wrong_move_count: number;
  hint_used: number;
  genre: string;
  created_at: string;
}

interface LastRatingEventRow {
  player_rating: number;
  player_rd: number;
  problem_rating: number;
  problem_rd: number;
  score: number;
}

interface BookmarkRow {
  genre: string;
  problem_id: number;
}

interface ReviewStateRow {
  problem_id: number;
  stability: number;
  difficulty: number;
  is_new: number;
  due_date: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const sessionId = url.searchParams.get('sessionId');
  const dev = url.searchParams.get('dev') === '1' ? 1 : 0;

  if (!sessionId || sessionId.length > 64 || sessionId.length < 8) {
    return Response.json({ error: 'Invalid sessionId' }, { status: 400 });
  }

  // Run all queries in parallel
  const [storedRating, lastEventRow, ratingEventCountRow, progressRows, bookmarkRows, reviewRows] = await Promise.all([
    context.env.STATS_DB.prepare(
      `SELECT rating, rd, volatility, solve_count
       FROM player_ratings
       WHERE session_id = ? AND dev = ?`
    ).bind(sessionId, dev).first<{ rating: number; rd: number; volatility: number; solve_count: number }>(),

    context.env.STATS_DB.prepare(
      `SELECT player_rating, player_rd, problem_rating, problem_rd, score
       FROM rating_events
       WHERE session_id = ? AND dev = ?
       ORDER BY created_at DESC, problem_id DESC
       LIMIT 1`
    ).bind(sessionId, dev).first<LastRatingEventRow>(),

    context.env.STATS_DB.prepare(
      `SELECT COUNT(*) AS n FROM rating_events WHERE session_id = ? AND dev = ?`
    ).bind(sessionId, dev).first<{ n: number }>(),

    context.env.STATS_DB.prepare(
      `SELECT problem_id, correct, wrong_move_count, hint_used, genre, created_at
       FROM (
         SELECT problem_id, correct, wrong_move_count, hint_used, genre, created_at,
                ROW_NUMBER() OVER (PARTITION BY problem_id ORDER BY created_at DESC) AS rn
         FROM solve_events
         WHERE session_id = ? AND dev = ?
       )
       WHERE rn = 1`
    ).bind(sessionId, dev).all<SolveProgressRow>(),

    context.env.STATS_DB.prepare(
      `SELECT genre, problem_id FROM bookmarks WHERE session_id = ? AND dev = ?`
    ).bind(sessionId, dev).all<BookmarkRow>(),

    context.env.STATS_DB.prepare(
      `SELECT problem_id, stability, difficulty, is_new, due_date
       FROM review_state
       WHERE session_id = ? AND dev = ?`
    ).bind(sessionId, dev).all<ReviewStateRow>(),
  ]);

  const totalRatingEvents = ratingEventCountRow?.n ?? 0;

  // Empty result -> 404 (let client know code is invalid)
  if (
    !storedRating &&
    totalRatingEvents === 0 &&
    progressRows.results.length === 0 &&
    bookmarkRows.results.length === 0 &&
    reviewRows.results.length === 0
  ) {
    return Response.json({ error: 'No data found for this code' }, { status: 404 });
  }

  // ── Rating ──
  let rating: { rating: number; rd: number; vol: number; solveCount: number } | null = null;
  if (storedRating) {
    // Fast path
    rating = {
      rating: storedRating.rating,
      rd: storedRating.rd,
      vol: storedRating.volatility,
      solveCount: storedRating.solve_count,
    };
  } else if (lastEventRow) {
    // Fallback: derive rating from the latest event using the client's snapshot.
    // Replaying from default is wrong for sessions whose history pre-dates the events
    // table — RD compounding diverges. Last-event snapshot matches the client.
    const final = updateRating(
      { rating: lastEventRow.player_rating, rd: lastEventRow.player_rd, vol: 0.06 },
      { rating: lastEventRow.problem_rating, rd: lastEventRow.problem_rd },
      lastEventRow.score,
    );
    rating = { rating: final.rating, rd: final.rd, vol: final.vol, solveCount: totalRatingEvents };
    // Persist for next time
    await context.env.STATS_DB.prepare(
      `INSERT INTO player_ratings (session_id, dev, rating, rd, volatility, solve_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(session_id, dev) DO UPDATE SET
         rating = excluded.rating,
         rd = excluded.rd,
         volatility = excluded.volatility,
         solve_count = excluded.solve_count,
         updated_at = excluded.updated_at`
    ).bind(
      sessionId, dev,
      final.rating, final.rd, final.vol,
      totalRatingEvents,
    ).run();
  }

  // ── Progress + timestamps ──
  type GenreKey = 'direct' | 'help' | 'self' | 'study' | 'retro';
  const VALID_GENRES: ReadonlyArray<GenreKey> = ['direct', 'help', 'self', 'study', 'retro'];
  const progress: Record<GenreKey, Record<string, 'solved' | 'failed'>> = {
    direct: {}, help: {}, self: {}, study: {}, retro: {},
  };
  const timestamps: Record<string, number> = {};
  for (const row of progressRows.results) {
    const genre = row.genre as GenreKey;
    if (!VALID_GENRES.includes(genre)) continue;
    const isCleanSolve = row.correct === 1 && row.wrong_move_count === 0 && row.hint_used === 0;
    progress[genre][String(row.problem_id)] = isCleanSolve ? 'solved' : 'failed';
    // SQLite returns "YYYY-MM-DD HH:MM:SS"; Date.parse needs a 'T' for some browsers
    const tsStr = row.created_at.replace(' ', 'T') + 'Z';
    const ms = Date.parse(tsStr);
    if (!isNaN(ms)) {
      timestamps[`${genre}:${row.problem_id}`] = ms;
    }
  }

  // ── Bookmarks ──
  const bookmarks: Record<GenreKey, string[]> = {
    direct: [], help: [], self: [], study: [], retro: [],
  };
  for (const row of bookmarkRows.results) {
    const genre = row.genre as GenreKey;
    if (VALID_GENRES.includes(genre)) {
      bookmarks[genre].push(String(row.problem_id));
    }
  }

  // ── Review queue ──
  const reviewQueue: Record<string, {
    problemId: number;
    stability: number;
    difficulty: number;
    isNew: boolean;
    dueDate: string;
  }> = {};
  for (const row of reviewRows.results) {
    reviewQueue[String(row.problem_id)] = {
      problemId: row.problem_id,
      stability: row.stability,
      difficulty: row.difficulty,
      isNew: row.is_new === 1,
      dueDate: row.due_date,
    };
  }

  return Response.json({
    rating,
    progress,
    timestamps,
    bookmarks,
    reviewQueue,
  }, {
    headers: { 'Cache-Control': 'private, max-age=30' },
  });
};
