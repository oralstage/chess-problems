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

  // Solutions live in their own database (the problems DB hit the 500MB
  // per-database cap). The old column is the fallback until the migration
  // finishes blanking it.
  let solutionText = row.solution_text as string;
  try {
    const sol = await context.env.SOLUTIONS_DB.prepare(
      'SELECT solution_text FROM solutions WHERE id = ?'
    ).bind(id).first<{ solution_text: string }>();
    if (sol && sol.solution_text) solutionText = sol.solution_text;
  } catch { /* solutions DB unavailable — fall back to the column */ }

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
    solutionText,
    keywords: JSON.parse(row.keywords as string),
    award: row.award,
  };

  return Response.json(problem);
};
