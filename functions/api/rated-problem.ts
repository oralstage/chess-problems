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
 *   genre      - which rated pool to draw from (direct | self | help), default direct
 */

const RATED_GENRES = ['direct', 'self', 'help'];

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

  const rating = parseFloat(params.get('rating') || '800') || 800;
  const sessionId = params.get('sessionId') || '';
  const dev = params.get('dev') === '1' ? 1 : 0;
  const genreParam = params.get('genre') || 'direct';
  const genre = RATED_GENRES.includes(genreParam) ? genreParam : 'direct';

  // Get IDs of problems already attempted by this session (from STATS_DB).
  // Capped at the most recent 4000: the NOT IN list is interpolated into the
  // SQL text, and an unbounded list would eventually exceed D1's statement
  // size limit (~12k+ solves), permanently breaking matchmaking for that
  // session. Re-serving a problem solved long ago is acceptable.
  let solvedIds: number[] = [];
  if (sessionId) {
    const rows = await context.env.STATS_DB.prepare(
      `SELECT problem_id, MAX(created_at) AS last_at FROM solve_events
       WHERE session_id = ? AND (genre = ? OR genre = '')
       GROUP BY problem_id
       ORDER BY last_at DESC
       LIMIT 4000`
    ).bind(sessionId, genre).all<{ problem_id: number }>();
    solvedIds = rows.results.map(r => r.problem_id).filter(id => Number.isInteger(id));
  }

  const excludeClause = solvedIds.length > 0
    ? `AND problem_id NOT IN (${solvedIds.join(',')})`
    : '';

  const ranges = [50, 100, 150, 200, 250, 300, 400];

  for (const range of ranges) {
    const minRating = rating - range;
    const maxRating = rating + range;

    // Find a problem from problem_ratings within range
    // genre has to be filtered here, not just on the problems table below: the
    // three pools share this table, and direct alone is ~75% of it, so an
    // unfiltered pick would hand back mostly wrong-genre candidates and 404.
    const ratedRow = await context.env.STATS_DB.prepare(
      `SELECT problem_id, rating FROM problem_ratings
       WHERE dev = ? AND genre = ? AND rating >= ? AND rating <= ? ${excludeClause}
       ORDER BY RANDOM()
       LIMIT 5`
    ).bind(dev, genre, minRating, maxRating).all<{ problem_id: number; rating: number }>();

    if (ratedRow.results.length === 0) continue;

    // Fetch problem data from main DB
    for (const rated of ratedRow.results) {
      // move_count >= 1: mate-in-1 is the entry rung for players who cannot yet
      // solve a #2. Only sound ones are reachable — the task/record problems that
      // list a dozen alternative keys, and the twins, were removed from
      // problem_ratings, so nothing filters them here.
      // Joke problems ask for a move no board can hold — a promotion to a king,
      // a rotation, a piece lifted off first. They are worth meeting while
      // browsing, where a banner explains them, but here they are a problem the
      // player cannot solve and cannot leave without losing rating.
      const conditions: string[] = [
        'id = ?', 'genre = ?', 'move_count >= 1',
        "keywords NOT LIKE '%Shortmate%'",
        "keywords NOT LIKE '%Joke problem%'",
      ];
      const bindings: (string | number)[] = [rated.problem_id, genre];
      addFairyExclusion(conditions, bindings);

      const row = await context.env.DB.prepare(
        `SELECT id, fen, authors, source_name, source_year, stipulation, move_count,
                genre, difficulty, difficulty_score, piece_count, keywords, award, solution_text
         FROM problems
         WHERE ${conditions.join(' AND ')}
         LIMIT 1`
      ).bind(...bindings).first<Record<string, unknown>>();

      if (row) {
        // Solutions live in their own DB; the old column is the fallback.
        try {
          const sol = await context.env.SOLUTIONS_DB.prepare(
            'SELECT solution_text FROM solutions WHERE id = ?'
          ).bind(row.id).first<{ solution_text: string }>();
          if (sol && sol.solution_text) row.solution_text = sol.solution_text;
        } catch { /* fall back */ }
        return Response.json(buildProblem(row, rated.rating));
      }
    }
  }

  return Response.json({ error: 'No problems found in rating range' }, { status: 404 });
};
