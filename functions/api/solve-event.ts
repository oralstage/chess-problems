/**
 * POST /api/solve-event
 *
 * Record a solve attempt (correct or give-up).
 * Rate-limited by IP (max 60 events per minute).
 *
 * Body: {
 *   problemId: number,
 *   sessionId: string,       // browser UUID
 *   dev?: boolean,           // dev_mode flag
 *   correct: boolean,
 *   firstMove?: string,      // first move attempted (SAN)
 *   moves: string[],         // all moves attempted
 *   timeSpent?: number,      // ms from start to solve/give-up
 * }
 */

interface SolveEventBody {
  problemId: number;
  sessionId: string;
  dev?: boolean;
  correct: boolean;
  firstMove?: string;
  moves: string[];
  timeSpent?: number;
  hintUsed?: boolean;
  wrongMoveCount?: number;
  genre?: string;
  stipulation?: string;
  source?: string;
}

// Simple in-memory rate limiting (per-isolate, resets on cold start)
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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  // Rate limit by IP
  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  if (isRateLimited(ip)) {
    return Response.json({ error: 'Rate limited' }, { status: 429 });
  }

  let body: SolveEventBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Validate required fields
  if (!body.problemId || typeof body.problemId !== 'number') {
    return Response.json({ error: 'problemId is required' }, { status: 400 });
  }
  if (!body.sessionId || typeof body.sessionId !== 'string' || body.sessionId.length > 64) {
    return Response.json({ error: 'sessionId is required' }, { status: 400 });
  }
  if (typeof body.correct !== 'boolean') {
    return Response.json({ error: 'correct is required' }, { status: 400 });
  }
  if (!Array.isArray(body.moves)) {
    return Response.json({ error: 'moves array is required' }, { status: 400 });
  }

  // Sanitize
  const moves = body.moves.slice(0, 100).map(m => String(m).slice(0, 20));
  const firstMove = body.firstMove ? String(body.firstMove).slice(0, 20) : (moves[0] || null);
  const timeSpent = typeof body.timeSpent === 'number' ? Math.max(0, Math.min(body.timeSpent, 3_600_000)) : null;

  const country = context.request.headers.get('CF-IPCountry') || '';
  const source = body.source ? String(body.source).slice(0, 20) : '';
  const hintUsed = body.hintUsed ? 1 : 0;
  const wrongMoveCount = typeof body.wrongMoveCount === 'number' ? Math.max(0, Math.min(body.wrongMoveCount, 1000)) : 0;
  const genre = body.genre ? String(body.genre).slice(0, 10) : '';
  const stipulation = body.stipulation ? String(body.stipulation).slice(0, 10) : '';

  await context.env.STATS_DB.prepare(
    `INSERT INTO solve_events (problem_id, session_id, dev, correct, first_move, moves, move_count, time_spent, hint_used, wrong_move_count, genre, stipulation, source, country)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    body.problemId,
    body.sessionId,
    body.dev ? 1 : 0,
    body.correct ? 1 : 0,
    firstMove,
    JSON.stringify(moves),
    moves.length,
    timeSpent,
    hintUsed,
    wrongMoveCount,
    genre,
    stipulation,
    source,
    country,
  ).run();

  return Response.json({ ok: true }, { status: 201 });
};
