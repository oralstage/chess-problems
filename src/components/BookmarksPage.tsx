import { useMemo, useEffect, useReducer } from 'react';
import { pieceCounts } from '../utils/pieceCount';
import { useTileGrid } from '../hooks/useTileGrid';
import { Chessboard } from 'react-chessboard';
import type { Genre, ChessProblem } from '../types';
import { fetchProblemBatch, metaToChessProblem } from '../services/api';

const GENRE_PREFIX: Record<string, string> = { direct: 'D', help: 'H', self: 'S', study: 'E', retro: 'R' };
const GENRE_LABEL: Record<string, string> = { direct: 'Direct', help: 'Helpmate', self: 'Selfmate', study: 'Study', retro: 'Retro' };

// Module-level cache: persists across mount/unmount
const metaCache = new Map<string, ChessProblem>();

interface BookmarksPageProps {
  genreData: Record<Genre, ChessProblem[]>;
  genreLoaded: Record<Genre, boolean>;
  bookmarks: Record<Genre, string[]>;
  onSelectProblem: (genre: Genre, problem: ChessProblem) => void;
  onClose: () => void;
}

interface BookmarkEntry {
  id: string;
  problem: ChessProblem | null;
  genre: Genre;
}

export function BookmarksPage({ genreData, genreLoaded, bookmarks, onSelectProblem, onClose }: BookmarksPageProps) {
  const [cacheVersion, forceUpdate] = useReducer(x => x + 1, 0);
  const { columns, boardSize } = useTileGrid(672);

  const entries = useMemo(() => {
    const result: BookmarkEntry[] = [];
    for (const genre of ['direct', 'help', 'self', 'study', 'retro'] as Genre[]) {
      const ids = bookmarks[genre] || [];
      if (ids.length === 0) continue;
      const problemMap = genreLoaded[genre]
        ? new Map(genreData[genre].map(p => [String(p.id), p]))
        : null;

      for (const id of ids) {
        const problem = problemMap?.get(id) || metaCache.get(`${genre}:${id}`) || null;
        result.push({ id, problem, genre });
      }
    }
    return result;
  }, [bookmarks, genreData, genreLoaded, cacheVersion]);

  // Fetch missing problem details individually (cached via Cache API)
  useEffect(() => {
    const toFetch = entries.filter(e => (!e.problem || !e.problem.fen) && !metaCache.has(`${e.genre}:${e.id}`));
    if (toFetch.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const ids = toFetch.map(e => Number(e.id));
        const results = await fetchProblemBatch(ids);
        if (cancelled) return;
        for (const meta of results) {
          const entry = toFetch.find(e => Number(e.id) === meta.id);
          if (entry) {
            metaCache.set(`${entry.genre}:${entry.id}`, metaToChessProblem(meta));
          }
        }
      } catch { /* batch failed */ }
      if (!cancelled) forceUpdate();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length]);

  return (
    <div className="nb-ground fixed inset-0 z-50 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full min-h-0">
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--ink)] shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Bookmarks
            <span className="text-sm font-semibold text-[var(--faint)] ml-1.5">({entries.length})</span>
          </h2>
          <button onClick={onClose} className="nb-disc" aria-label="Close">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tiles, like the WCSC set: the diagram, and under it what a solving
            sheet carries. No composer — a bookmark is a problem put aside to solve
            later, so this list is read before the attempt, and naming one here
            would hand over the clue the board stops showing. */}
        <div className="flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="text-center py-12 text-[var(--faint)] text-sm">No bookmarked problems yet</div>
          ) : (
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {entries.map(({ id, problem: p, genre }) => (
                <button
                  key={`${genre}-${id}`}
                  onClick={() => { if (p) onSelectProblem(genre, p); }}
                  disabled={!p}
                  className="nb-tile nb-shadow-room-sm w-full p-2 flex flex-col items-center gap-1 disabled:opacity-60"
                >
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-mono font-bold text-sm text-gray-700 dark:text-gray-200">{GENRE_PREFIX[genre] || ''}{id}</span>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">{GENRE_LABEL[genre] || genre}</span>
                  </span>
                  <div className="rounded-[6px] overflow-hidden border-2 border-[var(--ink)]" style={{ width: boardSize, height: boardSize }}>
                    {p ? (
                      <Chessboard position={p.fen} boardWidth={boardSize} arePiecesDraggable={false} animationDuration={0}
                        customBoardStyle={{ borderRadius: '0' }} customDarkSquareStyle={{ backgroundColor: '#779952' }} customLightSquareStyle={{ backgroundColor: '#edeed1' }} />
                    ) : (
                      <div className="w-full h-full bg-[var(--surface-2)] flex items-center justify-center">
                        <span className="text-3xl text-gray-300 dark:text-gray-600">♚</span>
                      </div>
                    )}
                  </div>
                  <div className="flex w-full items-baseline justify-between text-sm" style={{ maxWidth: boardSize }}>
                    <span className="font-bold text-[var(--ink)]">{p ? p.stipulation : ''}</span>
                    <span className="text-[var(--muted)]">{p ? pieceCounts(p.fen) : 'Loading...'}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
