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
}

/**
 * True when the entry is anything other than an orthodox problem.
 *
 * Four independent signals, because no single YACPDB field carries them all:
 *   1. neutral pieces   — belong to both sides, and FEN cannot express them
 *   2. legend           — every one of YACPDB's legend keys names a fairy
 *                         piece type (Grasshopper, Nightrider, Royal …)
 *   3. options          — Circe, Maximummer, Madrasi and friends
 *   4. unknown piece letters in white/black
 *
 * Deliberately structural: it reads what YACPDB declares rather than
 * substring-matching theme names. Matching on keyword text is what made the
 * original pass hide orthodox problems tagged "Chameleon echo" or
 * "Le Lionnais" — the words contain fairy piece names but the problems are
 * ordinary.
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
