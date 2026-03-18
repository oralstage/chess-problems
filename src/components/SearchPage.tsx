import { useState, useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import type { SearchResult } from '../services/api';
import { searchByAuthor } from '../services/api';

interface SearchPageProps {
  onClose: () => void;
  onSelectResult: (result: SearchResult) => void;
  initialQuery?: string;
  onQueryChange?: (q: string) => void;
}

const GENRE_PREFIX: Record<string, string> = { direct: 'D', help: 'H', self: 'S', study: 'E', retro: 'R' };
const GENRE_LABEL: Record<string, string> = { direct: 'Direct', help: 'Helpmate', self: 'Selfmate', study: 'Study', retro: 'Retro' };

type SortKey = 'year-desc' | 'year-asc' | 'stipulation';

export function SearchPage({ onClose, onSelectResult, initialQuery, onQueryChange }: SearchPageProps) {
  const [query, setQuery] = useState(initialQuery || '');
  const [results, setResults] = useState<SearchResult[] | null>(null);
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
    } catch {
      setResults([]);
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
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Search by Author</h2>
          <div className="flex items-center gap-2">
            {results != null && results.length > 0 && (
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="text-xs bg-transparent text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-1 focus:outline-none cursor-pointer"
              >
                <option value="year-desc">Newest</option>
                <option value="year-asc">Oldest</option>
                <option value="stipulation">By type</option>
              </select>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <form className="flex gap-2" onSubmit={handleSearch}>
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); onQueryChange?.(e.target.value); }}
              placeholder="e.g. Loyd, Kasparyan, Nunn"
              autoFocus
              className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={query.trim().length < 2 || searching}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {searching ? '...' : 'Search'}
            </button>
          </form>
        </div>

        {/* Genre filter pills + sort */}
        {results != null && results.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 shrink-0 flex items-center gap-2 overflow-x-auto">
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
            <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
              Enter an author name to search across all problems
            </div>
          )}

          {results != null && results.length === 0 && (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}

          {displayResults.length > 0 && (
            <>
              <div className="px-4 py-1.5 text-xs text-gray-400 dark:text-gray-500">
                {displayResults.length} result{displayResults.length !== 1 ? 's' : ''}{results && results.length >= 200 ? ' (limit reached)' : ''}
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {displayResults.map(r => {
                  const authors = typeof r.authors === 'string' ? JSON.parse(r.authors) : r.authors;
                  return (
                    <button
                      key={r.id}
                      onClick={() => onSelectResult(r)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors flex gap-3"
                    >
                      {/* Mini board */}
                      <div className="shrink-0 rounded overflow-hidden" style={{ width: 64, height: 64 }}>
                        <Chessboard
                          position={r.fen}
                          boardWidth={64}
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
                            {GENRE_PREFIX[r.genre] || ''}{r.id}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-xs font-bold font-mono bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">
                            {r.stipulation}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {GENRE_LABEL[r.genre] || r.genre}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 truncate mt-0.5">
                          {authors.join(', ')}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {r.sourceName || ''}
                          {r.sourceYear ? `, ${r.sourceYear}` : ''}
                          {r.award ? ` — ${r.award}` : ''}
                        </div>
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
