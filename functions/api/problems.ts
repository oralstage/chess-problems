import { addFairyExclusion } from './fairy-filter';

/**
 * GET /api/problems
 *
 * Query params:
 *   genre       - required: direct|help|self|study|retro
 *   page        - optional: page number (default 0)
 *   pageSize    - optional: items per page (default 20, max 100)
 *   sortBy      - optional: difficulty|year (default difficulty)
 *   sortOrder   - optional: asc|desc (default asc)
 *   stipulations - optional: comma-separated (e.g. "#2,#3")
 *   keywords    - optional: comma-separated theme keywords
 *   minPieces   - optional: min piece count
 *   maxPieces   - optional: max piece count
 *   minYear     - optional: min source year
 *   maxYear     - optional: max source year
 *
 * Returns:
 *   { problems: [...], total: number, page: number, pageSize: number }
 *   Problems do NOT include solution_text (for list view only).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const params = url.searchParams;

  // Edge-cache per full URL: problem data only changes on import, and the
  // paginated background loads re-request identical URLs from every browser
  // whose Cache API copy is cold.
  const cache = caches.default;
  const cacheKey = new Request(url.toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const genre = params.get('genre');
  if (!genre || !['direct', 'help', 'self', 'study', 'retro'].includes(genre)) {
    return Response.json({ error: 'genre is required (direct|help|self|study|retro)' }, { status: 400 });
  }

  const page = Math.max(0, parseInt(params.get('page') || '0') || 0);
  const pageSize = Math.min(5000, Math.max(1, parseInt(params.get('pageSize') || '20') || 20));
  const sortBy = params.get('sortBy') === 'year' ? 'source_year' : 'difficulty_score';
  const sortOrder = params.get('sortOrder') === 'desc' ? 'DESC' : 'ASC';

  // Build WHERE clause
  const conditions: string[] = ['genre = ?'];
  const bindings: (string | number)[] = [genre];

  // Stipulation filter
  const stipulations = params.get('stipulations');
  if (stipulations) {
    const stips = stipulations.split(',').filter(Boolean);
    if (stips.length > 0) {
      conditions.push(`stipulation IN (${stips.map(() => '?').join(',')})`);
      bindings.push(...stips);
    }
  }

  // Keyword filter (any match)
  const keywords = params.get('keywords');
  if (keywords) {
    const kws = keywords.split(',').filter(Boolean);
    if (kws.length > 0) {
      // JSON array stored as text, use LIKE for each keyword
      const kwConditions = kws.map(() => `keywords LIKE ?`);
      conditions.push(`(${kwConditions.join(' OR ')})`);
      bindings.push(...kws.map(kw => `%"${kw}"%`));
    }
  }

  // Piece count range
  const minPieces = params.get('minPieces');
  if (minPieces && Number.isFinite(parseInt(minPieces))) { conditions.push('piece_count >= ?'); bindings.push(parseInt(minPieces)); }
  const maxPieces = params.get('maxPieces');
  if (maxPieces && Number.isFinite(parseInt(maxPieces))) { conditions.push('piece_count <= ?'); bindings.push(parseInt(maxPieces)); }

  // Year range
  const minYear = params.get('minYear');
  if (minYear && Number.isFinite(parseInt(minYear))) { conditions.push('source_year >= ?'); bindings.push(parseInt(minYear)); }
  const maxYear = params.get('maxYear');
  if (maxYear && Number.isFinite(parseInt(maxYear))) { conditions.push('source_year <= ?'); bindings.push(parseInt(maxYear)); }

  // Anything beyond the genre condition (so far) means user-chosen filters
  // the count cache can't cover: stipulations, keywords, pieces, years.
  const hasUncacheableFilters = conditions.length > 1;

  // Move count range. Tracked separately: category lists (#3, #4+, h#2…)
  // always carry a move range, so counts for genre+moves-only must still be
  // servable from stats_cache or every category page view pays a full scan.
  const minMoves = params.get('minMoves');
  const minMovesN = minMoves && Number.isFinite(parseInt(minMoves)) ? parseInt(minMoves) : null;
  const maxMoves = params.get('maxMoves');
  const maxMovesN = maxMoves && Number.isFinite(parseInt(maxMoves)) ? parseInt(maxMoves) : null;
  if (minMovesN != null && minMovesN === maxMovesN) {
    // Equality instead of a closed range: with idx_genre_moves_diff the
    // difficulty order then comes straight off the index (a range forces a
    // temp b-tree sort over the whole category — the seconds-long first
    // open of #2/#3).
    conditions.push('move_count = ?'); bindings.push(minMovesN);
  } else {
    if (minMovesN != null) { conditions.push('move_count >= ?'); bindings.push(minMovesN); }
    if (maxMovesN != null) { conditions.push('move_count <= ?'); bindings.push(maxMovesN); }
  }

  const filtered = hasUncacheableFilters;
  const hasMoves = minMovesN != null || maxMovesN != null;

  // Exclude fairy problems (detected by keywords)
  addFairyExclusion(conditions, bindings);

  const where = conditions.join(' AND ');

  // Total count. The unfiltered per-genre total is static between imports but
  // costs a ~570k-row scan per request — after the /api/stats fix this was the
  // largest remaining D1 read (see CLAUDE.md, D1 無料枠). Serve it from
  // stats_cache; filtered combinations are rare enough to stay dynamic.
  // Invalidated together with the stats keys (DELETE FROM stats_cache).
  let total: number | null = null;
  const countCacheKey = hasMoves
    ? `v1:count:${genre}:m${minMovesN ?? 0}-${maxMovesN ?? 0}`
    : `v1:count:${genre}`;
  if (!filtered) {
    try {
      const row = await context.env.STATS_DB.prepare(
        'SELECT payload FROM stats_cache WHERE key = ?'
      ).bind(countCacheKey).first<{ payload: string }>();
      if (row) total = parseInt(row.payload);
    } catch { /* table missing — compute below */ }
  }

  if (total === null || Number.isNaN(total)) {
    const countResult = await context.env.DB.prepare(
      `SELECT COUNT(*) as total FROM problems WHERE ${where}`
    ).bind(...bindings).first<{ total: number }>();
    total = countResult?.total ?? 0;
    if (!filtered) {
      context.waitUntil(
        context.env.STATS_DB.prepare(
          'INSERT OR REPLACE INTO stats_cache (key, payload, updated_at) VALUES (?, ?, ?)'
        ).bind(countCacheKey, String(total), new Date().toISOString()).run().catch(() => {})
      );
    }
  }

  // Get page of problems (without solution_text for list view).
  // Keyset mode (afterScore+afterId): OFFSET scans offset+limit rows, which
  // makes a full-genre background load quadratic (~16M rows read for direct).
  // The cursor walk rides idx_genre_difficulty and reads ~pageSize rows per
  // page instead. Order matches the OFFSET path (difficulty ascending).
  const afterScoreP = params.get('afterScore');
  const afterIdP = params.get('afterId');
  const useKeyset = afterScoreP != null && afterIdP != null
    && Number.isFinite(parseFloat(afterScoreP)) && Number.isFinite(parseInt(afterIdP));

  let rows;
  if (useKeyset) {
    const afterScore = parseFloat(afterScoreP!);
    const afterId = parseInt(afterIdP!);
    rows = await context.env.DB.prepare(
      `SELECT id, fen, authors, source_name, source_year, stipulation, move_count, genre, difficulty, difficulty_score, piece_count, keywords, award
       FROM problems
       WHERE ${where} AND (difficulty_score > ? OR (difficulty_score = ? AND id > ?))
       ORDER BY difficulty_score ASC, id ASC
       LIMIT ?`
    ).bind(...bindings, afterScore, afterScore, afterId, pageSize).all();
  } else {
    const offset = page * pageSize;
    const nullHandling = sortBy === 'source_year' ? 'NULLS LAST' : '';
    rows = await context.env.DB.prepare(
      `SELECT id, fen, authors, source_name, source_year, stipulation, move_count, genre, difficulty, difficulty_score, piece_count, keywords, award
       FROM problems
       WHERE ${where}
       ORDER BY ${sortBy} ${sortOrder} ${nullHandling}, id ASC
       LIMIT ? OFFSET ?`
    ).bind(...bindings, pageSize, offset).all();
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

  const response = Response.json({ problems, total, page, pageSize }, {
    headers: { 'Cache-Control': 'public, max-age=86400' },
  });
  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
