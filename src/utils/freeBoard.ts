/** Piece movement with no rules — the analysis board's physical-set behaviour.
 *
 * chess.js can't host this: it rejects positions its rules can't reach (a
 * captured king, nine queens), and the whole point of the analysis board is
 * that, like a pocket set at a solving championship, any piece goes anywhere
 * in any order. So the FEN's placement field is edited directly. The other
 * fields are pinned to "w - - 0 1": nothing downstream reads them — the board
 * renders placement only, and no move validation ever sees these positions.
 */
/** The piece on a square, or null — works on rule-breaking positions too. */
export function pieceAt(fen: string, square: string): string | null {
  const rows = fen.split(' ')[0].split('/');
  const row = rows[8 - parseInt(square[1])];
  if (!row) return null;
  let c = 0;
  for (const ch of row) {
    if (/\d/.test(ch)) { c += parseInt(ch); continue; }
    if (c === square.charCodeAt(0) - 97) return ch;
    c++;
  }
  return null;
}

export function moveFreely(fen: string, from: string, to: string, replaceWith?: string): string {
  if (from === to) return fen;
  const placement = fen.split(' ')[0];
  const rows = placement.split('/').map(row => {
    const cells: string[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) cells.push(...Array(parseInt(ch)).fill(''));
      else cells.push(ch);
    }
    return cells;
  });

  const at = (sq: string) => ({ r: 8 - parseInt(sq[1]), c: sq.charCodeAt(0) - 97 });
  const f = at(from);
  const t = at(to);
  const piece = rows[f.r]?.[f.c];
  if (!piece) return fen;
  rows[f.r][f.c] = '';
  rows[t.r][t.c] = replaceWith ?? piece;

  const newPlacement = rows.map(cells => {
    let out = '';
    let run = 0;
    for (const cell of cells) {
      if (cell === '') { run++; continue; }
      if (run > 0) { out += run; run = 0; }
      out += cell;
    }
    if (run > 0) out += run;
    return out;
  }).join('/');

  return `${newPlacement} w - - 0 1`;
}
