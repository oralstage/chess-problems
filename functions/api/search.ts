import { addFairyExclusion } from './fairy-filter';
import { nameWords, searchKey } from './name-normalize';
import { dataCacheKey, DATA_CACHE_CONTROL } from './data-cache';
import { isMissingTable, unavailable } from './list-guard';

/**
 * GET /api/search
 *
 * Two modes, because the index scan must not be repeated per page.
 *
 *   ?author=NAME
 *     The whole match as a light list — one row per problem, id/genre/year/
 *     stipulation/difficulty only. Costs the ~21k-row author_search scan plus
 *     the matched problems' rows, once. The client sorts, filters by genre and
 *     pages this list itself.
 *
 *   ?ids=1,2,3
 *     Full rows for up to 100 ids, in the order given — one page's worth.
 *     Costs those rows and nothing else. A GET, so the edge caches it.
 *
 * Paging used to re-run the author query for every page: 18 problems for
 * ~26,000 rows read, eleven times over to see what one request used to
 * return. Now a page turn costs the page.
 *
 * Returns:
 *   author mode: { list: [[id, genreChar, year, stipulation, difficulty]], total }
 *   ids mode:    { results: [...] }
 */

/** One letter per genre, to keep the light list small. */
const GENRE_CHAR: Record<string, string> = { direct: 'd', help: 'h', self: 's', study: 'e', retro: 'r' };

const PROBLEM_FIELDS =
  'id, fen, authors, source_name, source_year, stipulation, move_count, genre, difficulty, difficulty_score, piece_count, keywords, award';

function toResult(row: Record<string, unknown>) {
  return {
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
  };
}
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

// The limiter alone does not protect the day: a bot that keeps to ten novel
// searches a minute reads ~210k rows a minute and spends the whole account's
// 5M in about 24 minutes. So novel searches also draw on one budget per UTC
// day, counted in stats_cache (one row read and written per search). People
// made three in the whole fortnight before 2026-09-29 (insights), so fifty
// never stops a reader; at ~21k rows for the index plus up to 5,000 matched
// problems, the most it lets through is ~1.3M rows. Past it, search answers
// 503 until the quota resets and the rest of the site is untouched.
const NOVEL_SEARCHES_PER_DAY = 50;

/** Take one novel search from today's budget. False when it is spent, and
 *  when it cannot be counted: a search that cannot be counted is not run. */
async function takeSearchBudget(env: Env): Promise<boolean> {
  const now = new Date().toISOString();
  try {
    const row = await env.STATS_DB.prepare(
      `INSERT INTO stats_cache (key, payload, updated_at) VALUES (?, '1', ?)
       ON CONFLICT(key) DO UPDATE SET payload = CAST(payload AS INTEGER) + 1, updated_at = excluded.updated_at
       RETURNING payload`
    ).bind(`search-day:${now.slice(0, 10)}`, now).first<{ payload: string | number }>();
    return row != null && Number(row.payload) <= NOVEL_SEARCHES_PER_DAY;
  } catch {
    return false;
  }
}

/** Seconds until 00:00 UTC, when the day's budget (and D1's quota) resets. */
function secondsToUtcMidnight(): number {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const author = url.searchParams.get('author')?.trim();
  const idsParam = url.searchParams.get('ids');

  // One page of an already-known list. No author_search scan, no rate limit:
  // it reads exactly the rows it returns.
  if (idsParam) {
    const ids = idsParam.split(',')
      .map(v => parseInt(v, 10))
      .filter(v => Number.isSafeInteger(v) && v > 0)
      .slice(0, 100);
    if (ids.length === 0) {
      return Response.json({ error: 'ids must be a comma-separated list of problem ids' }, { status: 400 });
    }
    // Keyed on the ids alone, written as the app writes them, so nothing
    // added to the URL can move it off its entry.
    const keyUrlIds = new URL('/api/search', url.origin);
    keyUrlIds.searchParams.set('ids', ids.join(','));
    const cacheKeyIds = dataCacheKey(keyUrlIds);
    const hit = await caches.default.match(cacheKeyIds);
    if (hit) return hit;
    const rows = await context.env.DB.prepare(
      `SELECT ${PROBLEM_FIELDS} FROM problems WHERE id IN (${ids.join(',')}) AND is_fairy = 0`
    ).all();
    const rank = new Map(ids.map((id, i) => [id, i]));
    const ordered = (rows.results as Record<string, unknown>[])
      .sort((a, b) => (rank.get(a.id as number) ?? 0) - (rank.get(b.id as number) ?? 0))
      .map(toResult);
    const res = Response.json({ results: ordered }, {
      headers: { 'Cache-Control': DATA_CACHE_CONTROL },
    });
    context.waitUntil(caches.default.put(cacheKeyIds, res.clone()));
    return res;
  }

  if (!author || author.length < 2) {
    return Response.json({ error: 'author param required (min 2 chars)' }, { status: 400 });
  }

  // Break the query into bare words exactly the way the index breaks a name
  // (see functions/api/name-normalize.ts): a reader pastes the name as it is
  // printed — "Visocka, Jūlija", "Winter-Wood" — and splitting on spaces
  // alone left the comma or the hyphen inside the term, which matched nothing
  // at all. Every term must match (AND). Five bindings per term below,
  // against D1's limit of 100.
  const terms = nameWords(author).slice(0, 12);
  if (terms.length === 0) {
    return Response.json({ error: 'author param required (min 2 chars)' }, { status: 400 });
  }

  // Edge-cache per search: the author_search scan (a LIKE on every row)
  // cannot use an index, so at least repeats are free. Keyed on the words,
  // which are all the result depends on, rather than on the URL: "Loyd," and
  // "loyd" share an entry, and nothing added to the URL can force a scan.
  const cache = caches.default;
  const keyUrl = new URL('/api/search', url.origin);
  keyUrl.searchParams.set('author', terms.join(' '));
  const cacheKey = dataCacheKey(keyUrl);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Only cache misses are limited: repeat searches cost nothing and stay free.
  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  if (isRateLimited(ip)) {
    return Response.json({ error: 'Rate limited' }, { status: 429 });
  }
  if (!(await takeSearchBudget(context.env))) {
    return Response.json(
      { error: 'Author search is closed until 00:00 UTC' },
      { status: 503, headers: { 'Retry-After': String(secondsToUtcMidnight()) } },
    );
  }
  // What to look for in the alias columns: the ASCII-folded word, which is
  // the form the index always holds. Spelling a name properly used to find
  // less than misspelling it — "Kovačević" nothing, "Kovacevic" 495.
  const keys = terms.map(searchKey);
  const esc = (t: string) => t.replace(/[\\%_]/g, c => '\\' + c);
  const likePatterns = terms.map(t => `%${esc(t)}%`);

  // Indexed path: scan the ~30k-row author_search table (name → pre-sorted
  // problem ids) instead of LIKE-scanning all ~580k problems. Cuts a novel
  // search from ~580k rows read to ~30k. Falls back to the full scan if the
  // index table is missing (see scripts/build-author-index.ts — rebuild it
  // after every import).
  let indexedIds: number[] | null = null;
  // How well each id's author answered the query, to order the list by.
  const tierOf = new Map<number, number>();
  try {
    const lowered = likePatterns.map(p => p.toLowerCase());
    const onName = terms.map(() => `name_lower LIKE ? ESCAPE '\\'`).join(' AND ');
    // The alias columns hold every searchable word of the name: the printed
    // words themselves, their ASCII-folded forms, and — for a name filed in
    // Cyrillic — each romanisation of it (see scripts/translit.ts). `aliases`
    // is the surname's words, `alias_other` the given names' and patronymics'.
    //
    // A term has to start a word. Matching mid-word turned every common
    // fragment into a dragnet: "dashi" pulled in Wakashima, Tadashi, and the
    // generated spellings are full of Slavic fragments that did the same at
    // scale. What that costs is 44 of 17,675 Latin-filed rows — 346 problems
    // of 448,993 — where one convention writes a leading cluster the reader's
    // convention drops (Tschobanjan for Chobanjan). Prefixes are unaffected,
    // which is what a reader actually types: "tada", "yama", "tkach", "zalok".
    const prefix = keys.map(k => `% ${esc(k)}%`);
    const whole = keys.map(k => `% ${esc(k)} %`);
    const onAnyPart = terms.map(
      () => `((' ' || aliases) LIKE ? ESCAPE '\\' OR (' ' || alias_other) LIKE ? ESCAPE '\\')`
    ).join(' AND ');
    // Relevance, not a filter. A word the term matches whole beats one it only
    // begins, and a surname beats a given name or patronymic at equal
    // precision. Both halves are needed: the surname rule alone is what keeps
    // "Bron" on Брон, Владимир Акимович (589 problems) instead of on the
    // patronymic in Згерский, Геннадий Брониславович, and the whole-word rule
    // is what puts Ковачевић, Марјан (495) ahead of Марјановић when the term
    // is his given name. The weaker rows used to be dropped rather than
    // ranked, so "Marjan" returned 131 problems by three other people and not
    // one of his.
    const tierExpr = terms.map(() =>
      `(CASE WHEN (' ' || aliases || ' ') LIKE ? ESCAPE '\\' THEN 3
             WHEN (' ' || alias_other || ' ') LIKE ? ESCAPE '\\' THEN 2
             WHEN (' ' || aliases) LIKE ? ESCAPE '\\' THEN 1 ELSE 0 END)`);
    // A row is only as good as its weakest term.
    const tierSql = tierExpr.length === 1 ? tierExpr[0] : `MIN(${tierExpr.join(', ')})`;
    const bind: string[] = [];
    for (let i = 0; i < terms.length; i++) bind.push(whole[i], whole[i], prefix[i]);
    for (const p of prefix) bind.push(p, p);
    let rows;
    try {
      rows = await context.env.DB.prepare(
        `SELECT problem_ids, ${tierSql} AS tier
         FROM author_search WHERE ${onAnyPart}
         ORDER BY tier DESC, length(problem_ids) DESC LIMIT 100`
      ).bind(...bind).all();
    } catch {
      // Index built before the alias columns existed.
      rows = await context.env.DB.prepare(
        `SELECT problem_ids, 1 AS tier FROM author_search WHERE ${onName}
         ORDER BY length(problem_ids) DESC LIMIT 100`
      ).bind(...lowered).all();
    }
    const all = rows.results as { problem_ids: string; tier: number }[];
    const byTier = new Map<number, number[][]>();
    for (const r of all) {
      try {
        const ids = JSON.parse(r.problem_ids).filter((id: unknown) => Number.isInteger(id));
        if (ids.length === 0) continue;
        const t = r.tier ?? 0;
        const group = byTier.get(t);
        if (group) group.push(ids); else byTier.set(t, [ids]);
      } catch { /* skip malformed row */ }
    }
    indexedIds = [];
    const CAP = 5000;
    // Round-robin within a tier, so no one author's newest problems bury the
    // others equally good; tiers in turn, so the cap falls on the weakest.
    for (const tier of [...byTier.keys()].sort((a, b) => b - a)) {
      const lists = byTier.get(tier)!;
      for (let round = 0; indexedIds.length < CAP; round++) {
        let took = false;
        for (const list of lists) {
          if (round < list.length && indexedIds.length < CAP) {
            const id = list[round];
            indexedIds.push(id);
            if (!tierOf.has(id)) tierOf.set(id, tier);
            took = true;
          }
        }
        if (!took) break;
      }
    }
  } catch (e) {
    // Only a missing author_search table takes the legacy path, a LIKE over
    // every problem (~580k rows); any other failure would make one search
    // cost as much as twenty-five, past the budget above.
    if (!isMissingTable(e)) return unavailable();
    indexedIds = null;
  }

  let rowsForQuery: Record<string, unknown>[];
  if (indexedIds != null) {
    if (indexedIds.length === 0) {
      const empty = Response.json({ list: [], total: 0 }, {
        headers: { 'Cache-Control': DATA_CACHE_CONTROL },
      });
      context.waitUntil(cache.put(cacheKey, empty.clone()));
      return empty;
    }
    // Numeric literals sidestep D1's 100-binding limit.
    const pick = [...new Set(indexedIds)];
    const result = await context.env.DB.prepare(
      `SELECT id, genre, source_year, stipulation, difficulty_score
       FROM problems WHERE id IN (${pick.join(',')}) AND is_fairy = 0`
    ).all();
    rowsForQuery = result.results as Record<string, unknown>[];
  } else {
    const conditions: string[] = [];
    const bindings: (string | number)[] = [];
    for (const p of likePatterns) {
      conditions.push(`authors LIKE ? ESCAPE '\\'`);
      bindings.push(p);
    }
    addFairyExclusion(conditions, bindings);
    const result = await context.env.DB.prepare(
      `SELECT id, genre, source_year, stipulation, difficulty_score
       FROM problems
       WHERE ${conditions.join(' AND ')}
       ORDER BY source_year DESC, difficulty_score ASC
       LIMIT 1000`
    ).bind(...bindings).all();
    rowsForQuery = result.results as Record<string, unknown>[];
  }

  // Best match first, and newest within it — oldest of a year's problems
  // being the easiest. The client re-sorts for its other two orders without
  // asking again. Only a query that reaches several people has more than one
  // tier, and there the closer match is what the reader is looking for.
  rowsForQuery.sort((a, b) => {
    const ta = tierOf.get(a.id as number) ?? 0, tb = tierOf.get(b.id as number) ?? 0;
    if (ta !== tb) return tb - ta;
    const ya = a.source_year as number | null, yb = b.source_year as number | null;
    if (ya == null && yb == null) return (a.difficulty_score as number) - (b.difficulty_score as number);
    if (ya == null) return 1;
    if (yb == null) return -1;
    if (ya !== yb) return yb - ya;
    return (a.difficulty_score as number) - (b.difficulty_score as number);
  });

  const list = rowsForQuery.map(row => [
    row.id as number,
    GENRE_CHAR[row.genre as string] ?? '?',
    row.source_year as number | null,
    row.stipulation as string,
    row.difficulty_score as number,
  ]);

  const response = Response.json({ list, total: list.length }, {
    headers: { 'Cache-Control': DATA_CACHE_CONTROL },
  });
  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
