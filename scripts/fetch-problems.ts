import * as fs from 'fs';
import * as path from 'path';

// ── Types ──────────────────────────────────────────────
interface YacpdbEntry {
  id: number;
  authors?: string[];
  source?: { name?: string; date?: { year?: number } };
  stipulation?: string;
  algebraic?: { white: string[]; black: string[] };
  solution?: string;
  keywords?: string[];
  award?: { distinction?: string; tourney?: { name?: string } };
}

interface OutputProblem {
  id: number;
  fen: string;
  authors: string[];
  sourceName: string;
  sourceYear: number | null;
  stipulation: string;
  moveCount: number;
  genre: 'direct' | 'help' | 'self' | 'study' | 'retro';
  difficulty: string;
  difficultyScore: number;
  solutionText: string;
  keywords: string[];
  award: string;
}

// ── YACPDB Algebraic → FEN ─────────────────────────────
const PIECE_MAP: Record<string, string> = {
  K: 'K', Q: 'Q', R: 'R', B: 'B', S: 'N', N: 'N', P: 'P',
};

function parsePieceString(s: string): { piece: string; rank: number; file: number } | null {
  const trimmed = s.trim();
  if (trimmed.length < 2) return null;
  const firstChar = trimmed[0];
  let pieceLetter: string;
  let squareStr: string;

  if (firstChar >= 'a' && firstChar <= 'h') {
    pieceLetter = 'P';
    squareStr = trimmed;
  } else if (PIECE_MAP[firstChar.toUpperCase()]) {
    pieceLetter = PIECE_MAP[firstChar.toUpperCase()];
    squareStr = trimmed.slice(1);
  } else {
    return null; // fairy piece
  }

  if (squareStr.length !== 2) return null;
  const file = squareStr.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = parseInt(squareStr[1]) - 1;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return { piece: pieceLetter, rank, file };
}

function algebraicToFen(alg: { white: string[]; black: string[] }, sideToMove: 'w' | 'b'): string | null {
  const board: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));

  for (const ps of alg.white) {
    const parsed = parsePieceString(ps);
    if (!parsed) return null; // fairy piece or parse error
    board[parsed.rank][parsed.file] = parsed.piece.toUpperCase();
  }
  for (const ps of alg.black) {
    const parsed = parsePieceString(ps);
    if (!parsed) return null;
    board[parsed.rank][parsed.file] = parsed.piece.toLowerCase();
  }

  const ranks: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let fenRank = '';
    let emptyCount = 0;
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p) {
        if (emptyCount > 0) { fenRank += emptyCount; emptyCount = 0; }
        fenRank += p;
      } else {
        emptyCount++;
      }
    }
    if (emptyCount > 0) fenRank += emptyCount;
    ranks.push(fenRank);
  }

  return ranks.join('/') + ` ${sideToMove} - - 0 1`;
}

function hasFairyPieces(alg: { white: string[]; black: string[] }): boolean {
  const validPieces = new Set(['K', 'Q', 'R', 'B', 'S', 'N', 'P']);
  for (const pieces of [alg.white, alg.black]) {
    if (!Array.isArray(pieces)) return true;
    for (const ps of pieces) {
      const t = ps.trim();
      if (t.length < 2) return true;
      const fc = t[0];
      if (fc >= 'a' && fc <= 'h') continue;
      if (!validPieces.has(fc.toUpperCase())) return true;
    }
  }
  return false;
}

// ── Stipulation parsing ────────────────────────────────
function parseStipulation(stip: unknown): { genre: 'direct' | 'help' | 'self' | 'study'; moveCount: number; sideToMove: 'w' | 'b' } | null {
  if (typeof stip !== 'string') return null;
  // Direct mate: #2, #3, etc.
  let m = stip.match(/^#(\d+)$/);
  if (m) return { genre: 'direct', moveCount: parseInt(m[1]), sideToMove: 'w' };

  // Helpmate: h#2, h#3, etc.
  m = stip.match(/^h#(\d+)$/);
  if (m) return { genre: 'help', moveCount: parseInt(m[1]), sideToMove: 'b' };

  // Selfmate: s#2, s#3, etc.
  m = stip.match(/^s#(\d+)$/);
  if (m) return { genre: 'self', moveCount: parseInt(m[1]), sideToMove: 'w' };

  // Study: + (win) or = (draw)
  if (stip === '+' || stip === '=') return { genre: 'study', moveCount: 0, sideToMove: 'w' };

  return null; // Unsupported stipulation (series, fairy, etc.)
}

// ── Difficulty scoring ─────────────────────────────────
function scoreDifficulty(genre: string, moveCount: number, pieceCount: number, solutionLen: number): { score: number; label: string } {
  const genreBase = genre === 'direct' ? 0 : genre === 'help' ? 500 : 1000;
  const score = genreBase + moveCount * 100 + pieceCount * 2 + Math.min(solutionLen / 10, 50);

  let label: string;
  if (moveCount === 1) label = 'Beginner';
  else if (moveCount === 2 && pieceCount <= 8) label = 'Easy';
  else if (moveCount === 2) label = 'Medium';
  else if (moveCount === 3) label = 'Hard';
  else label = 'Expert';

  return { score, label };
}

// ── Fetching ───────────────────────────────────────────
const CACHE_DIR = path.join(import.meta.dirname, '.cache');

/** Returns { entry, fromCache } */
async function fetchEntry(id: number): Promise<{ entry: YacpdbEntry | null; fromCache: boolean }> {
  const cacheFile = path.join(CACHE_DIR, `${id}.json`);

  // Check cache
  if (fs.existsSync(cacheFile)) {
    try {
      return { entry: JSON.parse(fs.readFileSync(cacheFile, 'utf-8')), fromCache: true };
    } catch {
      // ignore cache errors
    }
  }

  try {
    const res = await fetch(`https://www.yacpdb.org/json.php?entry&id=${id}`);
    if (!res.ok) return { entry: null, fromCache: false };
    const data = await res.json() as YacpdbEntry;

    // Cache response
    fs.writeFileSync(cacheFile, JSON.stringify(data));
    return { entry: data, fromCache: false };
  } catch {
    return { entry: null, fromCache: false };
  }
}

async function fetchBatch(ids: number[], concurrency: number = 20): Promise<(YacpdbEntry | null)[]> {
  const results: (YacpdbEntry | null)[] = new Array(ids.length).fill(null);
  let idx = 0;

  async function worker() {
    while (idx < ids.length) {
      const i = idx++;
      const { entry, fromCache } = await fetchEntry(ids[i]);
      results[i] = entry;
      // Only delay for API calls (not cache hits) to be respectful
      if (!fromCache) {
        await new Promise(r => setTimeout(r, 30));
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, ids.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── Main ───────────────────────────────────────────────
async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const problems: OutputProblem[] = [];
  // No hard caps — collect everything we find
  const targets = { direct: Infinity, help: Infinity, self: Infinity, study: Infinity, retro: Infinity };
  const counts = { direct: 0, help: 0, self: 0, study: 0, retro: 0 };

  // No move count limit — collect all move counts, filter in UI via slider
  const MAX_MOVE_COUNT: Record<string, number> = { direct: 999, help: 999, self: 999, study: 999 };

  // Track per-moveCount for logging
  const moveCountStats: Record<string, number> = {};

  console.log('Fetching problems from YACPDB...');
  console.log('  Move count limit: none (all move counts)');

  // Full scan: check every single ID from 1 to 1,000,000
  // Cached entries are read from disk (fast), only uncached IDs hit the API.
  // ~96k already cached, remaining ~900k need API calls.
  // With 15 concurrency and 50ms delay: ~50 minutes for uncached IDs.

  const ranges = [
    { start: 1, end: 1000000, step: 1 },
  ];

  for (const range of ranges) {
    const done = Object.values(counts).every((c, i) =>
      c >= Object.values(targets)[i]
    );
    if (done) break;

    const ids: number[] = [];
    for (let id = range.start; id < range.end; id += range.step) {
      ids.push(id);
    }

    console.log(`  Scanning IDs ${range.start}-${range.end} (step ${range.step}, ${ids.length} IDs)...`);

    // Process in batches of 500
    for (let batchStart = 0; batchStart < ids.length; batchStart += 500) {
      const batchIds = ids.slice(batchStart, batchStart + 500);
      const entries = await fetchBatch(batchIds);

      for (const entry of entries) {
        if (!entry || !entry.id) continue;
        if (!entry.stipulation || !entry.algebraic || !entry.solution) continue;
        if (typeof entry.solution !== 'string' || !entry.solution.trim()) continue;

        // Parse stipulation
        const stip = parseStipulation(entry.stipulation);
        if (!stip) continue;

        // Filter out #0 (already-mated proof positions) and long move counts (#6+)
        if (stip.moveCount === 0) continue;
        if (stip.moveCount > MAX_MOVE_COUNT[stip.genre]) continue;

        // Retro keyword overrides genre
        const isRetro = (entry.keywords || []).includes('Retro');
        const finalGenre = isRetro ? 'retro' as const : stip.genre;

        // Check if we still need this genre
        if (counts[finalGenre] >= targets[finalGenre]) continue;

        // Check for fairy pieces
        if (hasFairyPieces(entry.algebraic)) continue;

        // Convert to FEN
        const fen = algebraicToFen(entry.algebraic, stip.sideToMove);
        if (!fen) continue;

        // Basic validation: must have exactly one king per side
        const whiteKings = entry.algebraic.white.filter(p => p.startsWith('K')).length;
        const blackKings = entry.algebraic.black.filter(p => p.startsWith('K')).length;
        if (whiteKings !== 1 || blackKings !== 1) continue;

        const pieceCount = entry.algebraic.white.length + entry.algebraic.black.length;
        const { score, label } = scoreDifficulty(stip.genre, stip.moveCount, pieceCount, entry.solution.length);

        const award = entry.award
          ? [entry.award.distinction, entry.award.tourney?.name].filter(Boolean).join(', ')
          : '';

        problems.push({
          id: entry.id,
          fen,
          authors: entry.authors || ['Unknown'],
          sourceName: entry.source?.name || 'Unknown',
          sourceYear: entry.source?.date?.year || null,
          stipulation: entry.stipulation,
          moveCount: stip.moveCount,
          genre: finalGenre,
          difficulty: label,
          difficultyScore: score,
          solutionText: entry.solution,
          keywords: entry.keywords || [],
          award,
        });

        counts[finalGenre]++;
        const mcKey = `${finalGenre}#${stip.moveCount}`;
        moveCountStats[mcKey] = (moveCountStats[mcKey] || 0) + 1;
      }

      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      process.stdout.write(`\r    Progress: direct=${counts.direct} help=${counts.help} self=${counts.self} study=${counts.study} retro=${counts.retro} total=${total}  `);

      // Stop early if we have enough
      const allDone = (Object.keys(counts) as (keyof typeof counts)[]).every(
        k => counts[k] >= targets[k]
      );
      if (allDone) break;
    }

    console.log();
  }

  // Sort by genre then difficulty
  problems.sort((a, b) => {
    const genreOrder: Record<string, number> = { direct: 0, help: 1, self: 2, study: 3, retro: 4 };
    if (genreOrder[a.genre] !== genreOrder[b.genre]) {
      return genreOrder[a.genre] - genreOrder[b.genre];
    }
    return a.difficultyScore - b.difficultyScore;
  });

  // Write output
  const outDir = path.join(import.meta.dirname, '..', 'src', 'data');
  fs.mkdirSync(outDir, { recursive: true });

  // Split by genre
  for (const genre of ['direct', 'help', 'self', 'study', 'retro'] as const) {
    const genreProblems = problems.filter(p => p.genre === genre);
    const outFile = path.join(outDir, `problems-${genre}.json`);
    fs.writeFileSync(outFile, JSON.stringify(genreProblems, null, 0));
    console.log(`Wrote ${genreProblems.length} ${genre} problems to ${outFile}`);
  }

  // Also write a combined small starter set
  const starterSet = [
    ...problems.filter(p => p.genre === 'direct').slice(0, 50),
    ...problems.filter(p => p.genre === 'help').slice(0, 20),
    ...problems.filter(p => p.genre === 'self').slice(0, 10),
  ];
  const starterFile = path.join(outDir, 'problems-starter.json');
  fs.writeFileSync(starterFile, JSON.stringify(starterSet, null, 0));
  console.log(`Wrote ${starterSet.length} starter problems to ${starterFile}`);

  console.log('\nDone!');
  console.log(`Total: ${problems.length} problems`);
  console.log(`  Direct: ${counts.direct}`);
  console.log(`  Help: ${counts.help}`);
  console.log(`  Self: ${counts.self}`);
  console.log(`  Study: ${counts.study}`);
  console.log('\nMove count distribution:');
  Object.entries(moveCountStats).sort().forEach(([k, v]) => console.log(`  ${k}: ${v}`));
}

main().catch(console.error);
