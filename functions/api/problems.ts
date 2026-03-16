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

  const genre = params.get('genre');
  if (!genre || !['direct', 'help', 'self', 'study', 'retro'].includes(genre)) {
    return Response.json({ error: 'genre is required (direct|help|self|study|retro)' }, { status: 400 });
  }

  const page = Math.max(0, parseInt(params.get('page') || '0'));
  const pageSize = Math.min(100, Math.max(1, parseInt(params.get('pageSize') || '20')));
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
  if (minPieces) { conditions.push('piece_count >= ?'); bindings.push(parseInt(minPieces)); }
  const maxPieces = params.get('maxPieces');
  if (maxPieces) { conditions.push('piece_count <= ?'); bindings.push(parseInt(maxPieces)); }

  // Year range
  const minYear = params.get('minYear');
  if (minYear) { conditions.push('source_year >= ?'); bindings.push(parseInt(minYear)); }
  const maxYear = params.get('maxYear');
  if (maxYear) { conditions.push('source_year <= ?'); bindings.push(parseInt(maxYear)); }

  const where = conditions.join(' AND ');

  // Get total count
  const countResult = await context.env.DB.prepare(
    `SELECT COUNT(*) as total FROM problems WHERE ${where}`
  ).bind(...bindings).first<{ total: number }>();

  const total = countResult?.total ?? 0;

  // Get page of problems (without solution_text for list view)
  const offset = page * pageSize;
  const nullHandling = sortBy === 'source_year' ? 'NULLS LAST' : '';
  const rows = await context.env.DB.prepare(
    `SELECT id, fen, authors, source_name, source_year, stipulation, move_count, genre, difficulty, difficulty_score, piece_count, keywords, award
     FROM problems
     WHERE ${where}
     ORDER BY ${sortBy} ${sortOrder} ${nullHandling}
     LIMIT ? OFFSET ?`
  ).bind(...bindings, pageSize, offset).all();

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

  return Response.json({ problems, total, page, pageSize });
};
