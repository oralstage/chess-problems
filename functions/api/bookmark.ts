/**
 * POST /api/bookmark
 *
 * Add or remove a bookmark for the given session+genre+problem.
 *
 * Body: { sessionId: string, genre: string, problemId: number, action: 'add'|'remove' }
 */

const VALID_GENRES = new Set(['direct', 'help', 'self', 'study', 'retro']);

interface BookmarkBody {
  sessionId: string;
  genre: string;
  problemId: number;
  action: 'add' | 'remove';
  dev?: boolean;
}

// Rate limiting
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

  let body: BookmarkBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.sessionId || typeof body.sessionId !== 'string' || body.sessionId.length > 64) {
    return Response.json({ error: 'sessionId required' }, { status: 400 });
  }
  if (!body.genre || !VALID_GENRES.has(body.genre)) {
    return Response.json({ error: 'invalid genre' }, { status: 400 });
  }
  if (!body.problemId || typeof body.problemId !== 'number' || !Number.isInteger(body.problemId)) {
    return Response.json({ error: 'problemId required' }, { status: 400 });
  }
  if (body.action !== 'add' && body.action !== 'remove') {
    return Response.json({ error: 'action must be add or remove' }, { status: 400 });
  }

  const dev = body.dev ? 1 : 0;

  if (body.action === 'add') {
    await context.env.STATS_DB.prepare(
      `INSERT OR IGNORE INTO bookmarks (session_id, genre, problem_id, dev) VALUES (?, ?, ?, ?)`
    ).bind(body.sessionId, body.genre, body.problemId, dev).run();
  } else {
    await context.env.STATS_DB.prepare(
      `DELETE FROM bookmarks WHERE session_id = ? AND genre = ? AND problem_id = ? AND dev = ?`
    ).bind(body.sessionId, body.genre, body.problemId, dev).run();
  }

  return Response.json({ ok: true });
};
