import { Chess } from 'chess.js';
import type { SolutionNode } from '../types';

/**
 * Duplex helpmates are solved twice from the same diagram: once with Black
 * moving first (the ordinary h#N) and once with White moving first, White
 * being the side that gets mated. YACPDB writes both solutions with the same
 * "1.Xx 2.Yy" numbering, so the parser colours every root as Black's move and
 * the White-first half comes out as an impossible black move ("1...Kd8" for a
 * king standing on d7). This puts the colours of that half right: a root
 * whose first move only a white piece can make is flipped, with its whole
 * line, to White-first. Returns whether any root was flipped, so the caller
 * can keep that half out of the solving task and list it separately.
 *
 * Only runs for problems YACPDB tags "Duplex". Elsewhere a root the wrong
 * side can play is parser noise, and flipping it would turn junk into an
 * accepted solution.
 */
export function flipDuplexRoots(roots: SolutionNode[], fen: string, keywords: string[] | undefined, genre: string): boolean {
  if (genre !== 'help' || !keywords?.includes('Duplex')) return false;
  let flipped = false;
  for (const root of roots) {
    if (root.color !== 'b') continue;
    if (!executes(fen, 'b', root) && executes(fen, 'w', root)) {
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

/** Can `color` play this node's move from the diagram? */
function executes(fen: string, color: 'w' | 'b', node: SolutionNode): boolean {
  const turned = fen.replace(/ [wb] /, ` ${color} `);
  let chess: Chess;
  try {
    chess = new Chess(turned);
  } catch {
    return false;
  }
  if (node.moveUci.length >= 4) {
    try {
      const m = chess.move({
        from: node.moveUci.slice(0, 2),
        to: node.moveUci.slice(2, 4),
        promotion: node.moveUci.slice(4) || undefined,
      });
      if (m) return true;
    } catch { /* try SAN */ }
  }
  const san = node.moveSan.replace(/[!?]/g, '');
  if (!san) return false;
  try {
    return !!new Chess(turned).move(san);
  } catch {
    return false;
  }
}
