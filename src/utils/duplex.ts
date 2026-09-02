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

/**
 * Does this root's whole main line play legally on the board, with its own
 * side starting? Used to keep a solution the solver could never enter — a
 * move the parser mangled, a line the source truncated into nonsense — out of
 * the count of solutions they are asked to find.
 */
export function mainLinePlays(fen: string, root: SolutionNode): boolean {
  let length = 0;
  for (let node: SolutionNode | undefined = root; node; node = node.children[0]) length++;
  return pliesPlayable(fen, root.color, root) === length;
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

/**
 * Play one node — the same readings the solver's own executor accepts
 * (useProblem's tryExecuteNode): a from-to move, a wildcard "any move by
 * this piece", plain SAN, and SAN with its check/mate mark dropped. A move
 * no board can hold ("joke:") never plays.
 */
function play(chess: Chess, node: SolutionNode): boolean {
  const uci = node.moveUci;
  if (uci.startsWith('joke:')) return false;
  if (uci === 'any') {
    const piece = node.moveSan.match(/^([KQRBN])/)?.[1]?.toLowerCase();
    const candidates = chess.moves({ verbose: true }).filter(m => !piece || m.piece === piece);
    if (candidates.length === 0) return false;
    try { return !!chess.move(candidates[0]); } catch { return false; }
  }
  const from = fromSquare(node);
  if (from) {
    try {
      if (chess.move({ from, to: uci.slice(2, 4), promotion: uci.slice(4) || undefined })) return true;
    } catch { /* try SAN */ }
  }
  const san = (uci.startsWith('san:') ? uci.slice(4) : node.moveSan).replace(/[!?]/g, '');
  if (!san) return false;
  for (const attempt of [san, san.replace(/[+#]/g, '')]) {
    try {
      if (chess.move(attempt)) return true;
    } catch { /* next reading */ }
  }
  return false;
}
