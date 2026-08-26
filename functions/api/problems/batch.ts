/**
 * POST /api/problems/batch
 *
 * Fetch multiple problems by ID in a single request.
 * Body: { ids: number[] }
 * Returns: { problems: ProblemMeta[] }
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: { ids: number[] };
  try {
    body = await context.request.json() as { ids: number[] };
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
    return Response.json({ error: 'ids array is required' }, { status: 400 });
  }

  // Limit to 100 IDs per request; drop non-numeric entries
  const ids = body.ids.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).slice(0, 100);
  if (ids.length === 0) {
    return Response.json({ error: 'ids array is required' }, { status: 400 });
  }
  const placeholders = ids.map(() => '?').join(',');

  const rows = await context.env.DB.prepare(
    `SELECT id, fen, authors, source_name, source_year, stipulation, move_count,
            genre, difficulty, difficulty_score, piece_count, keywords, award, solution_text
     FROM problems
     WHERE id IN (${placeholders})`
  ).bind(...ids).all();

  // Solutions live in their own DB (500MB per-database cap); the old column
  // is the fallback until the migration blanks it.
  const solById = new Map<number, string>();
  try {
    const sols = await context.env.SOLUTIONS_DB.prepare(
      `SELECT id, solution_text FROM solutions WHERE id IN (${placeholders})`
    ).bind(...ids).all();
    for (const r of sols.results as { id: number; solution_text: string }[]) {
      solById.set(r.id, r.solution_text);
    }
  } catch { /* solutions DB unavailable — fall back to the column */ }

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
    solutionText: solById.get(row.id as number) || row.solution_text,
  }));

  return Response.json({ problems }, {
    headers: { 'Cache-Control': 'public, max-age=86400' },
  });
};
