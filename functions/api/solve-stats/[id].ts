/**
 * GET /api/solve-stats/:id
 *
 * Returns aggregated solve statistics for a problem.
 * Excludes dev events and admin-excluded events by default.
 *
 * Query params:
 *   ?includeDev=1  — include dev events in stats
 *
 * Response: {
 *   problemId: number,
 *   totalAttempts: number,
 *   correctCount: number,
 *   accuracyRate: number,          // 0-1
 *   avgTimeSpent: number | null,   // ms
 *   commonWrongFirstMoves: { move: string, count: number }[],  // top 5
 *   commonFirstMoves: { move: string, count: number }[],       // top 5
 * }
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const id = Number(context.params.id);
  if (!id || isNaN(id)) {
    return Response.json({ error: 'Invalid problem ID' }, { status: 400 });
  }

  const url = new URL(context.request.url);
  const includeDev = url.searchParams.get('includeDev') === '1';

  // Base filter: exclude admin-excluded events
  let filter = 'problem_id = ? AND excluded = 0';
  if (!includeDev) {
    filter += ' AND dev = 0';
  }

  // Total attempts and correct count
  const summary = await context.env.DB.prepare(
    `SELECT
       COUNT(*) as total,
       SUM(correct) as correct_count,
       AVG(CASE WHEN time_spent IS NOT NULL THEN time_spent END) as avg_time
     FROM solve_events
     WHERE ${filter}`
  ).bind(id).first<{ total: number; correct_count: number; avg_time: number | null }>();

  if (!summary || summary.total === 0) {
    return Response.json({
      problemId: id,
      totalAttempts: 0,
      correctCount: 0,
      accuracyRate: 0,
      avgTimeSpent: null,
      commonWrongFirstMoves: [],
      commonFirstMoves: [],
    }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  // Common first moves (all attempts)
  const firstMoves = await context.env.DB.prepare(
    `SELECT first_move as move, COUNT(*) as cnt
     FROM solve_events
     WHERE ${filter} AND first_move IS NOT NULL
     GROUP BY first_move
     ORDER BY cnt DESC
     LIMIT 5`
  ).bind(id).all<{ move: string; cnt: number }>();

  // Common wrong first moves (incorrect attempts only)
  const wrongFirstMoves = await context.env.DB.prepare(
    `SELECT first_move as move, COUNT(*) as cnt
     FROM solve_events
     WHERE ${filter} AND correct = 0 AND first_move IS NOT NULL
     GROUP BY first_move
     ORDER BY cnt DESC
     LIMIT 5`
  ).bind(id).all<{ move: string; cnt: number }>();

  return Response.json({
    problemId: id,
    totalAttempts: summary.total,
    correctCount: summary.correct_count || 0,
    accuracyRate: summary.total > 0 ? (summary.correct_count || 0) / summary.total : 0,
    avgTimeSpent: summary.avg_time ? Math.round(summary.avg_time) : null,
    commonWrongFirstMoves: (wrongFirstMoves.results || []).map(r => ({ move: r.move, count: r.cnt })),
    commonFirstMoves: (firstMoves.results || []).map(r => ({ move: r.move, count: r.cnt })),
  }, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
};
