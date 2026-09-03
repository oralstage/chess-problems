import { Chessboard } from 'react-chessboard';
import { LazyBoard } from './LazyBoard';
import { composerLine } from '../utils/composerName';
import { pieceCounts } from '../utils/pieceCount';
import { GENRE_PREFIX, GENRE_LABEL } from '../utils/genreLabels';
import type { SearchResult } from '../services/api';

interface ProblemTileProps {
  result: SearchResult;
  boardSize: number;
  onSelect: (result: SearchResult) => void;
}

/**
 * One problem as a tile: the diagram gets the room, and what a solving sheet
 * carries sits under it.
 */
export function ProblemTile({ result: r, boardSize, onSelect }: ProblemTileProps) {
  const authors: string[] = typeof r.authors === 'string' ? JSON.parse(r.authors) : r.authors;
  return (
    <div className="nb-tile nb-shadow-room-sm w-full p-2 flex flex-col items-center gap-1">
      <button
        onClick={() => onSelect(r)}
        className="w-full flex flex-col items-center gap-1"
      >
        <span className="flex items-baseline gap-1.5">
          <span className="font-mono font-bold text-sm text-gray-700 dark:text-gray-200">
            {GENRE_PREFIX[r.genre] || ''}{r.id}
          </span>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">
            {GENRE_LABEL[r.genre] || r.genre}
          </span>
        </span>
        <LazyBoard size={boardSize} className="rounded-[6px] overflow-hidden border-2 border-[var(--ink)]">
          <Chessboard
            position={r.fen}
            boardWidth={boardSize}
            arePiecesDraggable={false}
            animationDuration={0}
            customBoardStyle={{ borderRadius: '0' }}
            customDarkSquareStyle={{ backgroundColor: '#779952' }}
            customLightSquareStyle={{ backgroundColor: '#edeed1' }}
          />
        </LazyBoard>
        <div className="flex w-full items-baseline justify-between text-sm" style={{ maxWidth: boardSize }}>
          <span className="font-bold text-[var(--ink)]">{r.stipulation}</span>
          <span className="text-[var(--muted)]">{pieceCounts(r.fen)}</span>
        </div>
      </button>
      {/* Wrapped, not clipped: a joint composition is the one result whose name
          says something the search term did not. */}
      <div className="w-full text-center text-xs text-gray-600 dark:text-gray-400 break-words" style={{ maxWidth: boardSize }}>
        {composerLine(authors)}
      </div>
      <div className="w-full text-center text-[11px] text-gray-400 dark:text-gray-500 break-words" style={{ maxWidth: boardSize }}>
        {r.sourceName || ''}
        {r.sourceYear ? `, ${r.sourceYear}` : ''}
        {r.award ? ` — ${r.award}` : ''}
      </div>
    </div>
  );
}
