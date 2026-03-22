/**
 * GET /api/problem-rating?id=123&dev=0
 *
 * Returns the current rating for a problem from problem_ratings.
 * Falls back to initial formula if not yet rated.
 */

import { difficultyToRating } from '../utils/glicko2';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const id = parseInt(url.searchParams.get('id') || '0');
  const dev = url.searchParams.get('dev') === '1' ? 1 : 0;

  if (!id) {
    return Response.json({ error: 'Missing id' }, { status: 400 });
  }

  // Check problem_ratings first
  const rated = await context.env.STATS_DB.prepare(
    'SELECT rating, rd FROM problem_ratings WHERE problem_id = ? AND dev = ?'
  ).bind(id, dev).first<{ rating: number; rd: number }>();

  if (rated) {
    return Response.json({ rating: rated.rating, rd: rated.rd, source: 'rated' });
  }

  // Fallback: compute from problem data
  const problem = await context.env.DB.prepare(
    'SELECT difficulty_score, move_count, piece_count FROM problems WHERE id = ?'
  ).bind(id).first<{ difficulty_score: number; move_count: number; piece_count: number }>();

  if (!problem) {
    return Response.json({ error: 'Problem not found' }, { status: 404 });
  }

  const rating = difficultyToRating(problem.difficulty_score, problem.move_count, problem.piece_count);
  return Response.json({ rating, rd: 350, source: 'initial' });
};
