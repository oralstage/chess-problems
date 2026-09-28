import { addFairyExclusion } from '../fairy-filter';
import { dataCacheKey, DATA_CACHE_CONTROL } from '../data-cache';
import { LIST_GENRES, bad, refuseUnsupported, hasAdminToken } from '../list-guard';

/**
 * GET /api/problems/ids?genre=X
 *
 * Every non-fairy problem of a genre as { id, stipulation, sourceYear }, in
 * difficulty order. The app reads the static copy in public/problem-index/
 * and comes here only when that file is missing.
 *
 * Only the genre varies: no filters, no other order (list-guard.ts has why).
 * sortBy=difficulty, sortOrder=asc and v=2 are accepted as the app sends
 * them. `fresh` skips the edge cache and reads D1 -- for
 * scripts/build-problem-index.mjs right after an import -- and needs the
 * admin token, since each such read is the whole genre.
 *
 * Returns: { problems: { id, stipulation, sourceYear }[] }
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const params = url.searchParams;

  const genre = params.get('genre');
  if (!genre || !LIST_GENRES.includes(genre)) {
    return bad('genre is required');
  }
  const refused = refuseUnsupported(params);
  if (refused) return refused;

  const fresh = params.has('fresh');
  if (fresh && !hasAdminToken(context.request, context.env)) {
    return Response.json({ error: 'fresh needs the admin token' }, { status: 403 });
  }

  // Edge-cache per genre + DATA_VERSION: the result only changes on import,
  // and each list is a full-genre scan (~400k rows read for direct), too
  // expensive to repeat per request under the D1 daily read limit. The key
  // is the URL the app sends (src/services/api.ts), whatever this request
  // looked like.
  const keyUrl = new URL('/api/problems/ids', url.origin);
  keyUrl.searchParams.set('genre', genre);
  keyUrl.searchParams.set('sortBy', 'difficulty');
  keyUrl.searchParams.set('sortOrder', 'asc');
  keyUrl.searchParams.set('v', '2');
  const cache = caches.default;
  const cacheKey = dataCacheKey(keyUrl);
  if (!fresh) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  const conditions: string[] = ['genre = ?'];
  const bindings: (string | number)[] = [genre];
  addFairyExclusion(conditions, bindings);
  const where = conditions.join(' AND ');

  const rows = await context.env.DB.prepare(
    `SELECT id, stipulation, source_year FROM problems WHERE ${where} ORDER BY difficulty_score ASC`
  ).bind(...bindings).all();

  const problems = rows.results.map((r: Record<string, unknown>) => ({
    id: r.id as number,
    stipulation: r.stipulation as string,
    sourceYear: r.source_year as number | null,
  }));

  const response = Response.json({ problems }, {
    headers: { 'Cache-Control': DATA_CACHE_CONTROL },
  });
  // A fresh read is the script's, taken before the new DATA_VERSION is
  // deployed; it is not the entry the edge should hold.
  if (!fresh) context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
