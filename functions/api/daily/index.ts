import { addFairyExclusion } from '../fairy-filter';

/**
 * GET /api/daily
 *
 * Returns today's daily problem (a #2 direct mate).
 * Uses golden-ratio hashing on the date to pick deterministically.
 * Includes full solutionText for immediate solving.
 *
 * Accepts optional `?date=YYYY-MM-DD` query param (client's local date).
 * Falls back to UTC date if not provided.
 *
 * Speed strategy (fastest to slowest):
 *   1. Worker Cache API  — edge memory, 0 D1 queries
 *   2. daily_cache table — 1 D1 query (id lookup only)
 *   3. Full calculation  — 2 D1 queries + INSERT into daily_cache (once per day)
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const dateParam = url.searchParams.get('date');

  // Normalize date key. Reject non-calendar dates ("9999-99-99") and dates
  // far outside the feature's lifetime so bogus values can't bloat the edge
  // cache and daily_cache table with junk entries.
  const now = new Date();
  const todayUTC = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  let dateKey = todayUTC;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const parsed = new Date(dateParam + 'T00:00:00Z');
    const isRealDate = !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dateParam;
    // Allow a complete Monday–Sunday batch to be generated in advance.
    const withinWindow = dateParam >= '2026-03-01' && parsed.getTime() <= now.getTime() + 7 * 86_400_000;
    if (isRealDate && withinWindow) dateKey = dateParam;
  }

  // ── 1. Worker Cache API (edge memory) ──
  const cache = caches.default;
  const cacheKey = new Request(`https://chess-problems-cache/daily/${dateKey}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // ── 2. Check daily_cache table ──
  const cachedRow = await context.env.STATS_DB.prepare(
    'SELECT problem_id FROM daily_cache WHERE date = ?'
  ).bind(dateKey).first<{ problem_id: number }>();

  let problemId: number;

  // A daily_cache row outlives the filter that picked it, so a problem later
  // recognised as fairy would keep being served here — and posted to X by
  // scripts/generate-daily-post.mjs. Verify the cached pick still passes the
  // filter, and treat it as a miss if it doesn't.
  const cachedIsUsable = cachedRow
    ? await context.env.DB.prepare(
        // Only the fairy check, not the piece-count one: that is a policy about
        // which problems to pick from tomorrow, not a statement that yesterday's
        // was invalid. Re-deciding a cached day would rewrite the archive and
        // desync it from what was already posted.
        'SELECT 1 FROM problems WHERE id = ? AND is_fairy = 0'
      ).bind(cachedRow.problem_id).first() !== null
    : false;

  if (cachedRow && cachedIsUsable) {
    problemId = cachedRow.problem_id;
  } else {
    // ── 3. Full calculation ──
    // piece_count <= 10: the daily is the site's front door, and most people meet
    // it as a thumbnail on X with no context at all. What they judge in those two
    // seconds is how crowded the board is, not the move count — and half of every
    // #2 in the collection carries 17 pieces or more, which reads as a game
    // position to analyse rather than a puzzle to try. Ten leaves the board
    // visibly empty (16% of its squares), keeps 37,414 problems to draw from —
    // a century of dailies — and lands on a miniature about seven times in ten.
    const conditions: string[] = ["genre = 'direct'", "stipulation = '#2'", "piece_count <= 10", "keywords NOT LIKE '%Shortmate%'"];
    const bindings: (string | number)[] = [];
    addFairyExclusion(conditions, bindings);
    const where = conditions.join(' AND ');

    const countResult = await context.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM problems WHERE ${where}`
    ).bind(...bindings).first<{ cnt: number }>();
    const total = countResult?.cnt || 0;
    if (total === 0) {
      return Response.json({ error: 'No daily problems available' }, { status: 404 });
    }

    const [y, m, d] = dateKey.split('-').map(Number);
    const dayNum = y * 10000 + m * 100 + d;
    const GOLDEN = 2654435761;
    const hash = ((dayNum * GOLDEN) >>> 0) / 4294967296;
    const idx = Math.floor(hash * total);

    const idRow = await context.env.DB.prepare(
      `SELECT id FROM problems WHERE ${conditions.join(' AND ')} ORDER BY difficulty_score ASC LIMIT 1 OFFSET ?`
    ).bind(...bindings, idx).first<{ id: number }>();

    if (!idRow) {
      return Response.json({ error: 'Daily problem not found' }, { status: 404 });
    }

    problemId = idRow.id;

    // Store in daily_cache for future requests. REPLACE rather than IGNORE so
    // a row rejected just above is corrected instead of being recomputed on
    // every request from here on.
    context.waitUntil(
      context.env.STATS_DB.prepare(
        'INSERT OR REPLACE INTO daily_cache (date, problem_id) VALUES (?, ?)'
      ).bind(dateKey, problemId).run()
    );
  }

  // Fetch full problem data by ID
  const row = await context.env.DB.prepare(
    `SELECT id, fen, authors, source_name, source_year, stipulation, move_count,
            genre, difficulty, difficulty_score, piece_count, keywords, award, solution_text
     FROM problems WHERE id = ?`
  ).bind(problemId).first();

  if (!row) {
    return Response.json({ error: 'Daily problem not found' }, { status: 404 });
  }

  const problem = {
    id: row.id,
    fen: row.fen,
    authors: JSON.parse(row.authors as string),
    sourceName: row.source_name,
    sourceYear: row.source_year,
    stipulation: row.stipulation,
    moveCount: row.move_count,
    genre: row.genre,
    difficulty: row.difficulty,
    difficultyScore: row.difficulty_score,
    pieceCount: row.piece_count,
    keywords: JSON.parse(row.keywords as string),
    award: row.award || '',
    solutionText: row.solution_text,
  };

  const response = Response.json(problem, {
    headers: { 'Cache-Control': 'public, max-age=86400' },
  });

  // Store in Worker Cache for this edge node
  context.waitUntil(cache.put(cacheKey, response.clone()));

  return response;
};
