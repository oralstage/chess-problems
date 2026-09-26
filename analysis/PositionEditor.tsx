import { useCallback, useState } from 'react';
import { SparePiece } from 'react-chessboard';
import type { Piece } from 'react-chessboard/dist/chessboard/types';
import { Board } from '../src/components/Board';
import { moveFreely, pieceAt } from '../src/utils/freeBoard';
import { EMPTY, asFen, kingNotice, placementOf, rotate180, setSquare } from './placement';

/* Setting a position up, the /make page's way: pick a man and tap squares,
   Move to drag them, Erase, Clear -- plus Rotate 180° for a diagram printed
   with Black at the foot, and a line when the kings do not come to one a side
   (the photo reader's usual slip is a white king on a hatched square, read as
   black). Used by the analysis board's Edit position and by /scan, where what
   was read off a photo is put right.

   The page around it must be inside one ChessboardDnDProvider: the palette
   needs one, and the board would otherwise bring a second. */

type Tool = { kind: 'move' } | { kind: 'place'; piece: string } | { kind: 'erase' };

// The men in the order a diagram lists them, upper case White, as in a FEN.
const PALETTE = ['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p'];
const NAMES: Record<string, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

// The board's own drawing of a man, so the palette shows what will be put down.
const pieceCode = (fenChar: string): Piece =>
  ((fenChar === fenChar.toUpperCase() ? 'w' : 'b') + fenChar.toUpperCase()) as Piece;

function menCount(placement: string) {
  return {
    white: (placement.match(/[PNBRQK]/g) || []).length,
    black: (placement.match(/[pnbrqk]/g) || []).length,
  };
}

export function PositionEditor({ placement, onChange, boardWidth }: {
  placement: string;
  onChange: (update: (prev: string) => string) => void;
  boardWidth: number;
}) {
  const [tool, setTool] = useState<Tool>({ kind: 'move' });

  // A man moves as it stands: a pawn dropped on the last rank is being put
  // there, not promoted.
  const handleDrop = useCallback((source: string, target: string): boolean => {
    onChange(prev => (pieceAt(asFen(prev), source) ? placementOf(moveFreely(asFen(prev), source, target)) : prev));
    return true;
  }, [onChange]);

  const handleSquare = useCallback((square: string) => {
    if (tool.kind === 'place') onChange(prev => setSquare(prev, square, tool.piece));
    else if (tool.kind === 'erase') onChange(prev => setSquare(prev, square, null));
  }, [tool, onChange]);

  const kings = kingNotice(placement);
  const men = menCount(placement);

  return (
    <>
      <div className="flex justify-center -mx-1">
        <Board
          fen={asFen(placement)}
          onPieceDrop={handleDrop}
          orientation="white"
          width={boardWidth}
          freeMove
          onSquareTool={tool.kind !== 'move' ? handleSquare : undefined}
        />
      </div>
      <div className="px-3 space-y-2">
        {kings && <p className="text-sm font-semibold text-amber-700">{kings}</p>}
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setTool({ kind: 'move' })}
            className={`nb-btn py-1 px-2.5 text-sm ${tool.kind === 'move' ? 'nb-btn-key' : ''}`}
            title="Drag a man to another square"
          >
            Move
          </button>
          {PALETTE.map(piece => (
            <button
              key={piece}
              onClick={() => setTool({ kind: 'place', piece })}
              className={`nb-btn w-9 h-9 flex items-center justify-center ${tool.kind === 'place' && tool.piece === piece ? 'nb-btn-key' : ''}`}
              title={`Put a ${piece === piece.toUpperCase() ? 'white' : 'black'} man on a square`}
              aria-label={`${piece === piece.toUpperCase() ? 'White' : 'Black'} ${NAMES[piece.toLowerCase()]}`}
            >
              <span className="pointer-events-none">
                <SparePiece piece={pieceCode(piece)} width={26} dndId="palette" />
              </span>
            </button>
          ))}
          <button
            onClick={() => setTool({ kind: 'erase' })}
            className={`nb-btn py-1 px-2.5 text-sm ${tool.kind === 'erase' ? 'nb-btn-key' : ''}`}
            title="Tap a man to take it off"
          >
            Erase
          </button>
          <button onClick={() => onChange(() => EMPTY)} className="nb-btn py-1 px-2.5 text-sm" title="Take everything off">
            Clear
          </button>
          <button
            onClick={() => onChange(prev => rotate180(prev))}
            className="nb-btn py-1 px-2.5 text-sm"
            title="For a diagram printed with Black at the foot"
          >
            Rotate 180°
          </button>
          <span className="ml-auto text-sm text-[var(--muted)] tabular-nums">{men.white}+{men.black}</span>
        </div>
      </div>
    </>
  );
}
