/**
 * Import valid orthodox problems from YACPDB cache into D1.
 *
 * Usage:
 *   npx tsx scripts/import-to-d1.ts
 *
 * Reads all cached YACPDB entries from scripts/.cache/,
 * filters for valid orthodox problems (#1-#5, study, retro),
 * and outputs a SQL file for D1 bulk import.
 */
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
    return null;
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
    if (!parsed) return null;
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
function parseStipulation(stip: string): { genre: 'direct' | 'help' | 'self' | 'study'; moveCount: number; sideToMove: 'w' | 'b' } | null {
  let m = stip.match(/^#(\d+)$/);
  if (m) return { genre: 'direct', moveCount: parseInt(m[1]), sideToMove: 'w' };
  m = stip.match(/^h#(\d+)$/);
  if (m) return { genre: 'help', moveCount: parseInt(m[1]), sideToMove: 'b' };
  m = stip.match(/^s#(\d+)$/);
  if (m) return { genre: 'self', moveCount: parseInt(m[1]), sideToMove: 'w' };
  if (stip === '+' || stip === '=') return { genre: 'study', moveCount: 0, sideToMove: 'w' };
  return null;
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

// ── Main ───────────────────────────────────────────────
const CACHE_DIR = path.join(import.meta.dirname, '.cache');
const MAX_MOVE_COUNT: Record<string, number> = { direct: 999, help: 999, self: 999, study: 999 };

function escapeSQL(s: string): string {
  return s.replace(/'/g, "''");
}

async function main() {
  const cacheFiles = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  console.log(`Processing ${cacheFiles.length} cached entries...`);

  const problems: string[] = []; // SQL value tuples
  const counts: Record<string, number> = { direct: 0, help: 0, self: 0, study: 0, retro: 0 };
  let skipped = 0;

  for (const file of cacheFiles) {
    try {
      const entry: YacpdbEntry = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), 'utf-8'));
      if (!entry || !entry.id) { skipped++; continue; }
      if (!entry.stipulation || !entry.algebraic || !entry.solution) { skipped++; continue; }
      // Skip empty or placeholder solutions (e.g. "{\n}", "No solution", "{Solution?}")
      const solClean = entry.solution.replace(/[{}\s]/g, '');
      if (!solClean || /^(nosolution!?|solution\??)$/i.test(solClean)) { skipped++; continue; }
      // Must contain at least one chess move (digit followed by dot)
      if (!/\d\./.test(entry.solution)) { skipped++; continue; }

      const stip = parseStipulation(entry.stipulation);
      if (!stip) { skipped++; continue; }
      if (stip.moveCount === 0 && stip.genre !== 'study') { skipped++; continue; }
      if (stip.moveCount > MAX_MOVE_COUNT[stip.genre]) { skipped++; continue; }

      const isRetro = (entry.keywords || []).includes('Retro');
      const finalGenre = isRetro ? 'retro' as const : stip.genre;

      if (hasFairyPieces(entry.algebraic)) { skipped++; continue; }

      const fen = algebraicToFen(entry.algebraic, stip.sideToMove);
      if (!fen) { skipped++; continue; }

      const whiteKings = entry.algebraic.white.filter(p => p.startsWith('K')).length;
      const blackKings = entry.algebraic.black.filter(p => p.startsWith('K')).length;
      if (whiteKings !== 1 || blackKings !== 1) { skipped++; continue; }

      const pieceCount = entry.algebraic.white.length + entry.algebraic.black.length;
      const { score, label } = scoreDifficulty(stip.genre, stip.moveCount, pieceCount, entry.solution.length);

      const award = entry.award
        ? [entry.award.distinction, entry.award.tourney?.name].filter(Boolean).join(', ')
        : '';

      const authors = JSON.stringify(entry.authors || ['Unknown']);
      const keywords = JSON.stringify(entry.keywords || []);

      // Parse year: can be number (2001), 2-digit number (79 → 1979), string ("1989-1994"), or missing
      const rawYear = entry.source?.date?.year;
      let sourceYear: string;
      if (rawYear == null) {
        sourceYear = 'NULL';
      } else if (typeof rawYear === 'number') {
        if (rawYear <= 0) {
          sourceYear = 'NULL';
        } else if (rawYear < 100) {
          // 2-digit year: 79 → 1979, 05 → 2005
          sourceYear = String(rawYear < 30 ? 2000 + rawYear : 1900 + rawYear);
        } else if (rawYear >= 100 && rawYear < 200) {
          // 3-digit year 1xx: likely 18xx (e.g. 188 → 1888 from Nationaltidende)
          sourceYear = String(1800 + (rawYear - 100));
        } else if (rawYear > new Date().getFullYear()) {
          sourceYear = 'NULL'; // Future year — data error
        } else {
          // Values >= 200 kept as-is (includes medieval chess/shatranj problems from 800 AD+)
          sourceYear = String(rawYear);
        }
      } else {
        // String like "1989-1994" or "2001" — take first 4-digit number
        const yearMatch = String(rawYear).match(/(\d{4})/);
        if (yearMatch) {
          const parsed = parseInt(yearMatch[1]);
          sourceYear = parsed > new Date().getFullYear() ? 'NULL' : yearMatch[1];
        } else {
          sourceYear = 'NULL';
        }
      }

      // Truncate solution to 2000 chars to stay within D1 500MB free tier
      const solutionText = entry.solution.length > 2000 ? entry.solution.slice(0, 2000) + '...' : entry.solution;

      problems.push(
        `(${entry.id},'${escapeSQL(fen)}','${escapeSQL(authors)}','${escapeSQL(entry.source?.name || 'Unknown')}',${sourceYear},'${escapeSQL(entry.stipulation)}',${stip.moveCount},'${finalGenre}','${escapeSQL(label)}',${score},${pieceCount},'${escapeSQL(solutionText)}','${escapeSQL(keywords)}','${escapeSQL(award)}')`
      );

      counts[finalGenre]++;
    } catch {
      skipped++;
    }
  }

  console.log(`Valid: ${problems.length}, Skipped: ${skipped}`);
  console.log(`  Direct: ${counts.direct}, Help: ${counts.help}, Self: ${counts.self}, Study: ${counts.study}, Retro: ${counts.retro}`);

  // Write individual INSERT statements (D1 has statement size limit)
  // Split into multiple SQL files to avoid upload size limits
  const PROBLEMS_PER_FILE = 5000;
  const fileCount = Math.ceil(problems.length / PROBLEMS_PER_FILE);

  // Write first file with DELETE
  for (let fileIdx = 0; fileIdx < fileCount; fileIdx++) {
    const outFile = path.join(import.meta.dirname, `import-data-${fileIdx}.sql`);
    const stream = fs.createWriteStream(outFile);

    if (fileIdx === 0) {
      stream.write('DELETE FROM problems;\n');
    }

    const start = fileIdx * PROBLEMS_PER_FILE;
    const end = Math.min(start + PROBLEMS_PER_FILE, problems.length);
    for (let i = start; i < end; i++) {
      stream.write(`INSERT INTO problems (id,fen,authors,source_name,source_year,stipulation,move_count,genre,difficulty,difficulty_score,piece_count,solution_text,keywords,award) VALUES ${problems[i]};\n`);
    }

    stream.end();
    console.log(`  Wrote ${outFile} (${end - start} problems)`);
  }

  console.log(`\n${fileCount} SQL files generated.`);
  console.log(`\nTo import: for i in $(seq 0 ${fileCount - 1}); do npx wrangler d1 execute chess-problems-db --remote --file=scripts/import-data-$i.sql; done`);
}

main().catch(console.error);
