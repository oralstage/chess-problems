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
 *   3. Full calculation  — pool size from stats_cache (1 row) + one OFFSET
 *      query + INSERT into daily_cache. Runs once per date, globally.
 */

// Piece-count ceiling for the daily pool. Part of the stats_cache key below,
// so changing it re-counts the pool instead of reusing a stale total.
const MAX_PIECES = 10;

// How long a cached pool size may be trusted. The pool shrinks in ways the
// import runbook does not cover the moment they happen: update-from-yacpdb
// flips existing problems to is_fairy = 1 in step 5 while the cache is only
// cleared in step 8 (a gap the runbook itself says may span days), and
// rebuild-problems deletes an id range before re-inserting it, so the table is
// genuinely short for the seconds each of its 27 files takes.
//
// A count taken inside one of those windows is too LOW, and a low total never
// overshoots the OFFSET — so the recount-on-null guard below would never fire
// again and the daily would keep drawing from a silently truncated pool until
// someone cleared stats_cache by hand. An expiry bounds every such mistake,
// high or low, to one week without anyone noticing it. Cost: one ~205k-row
// count per week, against the eight the uncached version ran.
const POOL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
    const conditions: string[] = ["genre = 'direct'", "stipulation = '#2'", `piece_count <= ${MAX_PIECES}`, "keywords NOT LIKE '%Shortmate%'"];
    const bindings: (string | number)[] = [];
    addFairyExclusion(conditions, bindings);
    const where = conditions.join(' AND ');

    // The pool size is a ~205k-row scan that only changes on import, yet it was
    // recomputed for every date missing from daily_cache — and the weekly X-post
    // batch (scripts/generate-weekly-daily-posts.mjs) misses seven future dates
    // in one go, so a quiet Sunday cost ~1.6M of the 5M/day read allowance.
    // Serve it from stats_cache, the same table and pattern problems.ts uses for
    // its genre counts, invalidated by the same DELETE FROM stats_cache. The
    // threshold is part of the key so changing MAX_PIECES invalidates it too.
    const poolCacheKey = `v1:count:daily-pool:p${MAX_PIECES}`;

    const countPool = async (): Promise<number> => {
      const countResult = await context.env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM problems WHERE ${where}`
      ).bind(...bindings).first<{ cnt: number }>();
      const n = countResult?.cnt || 0;
      if (n > 0) {
        context.waitUntil(
          context.env.STATS_DB.prepare(
            'INSERT OR REPLACE INTO stats_cache (key, payload, updated_at) VALUES (?, ?, ?)'
          ).bind(poolCacheKey, String(n), new Date().toISOString()).run().catch(() => {})
        );
      }
      return n;
    };

    let total: number | null = null;
    let totalFromCache = false;
    try {
      const row = await context.env.STATS_DB.prepare(
        'SELECT payload, updated_at FROM stats_cache WHERE key = ?'
      ).bind(poolCacheKey).first<{ payload: string; updated_at: string }>();
      const n = row ? parseInt(row.payload) : NaN;
      const age = row ? Date.now() - Date.parse(row.updated_at) : NaN;
      if (Number.isFinite(n) && n > 0 && Number.isFinite(age) && age >= 0 && age < POOL_TTL_MS) {
        total = n;
        totalFromCache = true;
      }
    } catch { /* table missing — compute below */ }

    if (total === null) total = await countPool();
    if (total === 0) {
      return Response.json({ error: 'No daily problems available' }, { status: 404 });
    }

    const [y, m, d] = dateKey.split('-').map(Number);
    const dayNum = y * 10000 + m * 100 + d;
    const GOLDEN = 2654435761;
    const hash = ((dayNum * GOLDEN) >>> 0) / 4294967296;
    const offsetFor = (poolSize: number) => Math.floor(hash * poolSize);

    // An entry YACPDB marks "To delete" opens without a live board, so it
    // cannot be the daily. It is stepped over rather than added to the WHERE:
    // a narrower pool would move every future day's OFFSET and change problems
    // already announced for the week, and would need the cached count redone.
    // Seven of the ~37k in the pool carry the mark, so a step is rare and the
    // extra row reads are a handful.
    const pickOnce = (offset: number) => context.env.DB.prepare(
      `SELECT id, keywords FROM problems WHERE ${where} ORDER BY difficulty_score ASC LIMIT 1 OFFSET ?`
    ).bind(...bindings, offset).first<{ id: number; keywords: string }>();
    const pickAt = async (offset: number) => {
      for (let step = 0; step < 5; step++) {
        const row = await pickOnce(offset + step);
        if (!row || !String(row.keywords).includes('To delete')) return row;
      }
      return null;
    };

    let idRow = await pickAt(offsetFor(total));

    // A cached pool size that outlived a shrinking table would push the OFFSET
    // past the last row and 404 the daily for a whole day. Recount once — which
    // also refreshes the cache — before giving up.
    if (!idRow && totalFromCache) {
      const fresh = await countPool();
      if (fresh > 0) idRow = await pickAt(offsetFor(fresh));
    }

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

  // Solutions live in their own DB; the old column is the fallback.
  let dailySolution = row.solution_text as string;
  try {
    const sol = await context.env.SOLUTIONS_DB.prepare(
      'SELECT solution_text FROM solutions WHERE id = ?'
    ).bind(problemId).first<{ solution_text: string }>();
    if (sol && sol.solution_text) dailySolution = sol.solution_text;
  } catch { /* fall back */ }

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
    solutionText: dailySolution,
  };

  const response = Response.json(problem, {
    headers: { 'Cache-Control': 'public, max-age=86400' },
  });

  // Store in Worker Cache for this edge node
  context.waitUntil(cache.put(cacheKey, response.clone()));

  return response;
};
