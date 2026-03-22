/**
 * GET /api/rated-problem
 *
 * Matchmaking endpoint for Rated mode.
 * Returns a random problem matched to the player's rating.
 * Uses updated ratings from problem_ratings when available,
 * falls back to initial formula for unrated problems.
 *
 * Query params:
 *   rating     - player's current Glicko-2 rating
 *   sessionId  - session ID to exclude already-solved problems
 */

import { addFairyExclusion } from './fairy-filter';
import { difficultyToRating } from '../utils/glicko2';

/**
 * SQL expression for initial rating (used for unrated problems):
 * 600 + (move_count - 2) * 300 + piece_count * 50 + solutionComponent
 */
const RATING_EXPR = '(600 + (move_count - 2) * 300 + piece_count * 50 + MIN(MAX((difficulty_score - move_count * 100 - piece_count * 2) * 5, 0), 50))';

function buildProblem(row: Record<string, unknown>, actualRating?: number) {
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
    problemRating: actualRating ?? difficultyToRating(row.difficulty_score as number, row.move_count as number, row.piece_count as number),
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

  const ranges = [50, 100, 150, 200, 250, 300, 400];

  for (const range of ranges) {
    const minRating = rating - range;
    const maxRating = rating + range;

    // Step 1: Try to find a problem with an updated rating in problem_ratings
    const ratedResult = await tryRatedProblem(context, minRating, maxRating, solvedIds, dev);
    if (ratedResult) return Response.json(ratedResult);

    // Step 2: Fall back to unrated problems using initial formula
    const unratedResult = await tryUnratedProblem(context, minRating, maxRating, solvedIds, dev);
    if (unratedResult) return Response.json(unratedResult);
  }

  // Fallback: any direct problem (excluding #1)
  const conditions: string[] = ['genre = ?', 'move_count >= 2'];
  const bindings: (string | number)[] = ['direct'];
  addFairyExclusion(conditions, bindings);

  const row = await context.env.DB.prepare(
    `SELECT id, fen, authors, source_name, source_year, stipulation, move_count,
            genre, difficulty, difficulty_score, piece_count, keywords, award, solution_text
     FROM problems
     WHERE ${conditions.join(' AND ')}
     ORDER BY RANDOM()
     LIMIT 1`
  ).bind(...bindings).first<Record<string, unknown>>();

  if (!row) {
    return Response.json({ error: 'No problems found' }, { status: 404 });
  }

  return Response.json(buildProblem(row));
};

/**
 * Try to find a problem that has been rated (exists in problem_ratings)
 * and whose updated rating falls within the target range.
 */
async function tryRatedProblem(
  context: EventContext<Env, string, unknown>,
  minRating: number,
  maxRating: number,
  solvedIds: number[],
  dev: number,
): Promise<ReturnType<typeof buildProblem> | null> {
  // Query problem_ratings for IDs in range
  const excludeClause = solvedIds.length > 0
    ? `AND problem_id NOT IN (${solvedIds.map(() => '?').join(',')})`
    : '';
  const ratingBindings: (number | string)[] = [dev, minRating, maxRating, ...solvedIds];

  const ratedRows = await context.env.STATS_DB.prepare(
    `SELECT problem_id, rating FROM problem_ratings
     WHERE dev = ? AND rating >= ? AND rating <= ? ${excludeClause}
     ORDER BY RANDOM()
     LIMIT 5`
  ).bind(...ratingBindings).all<{ problem_id: number; rating: number }>();

  if (ratedRows.results.length === 0) return null;

  // Fetch problem data from main DB
  for (const rated of ratedRows.results) {
    const conditions: string[] = ['id = ?', 'genre = ?', 'move_count >= 2', "solution_text NOT LIKE '%+b)%'", "solution_text NOT LIKE 'a)%'"];
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
      return buildProblem(row, rated.rating);
    }
  }

  return null;
}

/**
 * Try to find an unrated problem (not in problem_ratings)
 * using the initial formula-based rating.
 */
async function tryUnratedProblem(
  context: EventContext<Env, string, unknown>,
  minRating: number,
  maxRating: number,
  solvedIds: number[],
  dev: number,
): Promise<ReturnType<typeof buildProblem> | null> {
  // Get IDs of already-rated problems to exclude them
  const ratedIdRows = await context.env.STATS_DB.prepare(
    'SELECT problem_id FROM problem_ratings WHERE dev = ?'
  ).bind(dev).all<{ problem_id: number }>();
  const ratedIds = ratedIdRows.results.map(r => r.problem_id);

  const excludeIds = [...new Set([...solvedIds, ...ratedIds])];

  const conditions: string[] = [
    'genre = ?',
    'move_count >= 2',
    `${RATING_EXPR} >= ?`,
    `${RATING_EXPR} <= ?`,
    "solution_text NOT LIKE '%+b)%'",
    "solution_text NOT LIKE 'a)%'",
  ];
  const bindings: (string | number)[] = ['direct', minRating, maxRating];

  if (excludeIds.length > 0) {
    conditions.push(`id NOT IN (${excludeIds.map(() => '?').join(',')})`);
    bindings.push(...excludeIds);
  }

  addFairyExclusion(conditions, bindings);

  const row = await context.env.DB.prepare(
    `SELECT id, fen, authors, source_name, source_year, stipulation, move_count,
            genre, difficulty, difficulty_score, piece_count, keywords, award, solution_text
     FROM problems
     WHERE ${conditions.join(' AND ')}
     ORDER BY RANDOM()
     LIMIT 1`
  ).bind(...bindings).first<Record<string, unknown>>();

  if (!row) return null;
  return buildProblem(row);
}
