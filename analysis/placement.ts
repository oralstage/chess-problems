/* What the analysis board accepts as a position. */

export const EMPTY = '8/8/8/8/8/8/8/8';

/** The placement field of what was typed or passed, or null if it is not one.
 *  A whole FEN is fine -- only its first field is read. */
export function readPlacement(text: string): string | null {
  const placement = text.trim().split(/\s+/)[0] ?? '';
  const rows = placement.split('/');
  if (rows.length !== 8) return null;
  for (const row of rows) {
    if (!/^[pnbrqkPNBRQK1-8]+$/.test(row)) return null;
    let n = 0;
    for (const ch of row) n += /\d/.test(ch) ? Number(ch) : 1;
    if (n !== 8) return null;
  }
  return placement;
}

function toCells(placement: string): string[][] {
  return placement.split('/').map(row => {
    const cells: string[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) cells.push(...Array(Number(ch)).fill(''));
      else cells.push(ch);
    }
    return cells;
  });
}

function fromCells(rows: string[][]): string {
  return rows.map(cells => {
    let out = '';
    let run = 0;
    for (const cell of cells) {
      if (cell === '') { run++; continue; }
      if (run > 0) { out += run; run = 0; }
      out += cell;
    }
    return run > 0 ? out + run : out;
  }).join('/');
}

/** Put a man on a square, or take the one there off (piece = null). */
export function setSquare(placement: string, square: string, piece: string | null): string {
  const rows = toCells(placement);
  rows[8 - Number(square[1])][square.charCodeAt(0) - 97] = piece ?? '';
  return fromCells(rows);
}

/** The position turned round -- for a diagram printed with Black at the foot,
 *  which reads as White's side up until it is turned. */
export function rotate180(placement: string): string {
  return fromCells(toCells(placement).reverse().map(row => row.reverse()));
}

/** What is wrong with the kings, said so it can be checked against the photo:
 *  a white king on a hatched square is the reading's usual slip, and it comes
 *  out as two black kings and no white one. */
export function kingNotice(placement: string): string | null {
  const white = (placement.match(/K/g) || []).length;
  const black = (placement.match(/k/g) || []).length;
  if (white === 1 && black === 1) return null;
  const count = (n: number, side: string) => (n === 0 ? `no ${side} king` : `${n} ${side} king${n === 1 ? '' : 's'}`);
  return `${count(white, 'white')} and ${count(black, 'black')} — check the kings against the diagram.`;
}
