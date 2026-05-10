/**
 * GET /api/my-rating?sessionId=xxx&dev=0|1
 *
 * Return the player's current Glicko-2 rating.
 *
 * Fast path: read from `player_ratings` (populated on every rating event from
 * post-event computation server-side).
 *
 * Fallback path: for legacy sessions where player_ratings has no row, take the
 * LAST rating_event's snapshot (which reflects the client's state going INTO
 * that event) and apply that one event. This matches the client's actual rating
 * far more accurately than replaying from default — the events table doesn't
 * record events that pre-date the table or that were sent with the wrong dev
 * flag, so a full replay would compound those gaps.
 *
 * Response: { rating, rd, vol, solveCount, firstEventAt, lastEventAt }
 * 404 if no events found.
 */

import { updateRating } from '../utils/glicko2';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const sessionId = url.searchParams.get('sessionId');
  const dev = url.searchParams.get('dev') === '1' ? 1 : 0;

  if (!sessionId || sessionId.length > 64 || sessionId.length < 8) {
    return Response.json({ error: 'Invalid sessionId' }, { status: 400 });
  }

  // Fast path: stored player rating
  const stored = await context.env.STATS_DB.prepare(
    `SELECT rating, rd, volatility, solve_count, updated_at
     FROM player_ratings
     WHERE session_id = ? AND dev = ?`
  ).bind(sessionId, dev).first<{ rating: number; rd: number; volatility: number; solve_count: number; updated_at: string }>();

  if (stored) {
    return Response.json({
      rating: stored.rating,
      rd: stored.rd,
      vol: stored.volatility,
      solveCount: stored.solve_count,
      firstEventAt: null,
      lastEventAt: stored.updated_at,
    }, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  }

  // Fallback: derive from the last rating event
  const totalRow = await context.env.STATS_DB.prepare(
    `SELECT COUNT(*) AS n, MIN(created_at) AS first_at FROM rating_events
     WHERE session_id = ? AND dev = ?`
  ).bind(sessionId, dev).first<{ n: number; first_at: string | null }>();

  const totalEvents = totalRow?.n ?? 0;

  if (totalEvents === 0) {
    return Response.json({ error: 'No rating history found for this code' }, { status: 404 });
  }

  const lastEvent = await context.env.STATS_DB.prepare(
    `SELECT player_rating, player_rd, problem_rating, problem_rd, score, created_at
     FROM rating_events
     WHERE session_id = ? AND dev = ?
     ORDER BY created_at DESC, problem_id DESC
     LIMIT 1`
  ).bind(sessionId, dev).first<{
    player_rating: number;
    player_rd: number;
    problem_rating: number;
    problem_rd: number;
    score: number;
    created_at: string;
  }>();

  if (!lastEvent) {
    return Response.json({ error: 'No rating history found for this code' }, { status: 404 });
  }

  // Apply the last event using the client's stored pre-event rating snapshot.
  // We don't have player_vol in the events table — default to 0.06 (Glicko-2 default).
  const final = updateRating(
    { rating: lastEvent.player_rating, rd: lastEvent.player_rd, vol: 0.06 },
    { rating: lastEvent.problem_rating, rd: lastEvent.problem_rd },
    lastEvent.score,
  );

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
    totalEvents,
  ).run();

  return Response.json({
    rating: final.rating,
    rd: final.rd,
    vol: final.vol,
    solveCount: totalEvents,
    firstEventAt: totalRow?.first_at ?? null,
    lastEventAt: lastEvent.created_at,
  }, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  });
};
