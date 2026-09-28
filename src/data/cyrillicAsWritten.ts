// Problems whose Cyrillic letters are left as written (solutionParser's
// ParseOptions.cyrillic = false). The swap lets the parser read moves typed on
// a Russian or Ukrainian keyboard, and in these six it reads the text worse
// than leaving it: the moves it uncovers sit where the text's other faults put
// them (an indentation the tree builder takes the wrong way, a "~" the board
// answers with a move that stops the threat, a line that breaks on notation
// it still cannot read). Found by playing every listed problem with Cyrillic
// in its moves on the board both ways (2026-09-28); re-check after a YACPDB
// import.
export const CYRILLIC_AS_WRITTEN: ReadonlySet<number> = new Set([
  321431, 337313, 348976, 383965, 386097, 386719,
]);
