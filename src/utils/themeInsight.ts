import { Chess } from 'chess.js';
import type { Square } from 'chess.js';

/* Post-solve theme appreciation. A YACPDB keyword is only the trigger: a card
   appears when the claim is verified on the position the solver actually
   reached (chess.js), so a tag we cannot locate on the board simply shows no
   card rather than a vague one. Themes covered so far are the reliably
   machine-checkable ones — model/ideal mates (verified square by square) and
   zugzwang (verified against the solution's own annotation). */

export interface ThemeInsight {
  theme: string;
  title: string;
  text: string;
  /** Mini-board position; absent for text-only cards (zugzwang). */
  fen?: string;
  marks?: Record<string, { backgroundColor: string }>;
}

const AMBER = { backgroundColor: 'rgba(255, 176, 32, 0.55)' };
const BLUE = { backgroundColor: 'rgba(59, 130, 246, 0.4)' };

const FILES = 'abcdefgh';

function adjacentSquares(sq: string): string[] {
  const f = FILES.indexOf(sq[0]);
  const r = Number(sq[1]);
  const out: string[] = [];
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const nf = f + df, nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 1 && nr <= 8) out.push(FILES[nf] + nr);
    }
  }
  return out;
}

interface MateEconomy {
  matedColor: 'w' | 'b';
  kingSquare: string;
  /** The king's field — every square the king could otherwise use (amber). */
  fieldSquares: string[];
  /** Attacker units taking part in the mate (blue). */
  participantSquares: string[];
  model: boolean;
  ideal: boolean;
}

/**
 * Verify a pure/model/ideal mate on a final position. Returns null unless the
 * position is checkmate AND the mate is pure: every field square unavailable
 * for exactly one reason (guarded once, blocked by a defender that is not also
 * guarded, or an attacker unit defended exactly once), single check only.
 */
export function analyzeMateEconomy(fen: string): MateEconomy | null {
  let chess: Chess;
  try { chess = new Chess(fen); } catch { return null; }
  if (!chess.isCheckmate()) return null;

  const mated = chess.turn();
  const attacker = mated === 'w' ? 'b' : 'w';

  const pieces: { square: string; type: string; color: string }[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell) pieces.push({ square: cell.square, type: cell.type, color: cell.color });
    }
  }
  const king = pieces.find(p => p.type === 'k' && p.color === mated);
  if (!king) return null;

  // Purity excludes double checks (two reasons the king cannot stand still).
  const checkers = chess.attackers(king.square as Square, attacker);
  if (checkers.length !== 1) return null;

  // Guards are counted with the mated king lifted off the board, so a flight
  // square behind the king on the checking line still reads as covered by the
  // checker — the standard king-attack semantics.
  const noKing = new Chess(fen);
  noKing.remove(king.square as Square);

  const field = adjacentSquares(king.square);
  const participants = new Set<string>(checkers);

  for (const s of field) {
    const occupant = chess.get(s as Square);
    const guards = noKing.attackers(s as Square, attacker);
    if (occupant && occupant.color === mated) {
      // Self-block. A guard on top of it would be a second reason — impure.
      if (guards.length !== 0) return null;
    } else if (occupant && occupant.color === attacker) {
      // The king could capture it, so it must be defended — exactly once.
      if (guards.length !== 1) return null;
      participants.add(s);
      participants.add(guards[0]);
    } else {
      if (guards.length !== 1) return null;
      participants.add(guards[0]);
    }
  }

  const attackerPieces = pieces.filter(p => p.color === attacker);
  const matedOthers = pieces.filter(p => p.color === mated && p.type !== 'k');

  // Model: every attacker unit takes part, king and pawns excused by convention.
  const model = attackerPieces
    .filter(p => p.type !== 'k' && p.type !== 'p')
    .every(p => participants.has(p.square));
  // Ideal: no unit of either side stands idle — attacker king and pawns
  // included, and every defender unit is one of the self-blocks.
  const ideal = model
    && attackerPieces.every(p => participants.has(p.square))
    && matedOthers.every(p => field.includes(p.square));

  return {
    matedColor: mated,
    kingSquare: king.square,
    fieldSquares: field,
    participantSquares: attackerPieces.filter(p => participants.has(p.square)).map(p => p.square),
    model,
    ideal,
  };
}

function mateMarks(a: MateEconomy): Record<string, { backgroundColor: string }> {
  const marks: Record<string, { backgroundColor: string }> = {};
  for (const s of a.fieldSquares) marks[s] = AMBER;
  for (const s of a.participantSquares) marks[s] = BLUE;
  return marks;
}

export function getThemeInsights(
  p: { keywords?: string[]; solutionText?: string; genre: string },
  keySan: string | null,
  finalFen: string | null,
): ThemeInsight[] {
  const out: ThemeInsight[] = [];
  const kw = p.keywords || [];

  if ((kw.includes('Model mate') || kw.includes('Ideal mate')) && finalFen) {
    const a = analyzeMateEconomy(finalFen);
    if (a) {
      const sideName = a.matedColor === 'w' ? 'White' : 'Black';
      const other = a.matedColor === 'w' ? 'Black' : 'White';
      if (kw.includes('Ideal mate') && a.ideal) {
        out.push({
          theme: 'Ideal mate',
          title: 'Ideal mate',
          text: `Every square around the ${sideName} king (amber) is blocked or guarded exactly once, `
            + `and not a single piece of either side stands idle — ${other}'s whole force takes part (blue). `
            + `The strictest mate a composer can build.`,
          fen: finalFen,
          marks: mateMarks(a),
        });
      } else if (kw.includes('Model mate') && a.model) {
        out.push({
          theme: 'Model mate',
          title: 'Model mate',
          text: `Every square around the ${sideName} king (amber) is blocked or guarded exactly once — `
            + `no double duties — and every ${other} piece takes part in the mate (blue). `
            + `Nothing wasted, nothing doubled.`,
          fen: finalFen,
          marks: mateMarks(a),
        });
      }
    }
  }

  // The solution's own "{zugzwang}" annotation is the authority; the keyword
  // alone could refer to a variation we cannot point at.
  if (kw.includes('Zugzwang') && p.genre === 'direct'
    && /zugzwang/i.test(p.solutionText || '') && keySan) {
    out.push({
      theme: 'Zugzwang',
      title: 'Zugzwang',
      text: `The key ${keySan}! threatens nothing at all. Black is in zugzwang — `
        + `obliged to move, and every move breaks something in the defence. `
        + `A quiet move that wins by taking away the right to stand still.`,
    });
  }

  return out;
}
