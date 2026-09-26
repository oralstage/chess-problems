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
