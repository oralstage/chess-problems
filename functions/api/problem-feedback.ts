/**
 * POST /api/problem-feedback
 *
 * A report from the "Something looks wrong" button, sent after a problem is
 * decided (solved or given up). Only the comment is typed by the sender —
 * everything else the app fills in, because the reports worth having are the
 * ones about problems that behave for me and not for them, and an id alone
 * cannot show that.
 *
 * Rate-limited by IP (max 5 per minute).
 *
 * Body: {
 *   problemId?: number,
 *   sessionId?: string,
 *   dev?: boolean,
 *   comment?: string,               // optional, may be empty
 *   context?: Record<string, unknown>,  // fen, moves, mode, url, build…
 * }
 */

interface FeedbackBody {
  problemId?: number;
  sessionId?: string;
  dev?: boolean;
  comment?: string;
  context?: Record<string, unknown>;
}

const COMMENT_MAX = 1000;
// Long selfmate lines plus the FEN and the user agent stay well inside this;
// anything past it is not a report.
const CONTEXT_MAX = 4096;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 5;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  if (isRateLimited(ip)) {
    return Response.json({ error: 'Rate limited' }, { status: 429 });
  }

  let body: FeedbackBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const problemId = typeof body.problemId === 'number' ? body.problemId : null;
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 64) : '';
  const dev = body.dev ? 1 : 0;
  const comment = typeof body.comment === 'string' ? body.comment.slice(0, COMMENT_MAX) : '';

  // The context is the whole value of a report with no comment, so an
  // oversized one is dropped rather than truncated: half a JSON object
  // stored as text would be worse than none.
  let ctx = '{}';
  if (body.context && typeof body.context === 'object') {
    const s = JSON.stringify(body.context);
    ctx = s.length > CONTEXT_MAX ? '{"truncated":true}' : s;
  }

  // A report with neither a problem nor a word in it says nothing.
  if (problemId == null && !comment) {
    return Response.json({ error: 'Nothing to report' }, { status: 400 });
  }

  const country = context.request.headers.get('CF-IPCountry') || '';

  await context.env.STATS_DB.prepare(
    'INSERT INTO problem_feedback (problem_id, session_id, dev, comment, context, country) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(problemId, sessionId, dev, comment, ctx, country).run();

  return Response.json({ ok: true }, { status: 201 });
};
