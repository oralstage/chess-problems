import { addFairyExclusion } from './fairy-filter';

/**
 * GET /api/search
 *
 * Query params:
 *   author - search by author name (partial match, case-insensitive)
 *   limit  - max results (default 50, max 200)
 *
 * Returns:
 *   { results: [{ id, fen, authors, sourceName, sourceYear, stipulation, moveCount, genre, difficulty, difficultyScore, pieceCount, keywords, award }] }
 */
// Same per-isolate limiter as solve-event. Every NOVEL search costs ~21k D1
// rows (the author index scan), so a bot iterating names could walk through
// the daily free-tier read budget; a human types a handful of searches a
// minute at most. Best-effort — each isolate counts separately — but it turns
// a trivial loop into a throttled one.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 10;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const author = url.searchParams.get('author')?.trim();
  const limit = Math.min(200, Math.max(1, (parseInt(url.searchParams.get('limit') || '50') || 50)));

  if (!author || author.length < 2) {
    return Response.json({ error: 'author param required (min 2 chars)' }, { status: 400 });
  }

  // Edge-cache per URL: the LIKE scan reads the whole table (~580k rows) and
  // cannot use an index, so at least repeats of the same search are free.
  const cache = caches.default;
  const cacheKey = new Request(url.toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Only cache misses are limited: repeat searches cost nothing and stay free.
  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  if (isRateLimited(ip)) {
    return Response.json({ error: 'Rate limited' }, { status: 429 });
  }

  // Split search terms by space and require all to match (AND).
  // Escape LIKE metacharacters so user input can't act as wildcards.
  const terms = author.split(/\s+/).filter(t => t.length > 0);
  const likePatterns = terms.map(t => `%${t.replace(/[\\%_]/g, c => '\\' + c)}%`);

  // Indexed path: scan the ~30k-row author_search table (name → pre-sorted
  // problem ids) instead of LIKE-scanning all ~580k problems. Cuts a novel
  // search from ~580k rows read to ~30k. Falls back to the full scan if the
  // index table is missing (see scripts/build-author-index.ts — rebuild it
  // after every import).
  let indexedIds: number[] | null = null;
  try {
    const conds = terms.map(() => `name_lower LIKE ? ESCAPE '\\'`).join(' AND ');
    const rows = await context.env.DB.prepare(
      `SELECT problem_ids FROM author_search WHERE ${conds} LIMIT 100`
    ).bind(...likePatterns.map(p => p.toLowerCase())).all();
    // Round-robin across the matched authors' pre-sorted (newest-first)
    // lists, so one prolific author cannot crowd the others out of the cap —
    // every matched author keeps its newest problems, and the global
    // re-sort below stays exact for up to cap/limit matched authors.
    const lists: number[][] = [];
    for (const r of rows.results as { problem_ids: string }[]) {
      try {
        const ids = JSON.parse(r.problem_ids).filter((id: unknown) => Number.isInteger(id));
        if (ids.length > 0) lists.push(ids);
      } catch { /* skip malformed row */ }
    }
    indexedIds = [];
    const CAP = 5000;
    for (let round = 0; indexedIds.length < CAP; round++) {
      let took = false;
      for (const list of lists) {
        if (round < list.length && indexedIds.length < CAP) {
          indexedIds.push(list[round]);
          took = true;
        }
      }
      if (!took) break;
    }
  } catch {
    indexedIds = null; // table missing — take the legacy path
  }

  let result;
  if (indexedIds != null) {
    if (indexedIds.length === 0) {
      const empty = Response.json({ results: [], total: 0 }, {
        headers: { 'Cache-Control': 'public, max-age=86400' },
      });
      context.waitUntil(cache.put(cacheKey, empty.clone()));
      return empty;
    }
    // Numeric literals sidestep D1's 100-binding limit.
    const pick = [...new Set(indexedIds)];
    result = await context.env.DB.prepare(
      `SELECT id, fen, authors, source_name, source_year, stipulation, move_count, genre, difficulty, difficulty_score, piece_count, keywords, award
       FROM problems
       WHERE id IN (${pick.join(',')}) AND is_fairy = 0`
    ).all();
    result.results.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const ya = a.source_year as number | null, yb = b.source_year as number | null;
      if (ya == null && yb == null) return (a.difficulty_score as number) - (b.difficulty_score as number);
      if (ya == null) return 1;
      if (yb == null) return -1;
      if (yb !== ya) return yb - ya;
      return (a.difficulty_score as number) - (b.difficulty_score as number);
    });
    result.results = result.results.slice(0, limit);
  } else {
    const conditions: string[] = [];
    const bindings: (string | number)[] = [];
    for (const p of likePatterns) {
      conditions.push(`authors LIKE ? ESCAPE '\\'`);
      bindings.push(p);
    }
    addFairyExclusion(conditions, bindings);
    result = await context.env.DB.prepare(
      `SELECT id, fen, authors, source_name, source_year, stipulation, move_count, genre, difficulty, difficulty_score, piece_count, keywords, award
       FROM problems
       WHERE ${conditions.join(' AND ')}
       ORDER BY source_year DESC, difficulty_score ASC
       LIMIT ?`
    ).bind(...bindings, limit).all();
  }

  const results = result.results.map((row: Record<string, unknown>) => ({
    id: row.id,
    fen: row.fen as string,
    authors: row.authors as string,
    sourceName: row.source_name as string,
    sourceYear: row.source_year as number | null,
    stipulation: row.stipulation as string,
    moveCount: row.move_count as number,
    genre: row.genre as string,
    difficulty: row.difficulty as string,
    difficultyScore: row.difficulty_score as number,
    pieceCount: row.piece_count as number,
    keywords: row.keywords as string,
    award: row.award as string,
  }));

  const response = Response.json({ results, total: results.length }, {
    headers: { 'Cache-Control': 'public, max-age=86400' },
  });
  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
