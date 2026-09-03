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
  /** Given, the composer's name becomes a link to the rest of their work. */
  onSelectComposer?: (name: string) => void;
  /**
   * A composer whose name the surrounding page already carries, so the tile
   * names only the people it adds. On one composer's own page their name under
   * all 24 diagrams says nothing; a co-author does.
   */
  omitAuthor?: string;
}

/**
 * One problem as a tile: the diagram gets the room, and what a solving sheet
 * carries sits under it. Shared by author search and the composer page.
 *
 * The outer element is a div, not a button, so the composer's name can be a
 * button of its own — a button inside a button is not valid markup, and the
 * name is the one thing on the tile worth its own destination.
 */
export function ProblemTile({ result: r, boardSize, onSelect, onSelectComposer, omitAuthor }: ProblemTileProps) {
  const all: string[] = typeof r.authors === 'string' ? JSON.parse(r.authors) : r.authors;
  const authors = omitAuthor ? all.filter(a => a !== omitAuthor) : all;
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
      {authors.length === 0 ? null : onSelectComposer ? (
        <div className="w-full text-center text-xs break-words" style={{ maxWidth: boardSize }}>
          {authors.map((a, i) => (
            <span key={a + i}>
              {i > 0 && <span className="text-gray-600 dark:text-gray-400"> &amp; </span>}
              {omitAuthor && i === 0 && <span className="text-gray-600 dark:text-gray-400">with </span>}
              <button
                onClick={() => onSelectComposer(a)}
                className="underline decoration-dotted underline-offset-2 text-gray-600 hover:text-[var(--ink)] dark:text-gray-400 dark:hover:text-white"
              >
                {a}
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className="w-full text-center text-xs text-gray-600 dark:text-gray-400 break-words" style={{ maxWidth: boardSize }}>
          {omitAuthor ? `with ${composerLine(authors)}` : composerLine(authors)}
        </div>
      )}
      <div className="w-full text-center text-[11px] text-gray-400 dark:text-gray-500 break-words" style={{ maxWidth: boardSize }}>
        {r.sourceName || ''}
        {r.sourceYear ? `, ${r.sourceYear}` : ''}
        {r.award ? ` — ${r.award}` : ''}
      </div>
    </div>
  );
}
