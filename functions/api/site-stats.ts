/**
 * GET /api/site-stats
 *
 * Returns aggregate site statistics for the home page.
 * Excludes dev and excluded events.
 *
 * Response: {
 *   uniqueSolvers: number,     // unique session_ids that tried at least 1 move
 *   problemsSolved: number,    // total solve events (not unique - each attempt counts)
 *   totalAttempts: number,     // same as problemsSolved for backward compat
 * }
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  // Unique solvers: distinct sessions that tried at least one move
  const solverStats = await context.env.STATS_DB.prepare(
    `SELECT COUNT(DISTINCT session_id) as unique_solvers
     FROM analytics_events
     WHERE event_name IN ('move_correct', 'move_wrong') AND dev = 0`
  ).first<{ unique_solvers: number }>();

  // Total problems attempted (each attempt counts, including abandoned)
  const solveStats = await context.env.STATS_DB.prepare(
    `SELECT COUNT(*) as total_solved
     FROM analytics_events
     WHERE event_name = 'problem_started' AND dev = 0`
  ).first<{ total_solved: number }>();

  // Unique visitors from analytics_events (session_start events)
  const visitorStats = await context.env.STATS_DB.prepare(
    `SELECT COUNT(DISTINCT session_id) as unique_visitors
     FROM analytics_events
     WHERE event_name = 'session_start' AND dev = 0`
  ).first<{ unique_visitors: number }>();

  return Response.json({
    uniqueVisitors: visitorStats?.unique_visitors || 0,
    uniqueSolvers: solverStats?.unique_solvers || 0,
    problemsSolved: solveStats?.total_solved || 0,
    totalAttempts: solveStats?.total_solved || 0,
  }, {
    headers: { 'Cache-Control': 'public, max-age=60' },
  });
};
