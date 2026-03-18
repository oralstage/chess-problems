import { addFairyExclusion } from './fairy-filter';

/**
 * GET /api/stats
 *
 * Returns problem counts per genre and available stipulations/keywords.
 * Used by ModeSelector and FilterPage.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const genre = new URL(context.request.url).searchParams.get('genre');

  // Build fairy exclusion once for reuse
  const fairyConds: string[] = [];
  const fairyBindings: (string | number)[] = [];
  addFairyExclusion(fairyConds, fairyBindings);
  const fairyWhere = fairyConds.join(' AND ');

  // Genre counts
  const genreCounts = await context.env.DB.prepare(
    `SELECT genre, COUNT(*) as count FROM problems WHERE ${fairyWhere} GROUP BY genre`
  ).bind(...fairyBindings).all();

  const counts: Record<string, number> = {};
  for (const row of genreCounts.results) {
    counts[row.genre as string] = row.count as number;
  }

  // Move-count breakdown per genre (for category counts on home page)
  const moveCountResult = await context.env.DB.prepare(
    `SELECT genre, move_count, COUNT(*) as count FROM problems WHERE genre IN ('direct', 'help') AND ${fairyWhere} GROUP BY genre, move_count ORDER BY genre, move_count`
  ).bind(...fairyBindings).all();
  const moveCounts: Record<string, Record<number, number>> = {};
  for (const row of moveCountResult.results) {
    const g = row.genre as string;
    if (!moveCounts[g]) moveCounts[g] = {};
    moveCounts[g][row.move_count as number] = row.count as number;
  }

  // If genre specified, return available stipulations and keyword stats
  let stipulations: string[] = [];
  let keywords: string[] = [];
  let yearRange = { min: 0, max: 0 };
  let pieceRange = { min: 0, max: 0 };
  let moveRange = { min: 0, max: 0 };

  if (genre && ['direct', 'help', 'self', 'study', 'retro'].includes(genre)) {
    const stipResult = await context.env.DB.prepare(
      `SELECT DISTINCT stipulation FROM problems WHERE genre = ? AND ${fairyWhere} ORDER BY stipulation`
    ).bind(genre, ...fairyBindings).all();
    stipulations = stipResult.results.map((r: Record<string, unknown>) => r.stipulation as string);

    const rangeResult = await context.env.DB.prepare(
      `SELECT MIN(source_year) as minYear, MAX(source_year) as maxYear,
              MIN(piece_count) as minPieces, MAX(piece_count) as maxPieces,
              MIN(CASE WHEN move_count > 0 THEN move_count END) as minMoves,
              MAX(move_count) as maxMoves
       FROM problems WHERE genre = ? AND ${fairyWhere}`
    ).bind(genre, ...fairyBindings).first<{ minYear: number; maxYear: number; minPieces: number; maxPieces: number; minMoves: number; maxMoves: number }>();

    if (rangeResult) {
      yearRange = { min: rangeResult.minYear || 0, max: rangeResult.maxYear || 0 };
      pieceRange = { min: rangeResult.minPieces || 0, max: rangeResult.maxPieces || 0 };
      moveRange = { min: rangeResult.minMoves || 1, max: rangeResult.maxMoves || 10 };
    }

    // Get all unique keywords for this genre
    const kwResult = await context.env.DB.prepare(
      `SELECT keywords FROM problems WHERE genre = ? AND keywords != '[]' AND ${fairyWhere}`
    ).bind(genre, ...fairyBindings).all();

    const kwSet = new Set<string>();
    for (const row of kwResult.results) {
      try {
        const kws = JSON.parse(row.keywords as string) as string[];
        for (const kw of kws) kwSet.add(kw);
      } catch { /* ignore */ }
    }
    keywords = [...kwSet].sort();
  }

  return Response.json({ counts, moveCounts, stipulations, keywords, yearRange, pieceRange, moveRange });
};
