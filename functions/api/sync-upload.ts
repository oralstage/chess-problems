/**
 * POST /api/sync-upload
 *
 * One-time migration: push existing localStorage state (bookmarks + review queue)
 * to the server so it can be later restored on other devices.
 *
 * Server-side write logic uses INSERT OR IGNORE / ON CONFLICT to avoid clobbering
 * data already present from concurrent activity.
 *
 * Body: {
 *   sessionId: string,
 *   dev?: boolean,
 *   bookmarks?: { [genre]: string[] },
 *   reviewQueue?: { [problemId]: { problemId, stability, difficulty, isNew, dueDate } },
 * }
 */

interface ReviewCardInput {
  problemId: number;
  stability: number;
  difficulty: number;
  isNew: boolean;
  dueDate: string;
}

interface SyncUploadBody {
  sessionId: string;
  dev?: boolean;
  bookmarks?: Record<string, string[]>;
  reviewQueue?: Record<string, ReviewCardInput>;
}

const VALID_GENRES = new Set(['direct', 'help', 'self', 'study', 'retro']);

// Rate limiting (intentionally permissive — this runs once per device)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 10;
}

function isValidCard(c: unknown): c is ReviewCardInput {
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

  let body: SyncUploadBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.sessionId || typeof body.sessionId !== 'string' || body.sessionId.length > 64) {
    return Response.json({ error: 'sessionId required' }, { status: 400 });
  }

  const dev = body.dev ? 1 : 0;
  const stmts: D1PreparedStatement[] = [];

  // Bookmarks
  if (body.bookmarks && typeof body.bookmarks === 'object') {
    for (const [genre, ids] of Object.entries(body.bookmarks)) {
      if (!VALID_GENRES.has(genre) || !Array.isArray(ids)) continue;
      for (const idStr of ids) {
        const id = Number(idStr);
        if (!Number.isInteger(id) || id <= 0) continue;
        stmts.push(context.env.STATS_DB.prepare(
          `INSERT OR IGNORE INTO bookmarks (session_id, genre, problem_id, dev) VALUES (?, ?, ?, ?)`
        ).bind(body.sessionId, genre, id, dev));
      }
    }
  }

  // Review queue (insert only if not already present — migration shouldn't overwrite)
  if (body.reviewQueue && typeof body.reviewQueue === 'object') {
    for (const card of Object.values(body.reviewQueue)) {
      if (!isValidCard(card)) continue;
      stmts.push(context.env.STATS_DB.prepare(
        `INSERT OR IGNORE INTO review_state (session_id, problem_id, dev, stability, difficulty, is_new, due_date)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        body.sessionId, card.problemId, dev,
        card.stability, card.difficulty, card.isNew ? 1 : 0, card.dueDate,
      ));
    }
  }

  if (stmts.length === 0) {
    return Response.json({ ok: true, count: 0 });
  }

  // Cap batch size to be safe
  const MAX_BATCH = 5000;
  if (stmts.length > MAX_BATCH) {
    return Response.json({ error: 'Too much data' }, { status: 400 });
  }

  await context.env.STATS_DB.batch(stmts);

  return Response.json({ ok: true, count: stmts.length });
};
