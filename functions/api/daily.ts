/**
 * GET /api/daily
 *
 * Returns today's daily problem (a #2 direct mate).
 * Uses golden-ratio hashing on the date to pick deterministically.
 * Includes full solutionText for immediate solving.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  // Count #2 direct problems
  const countResult = await context.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM problems WHERE genre = 'direct' AND stipulation = '#2'`
  ).first<{ cnt: number }>();
  const total = countResult?.cnt || 0;
  if (total === 0) {
    return Response.json({ error: 'No daily problems available' }, { status: 404 });
  }

  // Golden-ratio hash to pick today's problem (same logic as client getDailyIndex)
  const now = new Date();
  const dayNum = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const GOLDEN = 2654435761;
  const hash = ((dayNum * GOLDEN) >>> 0) / 4294967296;
  const idx = Math.floor(hash * total);

  // Fetch the problem at that offset, ordered by difficulty
  const row = await context.env.DB.prepare(
    `SELECT id, fen, authors, source_name, source_year, stipulation, move_count,
            genre, difficulty, difficulty_score, piece_count, keywords, award, solution_text
     FROM problems
     WHERE genre = 'direct' AND stipulation = '#2'
     ORDER BY difficulty_score ASC
     LIMIT 1 OFFSET ?`
  ).bind(idx).first();

  if (!row) {
    return Response.json({ error: 'Daily problem not found' }, { status: 404 });
  }

  const problem = {
    id: row.id,
    fen: row.fen,
    authors: JSON.parse(row.authors as string),
    sourceName: row.source_name,
    sourceYear: row.source_year,
    stipulation: row.stipulation,
    moveCount: row.move_count,
    genre: row.genre,
    difficulty: row.difficulty,
    difficultyScore: row.difficulty_score,
    pieceCount: row.piece_count,
    keywords: JSON.parse(row.keywords as string),
    award: row.award || '',
    solutionText: row.solution_text,
  };

  return Response.json(problem, {
    headers: {
      // Cache for 1 hour (daily problem changes once per day)
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
