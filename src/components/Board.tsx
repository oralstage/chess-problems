import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import type { PromotionPieceOption } from 'react-chessboard/dist/chessboard/types';
import { Chess } from 'chess.js';
import { pieceAt } from '../utils/freeBoard';
import type { PrintMode } from '../types';

interface BoardProps {
  fen: string;
  onPieceDrop: (sourceSquare: string, targetSquare: string, piece: string) => boolean;
  lastMove?: { from: string; to: string } | null;
  disabled?: boolean;
  orientation?: 'white' | 'black';
  width?: number;
  feedbackSquare?: string | null;
  feedbackType?: 'correct' | 'incorrect' | null;
  hintSquares?: string[] | null; // [fromSquare, ...toSquares]
  arrows?: [string, string, string?][] | null;
  allowAnyColor?: boolean; // Allow moving pieces of either color (retro problems)
  /** Analysis board: any piece to any square, no legality, no promotion —
      the behaviour of a physical pocket set. */
  freeMove?: boolean;
  printMode?: PrintMode; // Print / e-paper diagram style — see PRINT_MODE_CLASS
}

const PRINT_MODE_CLASS: Record<PrintMode, string> = {
  off: '',
  wood: 'board-print-wood',      // flat wood tone
  black: 'board-print-black',    // solid black dark squares
  red: 'board-print-red',        // solid red dark squares
  yellow: 'board-print-yellow',  // solid yellow dark squares
  bw: 'board-print-bw',          // hatched mono, for the thermal printer
};

export function Board({ fen, onPieceDrop, lastMove, disabled, orientation = 'white', width, feedbackSquare, feedbackType, hintSquares, arrows, allowAnyColor, freeMove, printMode = 'off' }: BoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  // A selection made in one mode must not survive into the other: entering the
  // analysis board with a piece still selected would turn the first tap into
  // an unintended (and there, unchecked) move.
  useEffect(() => { setSelectedSquare(null); }, [freeMove]);
  const [promotionMove, setPromotionMove] = useState<{ from: string; to: string } | null>(null);
  // A drag promotion is first applied by handlePromotionPieceSelect. The
  // chessboard library then calls onPieceDrop to finish its own dialog flow;
  // remember that result so the move is not submitted a second time.
  const completedDragPromotionRef = useRef<{
    from: string;
    to: string;
    accepted: boolean;
  } | null>(null);
  const boardWidth = width || 400;

  // Feedback icon position (absolute inside the board container)
  const iconPos = useMemo(() => {
    if (!feedbackSquare || !feedbackType) return null;
    const sqSize = boardWidth / 8;
    const col = feedbackSquare.charCodeAt(0) - 97;
    const row = parseInt(feedbackSquare[1]) - 1;
    const x = orientation === 'white'
      ? col * sqSize + sqSize - 10
      : (7 - col) * sqSize + sqSize - 10;
    const y = orientation === 'white'
      ? (7 - row) * sqSize + 2
      : row * sqSize + 2;
    return { x, y };
  }, [feedbackSquare, feedbackType, orientation, boardWidth]);

  const isPromotionMove = useCallback((from: string, to: string): boolean => {
    if (freeMove) return false; // a pawn carried to the last rank just sits there
    try {
      const chess = new Chess(fen);
      const piece = chess.get(from as never);
      if (!piece || piece.type !== 'p') return false;
      const targetRank = to[1];
      return (piece.color === 'w' && targetRank === '8') || (piece.color === 'b' && targetRank === '1');
    } catch {
      return false;
    }
  }, [fen, freeMove]);

  const legalMoves = useMemo(() => {
    if (!selectedSquare || freeMove) return [];
    try {
      const chess = new Chess(fen);
      const piece = chess.get(selectedSquare as never);
      // If allowAnyColor and piece color != current turn, flip FEN turn to compute legal moves
      if (allowAnyColor && piece && piece.color !== chess.turn()) {
        const flipped = fen.replace(/ [wb] /, chess.turn() === 'w' ? ' b ' : ' w ');
        const chess2 = new Chess(flipped);
        return chess2.moves({ square: selectedSquare as never, verbose: true });
      }
      return chess.moves({ square: selectedSquare as never, verbose: true });
    } catch {
      return [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, selectedSquare, allowAnyColor, freeMove]);

  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: 'rgba(255, 255, 0, 0.3)' };
      styles[lastMove.to] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };
    }
    // The green wash goes on only while the tick is marking the move that was
    // just played. A selfmate finishes on the opponent's move, so the tick
    // stays behind on the solver's own square while lastMove has moved on —
    // painting both would light three squares at once and bury which one was
    // last. There the tick carries the mark alone and the yellow keeps the
    // last move to itself.
    if (feedbackSquare && feedbackType === 'correct' && lastMove?.to === feedbackSquare) {
      styles[feedbackSquare] = {
        ...styles[feedbackSquare],
        backgroundColor: 'rgba(34, 197, 94, 0.5)',
      };
    } else if (feedbackSquare && feedbackType === 'incorrect') {
      styles[feedbackSquare] = {
        ...styles[feedbackSquare],
        backgroundColor: 'rgba(239, 68, 68, 0.45)',
      };
    }
    // Hint highlighting
    if (hintSquares && hintSquares.length > 0) {
      const [hintFrom, ...hintTos] = hintSquares;
      // Highlight the piece to move with a blue ring
      styles[hintFrom] = {
        ...styles[hintFrom],
        backgroundColor: 'rgba(59, 130, 246, 0.4)',
        boxShadow: 'inset 0 0 0 3px rgba(59, 130, 246, 0.8)',
      };
      // Show destination dots
      for (const sq of hintTos) {
        styles[sq] = {
          ...styles[sq],
          background: `radial-gradient(circle, rgba(59, 130, 246, 0.5) 25%, transparent 25%)`,
        };
      }
    }
    if (selectedSquare) {
      styles[selectedSquare] = { ...styles[selectedSquare], backgroundColor: 'rgba(20, 85, 200, 0.4)' };
      for (const move of legalMoves) {
        if (move.captured) {
          // Capture target: ring around the piece
          styles[move.to] = {
            ...styles[move.to],
            background: `radial-gradient(circle, transparent 60%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0.2) 80%, transparent 80%)`,
          };
        } else {
          // Empty square: center dot
          styles[move.to] = {
            ...styles[move.to],
            background: `radial-gradient(circle, rgba(0,0,0,0.2) 25%, transparent 25%)`,
          };
        }
      }
    }
    return styles;
  }, [lastMove, selectedSquare, legalMoves, feedbackType, feedbackSquare, hintSquares]);

  const handleSquareClick = useCallback((square: string) => {
    if (disabled) return;

    // Free movement: tap any occupied square, tap any destination. The FEN can
    // be unreachable by the rules, so chess.js never parses it here.
    if (freeMove) {
      if (selectedSquare) {
        if (square !== selectedSquare) onPieceDrop(selectedSquare, square, 'wP');
        setSelectedSquare(null);
      } else {
        setSelectedSquare(pieceAt(fen, square) ? square : null);
      }
      return;
    }

    if (selectedSquare) {
      const isLegalTarget = legalMoves.some(m => m.to === square);
      if (isLegalTarget) {
        if (isPromotionMove(selectedSquare, square)) {
          setPromotionMove({ from: selectedSquare, to: square });
          setSelectedSquare(null);
          return;
        }
        try {
          const chess = new Chess(fen);
          const piece = chess.get(selectedSquare as never);
          const pieceStr = piece ? (piece.color === 'w' ? 'w' : 'b') + piece.type.toUpperCase() : 'wP';
          onPieceDrop(selectedSquare, square, pieceStr);
        } catch {
          onPieceDrop(selectedSquare, square, 'wP');
        }
        setSelectedSquare(null);
        return;
      }
    }

    try {
      const chess = new Chess(fen);
      const piece = chess.get(square as never);
      if (piece && (piece.color === chess.turn() || allowAnyColor)) {
        setSelectedSquare(square === selectedSquare ? null : square);
      } else {
        setSelectedSquare(null);
      }
    } catch {
      setSelectedSquare(null);
    }
  }, [disabled, selectedSquare, legalMoves, fen, onPieceDrop, allowAnyColor, isPromotionMove, freeMove]);

  const handlePieceDrop = useCallback((source: string, target: string, piece: string) => {
    setSelectedSquare(null);

    const completedPromotion = completedDragPromotionRef.current;
    if (
      completedPromotion
      && completedPromotion.from === source
      && completedPromotion.to === target
    ) {
      completedDragPromotionRef.current = null;
      return completedPromotion.accepted;
    }

    if (isPromotionMove(source, target)) {
      setPromotionMove({ from: source, to: target });
      return true; // Accept visually, wait for promotion selection
    }
    return onPieceDrop(source, target, piece);
  }, [onPieceDrop, isPromotionMove]);

  const handlePromotionPieceSelect = useCallback((piece?: PromotionPieceOption, from?: string, to?: string) => {
    const src = from || promotionMove?.from;
    const tgt = to || promotionMove?.to;
    setPromotionMove(null);
    if (!piece || !src || !tgt) return false;

    // piece is like 'wQ', 'wR', 'wB', 'wN'. Submit the move exactly once.
    const accepted = onPieceDrop(src, tgt, piece);

    if (promotionMove) {
      // Click-to-move opened the dialog through our controlled props. Returning
      // false prevents react-chessboard from trying a second move without a
      // promoteFromSquare; the external FEN update displays accepted moves.
      return false;
    }

    // Drag-to-move opened react-chessboard's internal dialog. Let it complete
    // its cleanup, while handlePieceDrop consumes this result instead of
    // reopening the promotion dialog or submitting the move again.
    completedDragPromotionRef.current = { from: src, to: tgt, accepted };
    return true;
  }, [onPieceDrop, promotionMove]);

  const handlePieceDragBegin = useCallback(() => {
    setSelectedSquare(null);
  }, []);

  const isDraggablePiece = useCallback(({ piece }: { piece: string }) => {
    if (disabled) return false;
    if (freeMove || allowAnyColor) return true;
    // Default: only current turn's pieces
    try {
      const chess = new Chess(fen);
      const color = piece[0] === 'w' ? 'w' : 'b';
      return color === chess.turn();
    } catch {
      return true;
    }
  }, [disabled, allowAnyColor, freeMove, fen]);

  // Which way the 2x2 picker opens out from the promotion square. It is always
  // anchored with that square as one of its four cells, on the side that keeps
  // the whole block on the board — otherwise an a-file promotion hangs off the
  // edge and an eighth-rank one sits half over the header.
  const promotionAnchor = useMemo(() => {
    if (!promotionMove) return '';
    const file = promotionMove.to.charCodeAt(0) - 97;
    const rank = parseInt(promotionMove.to[1], 10);
    const col = orientation === 'white' ? file : 7 - file;
    const row = orientation === 'white' ? 8 - rank : rank - 1;
    return `${row <= 6 ? '' : 'cp-promo-up'} ${col <= 6 ? '' : 'cp-promo-left'}`;
  }, [promotionMove, orientation]);

  return (
    <div
      className={`relative ${freeMove ? 'board-analysis' : PRINT_MODE_CLASS[printMode]} ${promotionAnchor}`}
      style={{ touchAction: 'manipulation', ['--sq' as string]: `${boardWidth / 8}px` } as React.CSSProperties}
    >
      <Chessboard
        position={fen}
        onPieceDrop={handlePieceDrop}
        onSquareClick={handleSquareClick}
        onPieceDragBegin={handlePieceDragBegin}
        onPromotionPieceSelect={handlePromotionPieceSelect}
        promotionToSquare={promotionMove?.to as never}
        showPromotionDialog={!!promotionMove}
        // Never let the library open the picker off its own state: a dragged
        // promotion would then bypass promotionMove, and the anchor above would
        // have nothing to work from. Refusing here sends the drop through
        // onPieceDrop, so drag and click both arrive at handlePieceDrop.
        onPromotionCheck={() => false}
        promotionDialogVariant="vertical"
        boardWidth={boardWidth}
        boardOrientation={orientation}
        customSquareStyles={customSquareStyles}
        customDarkSquareStyle={{ backgroundColor: 'var(--board-d)' }}
        customLightSquareStyle={{ backgroundColor: 'var(--board-l)' }}
        customArrows={arrows as never}
        arePiecesDraggable={!disabled}
        isDraggablePiece={isDraggablePiece}
        animationDuration={200}
      />
      {disabled && (
        <div className="absolute inset-0 cursor-not-allowed" />
      )}
      {iconPos && feedbackType && (
        <div
          className="absolute pointer-events-none"
          style={{ left: iconPos.x, top: iconPos.y, zIndex: 50 }}
        >
          {feedbackType === 'correct' ? (
            <div className="w-5 h-5 rounded-full bg-green-500 border-2 border-white shadow flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full bg-[var(--bad)] border-2 border-white shadow flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
