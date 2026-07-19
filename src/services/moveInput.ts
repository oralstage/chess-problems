import { Chess } from 'chess.js';

const PROMOTION_PIECES: Record<string, string> = {
  Q: 'q',
  R: 'r',
  B: 'b',
  N: 'n',
};

/**
 * Return the requested promotion piece only when the piece on the source
 * square is actually a pawn moving to its promotion rank.
 *
 * react-chessboard supplies the chosen piece (for example `wN`) after the
 * promotion dialog, so the moving piece must be read from the position.
 */
export function getPromotionForMove(
  fen: string,
  source: string,
  target: string,
  selectedPiece: string,
): string | undefined {
  try {
    const chess = new Chess(fen);
    const movingPiece = chess.get(source as never);
    if (!movingPiece || movingPiece.type !== 'p') return undefined;

    const isPromotionRank = movingPiece.color === 'w'
      ? target[1] === '8'
      : target[1] === '1';
    if (!isPromotionRank) return undefined;

    return PROMOTION_PIECES[selectedPiece[1]] || 'q';
  } catch {
    return undefined;
  }
}
