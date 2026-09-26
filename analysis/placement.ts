/* What the analysis board accepts as a position, and the small things done
   to one. */

import { moveFreely, pieceAt } from '../src/utils/freeBoard';

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

/** A board asked for with a position and nothing to solve: no stipulation and
 *  no solution, or analysis=1. /solve and /board then open the analysis board
 *  rather than refusing the address, so a link made from a FEN alone is still
 *  a board to think on -- the same address a problem gets, less the problem.
 *  analysis=1 is how a position keeps what is asked of it (stip=#2) and is
 *  still handed over as an analysis board: /make's Solvable taken off. */
export function wantsAnalysis(q: URLSearchParams): boolean {
  if (!q.get('fen')?.trim()) return false;
  return q.get('analysis') === '1' || (!q.get('stip')?.trim() && !q.get('sol')?.trim());
}

export const asFen = (placement: string) => `${placement} w - - 0 1`;
export const placementOf = (fen: string) => fen.split(' ')[0];

/** A move on the analysis board, as the solving view's own does it: a pawn
 *  reaching its last rank comes with the picker's choice ('wQ', 'bN', ...);
 *  anything else arrives as a placeholder and moves as it is. */
export function freeDrop(fen: string, source: string, target: string, piece?: string): string {
  const mover = pieceAt(fen, source);
  const isPromo = ((mover === 'P' && target[1] === '8') || (mover === 'p' && target[1] === '1'))
    && !!piece && /^[wb][QRBN]$/.test(piece);
  const replaceWith = isPromo ? (piece![0] === 'w' ? piece![1] : piece![1].toLowerCase()) : undefined;
  return moveFreely(fen, source, target, replaceWith);
}

/** The credit an address carries (author=A;B, source, year), and whether it
 *  is to be shown: credits=1. On a problem that is "from the start rather
 *  than after the solve"; on an analysis board, with no solve to wait for,
 *  it is whether the credit is shown at all. */
export function creditFromParams(q: URLSearchParams) {
  const authors = (q.get('author') || '').split(';').map(a => a.trim()).filter(Boolean);
  const year = Number(q.get('year'));
  const source = [(q.get('source') || '').trim(), Number.isInteger(year) && year > 0 ? String(year) : '']
    .filter(Boolean).join(', ');
  return { authors, source, show: q.get('credits') === '1' };
}
