/**
 * GET /api/site-stats
 *
 * Returns aggregate site statistics for the home page.
 * Counts based on actual problem interactions (moves, hints, give-ups, solves).
 * Data available since 2026-03-19.
 *
 * Response: {
 *   uniqueSolvers: number,     // unique session_ids that interacted with at least 1 problem
 *   uniqueProblems: number,    // unique problem_ids with at least 1 interaction
 *   timesSolved: number,       // unique (problem_id, session_id) pairs with interactions
 * }
 */
const INTERACTION_EVENTS = "('move_correct', 'move_wrong', 'problem_gave_up', 'hint_used', 'problem_solved')";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  // Unique solvers: distinct sessions that interacted with at least one problem
  const solverStats = await context.env.STATS_DB.prepare(
    `SELECT COUNT(DISTINCT session_id) as unique_solvers
     FROM analytics_events
     WHERE event_name IN ${INTERACTION_EVENTS} AND dev = 0`
  ).first<{ unique_solvers: number }>();

  // Times solved: unique (problem_id, session_id) pairs
  const timesSolved = await context.env.STATS_DB.prepare(
    `SELECT COUNT(*) as total FROM (
       SELECT DISTINCT problem_id, session_id
       FROM analytics_events
       WHERE event_name IN ${INTERACTION_EVENTS} AND dev = 0 AND problem_id IS NOT NULL
     )`
  ).first<{ total: number }>();

  // Unique problems with at least 1 interaction
  const uniqueProblems = await context.env.STATS_DB.prepare(
    `SELECT COUNT(DISTINCT problem_id) as total
     FROM analytics_events
     WHERE event_name IN ${INTERACTION_EVENTS} AND dev = 0 AND problem_id IS NOT NULL`
  ).first<{ total: number }>();

  return Response.json({
    uniqueSolvers: solverStats?.unique_solvers || 0,
    uniqueProblems: uniqueProblems?.total || 0,
    timesSolved: timesSolved?.total || 0,
  }, {
    headers: { 'Cache-Control': 'public, max-age=60' },
  });
};
