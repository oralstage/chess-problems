/**
 * POST /api/review-state
 *
 * Upsert FSRS review state for a single problem.
 *
 * Body: {
 *   sessionId: string,
 *   problemId: number,
 *   stability: number,
 *   difficulty: number,
 *   isNew: boolean,
 *   dueDate: string (YYYY-MM-DD),
 * }
 *
 * Or batch upload (used by migration):
 * Body: {
 *   sessionId: string,
 *   batch: ReviewCard[]
 * }
 */

interface ReviewCardInput {
  problemId: number;
  stability: number;
  difficulty: number;
  isNew: boolean;
  dueDate: string;
}

interface ReviewStateBody extends Partial<ReviewCardInput> {
  sessionId: string;
  batch?: ReviewCardInput[];
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
  return entry.count > 240;
}

function validCard(c: unknown): c is ReviewCardInput {
  if (!c || typeof c !== 'object') return false;
  const r = c as Record<string, unknown>;
  return typeof r.problemId === 'number'
    && typeof r.stability === 'number'
    && typeof r.difficulty === 'number'
    && typeof r.isNew === 'boolean'
    && typeof r.dueDate === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(r.dueDate as string);
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  if (isRateLimited(ip)) {
    return Response.json({ error: 'Rate limited' }, { status: 429 });
  }

  let body: ReviewStateBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.sessionId || typeof body.sessionId !== 'string' || body.sessionId.length > 64) {
    return Response.json({ error: 'sessionId required' }, { status: 400 });
  }

  const dev = body.dev ? 1 : 0;

  // Batch path (migration)
  if (Array.isArray(body.batch)) {
    if (body.batch.length > 5000) {
      return Response.json({ error: 'batch too large' }, { status: 400 });
    }
    const valid = body.batch.filter(validCard);
    if (valid.length === 0) return Response.json({ ok: true, count: 0 });

    // Use a single multi-row INSERT for efficiency
    const stmts = valid.map(c => context.env.STATS_DB.prepare(
      `INSERT INTO review_state (session_id, problem_id, dev, stability, difficulty, is_new, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, problem_id, dev) DO UPDATE SET
         stability = excluded.stability,
         difficulty = excluded.difficulty,
         is_new = excluded.is_new,
         due_date = excluded.due_date,
         updated_at = datetime('now')`
    ).bind(body.sessionId, c.problemId, dev, c.stability, c.difficulty, c.isNew ? 1 : 0, c.dueDate));

    await context.env.STATS_DB.batch(stmts);
    return Response.json({ ok: true, count: valid.length });
  }

  // Single-card path
  if (!validCard(body)) {
    return Response.json({ error: 'invalid review card fields' }, { status: 400 });
  }

  await context.env.STATS_DB.prepare(
    `INSERT INTO review_state (session_id, problem_id, dev, stability, difficulty, is_new, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id, problem_id, dev) DO UPDATE SET
       stability = excluded.stability,
       difficulty = excluded.difficulty,
       is_new = excluded.is_new,
       due_date = excluded.due_date,
       updated_at = datetime('now')`
  ).bind(
    body.sessionId, body.problemId, dev,
    body.stability, body.difficulty, body.isNew ? 1 : 0, body.dueDate,
  ).run();

  return Response.json({ ok: true });
};
