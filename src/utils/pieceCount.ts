/** "7+1" — the material count problem magazines print beside the diagram.
    Counted off the FEN placement field, so it needs nothing else loaded. */
export function pieceCounts(fen: string): string {
  const board = fen.split(' ')[0];
  let white = 0, black = 0;
  for (const ch of board) {
    if (ch >= 'A' && ch <= 'Z') white++;
    else if (ch >= 'a' && ch <= 'z') black++;
  }
  return `${white}+${black}`;
}
