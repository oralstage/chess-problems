import { addFairyExclusion } from '../fairy-filter';

/**
 * GET /api/daily/history?days=30
 *
 * Returns past daily problems (last N days).
 * Uses the same golden-ratio hashing as /api/daily to compute which problem
 * was the daily for each past date.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30') || 30, 1), 90);

  // Build conditions for #2 direct problems, excluding fairy
  const conditions: string[] = ["genre = 'direct'", "stipulation = '#2'"];
  const bindings: (string | number)[] = [];
  addFairyExclusion(conditions, bindings);
  const where = conditions.join(' AND ');

  // Count total #2 direct problems (same as /api/daily)
  const countResult = await context.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM problems WHERE ${where}`
  ).bind(...bindings).first<{ cnt: number }>();
  const total = countResult?.cnt || 0;
  if (total === 0) {
    return Response.json([], { headers: { 'Cache-Control': 'public, max-age=3600' } });
  }

  // Compute daily problem offset for each day from today back to site open date
  const GOLDEN = 2654435761;
  const now = new Date();
  const SITE_OPEN = new Date(2026, 2, 15); // 2026-03-15
  const dateOffsets: { date: string; offset: number }[] = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (d < SITE_OPEN) break;
    const dayNum = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    const hash = ((dayNum * GOLDEN) >>> 0) / 4294967296;
    const offset = Math.floor(hash * total);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dateOffsets.push({ date: dateStr, offset });
  }

  // Fetch problems at each offset — use batch for efficiency
  // First get IDs via OFFSET queries, then batch fetch details
  const uniqueOffsets = [...new Set(dateOffsets.map(d => d.offset))];

  // Get IDs for each unique offset
  const idQueries = uniqueOffsets.map(offset =>
    context.env.DB.prepare(
      `SELECT id FROM problems WHERE ${where} ORDER BY difficulty_score ASC LIMIT 1 OFFSET ?`
    ).bind(...bindings, offset).first<{ id: number }>()
  );
  const idResults = await Promise.all(idQueries);

  const offsetToId = new Map<number, number>();
  uniqueOffsets.forEach((offset, i) => {
    if (idResults[i]?.id) offsetToId.set(offset, idResults[i]!.id);
  });

  // Batch fetch all unique problem IDs
  const uniqueIds = [...new Set(offsetToId.values())];
  if (uniqueIds.length === 0) {
    return Response.json([], { headers: { 'Cache-Control': 'public, max-age=3600' } });
  }

  const placeholders = uniqueIds.map(() => '?').join(',');
  const rows = await context.env.DB.prepare(
    `SELECT id, fen, authors, source_name, source_year, stipulation, move_count,
            genre, difficulty, difficulty_score, piece_count, keywords, award
     FROM problems WHERE id IN (${placeholders})`
  ).bind(...uniqueIds).all();

  const problemMap = new Map<number, Record<string, unknown>>();
  for (const row of (rows.results || [])) {
    problemMap.set(row.id as number, {
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
    });
  }

  // Build response: date + problem data
  const result = dateOffsets
    .map(({ date, offset }) => {
      const id = offsetToId.get(offset);
      if (!id) return null;
      const problem = problemMap.get(id);
      if (!problem) return null;
      return { date, ...problem };
    })
    .filter(Boolean);

  return Response.json(result, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
};
