import { addFairyExclusion } from './fairy-filter';
import { isMissingTable, unavailable } from './list-guard';

/**
 * GET /api/stats
 *
 * Returns problem counts per genre and available stipulations/keywords.
 * Used by ModeSelector and FilterPage.
 *
 * The underlying aggregates full-scan the 570k-row problems table (~4M rows
 * read per request), which is why this endpoint must never hit D1 directly
 * on the hot path — the D1 free tier allows 5M rows read per DAY. The
 * problems table only changes on import, so the result is effectively
 * static. Speed strategy (same as /api/daily):
 *   1. Worker Cache API — edge memory, 0 D1 queries
 *   2. stats_cache table (STATS_DB) — 1 row read
 *   3. Full calculation — full scans, runs once per cache key, ever
 *
 * After importing new problems: bump CACHE_VERSION below (invalidates both
 * edge and table entries) or DELETE FROM stats_cache on both stats DBs.
 */
const CACHE_VERSION = 2; // bumped 2026-08-25: incremental YACPDB import (+12,061 problems)

const VALID_GENRES = ['direct', 'help', 'self', 'study', 'retro'];

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const genre = new URL(context.request.url).searchParams.get('genre');
  const cacheKey = `v${CACHE_VERSION}:${genre && VALID_GENRES.includes(genre) ? genre : 'all'}`;

  // ── 1. Worker Cache API (edge memory) ──
  const cache = caches.default;
  const edgeKey = new Request(`https://chess-problems-cache/stats/${cacheKey}`);
  const cached = await cache.match(edgeKey);
  if (cached) return cached;

  // ── 2. stats_cache table ──
  // Tolerate a missing table (e.g. a stats DB that predates it) by falling
  // through to full calculation instead of failing the request. Any other
  // failure refuses instead: it used to fall through as well, so a stats DB
  // that could not be read -- over the daily read limit, say -- turned every
  // edge miss into a ~1.2M-row computation.
  let payload: string | null = null;
  try {
    const row = await context.env.STATS_DB.prepare(
      'SELECT payload FROM stats_cache WHERE key = ?'
    ).bind(cacheKey).first<{ payload: string }>();
    if (row) payload = row.payload;
  } catch (e) {
    if (!isMissingTable(e)) return unavailable();
  }

  // ── 3. Full calculation ──
  if (!payload) {
    payload = JSON.stringify(await computeStats(context.env.DB, genre));
    context.waitUntil(
      context.env.STATS_DB.prepare(
        'INSERT OR REPLACE INTO stats_cache (key, payload, updated_at) VALUES (?, ?, ?)'
      ).bind(cacheKey, payload, new Date().toISOString()).run().catch(() => {})
    );
  }

  const response = new Response(payload, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400',
    },
  });

  context.waitUntil(cache.put(edgeKey, response.clone()));
  return response;
};

async function computeStats(db: D1Database, genre: string | null) {
  // Build fairy exclusion once for reuse
  const fairyConds: string[] = [];
  const fairyBindings: (string | number)[] = [];
  addFairyExclusion(fairyConds, fairyBindings);
  const fairyWhere = fairyConds.join(' AND ');

  // Genre counts
  const genreCounts = await db.prepare(
    `SELECT genre, COUNT(*) as count FROM problems WHERE ${fairyWhere} GROUP BY genre`
  ).bind(...fairyBindings).all();

  const counts: Record<string, number> = {};
  for (const row of genreCounts.results) {
    counts[row.genre as string] = row.count as number;
  }

  // Move-count breakdown per genre (for category counts on home page)
  const moveCountResult = await db.prepare(
    `SELECT genre, move_count, COUNT(*) as count FROM problems WHERE genre IN ('direct', 'help') AND ${fairyWhere} GROUP BY genre, move_count ORDER BY genre, move_count`
  ).bind(...fairyBindings).all();
  const moveCounts: Record<string, Record<number, number>> = {};
  for (const row of moveCountResult.results) {
    const g = row.genre as string;
    if (!moveCounts[g]) moveCounts[g] = {};
    moveCounts[g][row.move_count as number] = row.count as number;
  }

  // If genre specified, return available stipulations and keyword stats
  let stipulations: string[] = [];
  let keywords: string[] = [];
  let yearRange = { min: 0, max: 0 };
  let pieceRange = { min: 0, max: 0 };
  let moveRange = { min: 0, max: 0 };

  if (genre && VALID_GENRES.includes(genre)) {
    const stipResult = await db.prepare(
      `SELECT DISTINCT stipulation FROM problems WHERE genre = ? AND ${fairyWhere} ORDER BY stipulation`
    ).bind(genre, ...fairyBindings).all();
    stipulations = stipResult.results.map((r: Record<string, unknown>) => r.stipulation as string);

    const rangeResult = await db.prepare(
      `SELECT MIN(source_year) as minYear, MAX(source_year) as maxYear,
              MIN(piece_count) as minPieces, MAX(piece_count) as maxPieces,
              MIN(CASE WHEN move_count > 0 THEN move_count END) as minMoves,
              MAX(move_count) as maxMoves
       FROM problems WHERE genre = ? AND ${fairyWhere}`
    ).bind(genre, ...fairyBindings).first<{ minYear: number; maxYear: number; minPieces: number; maxPieces: number; minMoves: number; maxMoves: number }>();

    if (rangeResult) {
      yearRange = { min: rangeResult.minYear || 0, max: rangeResult.maxYear || 0 };
      pieceRange = { min: rangeResult.minPieces || 0, max: rangeResult.maxPieces || 0 };
      moveRange = { min: rangeResult.minMoves || 1, max: rangeResult.maxMoves || 10 };
    }

    // Get all unique keywords for this genre
    const kwResult = await db.prepare(
      `SELECT keywords FROM problems WHERE genre = ? AND keywords != '[]' AND ${fairyWhere}`
    ).bind(genre, ...fairyBindings).all();

    const kwSet = new Set<string>();
    for (const row of kwResult.results) {
      try {
        const kws = JSON.parse(row.keywords as string) as string[];
        for (const kw of kws) kwSet.add(kw);
      } catch { /* ignore */ }
    }
    keywords = [...kwSet].sort();
  }

  return { counts, moveCounts, stipulations, keywords, yearRange, pieceRange, moveRange };
}
