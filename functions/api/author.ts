import { addFairyExclusion } from './fairy-filter';
import { dataCacheKey, DATA_CACHE_CONTROL } from './data-cache';

/**
 * GET /api/author
 *
 * One composer's problems, a page at a time. Author search can only ever show
 * its first 200 hits, which is nothing for the composers who matter most:
 * 683 authors have over 200 problems and between them hold 58% of the
 * database, and the largest single name has 3,202.
 *
 * Query params:
 *   name     - the author's name, exactly as author_search stores it
 *   page     - 0-based page index
 *   pageSize - problems per page (default 24, max 100)
 *
 * Costs one indexed row plus the page itself: author_search already holds
 * every one of that author's problem ids, sorted the way the list shows them
 * (source_year DESC, difficulty ASC), so paging needs no scan and no count.
 */
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const name = url.searchParams.get('name')?.trim();
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0') || 0);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1,
    parseInt(url.searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE));

  if (!name) {
    return Response.json({ error: 'name param required' }, { status: 400 });
  }

  const cache = caches.default;
  const cacheKey = dataCacheKey(url);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const row = await context.env.DB.prepare(
    'SELECT problem_ids FROM author_search WHERE name = ?'
  ).bind(name).first<{ problem_ids: string }>();

  if (!row) {
    return Response.json({ error: 'author not found', results: [], total: 0 }, { status: 404 });
  }

  let ids: number[];
  try {
    ids = JSON.parse(row.problem_ids).filter((id: unknown) => Number.isInteger(id));
  } catch {
    ids = [];
  }

  const total = ids.length;
  const slice = ids.slice(page * pageSize, page * pageSize + pageSize);
  if (slice.length === 0) {
    const empty = Response.json({ results: [], total, page, pageSize }, {
      headers: { 'Cache-Control': DATA_CACHE_CONTROL },
    });
    context.waitUntil(cache.put(cacheKey, empty.clone()));
    return empty;
  }

  const conditions: string[] = [`id IN (${slice.join(',')})`];
  const bindings: (string | number)[] = [];
  addFairyExclusion(conditions, bindings);
  const result = await context.env.DB.prepare(
    `SELECT id, fen, authors, source_name, source_year, stipulation, move_count, genre, difficulty, difficulty_score, piece_count, keywords, award
     FROM problems WHERE ${conditions.join(' AND ')}`
  ).bind(...bindings).all();

  // Keep the order author_search stored, which the slice above is a window of.
  const rank = new Map(slice.map((id, i) => [id, i]));
  const results = (result.results as Record<string, unknown>[])
    .sort((a, b) => (rank.get(a.id as number) ?? 0) - (rank.get(b.id as number) ?? 0))
    .map(row => ({
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

  const response = Response.json({ results, total, page, pageSize }, {
    headers: { 'Cache-Control': DATA_CACHE_CONTROL },
  });
  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
