/**
 * GET /api/site-stats
 *
 * Returns aggregate site statistics for the home page.
 * Excludes dev and excluded events.
 *
 * Response: {
 *   uniqueSolvers: number,     // unique session_ids with at least 1 solve event
 *   problemsSolved: number,    // total correct solves
 *   totalAttempts: number,     // total solve attempts
 * }
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  // From solve_events (structured data)
  // Count unique problems where at least one move was made (from analytics)
  const moveStats = await context.env.DB.prepare(
    `SELECT
       COUNT(DISTINCT problem_id) as problems_solved,
       COUNT(DISTINCT session_id) as unique_solvers
     FROM analytics_events
     WHERE event_name IN ('move_correct', 'move_wrong') AND dev = 0`
  ).first<{ problems_solved: number; unique_solvers: number }>();

  const solveStats = await context.env.DB.prepare(
    `SELECT COUNT(*) as total_attempts
     FROM solve_events
     WHERE excluded = 0 AND dev = 0`
  ).first<{ total_attempts: number }>();

  // Unique visitors from analytics_events (session_start events)
  const visitorStats = await context.env.DB.prepare(
    `SELECT COUNT(DISTINCT session_id) as unique_visitors
     FROM analytics_events
     WHERE event_name = 'session_start' AND dev = 0`
  ).first<{ unique_visitors: number }>();

  return Response.json({
    uniqueVisitors: visitorStats?.unique_visitors || 0,
    uniqueSolvers: moveStats?.unique_solvers || 0,
    problemsSolved: moveStats?.problems_solved || 0,
    totalAttempts: solveStats?.total_attempts || 0,
  }, {
    headers: { 'Cache-Control': 'public, max-age=60' },
  });
};
