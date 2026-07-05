import { addFairyExclusion } from '../fairy-filter';

/**
 * GET /api/daily/history?days=30
 *
 * Returns past daily problems (last N days).
 *
 * The per-day problem IDs come from the daily_cache table (the same one
 * /api/daily maintains) — one query for all dates. Only dates missing from
 * the cache are computed with the golden-ratio OFFSET queries, and the
 * result is written back so the cost is paid at most once per date.
 * (Recomputing every date used to issue ~30 OFFSET queries over ~200k rows
 * and took ~19s per request.)
 *
 * The full response is also edge-cached per (days, date) via the Worker
 * Cache API, so repeat requests hit no D1 at all.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30') || 30, 1), 90);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // ── Edge cache (keyed by date so it rolls over at midnight) ──
  const cache = caches.default;
  const cacheKey = new Request(`https://chess-problems-cache/daily-history/${days}/${todayStr}`);
  const cachedRes = await cache.match(cacheKey);
  if (cachedRes) return cachedRes;

  // ── Dates we need ──
  const SITE_OPEN = new Date(2026, 2, 15); // 2026-03-15
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (d < SITE_OPEN) break;
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  if (dates.length === 0) {
    return Response.json([], { headers: { 'Cache-Control': 'public, max-age=3600' } });
  }

  // ── 1. Known dates from daily_cache (single query) ──
  const dateToId = new Map<string, number>();
  const cachedRows = await context.env.STATS_DB.prepare(
    'SELECT date, problem_id FROM daily_cache WHERE date >= ? AND date <= ?'
  ).bind(dates[dates.length - 1], dates[0]).all<{ date: string; problem_id: number }>();
  for (const row of cachedRows.results) {
    dateToId.set(row.date, row.problem_id);
  }

  // ── 2. Compute only the missing dates (golden-ratio hash + OFFSET) ──
  const missing = dates.filter(d => !dateToId.has(d));
  if (missing.length > 0) {
    const conditions: string[] = ["genre = 'direct'", "stipulation = '#2'"];
    const bindings: (string | number)[] = [];
    addFairyExclusion(conditions, bindings);
    const where = conditions.join(' AND ');

    const countResult = await context.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM problems WHERE ${where}`
    ).bind(...bindings).first<{ cnt: number }>();
    const total = countResult?.cnt || 0;

    if (total > 0) {
      const GOLDEN = 2654435761;
      const offsetFor = (dateStr: string): number => {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dayNum = y * 10000 + m * 100 + d;
        const hash = ((dayNum * GOLDEN) >>> 0) / 4294967296;
        return Math.floor(hash * total);
      };

      const idResults = await Promise.all(missing.map(dateStr =>
        context.env.DB.prepare(
          `SELECT id FROM problems WHERE ${where} ORDER BY difficulty_score ASC LIMIT 1 OFFSET ?`
        ).bind(...bindings, offsetFor(dateStr)).first<{ id: number }>()
      ));

      const inserts: D1PreparedStatement[] = [];
      missing.forEach((dateStr, i) => {
        const id = idResults[i]?.id;
        if (id) {
          dateToId.set(dateStr, id);
          inserts.push(context.env.STATS_DB.prepare(
            'INSERT OR IGNORE INTO daily_cache (date, problem_id) VALUES (?, ?)'
          ).bind(dateStr, id));
        }
      });
      // Write back so these dates are never recomputed
      if (inserts.length > 0) {
        try { await context.env.STATS_DB.batch(inserts); } catch { /* non-fatal */ }
      }
    }
  }

  // ── 3. Batch fetch problem details (single query) ──
  const uniqueIds = [...new Set(dateToId.values())];
  if (uniqueIds.length === 0) {
    return Response.json([], { headers: { 'Cache-Control': 'public, max-age=3600' } });
  }

  const placeholders = uniqueIds.map(() => '?').join(',');
  const rows = await context.env.DB.prepare(
    `SELECT id, fen, authors, source_name, source_year, stipulation, move_count,
            genre, difficulty, difficulty_score, piece_count, keywords, award
     FROM problems WHERE id IN (${placeholders})`
  ).bind(...uniqueIds).all();

  const problemMap = new Map<number, Record<string, unknown>>();
  for (const row of (rows.results || [])) {
    problemMap.set(row.id as number, {
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
    });
  }

  // ── 4. Build response (newest first, same shape as before) ──
  const result = dates
    .map(date => {
      const id = dateToId.get(date);
      if (!id) return null;
      const problem = problemMap.get(id);
      if (!problem) return null;
      return { date, ...problem };
    })
    .filter(Boolean);

  const res = Response.json(result, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
};
