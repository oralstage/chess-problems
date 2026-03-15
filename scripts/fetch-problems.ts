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
  genre: 'direct' | 'help' | 'self' | 'study';
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
function parseStipulation(stip: string): { genre: 'direct' | 'help' | 'self' | 'study'; moveCount: number; sideToMove: 'w' | 'b' } | null {
  // Direct mate: #2, #3, etc.
  let m = stip.match(/^#(\d+)$/);
  if (m) return { genre: 'direct', moveCount: parseInt(m[1]), sideToMove: 'w' };

  // Helpmate: h#2, h#3, etc.
  m = stip.match(/^h#(\d+)$/);
  if (m) return { genre: 'help', moveCount: parseInt(m[1]), sideToMove: 'b' };

  // Selfmate: s#2, s#3, etc.
  m = stip.match(/^s#(\d+)$/);
  if (m) return { genre: 'self', moveCount: parseInt(m[1]), sideToMove: 'w' };

  return null; // Unsupported stipulation (series, fairy, study, etc.)
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

async function fetchEntry(id: number): Promise<YacpdbEntry | null> {
  const cacheFile = path.join(CACHE_DIR, `${id}.json`);

  // Check cache
  if (fs.existsSync(cacheFile)) {
    try {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    } catch {
      // ignore cache errors
    }
  }

  try {
    const res = await fetch(`https://www.yacpdb.org/json.php?entry&id=${id}`);
    if (!res.ok) return null;
    const data = await res.json() as YacpdbEntry;

    // Cache response
    fs.writeFileSync(cacheFile, JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}

async function fetchBatch(ids: number[], concurrency: number = 15): Promise<(YacpdbEntry | null)[]> {
  const results: (YacpdbEntry | null)[] = new Array(ids.length).fill(null);
  let idx = 0;

  async function worker() {
    while (idx < ids.length) {
      const i = idx++;
      results[i] = await fetchEntry(ids[i]);
      // Small delay to be respectful
      await new Promise(r => setTimeout(r, 50));
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
  const targets = { direct: 500, help: 200, self: 100 };
  const counts = { direct: 0, help: 0, self: 0 };

  // Track per-moveCount for logging only (no sub-targets - just collect 500 total)
  const directCounts: Record<number, number> = {};
  function directKey(moveCount: number): number {
    return moveCount >= 4 ? 4 : moveCount;
  }

  console.log('Fetching problems from YACPDB...');

  // Scan strategy:
  // - IDs 1-350000: mostly direct mates (#2, #3)
  // - IDs 340000-370000: mix of selfmates and helpmates
  // - IDs 370000-550000: mostly helpmates

  const ranges = [
    // Direct mates: sample from early IDs (denser scan)
    { start: 4, end: 50000, step: 12 },       // ~4200 checks
    { start: 50000, end: 200000, step: 60 },   // ~2500 checks
    { start: 200000, end: 340000, step: 80 },  // ~1750 checks (extended range)
    // Selfmates + helpmates
    { start: 340000, end: 380000, step: 15 },  // ~2700 checks
    // Helpmates
    { start: 380000, end: 550000, step: 40 },  // ~4250 checks
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

    // Process in batches of 200
    for (let batchStart = 0; batchStart < ids.length; batchStart += 200) {
      const batchIds = ids.slice(batchStart, batchStart + 200);
      const entries = await fetchBatch(batchIds);

      for (const entry of entries) {
        if (!entry || !entry.id) continue;
        if (!entry.stipulation || !entry.algebraic || !entry.solution) continue;
        if (!entry.solution.trim()) continue;

        // Parse stipulation
        const stip = parseStipulation(entry.stipulation);
        if (!stip) continue;

        // Check if we still need this genre
        if (counts[stip.genre] >= targets[stip.genre]) continue;

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
          genre: stip.genre,
          difficulty: label,
          difficultyScore: score,
          solutionText: entry.solution,
          keywords: entry.keywords || [],
          award,
        });

        counts[stip.genre]++;
        if (stip.genre === 'direct') {
          directCounts[directKey(stip.moveCount)]++;
        }
      }

      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      process.stdout.write(`\r    Progress: direct=${counts.direct}(#1:${directCounts[1]} #2:${directCounts[2]} #3:${directCounts[3]} #4+:${directCounts[4]}) help=${counts.help} self=${counts.self} total=${total}  `);

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
    const genreOrder = { direct: 0, help: 1, self: 2, study: 3 };
    if (genreOrder[a.genre] !== genreOrder[b.genre]) {
      return genreOrder[a.genre] - genreOrder[b.genre];
    }
    return a.difficultyScore - b.difficultyScore;
  });

  // Write output
  const outDir = path.join(import.meta.dirname, '..', 'src', 'data');
  fs.mkdirSync(outDir, { recursive: true });

  // Split by genre
  for (const genre of ['direct', 'help', 'self'] as const) {
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
  console.log(`  Direct: ${counts.direct} (#1:${directCounts[1]} #2:${directCounts[2]} #3:${directCounts[3]} #4+:${directCounts[4]})`);
  console.log(`  Help: ${counts.help}`);
  console.log(`  Self: ${counts.self}`);
}

main().catch(console.error);
