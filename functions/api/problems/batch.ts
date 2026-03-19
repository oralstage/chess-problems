/**
 * POST /api/problems/batch
 *
 * Fetch multiple problems by ID in a single request.
 * Body: { ids: number[] }
 * Returns: { problems: ProblemMeta[] }
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const body = await context.request.json() as { ids: number[] };
  if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
    return Response.json({ error: 'ids array is required' }, { status: 400 });
  }

  // Limit to 100 IDs per request
  const ids = body.ids.slice(0, 100);
  const placeholders = ids.map(() => '?').join(',');

  const rows = await context.env.DB.prepare(
    `SELECT id, fen, authors, source_name, source_year, stipulation, move_count,
            genre, difficulty, difficulty_score, piece_count, keywords, award, solution_text
     FROM problems
     WHERE id IN (${placeholders})`
  ).bind(...ids).all();

  const problems = rows.results.map((row: Record<string, unknown>) => ({
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
    solutionText: row.solution_text,
  }));

  return Response.json({ problems }, {
    headers: { 'Cache-Control': 'public, max-age=86400' },
  });
};
