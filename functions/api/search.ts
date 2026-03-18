import { addFairyExclusion } from './fairy-filter';

/**
 * GET /api/search
 *
 * Query params:
 *   author - search by author name (partial match, case-insensitive)
 *   limit  - max results (default 50, max 200)
 *
 * Returns:
 *   { results: [{ id, fen, authors, sourceName, sourceYear, stipulation, moveCount, genre, difficulty, difficultyScore, pieceCount, keywords, award }] }
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const author = url.searchParams.get('author')?.trim();
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));

  if (!author || author.length < 2) {
    return Response.json({ error: 'author param required (min 2 chars)' }, { status: 400 });
  }

  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  // Split search terms by space and require all to match (AND)
  const terms = author.split(/\s+/).filter(t => t.length > 0);
  for (const term of terms) {
    conditions.push('authors LIKE ?');
    bindings.push(`%${term}%`);
  }
  addFairyExclusion(conditions, bindings);

  const result = await context.env.DB.prepare(
    `SELECT id, fen, authors, source_name, source_year, stipulation, move_count, genre, difficulty, difficulty_score, piece_count, keywords, award
     FROM problems
     WHERE ${conditions.join(' AND ')}
     ORDER BY source_year DESC, difficulty_score ASC
     LIMIT ?`
  ).bind(...bindings, limit).all();

  const results = result.results.map((row: Record<string, unknown>) => ({
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

  return Response.json({ results, total: results.length });
};
