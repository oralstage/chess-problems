/**
 * Admin API for managing solve events.
 * Requires ADMIN_TOKEN secret in header: Authorization: Bearer <token>
 *
 * GET  /api/admin/solve-events?sessionId=X  — list events by session
 * POST /api/admin/solve-events  — exclude/delete events
 *   Body: { action: 'exclude' | 'include' | 'delete', sessionId: string }
 */

function checkAuth(request: Request, env: Env): boolean {
  const token = env.ADMIN_TOKEN;
  if (!token) return false;
  const auth = request.headers.get('Authorization');
  return auth === `Bearer ${token}`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!checkAuth(context.request, context.env)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(context.request.url);
  const sessionId = url.searchParams.get('sessionId');

  if (sessionId) {
    // List events for a specific session
    const rows = await context.env.DB.prepare(
      `SELECT id, problem_id, session_id, dev, correct, first_move, move_count, time_spent, excluded, created_at
       FROM solve_events WHERE session_id = ? ORDER BY created_at DESC LIMIT 200`
    ).bind(sessionId).all();
    return Response.json({ events: rows.results });
  }

  // List all sessions with event counts
  const rows = await context.env.DB.prepare(
    `SELECT session_id, dev, excluded,
            COUNT(*) as event_count,
            MIN(created_at) as first_event,
            MAX(created_at) as last_event
     FROM solve_events
     GROUP BY session_id
     ORDER BY last_event DESC
     LIMIT 100`
  ).all();
  return Response.json({ sessions: rows.results });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (!checkAuth(context.request, context.env)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await context.request.json() as { action: string; sessionId: string };
  if (!body.sessionId || !body.action) {
    return Response.json({ error: 'sessionId and action required' }, { status: 400 });
  }

  switch (body.action) {
    case 'exclude': {
      const result = await context.env.DB.prepare(
        'UPDATE solve_events SET excluded = 1 WHERE session_id = ?'
      ).bind(body.sessionId).run();
      return Response.json({ ok: true, affected: result.meta.changes });
    }
    case 'include': {
      const result = await context.env.DB.prepare(
        'UPDATE solve_events SET excluded = 0 WHERE session_id = ?'
      ).bind(body.sessionId).run();
      return Response.json({ ok: true, affected: result.meta.changes });
    }
    case 'delete': {
      const result = await context.env.DB.prepare(
        'DELETE FROM solve_events WHERE session_id = ?'
      ).bind(body.sessionId).run();
      return Response.json({ ok: true, affected: result.meta.changes });
    }
    default:
      return Response.json({ error: 'Invalid action. Use: exclude, include, delete' }, { status: 400 });
  }
};
