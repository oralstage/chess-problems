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
  const summary = await context.env.STATS_DB.prepare(
    `SELECT
       COUNT(*) as total,
       SUM(correct) as correct_count,
       COUNT(DISTINCT session_id) as unique_solvers,
       AVG(CASE WHEN time_spent IS NOT NULL THEN time_spent END) as avg_time,
       SUM(hint_used) as hint_used_count,
       AVG(wrong_move_count) as avg_wrong_moves
     FROM solve_events
     WHERE ${filter}`
  ).bind(id).first<{ total: number; correct_count: number; unique_solvers: number; avg_time: number | null; hint_used_count: number; avg_wrong_moves: number | null }>();

  if (!summary || summary.total === 0) {
    return Response.json({
      problemId: id,
      totalAttempts: 0,
      correctCount: 0,
      uniqueSolvers: 0,
      accuracyRate: 0,
      avgTimeSpent: null,
      hintUsedCount: 0,
      avgWrongMoves: null,
      commonWrongFirstMoves: [],
      commonFirstMoves: [],
    }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  // Common first moves (all attempts)
  const firstMoves = await context.env.STATS_DB.prepare(
    `SELECT first_move as move, COUNT(*) as cnt
     FROM solve_events
     WHERE ${filter} AND first_move IS NOT NULL
     GROUP BY first_move
     ORDER BY cnt DESC
     LIMIT 5`
  ).bind(id).all<{ move: string; cnt: number }>();

  // Common wrong first moves (incorrect attempts only)
  const wrongFirstMoves = await context.env.STATS_DB.prepare(
    `SELECT first_move as move, COUNT(*) as cnt
     FROM solve_events
     WHERE ${filter} AND correct = 0 AND first_move IS NOT NULL
     GROUP BY first_move
     ORDER BY cnt DESC
     LIMIT 5`
  ).bind(id).all<{ move: string; cnt: number }>();

  // All tried moves from analytics (correct + wrong), grouped by move number
  const analyticsFilter = includeDev ? 'problem_id = ?' : 'problem_id = ? AND dev = 0';
  const triedMoves = await context.env.STATS_DB.prepare(
    `SELECT json_extract(data, '$.san') as move, json_extract(data, '$.moveNumber') as move_num, event_name, COUNT(*) as cnt
     FROM analytics_events
     WHERE ${analyticsFilter} AND event_name IN ('move_correct', 'move_wrong')
       AND json_extract(data, '$.san') IS NOT NULL
     GROUP BY move, move_num, event_name
     ORDER BY move_num ASC, cnt DESC`
  ).bind(id).all<{ move: string; move_num: number; event_name: string; cnt: number }>();

  // Group by move number, track correct vs wrong per move
  const byMoveNum = new Map<number, Map<string, { count: number; correctCount: number; wrongCount: number }>>();
  for (const r of (triedMoves.results || [])) {
    const num = r.move_num || 1;
    if (!byMoveNum.has(num)) byMoveNum.set(num, new Map());
    const moveMap2 = byMoveNum.get(num)!;
    const existing = moveMap2.get(r.move) || { count: 0, correctCount: 0, wrongCount: 0 };
    existing.count += r.cnt;
    if (r.event_name === 'move_correct') existing.correctCount += r.cnt;
    if (r.event_name === 'move_wrong') existing.wrongCount += r.cnt;
    moveMap2.set(r.move, existing);
  }
  // Sort each group by count desc
  const movesByNumber: { moveNumber: number; moves: { move: string; count: number; correct: boolean }[] }[] = [];
  for (const [num, moves] of [...byMoveNum.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...moves.entries()]
      .map(([move, { count, correctCount, wrongCount }]) => ({ move, count, correct: correctCount > 0 && wrongCount === 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    movesByNumber.push({ moveNumber: num, moves: sorted });
  }

  // Flat allTriedMoves for backward compat
  const moveMap = new Map<string, number>();
  for (const r of (triedMoves.results || [])) {
    moveMap.set(r.move, (moveMap.get(r.move) || 0) + r.cnt);
  }
  const allTriedMoves = [...moveMap.entries()]
    .map(([move, count]) => ({ move, count, wrongCount: 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return Response.json({
    problemId: id,
    totalAttempts: summary.total,
    correctCount: summary.correct_count || 0,
    uniqueSolvers: summary.unique_solvers || 0,
    accuracyRate: summary.total > 0 ? (summary.correct_count || 0) / summary.total : 0,
    avgTimeSpent: summary.avg_time ? Math.round(summary.avg_time) : null,
    hintUsedCount: summary.hint_used_count || 0,
    avgWrongMoves: summary.avg_wrong_moves != null ? Math.round(summary.avg_wrong_moves * 10) / 10 : null,
    allTriedMoves,
    movesByNumber,
    commonWrongFirstMoves: (wrongFirstMoves.results || []).map(r => ({ move: r.move, count: r.cnt })),
    commonFirstMoves: (firstMoves.results || []).map(r => ({ move: r.move, count: r.cnt })),
  }, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
};
