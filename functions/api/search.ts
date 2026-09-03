import { addFairyExclusion } from './fairy-filter';
import { dataCacheKey, DATA_CACHE_CONTROL } from './data-cache';

/**
 * GET /api/search
 *
 * Query params:
 *   author   - author name; each whitespace-separated term must start a word
 *              of the name or of one of its generated readings
 *   page     - 0-based page index
 *   pageSize - problems per page (default 18, max 100)
 *   genre    - optional genre filter
 *   sort     - year-desc (default) | year-asc | stipulation
 *
 * Returns:
 *   { results: [...], total, page, pageSize, genreCounts }
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
  // Paged like the problem list, not capped: the old 200-result ceiling hid
  // most of the composers who matter — 683 of them have more than 200
  // problems and hold 58% of the database between them.
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0') || 0);
  const pageSize = Math.min(100, Math.max(1,
    parseInt(url.searchParams.get('pageSize') || '18') || 18));
  const genreFilter = url.searchParams.get('genre') || '';
  const sort = url.searchParams.get('sort') || 'year-desc';

  if (!author || author.length < 2) {
    return Response.json({ error: 'author param required (min 2 chars)' }, { status: 400 });
  }

  // Edge-cache per URL: the LIKE scan reads the whole table (~580k rows) and
  // cannot use an index, so at least repeats of the same search are free.
  const cache = caches.default;
  const cacheKey = dataCacheKey(url);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Only cache misses are limited: repeat searches cost nothing and stay free.
  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  if (isRateLimited(ip)) {
    return Response.json({ error: 'Rate limited' }, { status: 429 });
  }

  // Split search terms by space and require all to match (AND).
  // Escape LIKE metacharacters so user input can't act as wildcards.
  // Six bindings per term below, against D1's limit of 100.
  const terms = author.split(/\s+/).filter(t => t.length > 0).slice(0, 12);
  const likePatterns = terms.map(t => `%${t.replace(/[\\%_]/g, c => '\\' + c)}%`);

  // Indexed path: scan the ~30k-row author_search table (name → pre-sorted
  // problem ids) instead of LIKE-scanning all ~580k problems. Cuts a novel
  // search from ~580k rows read to ~30k. Falls back to the full scan if the
  // index table is missing (see scripts/build-author-index.ts — rebuild it
  // after every import).
  let indexedIds: number[] | null = null;
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
    const anchored = terms.map(t => `% ${t.replace(/[\\%_]/g, c => '\\' + c).toLowerCase()}%`);
    const onSurname = terms.map(() => `(' ' || aliases) LIKE ? ESCAPE '\\'`).join(' AND ');
    const onAnyPart = terms.map(
      () => `((' ' || aliases) LIKE ? ESCAPE '\\' OR (' ' || alias_other) LIKE ? ESCAPE '\\')`
    ).join(' AND ');
    // A surname hit outranks a given-name or patronymic one, and the weaker
    // rows are dropped whenever any surname matched at all — otherwise "Bron"
    // spends the page on the patronymic in Згерский, Геннадий Брониславович
    // and never reaches Брон, Владимир Акимович.
    const bind: string[] = [];
    for (const a of anchored) bind.push(a);
    for (const a of anchored) bind.push(a, a);
    let rows;
    try {
      rows = await context.env.DB.prepare(
        `SELECT problem_ids, (CASE WHEN ${onSurname} THEN 1 ELSE 0 END) AS tier
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
    const named = all.filter(r => r.tier > 0);
    const lists: number[][] = [];
    for (const r of (named.length > 0 ? named : all)) {
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

  let rowsForQuery: Record<string, unknown>[];
  if (indexedIds != null) {
    if (indexedIds.length === 0) {
      const empty = Response.json({ results: [], total: 0, page, pageSize, genreCounts: {} }, {
        headers: { 'Cache-Control': DATA_CACHE_CONTROL },
      });
      context.waitUntil(cache.put(cacheKey, empty.clone()));
      return empty;
    }
    // Numeric literals sidestep D1's 100-binding limit.
    const pick = [...new Set(indexedIds)];
    const result = await context.env.DB.prepare(
      `SELECT id, fen, authors, source_name, source_year, stipulation, move_count, genre, difficulty, difficulty_score, piece_count, keywords, award
       FROM problems
       WHERE id IN (${pick.join(',')}) AND is_fairy = 0`
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
      `SELECT id, fen, authors, source_name, source_year, stipulation, move_count, genre, difficulty, difficulty_score, piece_count, keywords, award
       FROM problems
       WHERE ${conditions.join(' AND ')}
       ORDER BY source_year DESC, difficulty_score ASC
       LIMIT 1000`
    ).bind(...bindings).all();
    rowsForQuery = result.results as Record<string, unknown>[];
  }

  // Genre counts come from the whole match, not from the page — the chips are
  // there to say what the search found, and counting only what is on screen
  // made them say something else.
  const genreCounts: Record<string, number> = {};
  for (const row of rowsForQuery) {
    const g = row.genre as string;
    genreCounts[g] = (genreCounts[g] || 0) + 1;
  }

  const filtered = genreFilter ? rowsForQuery.filter(r => r.genre === genreFilter) : rowsForQuery;
  filtered.sort((a, b) => {
    if (sort === 'stipulation') {
      return (a.stipulation as string).localeCompare(b.stipulation as string);
    }
    const ya = a.source_year as number | null, yb = b.source_year as number | null;
    if (ya == null && yb == null) return (a.difficulty_score as number) - (b.difficulty_score as number);
    if (ya == null) return 1;
    if (yb == null) return -1;
    if (ya !== yb) return sort === 'year-asc' ? ya - yb : yb - ya;
    return (a.difficulty_score as number) - (b.difficulty_score as number);
  });

  const total = filtered.length;
  const results = filtered
    .slice(page * pageSize, page * pageSize + pageSize)
    .map((row: Record<string, unknown>) => ({
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

  const response = Response.json({ results, total, page, pageSize, genreCounts }, {
    headers: { 'Cache-Control': DATA_CACHE_CONTROL },
  });
  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
