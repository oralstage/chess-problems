/**
 * Parser regression test — run with: npm run test:parser
 *
 * Two tiers:
 *
 * 1. Fixture assertions (always run, no external data needed):
 *    scripts/parser-fixtures.json holds real YACPDB solutions whose correct
 *    accepted-first-move sets were manually verified during the 2026-07-05
 *    parser bug fixes (refuted tries accepted, annotation marker leaks,
 *    1/2-1/2 mis-expansion, multi-solution helpmates rejected). These must
 *    match exactly.
 *
 * 2. Golden snapshot diff (runs only when scripts/.cache exists):
 *    Parses a deterministic sample of the YACPDB cache and compares each
 *    problem's accepted first moves against scripts/parser-golden.json.
 *    Any diff means parser behavior changed — review the listed problems,
 *    and if the change is intentional, regenerate with:
 *      npx tsx scripts/parser-regression.ts --update
 *
 * Exit code 0 = pass, 1 = failures.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseSolution, filterKeyMoves } from '../src/services/solutionParser';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(SCRIPTS_DIR, '.cache');
const FIXTURES_PATH = join(SCRIPTS_DIR, 'parser-fixtures.json');
const GOLDEN_PATH = join(SCRIPTS_DIR, 'parser-golden.json');
const SAMPLE_EVERY = 50; // ~19k of ~970k cached problems
const UPDATE = process.argv.includes('--update');

interface Fixture {
  id: number;
  stipulation: string;
  note: string;
  solution: string;
  expected: string[];
  /** Optional SAN path that must be walkable through the solving tree
   *  (root → child → grandchild …), like a user playing the solution.
   *  Guards mid-line regressions (e.g. D142094's 2.g8=Q) that the
   *  accepted-first-move check can't see. Non-threat children preferred,
   *  mirroring matchMoveToTree. */
  line?: string[];
}

function firstMoveColor(stipulation: string): 'w' | 'b' {
  return stipulation.startsWith('h#') ? 'b' : 'w';
}

type ParsedNode = ReturnType<typeof parseSolution>[number];

function solvingRoots(solution: string, stipulation: string): ParsedNode[] {
  const color = firstMoveColor(stipulation);
  return filterKeyMoves(parseSolution(solution, color), color);
}

function acceptedMoves(solution: string, stipulation: string): string[] {
  return solvingRoots(solution, stipulation).map(n => n.move).sort();
}

/** Walk a SAN path through the tree; returns the first move that can't be found (or null if all matched). */
function walkLine(roots: ParsedNode[], line: string[]): string | null {
  let candidates = roots;
  for (const san of line) {
    const found = candidates.find(n => !n.isThreat && n.moveSan === san)
      || candidates.find(n => n.moveSan === san);
    if (!found) return san;
    candidates = found.children;
  }
  return null;
}

/** FNV-1a hash of the full tree shape (moves, colors, flags, nesting). */
function treeHash(nodes: ParsedNode[]): string {
  let h = 0x811c9dc5;
  const mix = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  const walk = (ns: ParsedNode[], depth: number) => {
    for (const n of ns) {
      mix(`${depth}:${n.color}:${n.move}:${n.isKey ? 1 : 0}${n.isTry ? 1 : 0}${n.isThreat ? 1 : 0};`);
      walk(n.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return h.toString(36);
}

// ── Tier 1: fixtures ────────────────────────────────────────────
let failures = 0;
const fixtures: Fixture[] = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));
for (const f of fixtures) {
  let got: string[];
  try {
    got = acceptedMoves(f.solution, f.stipulation);
  } catch (e) {
    console.error(`FAIL D${f.id} (${f.stipulation}): parser threw: ${(e as Error).message}`);
    failures++;
    continue;
  }
  const want = [...f.expected].sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.error(`FAIL D${f.id} (${f.stipulation}) — ${f.note}`);
    console.error(`  expected: [${want.join(', ')}]`);
    console.error(`  got:      [${got.join(', ')}]`);
    failures++;
    continue;
  }
  if (f.line) {
    const missing = walkLine(solvingRoots(f.solution, f.stipulation), f.line);
    if (missing) {
      console.error(`FAIL D${f.id} (${f.stipulation}) — ${f.note}`);
      console.error(`  line [${f.line.join(' ')}] broken at "${missing}"`);
      failures++;
    }
  }
}
console.log(`Fixtures: ${fixtures.length - failures}/${fixtures.length} passed`);

// ── Tier 2: golden snapshot over the YACPDB cache ───────────────
if (!existsSync(CACHE_DIR)) {
  console.log('Golden: skipped (scripts/.cache not present on this machine)');
} else {
  const files = readdirSync(CACHE_DIR).filter((_, i) => i % SAMPLE_EVERY === 0);
  const current: Record<string, string> = {};
  let parseErrors = 0;

  for (const file of files) {
    let d: { stipulation?: unknown; solution?: unknown };
    try {
      d = JSON.parse(readFileSync(join(CACHE_DIR, file), 'utf8'));
    } catch { continue; }
    const stip = typeof d.stipulation === 'string' ? d.stipulation : '';
    const sol = typeof d.solution === 'string' ? d.solution : '';
    if (!sol || !stip || stip.startsWith('#0')) continue;
    const id = file.replace('.json', '');
    try {
      // Signature = accepted first moves + a hash of the FULL tree shape, so
      // regressions deeper in the tree (defenses, continuations, threat
      // attachment — e.g. the old D142094 move-2 bug) also show up as diffs.
      const color = firstMoveColor(stip);
      const all = parseSolution(sol, color);
      const accepted = filterKeyMoves(all, color).map(n => n.move).sort().join('|');
      current[id] = `${accepted}::${treeHash(all)}`;
    } catch {
      current[id] = '<parse error>';
      parseErrors++;
    }
  }

  if (UPDATE || !existsSync(GOLDEN_PATH)) {
    writeFileSync(GOLDEN_PATH, JSON.stringify(current));
    console.log(`Golden: wrote snapshot of ${Object.keys(current).length} problems (${parseErrors} parse errors) to ${GOLDEN_PATH}`);
  } else {
    const golden: Record<string, string> = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
    const diffs: string[] = [];
    for (const [id, sig] of Object.entries(current)) {
      if (golden[id] !== undefined && golden[id] !== sig) {
        diffs.push(`D${id}: golden=[${golden[id]}] now=[${sig}]`);
      }
    }
    if (diffs.length > 0) {
      console.error(`Golden: ${diffs.length}/${Object.keys(current).length} problems changed accepted first moves or tree shape:`);
      for (const line of diffs.slice(0, 30)) console.error('  ' + line);
      if (diffs.length > 30) console.error(`  ... and ${diffs.length - 30} more`);
      console.error('If these changes are intentional, regenerate with: npx tsx scripts/parser-regression.ts --update');
      failures += diffs.length;
    } else {
      console.log(`Golden: ${Object.keys(current).length} problems match (${parseErrors} parse errors, unchanged)`);
    }
  }
}

process.exit(failures > 0 ? 1 : 0);
