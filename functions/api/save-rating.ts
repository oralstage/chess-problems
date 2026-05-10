/**
 * POST /api/save-rating
 *
 * Persist the client's current Glicko-2 rating as the source of truth.
 * Called after every local rating update so the server reflects exactly
 * what the client has — no server-side recomputation.
 *
 * Body: { sessionId, rating, rd, vol, solveCount?, dev? }
 */

interface SaveRatingBody {
  sessionId: string;
  rating: number;
  rd: number;
  vol: number;
  solveCount?: number;
  dev?: boolean;
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 120;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  if (isRateLimited(ip)) {
    return Response.json({ error: 'Rate limited' }, { status: 429 });
  }

  let body: SaveRatingBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.sessionId || typeof body.sessionId !== 'string' || body.sessionId.length > 64) {
    return Response.json({ error: 'sessionId required' }, { status: 400 });
  }
  if (
    typeof body.rating !== 'number' || !Number.isFinite(body.rating) ||
    typeof body.rd !== 'number' || !Number.isFinite(body.rd) ||
    typeof body.vol !== 'number' || !Number.isFinite(body.vol)
  ) {
    return Response.json({ error: 'rating/rd/vol required' }, { status: 400 });
  }

  // Sanity bounds — silently clamp obviously bogus values
  const rating = Math.max(0, Math.min(4000, body.rating));
  const rd = Math.max(20, Math.min(400, body.rd));
  const vol = Math.max(0.001, Math.min(1, body.vol));
  const solveCount = typeof body.solveCount === 'number' && body.solveCount >= 0
    ? Math.floor(body.solveCount)
    : null;

  const dev = body.dev ? 1 : 0;

  // Upsert; if solveCount not provided we don't touch the existing one
  if (solveCount !== null) {
    await context.env.STATS_DB.prepare(
      `INSERT INTO player_ratings (session_id, dev, rating, rd, volatility, solve_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(session_id, dev) DO UPDATE SET
         rating = excluded.rating,
         rd = excluded.rd,
         volatility = excluded.volatility,
         solve_count = excluded.solve_count,
         updated_at = excluded.updated_at`
    ).bind(body.sessionId, dev, rating, rd, vol, solveCount).run();
  } else {
    await context.env.STATS_DB.prepare(
      `INSERT INTO player_ratings (session_id, dev, rating, rd, volatility, solve_count, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, datetime('now'))
       ON CONFLICT(session_id, dev) DO UPDATE SET
         rating = excluded.rating,
         rd = excluded.rd,
         volatility = excluded.volatility,
         updated_at = excluded.updated_at`
    ).bind(body.sessionId, dev, rating, rd, vol).run();
  }

  return Response.json({ ok: true });
};
