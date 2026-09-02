/**
 * List the direct mates and selfmates in the database whose key cannot be
 * played, and write them to functions/api/unplayable-keys.ts for the rated
 * pool to skip — the same treatment as the unplayable mate-in-ones of
 * 2026-08-30 and the helpmates of 2026-09-02.
 *
 * A problem qualifies when, through the app's own loading steps (twin
 * position, castling and en passant fixes), either no White key parses at
 * all or none of the parsed keys is a legal move on the board. Only the key
 * is checked: a direct mate's tree branches into defences and threats, so
 * "the whole line plays" is not a meaningful test there.
 *
 * Problems the rated pool already skips by keyword (Joke problem, Shortmate,
 * Retractor, Unsound, No solution) or by the older id list are left out, so
 * this file only carries what the keywords do not catch: unflagged fairy
 * boards, "Black to play and White mates" tasks recorded as #1, texts that
 * are prose or retro analysis, broken notation.
 *
 *   npx tsx scripts/find-unplayable-keys.ts --db path/to/problems.sqlite
 *
 * Re-run after a YACPDB import.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { parseSolution, filterKeyMoves, extractTwinFenMods, applyTwinMods } from '../src/services/solutionParser';
import { algebraicToFen } from '../src/utils/algebraicToFen';
import { moveSanLenient } from '../src/utils/sanResolve';
import { fixCastlingRights } from '../src/services/api';
import { UNPLAYABLE_IDS } from '../functions/api/unplayable-filter';
import type { SolutionNode } from '../src/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = resolve(ROOT, 'scripts/.cache');
const OUT = resolve(ROOT, 'functions/api/unplayable-keys.ts');
/** Must match the keyword conditions in functions/api/rated-problem.ts. */
const KEYWORD_EXCLUDED = /Joke problem|Shortmate|Retractor|Unsound|No solution/;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Same repair the app applies (App.tsx fixEnPassantFen) for a key that is
 *  an en passant capture the FEN does not allow. */
function fixEnPassant(fen: string, roots: SolutionNode[]): string {
  for (const node of roots) {
    const u = node.moveUci;
    if (u.length < 4 || u.startsWith('san:')) continue;
    try { if (new Chess(fen).move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : undefined })) continue; } catch { /* try the fix */ }
    const from = u.slice(0, 2), to = u.slice(2, 4);
    if (Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) !== 1 || Math.abs(+from[1] - +to[1]) !== 1) continue;
    try {
      const p = new Chess(fen).get(from as never);
      if (!p || p.type !== 'p') continue;
    } catch { continue; }
    const parts = fen.split(' ');
    if (parts.length >= 4 && parts[3] === '-') {
      parts[3] = to;
      const patched = parts.join(' ');
      try { if (new Chess(patched).move({ from, to })) return patched; } catch { /* no */ }
    }
  }
  return fen;
}

/** Can this key be entered on the board, read the way the solver reads it? */
function keyPlays(fen: string, node: SolutionNode): boolean {
  try {
    const chess = new Chess(fen);
    const u = node.moveUci;
    if (u.startsWith('joke:')) return false;
    if (u === 'any') return chess.moves().length > 0;
    if (/^[a-h][1-8][a-h][1-8]/.test(u)) {
      try { if (chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4) || undefined })) return true; } catch { /* SAN next */ }
    }
    return moveSanLenient(chess, node.moveSan || (u.startsWith('san:') ? u.slice(4) : '')) !== null;
  } catch {
    return false;
  }
}

async function main() {
  const db = arg('--db');
  if (!db) {
    console.error('usage: npx tsx scripts/find-unplayable-keys.ts --db path/to/problems.sqlite');
    process.exit(2);
  }
  const { DatabaseSync } = await import('node:sqlite');
  const conn = new DatabaseSync(db, { readOnly: true });
  const rows = conn.prepare("SELECT id, genre FROM problems WHERE genre IN ('direct', 'self') AND is_fairy = 0").all() as { id: number; genre: string }[];
  conn.close();

  const already = new Set<number>(UNPLAYABLE_IDS as readonly number[]);
  const unplayable: number[] = [];
  const perGenre: Record<string, number> = {};
  let checked = 0;
  for (const { id, genre } of rows) {
    let d: { algebraic?: { white?: string[]; black?: string[] }; solution?: unknown; keywords?: string[] };
    try { d = JSON.parse(readFileSync(resolve(CACHE, `${id}.json`), 'utf8')); } catch { continue; }
    if (!d.algebraic || typeof d.solution !== 'string') continue;
    const solution = d.solution;
    let fen: string;
    try {
      fen = algebraicToFen({ white: d.algebraic.white ?? [], black: d.algebraic.black ?? [] });
      const mods = extractTwinFenMods(solution);
      if (mods) fen = applyTwinMods(fen, mods);
      fen = fixCastlingRights(fen, solution);
    } catch { continue; }
    checked++;
    const roots = filterKeyMoves(parseSolution(solution, 'w'), 'w').filter(r => r.color === 'w');
    let bad = roots.length === 0;
    if (!bad) {
      fen = fixEnPassant(fen, roots);
      bad = !roots.some(r => keyPlays(fen, r));
    }
    if (!bad) continue;
    if (already.has(id) || (d.keywords ?? []).some(k => KEYWORD_EXCLUDED.test(k))) continue;
    unplayable.push(id);
    perGenre[genre] = (perGenre[genre] ?? 0) + 1;
  }
  unplayable.sort((a, b) => a - b);
  const lines: string[] = [];
  for (let i = 0; i < unplayable.length; i += 12) lines.push('  ' + unplayable.slice(i, i + 12).join(', ') + ',');
  writeFileSync(OUT,
    `// Generated by scripts/find-unplayable-keys.ts — do not edit by hand.\n` +
    `// Direct mates and selfmates whose recorded key cannot be played on this\n` +
    `// board and that no keyword exclusion catches (unflagged fairy boards,\n` +
    `// Black-to-play tasks recorded as #1, prose or retro texts, broken\n` +
    `// notation). Kept out of the rated pool only. ${unplayable.length} of ${checked} checked\n` +
    `// (${Object.entries(perGenre).map(([g, n]) => `${g} ${n}`).join(', ')}).\n` +
    `export const UNPLAYABLE_KEY_IDS: readonly number[] = [\n${lines.join('\n')}\n];\n`);
  console.log(`${unplayable.length} unplayable keys of ${checked} checked (${JSON.stringify(perGenre)}) → ${OUT.replace(ROOT + '/', '')}`);
}

main().catch(err => { console.error(err); process.exit(1); });
