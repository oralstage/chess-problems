import { useState, useMemo } from 'react';
import { composerLine } from '../utils/composerName';
import { pieceCounts } from '../utils/pieceCount';
import { useTileGrid } from '../hooks/useTileGrid';
import { Chessboard } from 'react-chessboard';
import type { SearchResult } from '../services/api';
import { searchByAuthor } from '../services/api';

interface SearchPageProps {
  onClose: () => void;
  onSelectResult: (result: SearchResult) => void;
  initialQuery?: string;
  onQueryChange?: (q: string) => void;
  cachedResults?: SearchResult[] | null;
  onResultsChange?: (results: SearchResult[] | null) => void;
}

const GENRE_PREFIX: Record<string, string> = { direct: 'D', help: 'H', self: 'S', study: 'E', retro: 'R' };
const GENRE_LABEL: Record<string, string> = { direct: 'Direct', help: 'Helpmate', self: 'Selfmate', study: 'Study', retro: 'Retro' };

type SortKey = 'year-desc' | 'year-asc' | 'stipulation';

export function SearchPage({ onClose, onSelectResult, initialQuery, onQueryChange, cachedResults, onResultsChange }: SearchPageProps) {
  const [query, setQuery] = useState(initialQuery || '');
  const { columns, boardSize } = useTileGrid(672);
  const [results, setResults] = useState<SearchResult[] | null>(cachedResults ?? null);
  const [searching, setSearching] = useState(false);
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('year-desc');

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    setGenreFilter(null);
    try {
      const data = await searchByAuthor(q, 200);
      setResults(data);
      onResultsChange?.(data);
    } catch {
      setResults([]);
      onResultsChange?.([]);
    }
    setSearching(false);
  };

  // Available genres from results
  const availableGenres = useMemo(() => {
    if (!results) return [];
    const genres = new Set(results.map(r => r.genre));
    return ['direct', 'help', 'self', 'study', 'retro'].filter(g => genres.has(g));
  }, [results]);

  // Genre counts
  const genreCounts = useMemo(() => {
    if (!results) return {};
    const counts: Record<string, number> = {};
    for (const r of results) {
      counts[r.genre] = (counts[r.genre] || 0) + 1;
    }
    return counts;
  }, [results]);

  // Filtered and sorted results
  const displayResults = useMemo(() => {
    if (!results) return [];
    let filtered = genreFilter ? results.filter(r => r.genre === genreFilter) : results;
    if (sortBy === 'year-asc') {
      filtered = [...filtered].sort((a, b) => (a.sourceYear || 0) - (b.sourceYear || 0));
    } else if (sortBy === 'year-desc') {
      filtered = [...filtered].sort((a, b) => (b.sourceYear || 0) - (a.sourceYear || 0));
    } else if (sortBy === 'stipulation') {
      filtered = [...filtered].sort((a, b) => a.stipulation.localeCompare(b.stipulation));
    }
    return filtered;
  }, [results, genreFilter, sortBy]);

  return (
    <div className="nb-ground fixed inset-0 z-50 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--ink)] shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Search by Author</h2>
          <div className="flex items-center gap-2">
            {results != null && results.length > 0 && (
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="nb-chip text-xs px-2 py-1 focus:outline-none cursor-pointer"
              >
                <option value="year-desc">Newest</option>
                <option value="year-asc">Oldest</option>
                <option value="stipulation">By type</option>
              </select>
            )}
            <button
              onClick={onClose}
              className="nb-disc" aria-label="Close"
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="px-4 py-3 border-b-2 border-[var(--ink)] shrink-0">
          <form className="flex gap-2" onSubmit={handleSearch}>
            <div className="flex-1 min-w-0 relative">
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); onQueryChange?.(e.target.value); }}
                placeholder="e.g. Loyd, Kasparyan, Nunn"
                autoFocus
                className="nb-input w-full px-4 py-2 pr-8 text-sm focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(''); onQueryChange?.(''); setResults(null); onResultsChange?.(null); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={query.trim().length < 2 || searching}
              className="nb-btn nb-btn-key px-4 py-2 text-sm"
            >
              {searching ? '...' : 'Search'}
            </button>
          </form>
        </div>

        {/* Genre filter pills + sort */}
        {results != null && results.length > 0 && (
          <div className="px-4 py-2 border-b-2 border-[var(--ink)] shrink-0 flex items-center gap-2 overflow-x-auto">
            <button
              onClick={() => setGenreFilter(null)}
              className={`px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                !genreFilter ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              All ({results.length})
            </button>
            {availableGenres.map(g => (
              <button
                key={g}
                onClick={() => setGenreFilter(genreFilter === g ? null : g)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                  genreFilter === g ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
              >
                {GENRE_LABEL[g] || g} ({genreCounts[g] || 0})
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {results == null && (
            <div className="text-center py-12 text-[var(--faint)] text-sm">
              Enter an author name to search across all problems
            </div>
          )}

          {results != null && results.length === 0 && (
            <div className="text-center py-12 text-[var(--faint)] text-sm">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}

          {displayResults.length > 0 && (
            <>
              <div className="px-4 py-1.5 text-xs font-semibold text-[var(--faint)]">
                {displayResults.length} result{displayResults.length !== 1 ? 's' : ''}{results && results.length >= 200 ? ' (limit reached)' : ''}
              </div>
              {/* Tiles, like the WCSC set and the menu's lists: the diagram gets the
                  room, and what a solving sheet carries sits under it. The composer
                  stays — the search matches on part of a name, so "yama" answers with
                  Yamashita and Yamada together and a result without its name says
                  nothing. Source and year stay too: the sort is by year, and without
                  it the order has no visible reason. */}
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                {displayResults.map(r => {
                  const authors = typeof r.authors === 'string' ? JSON.parse(r.authors) : r.authors;
                  return (
                    <button
                      key={r.id}
                      onClick={() => onSelectResult(r)}
                      className="nb-tile nb-shadow-room-sm w-full p-2 flex flex-col items-center gap-1"
                    >
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-mono font-bold text-sm text-gray-700 dark:text-gray-200">
                          {GENRE_PREFIX[r.genre] || ''}{r.id}
                        </span>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">
                          {GENRE_LABEL[r.genre] || r.genre}
                        </span>
                      </span>
                      <div className="rounded-[6px] overflow-hidden border-2 border-[var(--ink)]" style={{ width: boardSize, height: boardSize }}>
                        <Chessboard
                          position={r.fen}
                          boardWidth={boardSize}
                          arePiecesDraggable={false}
                          animationDuration={0}
                          customBoardStyle={{ borderRadius: '0' }}
                          customDarkSquareStyle={{ backgroundColor: '#779952' }}
                          customLightSquareStyle={{ backgroundColor: '#edeed1' }}
                        />
                      </div>
                      <div className="flex w-full items-baseline justify-between text-sm" style={{ maxWidth: boardSize }}>
                        <span className="font-bold text-[var(--ink)]">{r.stipulation}</span>
                        <span className="text-[var(--muted)]">{pieceCounts(r.fen)}</span>
                      </div>
                      {/* Wrapped, not clipped: a joint composition is the one result
                          whose name says something the search term did not. */}
                      <div className="w-full text-center text-xs text-gray-600 dark:text-gray-400 break-words" style={{ maxWidth: boardSize }}>
                        {composerLine(authors)}
                      </div>
                      <div className="w-full text-center text-[11px] text-gray-400 dark:text-gray-500 break-words" style={{ maxWidth: boardSize }}>
                        {r.sourceName || ''}
                        {r.sourceYear ? `, ${r.sourceYear}` : ''}
                        {r.award ? ` — ${r.award}` : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
