/**
 * GET /api/rated-problem
 *
 * Matchmaking endpoint for Rated mode.
 * Returns a random problem matched to the player's rating.
 *
 * Query params:
 *   rating     - player's current Glicko-2 rating
 *   excludeIds - comma-separated problem IDs to exclude (recently solved)
 */

import { addFairyExclusion } from './fairy-filter';
import { difficultyToRating } from '../utils/glicko2';

/**
 * SQL expression that approximates the problem rating formula:
 * 600 + (move_count - 2) * 300 + piece_count * 50
 */
const RATING_EXPR = '(600 + (move_count - 2) * 300 + piece_count * 50)';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const params = url.searchParams;

  const rating = parseFloat(params.get('rating') || '800');
  const sessionId = params.get('sessionId') || '';

  // Get IDs of problems already attempted by this session (from STATS_DB)
  let solvedIds: number[] = [];
  if (sessionId) {
    const rows = await context.env.STATS_DB.prepare(
      'SELECT DISTINCT problem_id FROM solve_events WHERE session_id = ?'
    ).bind(sessionId).all<{ problem_id: number }>();
    solvedIds = rows.results.map(r => r.problem_id);
  }

  // Try progressively wider ranges
  const ranges = [50, 100, 200, 400];

  for (const range of ranges) {
    const minRating = rating - range;
    const maxRating = rating + range;

    const conditions: string[] = [
      'genre = ?',
      'move_count >= 2',
      `${RATING_EXPR} >= ?`,
      `${RATING_EXPR} <= ?`,
    ];
    const bindings: (string | number)[] = ['direct', minRating, maxRating];

    // Exclude already-solved problems
    if (solvedIds.length > 0) {
      conditions.push(`id NOT IN (${solvedIds.map(() => '?').join(',')})`);
      bindings.push(...solvedIds);
    }

    // Exclude fairy
    addFairyExclusion(conditions, bindings);

    const row = await context.env.DB.prepare(
      `SELECT id, fen, authors, source_name, source_year, stipulation, move_count,
              genre, difficulty, difficulty_score, piece_count, keywords, award, solution_text
       FROM problems
       WHERE ${conditions.join(' AND ')}
       ORDER BY RANDOM()
       LIMIT 1`
    ).bind(...bindings).first<Record<string, unknown>>();

    if (row) {
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
        keywords: JSON.parse(row.keywords as string),
        award: row.award,
        solutionText: row.solution_text,
        problemRating: difficultyToRating(row.difficulty_score as number, row.move_count as number, row.piece_count as number),
      };

      return Response.json(problem);
    }
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
    keywords: JSON.parse(row.keywords as string),
    award: row.award,
    solutionText: row.solution_text,
    problemRating: difficultyToRating(row.difficulty_score as number, row.move_count as number, row.piece_count as number),
  };

  return Response.json(problem);
};
