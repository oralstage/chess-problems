const PIECE_MAP: Record<string, string> = {
  K: 'K', Q: 'Q', R: 'R', B: 'B', S: 'N', N: 'N', P: 'P',
};

function parseSquare(sq: string): [number, number] | null {
  if (sq.length !== 2) return null;
  const file = sq.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = parseInt(sq[1]) - 1;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return [rank, file];
}

function parsePieceString(s: string): { piece: string; rank: number; file: number } | null {
  const trimmed = s.trim();
  if (trimmed.length < 2) return null;

  let pieceLetter: string;
  let squareStr: string;

  const firstChar = trimmed[0];
  if (firstChar >= 'a' && firstChar <= 'h') {
    // Pawn without prefix: "f3"
    pieceLetter = 'P';
    squareStr = trimmed;
  } else if (PIECE_MAP[firstChar.toUpperCase()]) {
    // Piece with prefix: "Kg2", "Sf5", "Pf3"
    pieceLetter = PIECE_MAP[firstChar.toUpperCase()];
    squareStr = trimmed.slice(1);
  } else {
    return null;
  }

  const pos = parseSquare(squareStr);
  if (!pos) return null;

  return { piece: pieceLetter, rank: pos[0], file: pos[1] };
}

export function algebraicToFen(algebraic: { white: string[]; black: string[] }): string {
  const board: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));

  for (const ps of algebraic.white) {
    const parsed = parsePieceString(ps);
    if (parsed) {
      board[parsed.rank][parsed.file] = parsed.piece.toUpperCase();
    }
  }

  for (const ps of algebraic.black) {
    const parsed = parsePieceString(ps);
    if (parsed) {
      board[parsed.rank][parsed.file] = parsed.piece.toLowerCase();
    }
  }

  const ranks: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let fenRank = '';
    let emptyCount = 0;
    for (let file = 0; file < 8; file++) {
      const p = board[rank][file];
      if (p) {
        if (emptyCount > 0) {
          fenRank += emptyCount;
          emptyCount = 0;
        }
        fenRank += p;
      } else {
        emptyCount++;
      }
    }
    if (emptyCount > 0) fenRank += emptyCount;
    ranks.push(fenRank);
  }

  return ranks.join('/') + ' w - - 0 1';
}

export function isFairyPiece(algebraic: { white: string[]; black: string[] }): boolean {
  const validPieces = new Set(['K', 'Q', 'R', 'B', 'S', 'N', 'P']);
  for (const pieces of [algebraic.white, algebraic.black]) {
    for (const ps of pieces) {
      const trimmed = ps.trim();
      if (trimmed.length < 2) continue;
      const firstChar = trimmed[0];
      if (firstChar >= 'a' && firstChar <= 'h') continue; // pawn
      if (!validPieces.has(firstChar.toUpperCase())) return true;
    }
  }
  return false;
}
