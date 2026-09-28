/**
 * Fairy detection for YACPDB entries.
 *
 * fetch-problems.ts and import-to-d1.ts used to carry two hand-copied
 * versions of this check, and they drifted: the import copy was missing the
 * neutral-piece test entirely. That let fairy problems into D1 with their
 * unrepresentable pieces silently dropped from the FEN — H649268 (h#2 with
 * three neutral pieces) rendered as a board holding nothing but two kings.
 * Both scripts now share this one implementation.
 */

// YACPDB writes pieces with Popeye letters, where S is the Knight and N is
// the Nightrider — a fairy piece. N is deliberately absent here: mapping it
// to the knight is what let Nightrider problems through looking orthodox.
export const PIECE_MAP: Record<string, string> = {
  K: 'K', Q: 'Q', R: 'R', B: 'B', S: 'N', P: 'P',
};

// YACPDB keeps fairy conditions in `options`, mixed in with a few markers
// that say nothing about the rules. Anything outside this list is fairy.
const ORTHODOX_OPTIONS = /^(setplay|duplex|defence\s+\d+)$/i;

export interface FairyAlgebraic {
  white?: unknown;
  black?: unknown;
  neutral?: unknown;
}

export interface FairyEntry {
  algebraic?: FairyAlgebraic;
  options?: unknown;
  legend?: unknown;
  keywords?: unknown;
}

/* Keywords that name a fairy board or a fairy rule outright. YACPDB records
   some conditions only here, with nothing in `options`: 237 problems were
   being served as orthodox (2026-09-28) -- cylinder and torus boards, 7x8
   and 5x5 boards, Marseillais, AugsburgChess, Half-check Chess under a bare
   "Fairy", grasshoppers written as G. Matched whole, never as a substring
   (see isFairyEntry), and only names that cannot be a theme: "Bishop hopper"
   and "Rook hopper" are orthodox manoeuvres, "Kamikaze" is also used for a
   sacrifice, so none of those is here. */
const FAIRY_KEYWORDS = new Set([
  'fairy', 'fairy board', 'cylinder board', 'vertical cylinder', 'horizontal cylinder',
  'torus', 'torus board', 'anchor ring', 'marseillais', 'koeko',
]);
/* Every "... Chess" keyword in the collection is a variant's name
   (AugsburgChess, Virrey Chess, Take&MakeChess, 3D-Chess, ...), as is a board
   of another size ("Board 7x8"). */
const FAIRY_KEYWORD_FORMS = [/chess$/i, /^board \d+x\d+(?:x\d+)?$/i];
/* YACPDB also tags the joke problems "Fairy" -- a promotion to a black king,
   and so on. The solver plays those on purpose (useProblem's joke moves), so
   the keyword does not hide them. */
const JOKE = 'joke problem';

function hasFairyKeyword(keywords: unknown): boolean {
  if (!Array.isArray(keywords)) return false;
  const kws = keywords.map(k => String(k).trim().toLowerCase());
  const joke = kws.includes(JOKE);
  return kws.some(k => (k === 'fairy' ? !joke : FAIRY_KEYWORDS.has(k))
    || FAIRY_KEYWORD_FORMS.some(re => re.test(k)));
}

/**
 * True when the entry is anything other than an orthodox problem.
 *
 * Four independent signals, because no single YACPDB field carries them all:
 *   1. neutral pieces   — belong to both sides, and FEN cannot express them
 *   2. legend           — every one of YACPDB's legend keys names a fairy
 *                         piece type (Grasshopper, Nightrider, Royal …)
 *   3. options          — Circe, Maximummer, Madrasi and friends
 *      (3b. or the same named only in the keywords — FAIRY_KEYWORDS, whole words)
 *   4. unknown piece letters in white/black
 *
 * Deliberately structural: it reads what YACPDB declares rather than
 * substring-matching theme names. Matching on keyword text is what made the
 * original pass hide orthodox problems tagged "Chameleon echo" or
 * "Le Lionnais" — the words contain fairy piece names but the problems are
 * ordinary. 3b is the one reading of keywords, and it takes a keyword only
 * when the whole of it is the name of a board or a rule ("ChameleonChess",
 * never "Chameleon echo mates").
 */
export function isFairyEntry(entry: FairyEntry): boolean {
  const alg = entry.algebraic;
  if (!alg) return true;

  // 1. Neutral pieces
  if (Array.isArray(alg.neutral) && alg.neutral.length > 0) return true;

  // 2. Fairy piece legend
  if (entry.legend && typeof entry.legend === 'object'
      && Object.keys(entry.legend as Record<string, unknown>).length > 0) return true;

  // 3. Fairy conditions
  if (Array.isArray(entry.options)
      && entry.options.some(o => !ORTHODOX_OPTIONS.test(String(o).trim()))) return true;

  // 3b. Fairy boards and rules YACPDB names only in the keywords
  if (hasFairyKeyword(entry.keywords)) return true;

  // 4. Unknown piece letters
  for (const pieces of [alg.white, alg.black]) {
    if (!Array.isArray(pieces)) return true;
    for (const ps of pieces as string[]) {
      const t = String(ps).trim();
      if (t.length < 2) return true;
      const fc = t[0];
      if (fc >= 'a' && fc <= 'h') continue; // bare square = pawn
      if (!PIECE_MAP[fc.toUpperCase()]) return true;
    }
  }

  return false;
}
