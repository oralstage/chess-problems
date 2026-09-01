/**
 * Commentary card sweep — run with: npx tsx scripts/commentary-sweep.ts [--dump file.json]
 *
 * Builds the post-solve Commentary card for every golden-corpus problem the
 * app could actually serve (fairy-piece entries are skipped, mirroring the
 * import filter) and checks the invariants the card promises:
 *
 *   - no sentence contradicts itself ("no threat" opener vs "threatening" key,
 *     "answer to everything" vs "no reply");
 *   - "the same defences get changed mates" only quotes defences the previous
 *     phase actually showed;
 *   - surface grammar: no sentence opens on a digit or on "try", no doubled
 *     punctuation, no doubled words, no counting by numerals.
 *
 * Prints coverage and per-check counts (all should be 0). --dump writes the
 * full card texts to a JSON file for before/after diffing.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseSolution } from '../src/services/solutionParser';
import { buildTryCommentary, mergeSameMoveChildren } from '../src/utils/tryCommentary';
import { algebraicToFen, isFairyPiece } from '../src/utils/algebraicToFen';
import { fixCastlingRights } from '../src/services/api';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(SCRIPTS_DIR, '.cache');
const GOLDEN_PATH = join(SCRIPTS_DIR, 'parser-golden.json');

const dumpIdx = process.argv.indexOf('--dump');
const dumpPath = dumpIdx >= 0 ? process.argv[dumpIdx + 1] : null;

function cardFor(id: number): string | null {
  const path = join(CACHE_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  let data;
  try { data = JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
  if (!data?.solution || !data?.algebraic || typeof data.stipulation !== 'string') return null;
  if (isFairyPiece(data.algebraic)) return null; // never imported into D1
  const fen = fixCastlingRights(algebraicToFen(data.algebraic), data.solution);
  const color = data.stipulation.startsWith('h#') ? 'b' : 'w';
  const merged = parseSolution(data.solution, color).map(mergeSameMoveChildren);
  const c = buildTryCommentary(merged, fen, data.stipulation);
  return c ? c.paragraphs.map(p => p.map(s => s.text).join('')).join('\n\n') : null;
}

/** Defences quoted in a pairs list, slash groups expanded, marks stripped. */
function quotedDefences(chunk: string): Set<string> {
  const out = new Set<string>();
  for (const m of chunk.matchAll(/1\.\.\.([A-Za-z0-9=+#x/-]+)/g)) {
    for (const alt of m[1].split('/')) out.add(alt.replace(/[+#!?]/g, ''));
  }
  for (const m of chunk.matchAll(/any (\w+) move/g)) out.add(`any:${m[1]}`);
  return out;
}

const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
const ids = Object.keys(golden).map(Number);

let cards = 0;
const bad: Record<string, number[]> = {
  noThreatOpenerButKeyThreatens: [],
  answerToEverythingButNoReply: [],
  sameDefencesOverreach: [],
  digitStartSentence: [],
  tryStartSentence: [],
  doubledPunctuation: [],
  doubledWord: [],
  numeralCount: [],
};
const flag = (name: string, id: number) => {
  if (!bad[name].includes(id)) bad[name].push(id);
};
const texts: Record<number, string> = {};

for (const id of ids) {
  let text: string | null;
  try { text = cardFor(id); } catch { continue; }
  if (!text) continue;
  cards++;
  texts[id] = text;

  const sentences = text.split(/(?<=[.!]) (?=[A-Z])/);
  const opener = sentences[0] ?? '';
  if (/no threat/.test(opener) && /The (answer is|one square that holds is)[^.]*threatening/.test(text)) {
    flag('noThreatOpenerButKeyThreatens', id);
  }
  for (const s of sentences) {
    if (/an answer to everything[^.!]*no reply/.test(s)) flag('answerToEverythingButNoReply', id);
    if (/(?:^|\n)\d/.test(s)) flag('digitStartSentence', id);
    if (/^(The )?tr(y|ies)\b/i.test(s)) flag('tryStartSentence', id);
    if (/[.,;:]{2,}|,\s*\./.test(s.replace(/\.\.\./g, ''))) flag('doubledPunctuation', id);
    if (/\b(\w{3,}) \1\b/.test(s)) flag('doubledWord', id);
    if (/\bthe other \d+\b|\b\d+ (more|others)\b/.test(s)) flag('numeralCount', id);
  }

  // "the same defences" may only name defences its own previous phase showed.
  if (text.includes('the same defences get changed mates:')) {
    const para = text.split('\n\n')[0];
    let prevDefs: Set<string> | null = null;
    for (const s of para.split(/(?<=[.!]) (?=[A-Z])/)) {
      if (/can start with|can wait with|might instead play|can check with|answers are in place after/.test(s)) {
        prevDefs = quotedDefences(s);
      } else if (s.includes('the same defences get changed mates:')) {
        const body = s.split('changed mates:')[1].split(/but \w+ has no reply/)[0];
        const defs = quotedDefences(body);
        // "any knight move" in the earlier phase covers every knight defence
        // quoted by name in this one.
        const pieceName: Record<string, string> = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' };
        const covered = (d: string) => {
          if (prevDefs!.has(d)) return true;
          const piece = d.startsWith('O-O') ? 'K' : /^[KQRNB]/.test(d) ? d[0] : 'P';
          return prevDefs!.has(`any:${pieceName[piece]}`);
        };
        // A current-side "any X move" cannot be expanded from the text; the
        // generator verifies that group against the previous quote's actual
        // defences, so only the named moves are checked here.
        const namedOnly = [...defs].filter(d => !d.startsWith('any:'));
        if (!prevDefs || defs.size === 0 || !namedOnly.every(covered)) {
          flag('sameDefencesOverreach', id);
        }
        prevDefs = new Set([...(prevDefs ?? []), ...defs]);
      }
    }
  }
}

console.log(`cards: ${cards} / ${ids.length}`);
let failures = 0;
for (const [name, list] of Object.entries(bad)) {
  console.log(`${name}: ${list.length}${list.length ? '  e.g. D' + list.slice(0, 8).join(', D') : ''}`);
  failures += list.length;
}
if (dumpPath) {
  writeFileSync(dumpPath, JSON.stringify(texts, null, 0));
  console.log(`dumped ${cards} cards to ${dumpPath}`);
}
process.exit(failures ? 1 : 0);
