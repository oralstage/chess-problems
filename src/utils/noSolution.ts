import type { ChessProblem } from '../types';

/**
 * True when the source records no move the solver could ever play, so the
 * board is a trap: every move they try comes back wrong, the hint has nothing
 * to point at, and Give Up has no line to replay. YACPDB keeps such problems
 * on purpose -- a work that was broken after publication is still a work, and
 * its tries are still worth reading -- and marks most of them Unsound.
 *
 * The test is the shape of the tree, never the keyword. Plenty of unsound
 * problems still carry the key the composer intended and are solved exactly
 * as they were composed; what decides it is whether anything at all is
 * written down for the side the solver is about to move. D251073 (Savournin,
 * 2nd Prize 1997, later broken) has a set play and six refuted tries and no
 * key: the three roots are all Black's, and the solver holds White.
 *
 * It says nothing until the solution has been parsed, and nothing at all
 * about:
 *  - retro, where the solver holds both colours and working out whose turn it
 *    is IS the problem;
 *  - helpmates, where the solver plays both sides, so a root of either colour
 *    is one they can play;
 *  - black-to-move studies, whose roots are all Black's because the board
 *    plays the recorded first move itself before handing over.
 *
 * A key that is written down but cannot be played on the board (notation the
 * parser cannot resolve, a position the import got wrong) is not caught here.
 * That needs the board, and a false positive would take the solve away from a
 * sound problem -- much the worse of the two mistakes.
 */
export function hasNoRecordedSolution(p: ChessProblem): boolean {
  // Not read yet: an empty tree here means nothing has been parsed.
  if (!p.solutionText) return false;
  if (p.genre === 'retro') return false;
  if (p.solutionTree.length === 0) return true;
  if (p.genre === 'help') return false;
  if (p.genre === 'study' && p.fen.split(' ')[1] === 'b') return false;
  // Everything left is White to play.
  return p.solutionTree.every(n => n.color !== 'w');
}
