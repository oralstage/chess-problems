/**
 * Shared edge-cache policy for endpoints that read the problems DB.
 *
 * The problem data only changes at a YACPDB import (every few months), so
 * these responses are effectively immutable in between. Edge entries used to
 * expire daily, which made every Cloudflare colo re-run the underlying D1
 * query (up to ~400k rows for a full-genre ids list) once per day — a cost
 * that grows linearly with how many regions have active users. Instead the
 * edge holds entries for 30 days and the cache KEY carries DATA_VERSION, so
 * an import invalidates every colo at once by changing the key.
 *
 * ⚠️ Bump DATA_VERSION whenever the problems DB content changes (YACPDB
 * import, fairy-flag fixes, rebuilds). Deploys do NOT clear the edge cache —
 * without the bump, colos keep serving the old data for up to 30 days.
 */
export const DATA_VERSION = '2026-08-25'; // last YACPDB import

// Browsers revalidate daily (cheap: they hit the edge); the edge keeps the
// entry for 30 days via s-maxage.
export const DATA_CACHE_CONTROL = 'public, max-age=86400, s-maxage=2592000';

/** Cache key for a data-backed response: the request URL + data version.
 *  Server-side only — clients never see the dv parameter. */
export function dataCacheKey(url: URL): Request {
  const keyUrl = new URL(url.toString());
  keyUrl.searchParams.set('dv', DATA_VERSION);
  return new Request(keyUrl.toString());
}
