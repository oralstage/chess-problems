/**
 * POST /api/analytics
 *
 * Batch insert analytics events.
 * Body: { events: Array<{ event: string, problemId?: number, data?: object }>, sessionId: string, dev?: boolean }
 *
 * Rate limited: max 120 requests/minute per IP.
 */

interface AnalyticsBody {
  events: Array<{
    event: string;
    problemId?: number;
    data?: Record<string, unknown>;
  }>;
  sessionId: string;
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

  let body: AnalyticsBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.sessionId || typeof body.sessionId !== 'string') {
    return Response.json({ error: 'sessionId required' }, { status: 400 });
  }
  if (!Array.isArray(body.events) || body.events.length === 0) {
    return Response.json({ error: 'events array required' }, { status: 400 });
  }

  // Limit batch size
  const events = body.events.slice(0, 100);
  const dev = body.dev ? 1 : 0;
  const sessionId = body.sessionId.slice(0, 64);

  // Batch insert using D1 batch API
  const country = context.request.headers.get('CF-IPCountry') || '';
  const stmts = events.map(e => {
    const eventName = String(e.event).slice(0, 50);
    const problemId = typeof e.problemId === 'number' ? e.problemId : null;
    const data = e.data ? JSON.stringify(e.data) : '{}';
    return context.env.STATS_DB.prepare(
      'INSERT INTO analytics_events (event_name, problem_id, session_id, dev, data, country) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(eventName, problemId, sessionId, dev, data, country);
  });

  await context.env.STATS_DB.batch(stmts);

  return Response.json({ ok: true, count: events.length }, { status: 201 });
};
