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

  // Total times solved (each attempt counts)
  const timesSolved = await context.env.STATS_DB.prepare(
    `SELECT COUNT(*) as total
     FROM analytics_events
     WHERE event_name = 'problem_started' AND dev = 0`
  ).first<{ total: number }>();

  // Unique problems solved (distinct problem_ids)
  const uniqueProblems = await context.env.STATS_DB.prepare(
    `SELECT COUNT(DISTINCT problem_id) as total
     FROM analytics_events
     WHERE event_name = 'problem_started' AND dev = 0 AND problem_id IS NOT NULL`
  ).first<{ total: number }>();

  return Response.json({
    uniqueSolvers: solverStats?.unique_solvers || 0,
    uniqueProblems: uniqueProblems?.total || 0,
    timesSolved: timesSolved?.total || 0,
  }, {
    headers: { 'Cache-Control': 'public, max-age=60' },
  });
};
