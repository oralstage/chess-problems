import { addFairyExclusion } from '../fairy-filter';

/**
 * GET /api/problems/ids
 *
 * Returns all problem IDs matching filters (for navigation).
 * Same filters as /api/problems but returns only IDs in order.
 *
 * Query params: same as /api/problems (genre, stipulations, keywords, etc.)
 *
 * Returns: { ids: number[] }
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const params = url.searchParams;

  const genre = params.get('genre');
  if (!genre || !['direct', 'help', 'self', 'study', 'retro'].includes(genre)) {
    return Response.json({ error: 'genre is required' }, { status: 400 });
  }

  const sortBy = params.get('sortBy') === 'year' ? 'source_year' : 'difficulty_score';
  const sortOrder = params.get('sortOrder') === 'desc' ? 'DESC' : 'ASC';

  const conditions: string[] = ['genre = ?'];
  const bindings: (string | number)[] = [genre];

  const stipulations = params.get('stipulations');
  if (stipulations) {
    const stips = stipulations.split(',').filter(Boolean);
    if (stips.length > 0) {
      conditions.push(`stipulation IN (${stips.map(() => '?').join(',')})`);
      bindings.push(...stips);
    }
  }

  const keywords = params.get('keywords');
  if (keywords) {
    const kws = keywords.split(',').filter(Boolean);
    if (kws.length > 0) {
      const kwConditions = kws.map(() => `keywords LIKE ?`);
      conditions.push(`(${kwConditions.join(' OR ')})`);
      bindings.push(...kws.map(kw => `%"${kw}"%`));
    }
  }

  const minPieces = params.get('minPieces');
  if (minPieces) { conditions.push('piece_count >= ?'); bindings.push(parseInt(minPieces)); }
  const maxPieces = params.get('maxPieces');
  if (maxPieces) { conditions.push('piece_count <= ?'); bindings.push(parseInt(maxPieces)); }
  const minYear = params.get('minYear');
  if (minYear) { conditions.push('source_year >= ?'); bindings.push(parseInt(minYear)); }
  const maxYear = params.get('maxYear');
  if (maxYear) { conditions.push('source_year <= ?'); bindings.push(parseInt(maxYear)); }

  addFairyExclusion(conditions, bindings);

  const where = conditions.join(' AND ');
  const nullHandling = sortBy === 'source_year' ? 'NULLS LAST' : '';

  const rows = await context.env.DB.prepare(
    `SELECT id, stipulation FROM problems WHERE ${where} ORDER BY ${sortBy} ${sortOrder} ${nullHandling}`
  ).bind(...bindings).all();

  const problems = rows.results.map((r: Record<string, unknown>) => ({
    id: r.id as number,
    stipulation: r.stipulation as string,
  }));

  return Response.json({ problems }, {
    headers: { 'Cache-Control': 'public, max-age=86400' },
  });
};
