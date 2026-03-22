/**
 * POST /api/rating-event
 *
 * Record a Glicko-2 rating event (player vs problem).
 * Updates the problem's rating server-side.
 * Deduplicates by (problem_id, session_id) — first attempt only.
 *
 * Body: {
 *   problemId: number,
 *   sessionId: string,
 *   score: number,          // 1.0 (perfect solve) or 0.0 (fail)
 *   playerRating: number,
 *   playerRd: number,
 * }
 */

import { updateRating, difficultyToRating, type Glicko2Rating } from '../utils/glicko2';

interface RatingEventBody {
  problemId: number;
  sessionId: string;
  dev?: boolean;
  score: number;
  playerRating: number;
  playerRd: number;
}

// Rate limiting (per-isolate)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 60;
}

/** Get problem rating from DB, or compute default from difficultyScore */
async function getProblemRating(env: Env, problemId: number, dev: number): Promise<Glicko2Rating> {
  // Check problem_ratings table first
  const row = await env.STATS_DB.prepare(
    'SELECT rating, rd, volatility FROM problem_ratings WHERE problem_id = ? AND dev = ?'
  ).bind(problemId, dev).first<{ rating: number; rd: number; volatility: number }>();

  if (row) {
    return { rating: row.rating, rd: row.rd, vol: row.volatility };
  }

  // Fall back to heuristic from problems table
  const problem = await env.DB.prepare(
    'SELECT difficulty_score, move_count, piece_count FROM problems WHERE id = ?'
  ).bind(problemId).first<{ difficulty_score: number; move_count: number; piece_count: number }>();

  if (problem) {
    return { rating: difficultyToRating(problem.difficulty_score, problem.move_count, problem.piece_count), rd: 350, vol: 0.06 };
  }

  // Problem not found — use default
  return { rating: 1500, rd: 350, vol: 0.06 };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  if (isRateLimited(ip)) {
    return Response.json({ error: 'Rate limited' }, { status: 429 });
  }

  let body: RatingEventBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Validate
  if (!body.problemId || typeof body.problemId !== 'number') {
    return Response.json({ error: 'problemId is required' }, { status: 400 });
  }
  if (!body.sessionId || typeof body.sessionId !== 'string' || body.sessionId.length > 64) {
    return Response.json({ error: 'sessionId is required' }, { status: 400 });
  }
  if (body.score !== 0 && body.score !== 1) {
    return Response.json({ error: 'score must be 0 or 1' }, { status: 400 });
  }
  if (typeof body.playerRating !== 'number' || typeof body.playerRd !== 'number') {
    return Response.json({ error: 'playerRating and playerRd required' }, { status: 400 });
  }

  const dev = body.dev ? 1 : 0;

  // Get current problem rating
  const problemRating = await getProblemRating(context.env, body.problemId, dev);

  // Try to insert rating event (PK dedup: problem_id + session_id + dev)
  try {
    await context.env.STATS_DB.prepare(
      `INSERT INTO rating_events (problem_id, session_id, dev, score, player_rating, player_rd, problem_rating, problem_rd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      body.problemId,
      body.sessionId,
      dev,
      body.score,
      body.playerRating,
      body.playerRd,
      problemRating.rating,
      problemRating.rd,
    ).run();
  } catch (e: unknown) {
    // PRIMARY KEY conflict = duplicate (same person, same problem)
    if (e instanceof Error && e.message.includes('UNIQUE')) {
      return Response.json({
        ok: true,
        duplicate: true,
        problemRating: { rating: problemRating.rating, rd: problemRating.rd },
      });
    }
    throw e;
  }

  // Update problem rating (problem "plays" against the player with inverted score)
  const problemScore = 1 - body.score;
  const newProblemRating = updateRating(
    problemRating,
    { rating: body.playerRating, rd: body.playerRd },
    problemScore,
  );

  // Upsert problem_ratings
  await context.env.STATS_DB.prepare(
    `INSERT INTO problem_ratings (problem_id, dev, rating, rd, volatility, solve_count, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
     ON CONFLICT(problem_id, dev) DO UPDATE SET
       rating = ?, rd = ?, volatility = ?,
       solve_count = solve_count + 1,
       updated_at = datetime('now')`
  ).bind(
    body.problemId, dev,
    newProblemRating.rating, newProblemRating.rd, newProblemRating.vol,
    newProblemRating.rating, newProblemRating.rd, newProblemRating.vol,
  ).run();

  return Response.json({
    ok: true,
    problemRating: { rating: newProblemRating.rating, rd: newProblemRating.rd },
  }, { status: 201 });
};
