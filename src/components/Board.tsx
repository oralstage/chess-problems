import { useState, useMemo, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import type { PromotionPieceOption } from 'react-chessboard/dist/chessboard/types';
import { Chess } from 'chess.js';

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
}

export function Board({ fen, onPieceDrop, lastMove, disabled, orientation = 'white', width, feedbackSquare, feedbackType, hintSquares, arrows, allowAnyColor }: BoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [promotionMove, setPromotionMove] = useState<{ from: string; to: string } | null>(null);
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
    try {
      const chess = new Chess(fen);
      const piece = chess.get(from as never);
      if (!piece || piece.type !== 'p') return false;
      const targetRank = to[1];
      return (piece.color === 'w' && targetRank === '8') || (piece.color === 'b' && targetRank === '1');
    } catch {
      return false;
    }
  }, [fen]);

  const legalMoves = useMemo(() => {
    if (!selectedSquare) return [];
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
  }, [fen, selectedSquare, allowAnyColor]);

  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: 'rgba(255, 255, 0, 0.3)' };
      styles[lastMove.to] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };
    }
    if (feedbackSquare && feedbackType === 'correct') {
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
  }, [disabled, selectedSquare, legalMoves, fen, onPieceDrop, allowAnyColor]);

  const handlePieceDrop = useCallback((source: string, target: string, piece: string) => {
    setSelectedSquare(null);
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
    // piece is like 'wQ', 'wR', 'wB', 'wN'
    return onPieceDrop(src, tgt, piece);
  }, [onPieceDrop, promotionMove]);

  const handlePieceDragBegin = useCallback(() => {
    setSelectedSquare(null);
  }, []);

  const isDraggablePiece = useCallback(({ piece }: { piece: string }) => {
    if (disabled) return false;
    if (allowAnyColor) return true;
    // Default: only current turn's pieces
    try {
      const chess = new Chess(fen);
      const color = piece[0] === 'w' ? 'w' : 'b';
      return color === chess.turn();
    } catch {
      return true;
    }
  }, [disabled, allowAnyColor, fen]);

  return (
    <div className="relative">
      <Chessboard
        position={fen}
        onPieceDrop={handlePieceDrop}
        onSquareClick={handleSquareClick}
        onPieceDragBegin={handlePieceDragBegin}
        onPromotionPieceSelect={handlePromotionPieceSelect}
        promotionToSquare={promotionMove?.to as never}
        showPromotionDialog={!!promotionMove}
        boardWidth={boardWidth}
        boardOrientation={orientation}
        customSquareStyles={customSquareStyles}
        customDarkSquareStyle={{ backgroundColor: '#779952' }}
        customLightSquareStyle={{ backgroundColor: '#edeed1' }}
        customArrows={arrows as never}
        arePiecesDraggable={!disabled}
        isDraggablePiece={isDraggablePiece}
        animationDuration={400}
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
            <div className="w-5 h-5 rounded-full bg-red-500 border-2 border-white shadow flex items-center justify-center">
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
