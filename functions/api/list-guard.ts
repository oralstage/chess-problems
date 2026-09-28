/**
 * What the problem-list endpoints (/api/problems, /api/problems/ids) accept.
 *
 * 2026-09-29, 00:00 JST: something outside the app sent about eighty list
 * requests carrying a year bound (maxYear) and move counts, all within a few
 * seconds. A request with a filter misses both caches (the count cache and
 * the edge cache only ever held the app's own shapes) and reads up to the
 * whole genre, ~400k rows, so that burst read 32.8M rows -- six and a half
 * times the free D1 allowance for a day -- and the problem pages were down
 * until the 09:00 JST reset. The app has never sent a year, keyword,
 * stipulation or piece filter to either endpoint; it filters those in the
 * browser.
 *
 * So the endpoints take only the requests the app makes and refuse the rest
 * before D1 is touched, and each one rebuilds its edge-cache key from the
 * parameters it accepted, written in the order the app writes them: the
 * entries the app's own URLs filled still match, and a reordered or padded
 * URL lands on the same entry instead of costing a fresh read.
 */

export const LIST_GENRES = ['direct', 'help', 'self', 'study', 'retro'];

/** Filters the endpoints used to take. Any one of them made the count
 *  uncacheable and the scan genre-wide. */
const UNSUPPORTED_FILTERS = ['stipulations', 'keywords', 'minPieces', 'maxPieces', 'minYear', 'maxYear'];

export function bad(error: string): Response {
  return Response.json({ error }, { status: 400 });
}

/** A retryable refusal, for when a cache that must answer cannot be read. */
export function unavailable(): Response {
  return Response.json({ error: 'temporarily unavailable' }, { status: 503 });
}

/** The first thing in the request the app never sends, as a 400, or null.
 *  Difficulty ascending is the only order either endpoint serves. */
export function refuseUnsupported(params: URLSearchParams): Response | null {
  for (const name of UNSUPPORTED_FILTERS) {
    if (params.get(name)) return bad(`${name} is not supported`);
  }
  const sortBy = params.get('sortBy');
  if (sortBy != null && sortBy !== 'difficulty') return bad('sortBy must be difficulty');
  const sortOrder = params.get('sortOrder');
  if (sortOrder != null && sortOrder !== 'asc') return bad('sortOrder must be asc');
  return null;
}

export interface CategoryMoves { min: number | null; max: number | null }

/** The move range of one of the app's categories (CATEGORY_DEFS in
 *  src/types.ts), or null. Only direct and help are split by move count:
 *  2-2, 3-3, and 4 with no upper bound. No range at all is the whole genre. */
export function readCategoryMoves(params: URLSearchParams, genre: string): CategoryMoves | null {
  const minP = params.get('minMoves') || null;
  const maxP = params.get('maxMoves') || null;
  if (minP == null && maxP == null) return { min: null, max: null };
  if (genre !== 'direct' && genre !== 'help') return null;
  const min = minP == null ? null : Number(minP);
  const max = maxP == null ? null : Number(maxP);
  if ((min === 2 && max === 2) || (min === 3 && max === 3) || (min === 4 && max == null)) {
    return { min, max };
  }
  return null;
}

/** A stats DB that predates the stats_cache table. That is the only failure
 *  a cache read may fall through from to a full computation: any other --
 *  the daily read limit among them -- would turn every request into a scan. */
export function isMissingTable(e: unknown): boolean {
  return /no such table/i.test(e instanceof Error ? e.message : String(e));
}

/** The admin endpoints' Bearer token, compared in constant time. */
export function hasAdminToken(request: Request, env: Env): boolean {
  const token = env.ADMIN_TOKEN;
  if (!token) return false;
  const auth = request.headers.get('Authorization');
  if (!auth) return false;
  const expected = new TextEncoder().encode(`Bearer ${token}`);
  const actual = new TextEncoder().encode(auth);
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
  return diff === 0;
}
