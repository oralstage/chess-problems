import { Chess } from 'chess.js';
import type { SolutionNode } from '../types';

/**
 * Duplex helpmates are solved twice from the same diagram: once with Black
 * moving first (the ordinary h#N) and once with White moving first, Black and
 * White cooperating to mate the white king. YACPDB writes both solutions with
 * the same "1.Xx 2.Yy" numbering, so the parser colours every root as Black's
 * move and the White-to-play half comes out as an impossible black move
 * ("1...Kd8" for a king standing on d7). This puts the colours of that half
 * right: a root whose line is White's is flipped, with its whole line, to
 * White-first. Returns whether any root was flipped.
 *
 * Which side a root belongs to is decided on the board, not from the text:
 *   1. when the move names its from-square ("Kd7-d8"), by the colour of the
 *      piece standing there;
 *   2. otherwise ("Ne3", which both a white and a black knight may be able to
 *      play) by playing the whole line as Black-first and as White-first and
 *      keeping the side that gets further — a duplex line only plays through
 *      for its own side.
 * A plain "can Black play this move?" test was not enough: in about one
 * duplex in twenty the other side has a piece that can make the same move,
 * and the White half then stayed black and unplayable.
 *
 * Only runs for problems YACPDB marks Duplex. Elsewhere a root the wrong
 * side can play is parser noise, and flipping it would turn junk into an
 * accepted solution.
 */
export function flipDuplexRoots(roots: SolutionNode[], fen: string, keywords: string[] | undefined, genre: string): boolean {
  if (genre !== 'help' || !keywords?.includes('Duplex')) return false;
  let flipped = false;
  for (const root of roots) {
    if (root.color !== 'b') continue;
    if (sideOf(fen, root) === 'w') {
      flipLine(root);
      flipped = true;
    }
  }
  return flipped;
}

function flipLine(node: SolutionNode): void {
  node.color = node.color === 'w' ? 'b' : 'w';
  for (const child of node.children) flipLine(child);
}

/** Whose line is this root? 'b' when in doubt (the ordinary half). */
function sideOf(fen: string, root: SolutionNode): 'w' | 'b' {
  const from = fromSquare(root);
  if (from) {
    try {
      const piece = new Chess(fen).get(from as never);
      if (piece) return piece.color;
    } catch { /* fall through to playing the line */ }
  }
  const asBlack = pliesPlayable(fen, 'b', root);
  const asWhite = pliesPlayable(fen, 'w', root);
  return asWhite > asBlack ? 'w' : 'b';
}

function fromSquare(node: SolutionNode): string | null {
  const m = node.moveUci.match(/^([a-h][1-8])[a-h][1-8]/);
  return m ? m[1] : null;
}

/** How many moves of the root's main line play legally when `color` starts. */
function pliesPlayable(fen: string, color: 'w' | 'b', root: SolutionNode): number {
  let chess: Chess;
  try {
    chess = new Chess(fen.replace(/ [wb] /, ` ${color} `));
  } catch {
    return 0;
  }
  let plies = 0;
  let node: SolutionNode | undefined = root;
  while (node) {
    if (!play(chess, node)) break;
    plies++;
    node = node.children[0];
  }
  return plies;
}

function play(chess: Chess, node: SolutionNode): boolean {
  const from = fromSquare(node);
  if (from) {
    try {
      if (chess.move({ from, to: node.moveUci.slice(2, 4), promotion: node.moveUci.slice(4) || undefined })) return true;
    } catch { /* try SAN */ }
  }
  const san = node.moveSan.replace(/[!?]/g, '');
  if (!san) return false;
  try {
    return !!chess.move(san);
  } catch {
    return false;
  }
}
