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

  // Normalize date key
  let dateKey: string;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    dateKey = dateParam;
  } else {
    const now = new Date();
    dateKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
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

  if (cachedRow) {
    problemId = cachedRow.problem_id;
  } else {
    // ── 3. Full calculation ──
    const conditions: string[] = ["genre = 'direct'", "stipulation = '#2'"];
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

    // Store in daily_cache for future requests
    context.waitUntil(
      context.env.STATS_DB.prepare(
        'INSERT OR IGNORE INTO daily_cache (date, problem_id) VALUES (?, ?)'
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
