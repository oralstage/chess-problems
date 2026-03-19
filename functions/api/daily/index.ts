import { addFairyExclusion } from '../fairy-filter';

/**
 * GET /api/daily
 *
 * Returns today's daily problem (a #2 direct mate).
 * Uses golden-ratio hashing on the date to pick deterministically.
 * Includes full solutionText for immediate solving.
 *
 * Accepts optional `?date=YYYY-MM-DD` query param (client's local date)
 * so the problem matches the date displayed in the UI.
 * Falls back to UTC date if not provided.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  // Build conditions for #2 direct problems, excluding fairy
  const conditions: string[] = ["genre = 'direct'", "stipulation = '#2'"];
  const bindings: (string | number)[] = [];
  addFairyExclusion(conditions, bindings);
  const where = conditions.join(' AND ');

  // Count #2 direct problems
  const countResult = await context.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM problems WHERE ${where}`
  ).bind(...bindings).first<{ cnt: number }>();
  const total = countResult?.cnt || 0;
  if (total === 0) {
    return Response.json({ error: 'No daily problems available' }, { status: 404 });
  }

  // Use client's local date if provided, otherwise UTC
  const url = new URL(context.request.url);
  const dateParam = url.searchParams.get('date');
  let dayNum: number;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const [y, m, d] = dateParam.split('-').map(Number);
    dayNum = y * 10000 + m * 100 + d;
  } else {
    const now = new Date();
    dayNum = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  }

  // Golden-ratio hash to pick today's problem
  const GOLDEN = 2654435761;
  const hash = ((dayNum * GOLDEN) >>> 0) / 4294967296;
  const idx = Math.floor(hash * total);

  // Fetch the problem at that offset, ordered by difficulty
  const row = await context.env.DB.prepare(
    `SELECT id, fen, authors, source_name, source_year, stipulation, move_count,
            genre, difficulty, difficulty_score, piece_count, keywords, award, solution_text
     FROM problems
     WHERE ${where}
     ORDER BY difficulty_score ASC
     LIMIT 1 OFFSET ?`
  ).bind(...bindings, idx).first();

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
