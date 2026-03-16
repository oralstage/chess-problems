/**
 * GET /api/problems/:id
 *
 * Returns a single problem with full solution_text for solving.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const id = parseInt(context.params.id as string);
  if (isNaN(id)) {
    return Response.json({ error: 'Invalid problem ID' }, { status: 400 });
  }

  const row = await context.env.DB.prepare(
    `SELECT * FROM problems WHERE id = ?`
  ).bind(id).first();

  if (!row) {
    return Response.json({ error: 'Problem not found' }, { status: 404 });
  }

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
    solutionText: row.solution_text,
    keywords: JSON.parse(row.keywords as string),
    award: row.award,
  };

  return Response.json(problem);
};
