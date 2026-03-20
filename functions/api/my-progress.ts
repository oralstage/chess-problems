/**
 * GET /api/my-progress?sessionId=xxx
 *
 * Returns the latest solve event per problem for a given session.
 * Used for one-time client-side progress migration.
 *
 * Response: {
 *   [problemId]: { correct: boolean, wrongMoveCount: number, hintUsed: boolean, genre: string }
 * }
 */

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId || sessionId.length > 64) {
    return Response.json({ error: 'sessionId is required' }, { status: 400 });
  }

  // Fetch the latest solve event per problem for this session
  // Using ROW_NUMBER() to get only the latest event per problem_id
  const { results } = await context.env.STATS_DB.prepare(
    `SELECT problem_id, correct, wrong_move_count, hint_used, genre
     FROM (
       SELECT problem_id, correct, wrong_move_count, hint_used, genre,
              ROW_NUMBER() OVER (PARTITION BY problem_id ORDER BY created_at DESC) AS rn
       FROM solve_events
       WHERE session_id = ? AND dev = 0
     )
     WHERE rn = 1`
  ).bind(sessionId).all<{
    problem_id: number;
    correct: number;
    wrong_move_count: number;
    hint_used: number;
    genre: string;
  }>();

  const progress: Record<string, { correct: boolean; wrongMoveCount: number; hintUsed: boolean; genre: string }> = {};
  for (const row of results) {
    progress[row.problem_id] = {
      correct: row.correct === 1,
      wrongMoveCount: row.wrong_move_count ?? 0,
      hintUsed: row.hint_used === 1,
      genre: row.genre || '',
    };
  }

  return Response.json(progress, {
    headers: { 'Cache-Control': 'private, max-age=300' },
  });
};
