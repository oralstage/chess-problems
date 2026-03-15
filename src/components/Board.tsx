import { useState, useMemo, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
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
}

export function Board({ fen, onPieceDrop, lastMove, disabled, orientation = 'white', width, feedbackSquare, feedbackType, hintSquares }: BoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
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

  const legalMoves = useMemo(() => {
    if (!selectedSquare) return [];
    try {
      const chess = new Chess(fen);
      return chess.moves({ square: selectedSquare as never, verbose: true });
    } catch {
      return [];
    }
  }, [fen, selectedSquare]);

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
        styles[move.to] = {
          ...styles[move.to],
          background: `radial-gradient(circle, rgba(0,0,0,0.2) 25%, transparent 25%)`,
        };
      }
    }
    return styles;
  }, [lastMove, selectedSquare, legalMoves, feedbackType, feedbackSquare, hintSquares]);

  const handleSquareClick = useCallback((square: string) => {
    if (disabled) return;

    if (selectedSquare) {
      const isLegalTarget = legalMoves.some(m => m.to === square);
      if (isLegalTarget) {
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
      if (piece && piece.color === chess.turn()) {
        setSelectedSquare(square === selectedSquare ? null : square);
      } else {
        setSelectedSquare(null);
      }
    } catch {
      setSelectedSquare(null);
    }
  }, [disabled, selectedSquare, legalMoves, fen, onPieceDrop]);

  const handlePieceDrop = useCallback((source: string, target: string, piece: string) => {
    setSelectedSquare(null);
    return onPieceDrop(source, target, piece);
  }, [onPieceDrop]);

  const handlePieceDragBegin = useCallback(() => {
    setSelectedSquare(null);
  }, []);

  return (
    <div className="relative">
      <Chessboard
        position={fen}
        onPieceDrop={handlePieceDrop}
        onSquareClick={handleSquareClick}
        onPieceDragBegin={handlePieceDragBegin}
        boardWidth={boardWidth}
        boardOrientation={orientation}
        customSquareStyles={customSquareStyles}
        customDarkSquareStyle={{ backgroundColor: '#779952' }}
        customLightSquareStyle={{ backgroundColor: '#edeed1' }}
        arePiecesDraggable={!disabled}
        animationDuration={300}
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
