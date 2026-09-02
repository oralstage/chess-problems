/**
 * List the helpmates in the database that cannot be completed in the app,
 * and write them to functions/api/unplayable-help.ts for the rated pool to
 * skip (the same treatment as the unplayable mate-in-ones of 2026-08-30:
 * an id list in the matchmaking WHERE clause, no rows touched).
 *
 * A problem is unplayable when, through the app's own loading steps (twin
 * position, castling and en passant fixes, duplex colouring, set play set
 * aside), not one of its solutions plays legally from the diagram to its
 * end — or when no solution parses at all. What is left after the parser
 * fixes of 2026-09-02 is mostly fairy conditions the database does not flag
 * (cylinder boards, Frankfurt chess, invisible pieces…), zero-position twins
 * the twin reader does not understand, and broken notation.
 *
 *   npx tsx scripts/find-unplayable-helpmates.ts [--db path/to/problems.sqlite]
 *
 * Reads the YACPDB cache (scripts/.cache). The set of helpmate ids comes
 * from a local SQLite copy of the problems table when --db is given (genre =
 * help, is_fairy = 0); otherwise every integer h#N entry in the cache is
 * checked, which also covers problems not in the database (harmless: the
 * list is only ever used to exclude).
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { parseSolution, filterKeyMoves, extractTwinFenMods, applyTwinMods } from '../src/services/solutionParser';
import { algebraicToFen } from '../src/utils/algebraicToFen';
import { flipDuplexRoots, mainLinePlays } from '../src/utils/duplex';
import { fixCastlingRights } from '../src/services/api';
import type { SolutionNode } from '../src/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = resolve(ROOT, 'scripts/.cache');
const OUT = resolve(ROOT, 'functions/api/unplayable-help.ts');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function helpmateIds(): Promise<number[]> {
  const db = arg('--db');
  if (db) {
    const { DatabaseSync } = await import('node:sqlite');
    const conn = new DatabaseSync(db, { readOnly: true });
    const rows = conn.prepare("SELECT id FROM problems WHERE genre = 'help' AND is_fairy = 0").all() as { id: number }[];
    conn.close();
    return rows.map(r => r.id);
  }
  const ids: number[] = [];
  for (const f of readdirSync(CACHE)) {
    if (!f.endsWith('.json')) continue;
    try {
      const d = JSON.parse(readFileSync(resolve(CACHE, f), 'utf8'));
      if (typeof d?.id === 'number' && typeof d.stipulation === 'string' && /^h#\d+$/.test(d.stipulation)) ids.push(d.id);
    } catch { /* skip */ }
  }
  return ids;
}

/** Same repair the app applies (App.tsx fixEnPassantFen) for a first move
 *  that is an en passant capture the FEN does not allow. */
function fixEnPassant(fen: string, roots: SolutionNode[]): string {
  for (const node of roots.filter(n => n.color === 'b')) {
    try {
      const c = new Chess(fen);
      const u = node.moveUci;
      const m = u.startsWith('san:') ? c.move(u.slice(4))
        : u.length >= 4 ? c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : undefined }) : null;
      if (m) continue;
    } catch { /* try the fix */ }
    const u = node.moveUci;
    if (u.length < 4 || u.startsWith('san:')) continue;
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

async function main() {
  const ids = await helpmateIds();
  const unplayable: number[] = [];
  let checked = 0;
  for (const id of ids) {
    let d: { algebraic?: { white?: string[]; black?: string[] }; solution?: unknown; keywords?: string[]; options?: string[] };
    try { d = JSON.parse(readFileSync(resolve(CACHE, `${id}.json`), 'utf8')); } catch { continue; }
    if (!d.algebraic || typeof d.solution !== 'string') continue;
    const solution = d.solution;
    let fen: string;
    try {
      fen = algebraicToFen({ white: d.algebraic.white ?? [], black: d.algebraic.black ?? [] }).replace(' w ', ' b ');
      const mods = extractTwinFenMods(solution);
      if (mods) fen = applyTwinMods(fen, mods);
      fen = fixCastlingRights(fen, solution);
    } catch { continue; }
    checked++;
    const all = parseSolution(solution, 'b');
    const duplex = (d.options ?? []).includes('Duplex') || (d.keywords ?? []).includes('Duplex');
    flipDuplexRoots(all, fen, duplex ? ['Duplex'] : [], 'help');
    let roots = filterKeyMoves(all, 'b');
    if (!duplex) {
      const own = roots.filter(r => r.color === 'b');
      if (own.length > 0) roots = own;
    }
    if (roots.length === 0) { unplayable.push(id); continue; }
    fen = fixEnPassant(fen, roots);
    if (!roots.some(r => mainLinePlays(fen, r))) unplayable.push(id);
  }
  unplayable.sort((a, b) => a - b);
  const lines: string[] = [];
  for (let i = 0; i < unplayable.length; i += 12) lines.push('  ' + unplayable.slice(i, i + 12).join(', ') + ',');
  writeFileSync(OUT,
    `// Generated by scripts/find-unplayable-helpmates.ts — do not edit by hand.\n` +
    `// Helpmates whose recorded solutions cannot be played through on this board\n` +
    `// (unflagged fairy conditions, twin notation the reader does not follow,\n` +
    `// broken notation). Kept out of the rated pool only; the problems stay in\n` +
    `// the database and in every other mode. ${unplayable.length} of ${checked} checked.\n` +
    `export const UNPLAYABLE_HELP_IDS: readonly number[] = [\n${lines.join('\n')}\n];\n`);
  console.log(`${unplayable.length} unplayable of ${checked} helpmates → ${OUT.replace(ROOT + '/', '')}`);
}

main().catch(err => { console.error(err); process.exit(1); });
