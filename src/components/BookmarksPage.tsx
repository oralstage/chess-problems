import { useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Genre, ChessProblem } from '../types';

const GENRE_PREFIX: Record<string, string> = { direct: 'D', help: 'H', self: 'S', study: 'E', retro: 'R' };
const GENRE_LABEL: Record<string, string> = { direct: 'Direct', help: 'Helpmate', self: 'Selfmate', study: 'Study', retro: 'Retro' };

interface BookmarksPageProps {
  genreData: Record<Genre, ChessProblem[]>;
  genreLoaded: Record<Genre, boolean>;
  bookmarks: Record<Genre, string[]>;
  onSelectProblem: (genre: Genre, problem: ChessProblem) => void;
  onClose: () => void;
}

export function BookmarksPage({ genreData, genreLoaded, bookmarks, onSelectProblem, onClose }: BookmarksPageProps) {
  const totalBookmarked = Object.values(bookmarks).reduce((sum, ids) => sum + (ids?.length || 0), 0);
  const loading = totalBookmarked > 0 && Object.entries(bookmarks).some(([g, ids]) => (ids?.length || 0) > 0 && !genreLoaded[g as Genre]);

  const entries = useMemo(() => {
    const result: { problem: ChessProblem; genre: Genre }[] = [];
    for (const genre of ['direct', 'help', 'self', 'study', 'retro'] as Genre[]) {
      if (!genreLoaded[genre]) continue;
      const ids = bookmarks[genre] || [];
      if (ids.length === 0) continue;
      const problemMap = new Map(genreData[genre].map(p => [String(p.id), p]));
      for (const id of ids) {
        const problem = problemMap.get(id);
        if (problem) result.push({ problem, genre });
      }
    }
    return result;
  }, [genreData, genreLoaded, bookmarks]);

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Bookmarks
            <span className="text-base font-normal text-gray-400 ml-1.5">({entries.length})</span>
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
              Loading bookmarks...
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
              {totalBookmarked > 0 ? 'Loading...' : 'No bookmarked problems yet'}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {entries.map(({ problem: p, genre }) => (
                <button
                  key={`${genre}-${p.id}`}
                  onClick={() => onSelectProblem(genre, p)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors flex gap-3"
                >
                  {/* Mini board */}
                  <div className="shrink-0 rounded overflow-hidden" style={{ width: 56, height: 56 }}>
                    <Chessboard
                      position={p.fen}
                      boardWidth={56}
                      arePiecesDraggable={false}
                      animationDuration={0}
                      customBoardStyle={{ borderRadius: '0' }}
                      customDarkSquareStyle={{ backgroundColor: '#779952' }}
                      customLightSquareStyle={{ backgroundColor: '#edeed1' }}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-gray-700 dark:text-gray-200">
                        {GENRE_PREFIX[genre] || ''}{p.id}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-xs font-bold font-mono bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">
                        {p.stipulation}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {GENRE_LABEL[genre] || genre}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 truncate mt-0.5">
                      {p.authors.join(', ')}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {p.sourceName || ''}
                      {p.sourceYear ? `, ${p.sourceYear}` : ''}
                    </div>
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
