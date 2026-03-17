/**
 * GET /api/stats
 *
 * Returns problem counts per genre and available stipulations/keywords.
 * Used by ModeSelector and FilterPage.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const genre = new URL(context.request.url).searchParams.get('genre');

  // Genre counts
  const genreCounts = await context.env.DB.prepare(
    `SELECT genre, COUNT(*) as count FROM problems GROUP BY genre`
  ).all();

  const counts: Record<string, number> = {};
  for (const row of genreCounts.results) {
    counts[row.genre as string] = row.count as number;
  }

  // If genre specified, return available stipulations and keyword stats
  let stipulations: string[] = [];
  let keywords: string[] = [];
  let yearRange = { min: 0, max: 0 };
  let pieceRange = { min: 0, max: 0 };
  let moveRange = { min: 0, max: 0 };

  if (genre && ['direct', 'help', 'self', 'study', 'retro'].includes(genre)) {
    const stipResult = await context.env.DB.prepare(
      `SELECT DISTINCT stipulation FROM problems WHERE genre = ? ORDER BY stipulation`
    ).bind(genre).all();
    stipulations = stipResult.results.map((r: Record<string, unknown>) => r.stipulation as string);

    const rangeResult = await context.env.DB.prepare(
      `SELECT MIN(source_year) as minYear, MAX(source_year) as maxYear,
              MIN(piece_count) as minPieces, MAX(piece_count) as maxPieces,
              MIN(CASE WHEN move_count > 0 THEN move_count END) as minMoves,
              MAX(move_count) as maxMoves
       FROM problems WHERE genre = ?`
    ).bind(genre).first<{ minYear: number; maxYear: number; minPieces: number; maxPieces: number; minMoves: number; maxMoves: number }>();

    if (rangeResult) {
      yearRange = { min: rangeResult.minYear || 0, max: rangeResult.maxYear || 0 };
      pieceRange = { min: rangeResult.minPieces || 0, max: rangeResult.maxPieces || 0 };
      moveRange = { min: rangeResult.minMoves || 1, max: rangeResult.maxMoves || 10 };
    }

    // Get all unique keywords for this genre
    const kwResult = await context.env.DB.prepare(
      `SELECT keywords FROM problems WHERE genre = ? AND keywords != '[]'`
    ).bind(genre).all();

    const kwSet = new Set<string>();
    for (const row of kwResult.results) {
      try {
        const kws = JSON.parse(row.keywords as string) as string[];
        for (const kw of kws) kwSet.add(kw);
      } catch { /* ignore */ }
    }
    keywords = [...kwSet].sort();
  }

  return Response.json({ counts, stipulations, keywords, yearRange, pieceRange, moveRange });
};
