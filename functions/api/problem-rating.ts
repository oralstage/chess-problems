/**
 * GET /api/problem-rating?id=123&dev=0
 *
 * Returns the current rating for a problem from problem_ratings.
 * All problems should be pre-populated in problem_ratings.
 */

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const id = parseInt(url.searchParams.get('id') || '0');
  const dev = url.searchParams.get('dev') === '1' ? 1 : 0;

  if (!id) {
    return Response.json({ error: 'Missing id' }, { status: 400 });
  }

  const rated = await context.env.STATS_DB.prepare(
    'SELECT rating, rd FROM problem_ratings WHERE problem_id = ? AND dev = ?'
  ).bind(id, dev).first<{ rating: number; rd: number }>();

  if (rated) {
    return Response.json({ rating: rated.rating, rd: rated.rd });
  }

  return Response.json({ error: 'Problem not found in ratings' }, { status: 404 });
};
