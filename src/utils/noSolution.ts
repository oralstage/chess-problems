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

/**
 * YACPDB's own marks that the entry is not a sound diagram to solve -- its
 * bookkeeping, not themes, so they are kept out of the theme list too.
 *  - "To delete": the entry is being removed (a wrong diagram, a duplicate, a
 *    twin or phase entered on its own). D267111 (#3) is a wrong diagram with
 *    "1.Ka2-a1" for a solution; Popeye finds no mate in it.
 *  - "Position?": the diagram is in doubt. Of the 155 in the site's genres,
 *    102 are not even legal positions (a king missing, or the side to move can
 *    take the enemy king) and 19 more have no solution by Popeye (2026-09-30).
 *  - "Wrong position (see References)": the diagram is known to be wrong.
 * The pointer to the right entry lives in YACPDB's comments, which the import
 * does not keep. Nobody sets out to solve a problem the source itself doubts,
 * so these get the same page as one with no solution at all.
 */
export type YacpdbFlag = 'delete' | 'doubtful' | 'wrong';

const FLAG_KEYWORDS: Record<string, YacpdbFlag> = {
  'To delete': 'delete',
  'Position?': 'doubtful',
  'Wrong position (see References)': 'wrong',
};

export function isFlagKeyword(keyword: string): boolean {
  return keyword in FLAG_KEYWORDS;
}

export function yacpdbFlag(p: ChessProblem): YacpdbFlag | null {
  for (const k of p.keywords ?? []) {
    const flag = FLAG_KEYWORDS[k];
    if (flag) return flag;
  }
  return null;
}

export const FLAG_TEXT: Record<YacpdbFlag, { label: string; sub: string; notice: string }> = {
  delete: {
    label: 'Marked for deletion',
    sub: 'YACPDB marks this entry for deletion — see below.',
    notice: 'YACPDB marks this entry for deletion (a wrong diagram, or a duplicate of another entry), so it is not offered for solving here. What the source does have is below.',
  },
  doubtful: {
    label: 'Doubtful diagram',
    sub: 'YACPDB marks this diagram as doubtful — see below.',
    notice: 'YACPDB marks this diagram as doubtful — it may not be the position the composer published — so it is not offered for solving here. What the source does have is below.',
  },
  wrong: {
    label: 'Wrong diagram',
    sub: 'YACPDB marks this diagram as wrong — see below.',
    notice: 'YACPDB marks this diagram as wrong, so it is not offered for solving here. What the source does have is below.',
  },
};
