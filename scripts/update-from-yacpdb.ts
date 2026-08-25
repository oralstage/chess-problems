/**
 * Incremental YACPDB → D1 update. Unlike import-to-d1.ts (full wipe-and-reload),
 * this touches only problems that changed on YACPDB since a given date, plus
 * newly created ids, and upserts them without disturbing is_fairy.
 *
 * Phases (run in order):
 *   npx tsx scripts/update-from-yacpdb.ts discover --since 2026-03-15
 *       Walk json.php?changes pages back to --since, save target ids to
 *       scripts/.update/targets.json (changed ids + highest id seen).
 *   npx tsx scripts/update-from-yacpdb.ts refetch --db-max 671418
 *       Drop the stale cache files for the targets (changed ids, plus every id
 *       in (db-max, maxSeen+500] whose cache entry is an empty stub) and
 *       re-download them into scripts/.cache/.
 *   npx tsx scripts/update-from-yacpdb.ts check <id> [<id>...]
 *       Convert the given cached ids and print the SQL column values, for
 *       comparing against current D1 rows before trusting the converter.
 *   npx tsx scripts/update-from-yacpdb.ts sql
 *       Convert all targets from cache into scripts/.update/update-data-*.sql:
 *       UPSERTs (ON CONFLICT(id) DO UPDATE, is_fairy untouched) for valid
 *       entries, UPDATE ... SET is_fairy = 1 for ones that turned fairy.
 *
 * The conversion logic must stay byte-identical to import-to-d1.ts — verify
 * with `check` against rows already in D1 before importing.
 */
import * as fs from 'fs';
import * as path from 'path';
import { isFairyEntry, PIECE_MAP } from './fairy-detect';

interface YacpdbEntry {
  id: number;
  authors?: string[];
  source?: { name?: string; date?: { year?: number } };
  stipulation?: string;
  algebraic?: { white: string[]; black: string[]; neutral?: string[] };
  options?: string[];
  legend?: Record<string, string[]>;
  solution?: string;
  keywords?: string[];
  award?: { distinction?: string; tourney?: { name?: string } };
}

const CACHE_DIR = path.join(import.meta.dirname, '.cache');
const UPDATE_DIR = path.join(import.meta.dirname, '.update');
const TARGETS_FILE = path.join(UPDATE_DIR, 'targets.json');
const MAX_MOVE_COUNT: Record<string, number> = { direct: 999, help: 999, self: 999, study: 999 };

// ── Conversion (copied verbatim from import-to-d1.ts — keep in sync) ───
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

function escapeSQL(s: string): string {
  return s.replace(/'/g, "''");
}

interface Converted {
  id: number;
  genre: string;
  columns: Record<string, string | number>; // SQL-ready values (strings unescaped)
}

/** Returns converted row, or 'fairy', or a skip reason string. */
function convertEntry(entry: YacpdbEntry): Converted | 'fairy' | string {
  if (!entry || !entry.id) return 'no id';
  if (!entry.stipulation || !entry.algebraic || !entry.solution) return 'missing fields';
  const solClean = entry.solution.replace(/[{}\s]/g, '');
  if (!solClean || /^(nosolution!?|solution\??)$/i.test(solClean)) return 'placeholder solution';
  if (!/\d\./.test(entry.solution)) return 'no moves in solution';

  const stip = parseStipulation(entry.stipulation);
  if (!stip) return 'unsupported stipulation';
  if (stip.moveCount === 0 && stip.genre !== 'study') return 'moveCount 0';
  if (stip.moveCount > MAX_MOVE_COUNT[stip.genre]) return 'moveCount too high';

  const isRetro = (entry.keywords || []).includes('Retro');
  const finalGenre = isRetro ? 'retro' : stip.genre;

  if (isFairyEntry(entry)) return 'fairy';

  const fen = algebraicToFen(entry.algebraic, stip.sideToMove);
  if (!fen) return 'fen conversion failed';

  const whiteKings = entry.algebraic.white.filter(p => p.startsWith('K')).length;
  const blackKings = entry.algebraic.black.filter(p => p.startsWith('K')).length;
  if (whiteKings !== 1 || blackKings !== 1) return 'king count';

  const pieceCount = entry.algebraic.white.length + entry.algebraic.black.length;
  const { score, label } = scoreDifficulty(stip.genre, stip.moveCount, pieceCount, entry.solution.length);

  const award = entry.award
    ? [entry.award.distinction, entry.award.tourney?.name].filter(Boolean).join(', ')
    : '';

  const rawYear = entry.source?.date?.year;
  let sourceYear: string;
  if (rawYear == null) {
    sourceYear = 'NULL';
  } else if (typeof rawYear === 'number') {
    if (rawYear <= 0) {
      sourceYear = 'NULL';
    } else if (rawYear < 100) {
      sourceYear = String(rawYear < 30 ? 2000 + rawYear : 1900 + rawYear);
    } else if (rawYear >= 100 && rawYear < 200) {
      sourceYear = String(1800 + (rawYear - 100));
    } else if (rawYear > new Date().getFullYear()) {
      sourceYear = 'NULL';
    } else {
      sourceYear = String(rawYear);
    }
  } else {
    const yearMatch = String(rawYear).match(/(\d{4})/);
    if (yearMatch) {
      const parsed = parseInt(yearMatch[1]);
      sourceYear = parsed > new Date().getFullYear() ? 'NULL' : yearMatch[1];
    } else {
      sourceYear = 'NULL';
    }
  }

  const solutionText = entry.solution.length > 2000 ? entry.solution.slice(0, 2000) + '...' : entry.solution;

  return {
    id: entry.id,
    genre: finalGenre,
    columns: {
      fen,
      authors: JSON.stringify(entry.authors || ['Unknown']),
      source_name: entry.source?.name || 'Unknown',
      source_year: sourceYear, // 'NULL' or numeric string, unquoted in SQL
      stipulation: entry.stipulation,
      move_count: stip.moveCount,
      genre: finalGenre,
      difficulty: label,
      difficulty_score: score,
      piece_count: pieceCount,
      solution_text: solutionText,
      keywords: JSON.stringify(entry.keywords || []),
      award,
    },
  };
}

// ── Fetch helpers ──────────────────────────────────────
async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
}

async function refetchIds(ids: number[], concurrency = 10): Promise<{ ok: number; failed: number[] }> {
  let idx = 0;
  let ok = 0;
  const failed: number[] = [];

  async function worker() {
    while (idx < ids.length) {
      const i = idx++;
      const id = ids[i];
      try {
        const data = await fetchJson(`https://www.yacpdb.org/json.php?entry&id=${id}`);
        fs.writeFileSync(path.join(CACHE_DIR, `${id}.json`), JSON.stringify(data));
        ok++;
      } catch {
        failed.push(id);
      }
      await new Promise(r => setTimeout(r, 50));
      if ((ok + failed.length) % 500 === 0) {
        process.stdout.write(`\r  ${ok + failed.length}/${ids.length} (${failed.length} failed)`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  console.log(`\r  ${ok + failed.length}/${ids.length} done (${failed.length} failed)`);
  return { ok, failed };
}

function isEmptyStub(file: string): boolean {
  try {
    const e = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return !e.algebraic && !e.stipulation;
  } catch {
    return true;
  }
}

// ── Phases ─────────────────────────────────────────────
async function discover(since: string) {
  const sinceTime = new Date(since + 'T00:00:00Z').getTime();
  if (isNaN(sinceTime)) throw new Error(`bad --since date: ${since}`);

  const changedIds = new Set<number>();
  let maxSeen = 0;
  let page = 1;
  let reachedSince = false;

  while (!reachedSince) {
    const data = await fetchJson(`https://www.yacpdb.org/json.php?changes&p=${page}`) as {
      changes: { problem_id: string; date: string }[];
    };
    if (!data.changes || data.changes.length === 0) break;

    for (const ch of data.changes) {
      // date like "25 Aug 2026 <sup>01:40</sup>"
      const dateStr = ch.date.replace(/<[^>]*>/g, ' ').trim();
      const t = new Date(dateStr + ' UTC').getTime();
      if (!isNaN(t) && t < sinceTime) {
        reachedSince = true;
        break;
      }
      const pid = parseInt(ch.problem_id);
      if (pid > 0) {
        changedIds.add(pid);
        if (pid > maxSeen) maxSeen = pid;
      }
    }

    if (page % 25 === 0) process.stdout.write(`\r  page ${page}, ${changedIds.size} ids`);
    page++;
    await new Promise(r => setTimeout(r, 60));
    if (page > 20000) throw new Error('walked 20k pages without reaching --since; aborting');
  }

  fs.mkdirSync(UPDATE_DIR, { recursive: true });
  fs.writeFileSync(TARGETS_FILE, JSON.stringify({ since, changedIds: [...changedIds].sort((a, b) => a - b), maxSeen }, null, 1));
  console.log(`\nWalked ${page - 1} pages back to ${since}.`);
  console.log(`Changed problem ids: ${changedIds.size}, highest id seen: ${maxSeen}`);
  console.log(`Saved to ${TARGETS_FILE}`);
}

function loadTargets(): { since: string; changedIds: number[]; maxSeen: number } {
  return JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf-8'));
}

async function refetch(dbMax: number) {
  const { changedIds, maxSeen } = loadTargets();

  // New-id candidates: everything above what D1 has, up to the frontier plus
  // margin. Their cached entries are 6-month-old empty stubs that would mask
  // them (fetch reads cache first), so only stub files are refetched; a cache
  // file with a real position in this range is left alone.
  const newRange: number[] = [];
  for (let id = dbMax + 1; id <= maxSeen + 500; id++) {
    const f = path.join(CACHE_DIR, `${id}.json`);
    if (!fs.existsSync(f) || isEmptyStub(f)) newRange.push(id);
  }

  const targets = [...new Set([...changedIds, ...newRange])].sort((a, b) => a - b);
  console.log(`Refetching ${targets.length} ids (${changedIds.length} changed + ${newRange.length} new-range stubs)...`);
  const { failed } = await refetchIds(targets);
  if (failed.length > 0) {
    console.log(`Failed ids (rerun refetch to retry): ${failed.slice(0, 20).join(',')}${failed.length > 20 ? '…' : ''}`);
  }
  fs.writeFileSync(path.join(UPDATE_DIR, 'refetched.json'), JSON.stringify({ dbMax, targets }, null, 1));
}

function sqlValue(v: string | number, unquoted = false): string {
  if (typeof v === 'number') return String(v);
  if (unquoted) return v; // source_year: 'NULL' or numeric string
  return `'${escapeSQL(v)}'`;
}

const COLS = ['fen', 'authors', 'source_name', 'source_year', 'stipulation', 'move_count', 'genre', 'difficulty', 'difficulty_score', 'piece_count', 'solution_text', 'keywords', 'award'];

function generateSql() {
  const { targets } = JSON.parse(fs.readFileSync(path.join(UPDATE_DIR, 'refetched.json'), 'utf-8')) as { targets: number[] };

  const upserts: string[] = [];
  const fairyIds: number[] = [];
  const skips: Record<string, number> = {};
  const genreCounts: Record<string, number> = {};

  for (const id of targets) {
    const f = path.join(CACHE_DIR, `${id}.json`);
    if (!fs.existsSync(f)) continue;
    let entry: YacpdbEntry;
    try {
      entry = JSON.parse(fs.readFileSync(f, 'utf-8'));
    } catch {
      continue;
    }
    const result = convertEntry(entry);
    if (result === 'fairy') {
      fairyIds.push(id);
      continue;
    }
    if (typeof result === 'string') {
      skips[result] = (skips[result] || 0) + 1;
      continue;
    }

    const vals = COLS.map(c => sqlValue(result.columns[c], c === 'source_year')).join(',');
    const updates = COLS.map(c => `${c}=excluded.${c}`).join(',');
    upserts.push(
      `INSERT INTO problems (id,${COLS.join(',')}) VALUES (${result.id},${vals}) ON CONFLICT(id) DO UPDATE SET ${updates};`
    );
    genreCounts[result.genre] = (genreCounts[result.genre] || 0) + 1;
  }

  const PER_FILE = 5000;
  const fileCount = Math.ceil(upserts.length / PER_FILE) || 1;
  for (let i = 0; i < fileCount; i++) {
    const slice = upserts.slice(i * PER_FILE, (i + 1) * PER_FILE);
    fs.writeFileSync(path.join(UPDATE_DIR, `update-data-${i}.sql`), slice.join('\n') + '\n');
  }

  // Entries that turned fairy since import: hide them the same way the
  // fairy-flag pass does. Never clears the flag.
  if (fairyIds.length > 0) {
    const stmts: string[] = [];
    for (let i = 0; i < fairyIds.length; i += 500) {
      stmts.push(`UPDATE problems SET is_fairy = 1 WHERE is_fairy = 0 AND id IN (${fairyIds.slice(i, i + 500).join(',')});`);
    }
    fs.writeFileSync(path.join(UPDATE_DIR, 'update-fairy.sql'), stmts.join('\n') + '\n');
  }

  console.log(`Upserts: ${upserts.length}  (${Object.entries(genreCounts).map(([g, c]) => `${g}=${c}`).join(' ')})`);
  console.log(`Fairy (flagged, not upserted): ${fairyIds.length}`);
  console.log(`Skipped: ${JSON.stringify(skips)}`);
  console.log(`Wrote ${fileCount} update-data files${fairyIds.length ? ' + update-fairy.sql' : ''} in ${UPDATE_DIR}`);
}

function check(ids: number[]) {
  for (const id of ids) {
    const f = path.join(CACHE_DIR, `${id}.json`);
    if (!fs.existsSync(f)) { console.log(`${id}: no cache`); continue; }
    const result = convertEntry(JSON.parse(fs.readFileSync(f, 'utf-8')));
    if (typeof result === 'string') { console.log(`${id}: ${result}`); continue; }
    console.log(JSON.stringify({ id: result.id, ...result.columns }));
  }
}

// ── CLI ────────────────────────────────────────────────
async function main() {
  const cmd = process.argv[2];
  if (cmd === 'discover') {
    const since = process.argv.includes('--since') ? process.argv[process.argv.indexOf('--since') + 1] : '2026-03-15';
    await discover(since);
  } else if (cmd === 'refetch') {
    const dbMax = process.argv.includes('--db-max') ? parseInt(process.argv[process.argv.indexOf('--db-max') + 1]) : NaN;
    if (isNaN(dbMax)) throw new Error('refetch requires --db-max <id> (current MAX(id) in D1)');
    await refetch(dbMax);
  } else if (cmd === 'sql') {
    generateSql();
  } else if (cmd === 'check') {
    check(process.argv.slice(3).map(Number).filter(n => n > 0));
  } else {
    console.log('usage: update-from-yacpdb.ts discover|refetch|sql|check (see header comment)');
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
