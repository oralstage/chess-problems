/**
 * GET /api/admin/feedback?after=<id>&limit=<n>
 *
 * Bug reports newer than an id, for the weekly notifier on the raspi — it has
 * no wrangler, so it cannot read D1 directly. Returns the newest id even when
 * nothing is new, so the caller can keep its watermark honest.
 *
 * Requires ADMIN_TOKEN: Authorization: Bearer <token>
 */

function checkAuth(request: Request, env: Env): boolean {
  const token = env.ADMIN_TOKEN;
  if (!token) return false;
  const auth = request.headers.get('Authorization');
  if (!auth) return false;
  // Constant-time comparison to avoid a timing side-channel
  const expected = new TextEncoder().encode(`Bearer ${token}`);
  const actual = new TextEncoder().encode(auth);
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
  return diff === 0;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!checkAuth(context.request, context.env)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(context.request.url);
  const after = Number(url.searchParams.get('after') ?? 0) || 0;
  const dev = url.searchParams.get('dev') === '1' ? 1 : 0;
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 10) || 10, 1), 50);

  const { results } = await context.env.STATS_DB.prepare(
    `SELECT id, problem_id, comment, country, created_at
       FROM problem_feedback
      WHERE dev = ? AND id > ?
      ORDER BY id DESC
      LIMIT ?`
  ).bind(dev, after, limit).all<{
    id: number;
    problem_id: number | null;
    comment: string;
    country: string;
    created_at: string;
  }>();

  // The count is of everything newer, not just the page returned.
  const total = await context.env.STATS_DB.prepare(
    'SELECT COUNT(*) AS n, MAX(id) AS maxId FROM problem_feedback WHERE dev = ? AND id > ?'
  ).bind(dev, after).first<{ n: number; maxId: number | null }>();

  const newest = await context.env.STATS_DB.prepare(
    'SELECT MAX(id) AS maxId FROM problem_feedback WHERE dev = ?'
  ).bind(dev).first<{ maxId: number | null }>();

  return Response.json({
    count: total?.n ?? 0,
    latestId: newest?.maxId ?? 0,
    items: (results ?? []).map(r => ({
      id: r.id,
      problemId: r.problem_id,
      comment: r.comment,
      country: r.country,
      createdAt: r.created_at,
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
};
