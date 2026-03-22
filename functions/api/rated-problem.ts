/**
 * GET /api/rated-problem
 *
 * Matchmaking endpoint for Rated mode.
 * Returns a random problem matched to the player's rating.
 * All problem ratings are stored in problem_ratings table (pre-populated with initial values).
 *
 * Query params:
 *   rating     - player's current Glicko-2 rating
 *   sessionId  - session ID to exclude already-solved problems
 */

import { addFairyExclusion } from './fairy-filter';

function buildProblem(row: Record<string, unknown>, problemRating: number) {
  return {
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
    award: row.award,
    solutionText: row.solution_text,
    problemRating,
  };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const params = url.searchParams;

  const rating = parseFloat(params.get('rating') || '800');
  const sessionId = params.get('sessionId') || '';
  const dev = params.get('dev') === '1' ? 1 : 0;

  // Get IDs of problems already attempted by this session (from STATS_DB)
  let solvedIds: number[] = [];
  if (sessionId) {
    const rows = await context.env.STATS_DB.prepare(
      'SELECT DISTINCT problem_id FROM solve_events WHERE session_id = ?'
    ).bind(sessionId).all<{ problem_id: number }>();
    solvedIds = rows.results.map(r => r.problem_id);
  }

  const excludeClause = solvedIds.length > 0
    ? `AND problem_id NOT IN (${solvedIds.join(',')})`
    : '';

  const ranges = [50, 100, 150, 200, 250, 300, 400];

  for (const range of ranges) {
    const minRating = rating - range;
    const maxRating = rating + range;

    // Find a problem from problem_ratings within range
    const ratedRow = await context.env.STATS_DB.prepare(
      `SELECT problem_id, rating FROM problem_ratings
       WHERE dev = ? AND rating >= ? AND rating <= ? ${excludeClause}
       ORDER BY RANDOM()
       LIMIT 5`
    ).bind(dev, minRating, maxRating).all<{ problem_id: number; rating: number }>();

    if (ratedRow.results.length === 0) continue;

    // Fetch problem data from main DB
    for (const rated of ratedRow.results) {
      const conditions: string[] = ['id = ?', 'genre = ?', 'move_count >= 2'];
      const bindings: (string | number)[] = [rated.problem_id, 'direct'];
      addFairyExclusion(conditions, bindings);

      const row = await context.env.DB.prepare(
        `SELECT id, fen, authors, source_name, source_year, stipulation, move_count,
                genre, difficulty, difficulty_score, piece_count, keywords, award, solution_text
         FROM problems
         WHERE ${conditions.join(' AND ')}
         LIMIT 1`
      ).bind(...bindings).first<Record<string, unknown>>();

      if (row) {
        return Response.json(buildProblem(row, rated.rating));
      }
    }
  }

  return Response.json({ error: 'No problems found in rating range' }, { status: 404 });
};
