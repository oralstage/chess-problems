import { addFairyExclusion } from './fairy-filter';
import { dataCacheKey, DATA_CACHE_CONTROL } from './data-cache';
import { LIST_GENRES, bad, unavailable, refuseUnsupported, readCategoryMoves, isMissingTable } from './list-guard';

/**
 * GET /api/problems
 *
 * The list the app pages through. It takes exactly the requests the app
 * makes and refuses everything else before D1 is read (list-guard.ts has
 * why -- the 2026-09-29 burst):
 *   genre       - required: direct|help|self|study|retro
 *   pageSize    - 1, 20 (the default), 50 or 5000
 *   page        - 0 only; later pages go by the keyset cursor below
 *   afterScore + afterId - the page after this problem, in difficulty order
 *                          (not together with minMoves=4)
 *   minMoves / maxMoves  - a category's range, direct and help only:
 *                          2-2, 3-3, or minMoves=4 alone
 *   sortBy=difficulty, sortOrder=asc - accepted; it is the only order
 *
 * Returns:
 *   { problems: [...], total: number, page: number, pageSize: number }
 *   Problems do NOT include solution_text (for list view only).
 */

/** The sizes the app asks for: 5000 for the background genre load, 50 for
 *  the quick start, 1 for the count warm-up after an import, and 20 when a
 *  request names none. Each size is its own edge entry, so the set stays
 *  small. */
const PAGE_SIZES = [1, 20, 50, 5000];
const DEFAULT_PAGE_SIZE = 20;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const params = url.searchParams;

  const genre = params.get('genre');
  if (!genre || !LIST_GENRES.includes(genre)) {
    return bad('genre is required (direct|help|self|study|retro)');
  }
  const refused = refuseUnsupported(params);
  if (refused) return refused;

  const pageSize = Number(params.get('pageSize') ?? DEFAULT_PAGE_SIZE);
  if (!PAGE_SIZES.includes(pageSize)) return bad('pageSize must be 1, 20, 50 or 5000');

  // OFFSET scans offset+limit rows, so a deep page was a genre-wide read
  // anyone could ask for. The app reads the first page and walks on by
  // cursor.
  const page = params.get('page');
  if (page != null && page !== '0') return bad('only page=0; later pages go by afterScore and afterId');

  const moves = readCategoryMoves(params, genre);
  if (!moves) return bad('minMoves/maxMoves must be a category: 2-2, 3-3 or minMoves=4 alone (direct and help)');

  // Keyset mode: OFFSET made a full-genre background load quadratic (~16M
  // rows read for direct). The cursor walk rides idx_genre_difficulty and
  // reads ~pageSize rows per page instead, in the same order.
  const afterScoreP = params.get('afterScore');
  const afterIdP = params.get('afterId');
  let cursor: { score: number; id: number } | null = null;
  if (afterScoreP != null || afterIdP != null) {
    const score = parseFloat(afterScoreP ?? '');
    const id = parseInt(afterIdP ?? '');
    if (!Number.isFinite(score) || !Number.isFinite(id)) {
      return bad('afterScore and afterId go together, as numbers');
    }
    cursor = { score, id };
  }
  // A cursor over a range of move counts cannot seek. D1's plan for it walks
  // idx_genre_difficulty from the cursor and drops every #2 and #3 on the way
  // to the page (EXPLAIN QUERY PLAN, 2026-09-29), however many lie between.
  // The app walks cursors over whole genres only.
  if (cursor && moves.min != null && moves.min !== moves.max) {
    return bad('afterScore and afterId cannot be combined with minMoves=4');
  }

  // Edge-cache per request, keyed on what was accepted, written the way
  // src/services/api.ts writes it: problem data only changes on import, the
  // paginated background loads re-request identical URLs from every browser
  // whose Cache API copy is cold, and nothing a caller adds or reorders can
  // move a request off its entry.
  const keyUrl = new URL('/api/problems', url.origin);
  const key = keyUrl.searchParams;
  key.set('genre', genre);
  key.set('pageSize', String(pageSize));
  if (cursor) {
    key.set('afterScore', String(cursor.score));
    key.set('afterId', String(cursor.id));
  } else {
    key.set('page', '0');
    key.set('sortBy', 'difficulty');
    key.set('sortOrder', 'asc');
  }
  if (moves.min != null) key.set('minMoves', String(moves.min));
  if (moves.max != null) key.set('maxMoves', String(moves.max));

  const cache = caches.default;
  const cacheKey = dataCacheKey(keyUrl);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const conditions: string[] = ['genre = ?'];
  const bindings: (string | number)[] = [genre];
  if (moves.min != null && moves.min === moves.max) {
    // Equality instead of a closed range: with idx_genre_moves_diff the
    // difficulty order then comes straight off the index (a range forces a
    // temp b-tree sort over the whole category — the seconds-long first
    // open of #2/#3).
    conditions.push('move_count = ?'); bindings.push(moves.min);
  } else if (moves.min != null) {
    conditions.push('move_count >= ?'); bindings.push(moves.min);
  }

  // Exclude fairy problems (detected by keywords)
  addFairyExclusion(conditions, bindings);

  const where = conditions.join(' AND ');

  // Total count. It is static between imports but costs up to a ~570k-row
  // scan, so it comes from stats_cache; with only the app's shapes accepted
  // there are eleven keys, each counted once. Invalidated together with the
  // stats keys (DELETE FROM stats_cache).
  let total: number | null = null;
  const countCacheKey = moves.min != null
    ? `v1:count:${genre}:m${moves.min}-${moves.max ?? 0}`
    : `v1:count:${genre}`;
  try {
    const row = await context.env.STATS_DB.prepare(
      'SELECT payload FROM stats_cache WHERE key = ?'
    ).bind(countCacheKey).first<{ payload: string }>();
    if (row) total = parseInt(row.payload);
  } catch (e) {
    if (!isMissingTable(e)) return unavailable();
  }

  if (total === null || Number.isNaN(total)) {
    const countResult = await context.env.DB.prepare(
      `SELECT COUNT(*) as total FROM problems WHERE ${where}`
    ).bind(...bindings).first<{ total: number }>();
    total = countResult?.total ?? 0;
    context.waitUntil(
      context.env.STATS_DB.prepare(
        'INSERT OR REPLACE INTO stats_cache (key, payload, updated_at) VALUES (?, ?, ?)'
      ).bind(countCacheKey, String(total), new Date().toISOString()).run().catch(() => {})
    );
  }

  // Get page of problems (without solution_text for list view).
  // Must stay a row-value comparison: the expanded form
  // (ds > ? OR (ds = ? AND id > ?)) defeats the index seek with bound params
  // (planner can't prove the two ?s are equal, falls back to genre=? scan).
  let rows;
  if (cursor) {
    rows = await context.env.DB.prepare(
      `SELECT id, fen, authors, source_name, source_year, stipulation, move_count, genre, difficulty, difficulty_score, piece_count, keywords, award
       FROM problems
       WHERE ${where} AND (difficulty_score, id) > (?, ?)
       ORDER BY difficulty_score ASC, id ASC
       LIMIT ?`
    ).bind(...bindings, cursor.score, cursor.id, pageSize).all();
  } else {
    rows = await context.env.DB.prepare(
      `SELECT id, fen, authors, source_name, source_year, stipulation, move_count, genre, difficulty, difficulty_score, piece_count, keywords, award
       FROM problems
       WHERE ${where}
       ORDER BY difficulty_score ASC, id ASC
       LIMIT ?`
    ).bind(...bindings, pageSize).all();
  }

  // Parse JSON fields
  const problems = rows.results.map((r: Record<string, unknown>) => ({
    id: r.id,
    fen: r.fen,
    authors: JSON.parse(r.authors as string),
    sourceName: r.source_name,
    sourceYear: r.source_year,
    stipulation: r.stipulation,
    moveCount: r.move_count,
    genre: r.genre,
    difficulty: r.difficulty,
    difficultyScore: r.difficulty_score,
    pieceCount: r.piece_count,
    keywords: JSON.parse(r.keywords as string),
    award: r.award,
  }));

  const response = Response.json({ problems, total, page: 0, pageSize }, {
    headers: { 'Cache-Control': DATA_CACHE_CONTROL },
  });
  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
