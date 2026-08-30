/** How many men each side has, off the FEN placement field alone. */
export function pieceCountParts(fen: string): { white: number; black: number } {
  const board = fen.split(' ')[0];
  let white = 0, black = 0;
  for (const ch of board) {
    if (ch >= 'A' && ch <= 'Z') white++;
    else if (ch >= 'a' && ch <= 'z') black++;
  }
  return { white, black };
}

/** "7+1" — the material count problem magazines print beside the diagram. It is
    there so a reader setting the position up on a board can check they have not
    dropped a piece, which is also why it survives on screen: it is part of what
    makes a diagram read as a composition. */
export function pieceCounts(fen: string): string {
  const { white, black } = pieceCountParts(fen);
  return `${white}+${black}`;
}
