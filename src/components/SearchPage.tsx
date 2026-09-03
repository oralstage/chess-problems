import { useEffect, useState } from 'react';
import { useTileGrid } from '../hooks/useTileGrid';
import { ProblemTile } from './ProblemTile';
import { Pagination } from './Pagination';
import { GENRE_LABEL } from '../utils/genreLabels';
import type { SearchResult } from '../services/api';
import { searchByAuthor } from '../services/api';

/** Everything the page needs to come back to where it was. */
export interface SearchViewState {
  query: string;
  page: number;
  genre: string | null;
  sort: SortKey;
  results: SearchResult[];
  total: number;
  genreCounts: Record<string, number>;
}

interface SearchPageProps {
  onClose: () => void;
  onSelectResult: (result: SearchResult) => void;
  initialQuery?: string;
  onQueryChange?: (q: string) => void;
  cachedView?: SearchViewState | null;
  onViewChange?: (view: SearchViewState | null) => void;
}

type SortKey = 'year-desc' | 'year-asc' | 'stipulation';

// Three across, six down — the problem list's page, so the two lists move the
// same way and a page is the same amount of looking in both.
const PAGE_SIZE = 18;

export function SearchPage({
  onClose, onSelectResult, initialQuery, onQueryChange, cachedView, onViewChange,
}: SearchPageProps) {
  const { columns, boardSize } = useTileGrid(672);
  const [query, setQuery] = useState(initialQuery ?? cachedView?.query ?? '');
  // What was actually searched, as opposed to what is being typed.
  const [submitted, setSubmitted] = useState(cachedView?.query ?? '');
  const [page, setPage] = useState(cachedView?.page ?? 0);
  const [genreFilter, setGenreFilter] = useState<string | null>(cachedView?.genre ?? null);
  const [sortBy, setSortBy] = useState<SortKey>(cachedView?.sort ?? 'year-desc');
  const [loaded, setLoaded] = useState<SearchViewState | null>(cachedView ?? null);

  // Whether what is loaded is the view being asked for. Derived, not stored:
  // a "searching" flag set inside the effect would set state during it and
  // cascade a render.
  const holdsCurrent = !!loaded && loaded.query === submitted && loaded.page === page
    && loaded.genre === genreFilter && loaded.sort === sortBy;
  const searching = !!submitted && !holdsCurrent;

  useEffect(() => {
    if (!submitted || holdsCurrent) return;
    let cancelled = false;
    searchByAuthor(submitted, { page, pageSize: PAGE_SIZE, genre: genreFilter, sort: sortBy })
      .then(data => {
        if (cancelled) return;
        const view: SearchViewState = {
          query: submitted, page, genre: genreFilter, sort: sortBy,
          results: data.results, total: data.total, genreCounts: data.genreCounts,
        };
        setLoaded(view);
        onViewChange?.(view);
      })
      .catch(() => {
        if (cancelled) return;
        const view: SearchViewState = {
          query: submitted, page, genre: genreFilter, sort: sortBy,
          results: [], total: 0, genreCounts: {},
        };
        setLoaded(view);
        onViewChange?.(view);
      });
    return () => { cancelled = true; };
  }, [submitted, page, genreFilter, sortBy, holdsCurrent, onViewChange]);

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setPage(0);
    setGenreFilter(null);
    setSubmitted(q);
  };

  const showing = loaded && loaded.query === submitted ? loaded : null;
  const results = showing?.results ?? null;
  const total = showing?.total ?? 0;
  const genreCounts = showing?.genreCounts ?? {};
  const allCount = Object.values(genreCounts).reduce((a, b) => a + b, 0);
  const availableGenres = ['direct', 'help', 'self', 'study', 'retro']
    .filter(g => (genreCounts[g] ?? 0) > 0);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const first = page * PAGE_SIZE + 1;
  const last = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <div className="nb-ground fixed inset-0 z-50 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--ink)] shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Search by Author</h2>
          <div className="flex items-center gap-2">
            {total > 0 && (
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value as SortKey); setPage(0); }}
                className="nb-chip text-xs px-2 py-1 focus:outline-none cursor-pointer"
              >
                <option value="year-desc">Newest</option>
                <option value="year-asc">Oldest</option>
                <option value="stipulation">By type</option>
              </select>
            )}
            <button onClick={onClose} className="nb-disc" aria-label="Close">
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
                  onClick={() => {
                    setQuery(''); onQueryChange?.('');
                    setSubmitted(''); setLoaded(null); onViewChange?.(null);
                  }}
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

        {/* Genre filter pills — counted over the whole match, not the page */}
        {availableGenres.length > 0 && (
          <div className="px-4 py-2 border-b-2 border-[var(--ink)] shrink-0 flex items-center gap-2 overflow-x-auto">
            <button
              onClick={() => { setGenreFilter(null); setPage(0); }}
              className={`px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                !genreFilter ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              All ({allCount.toLocaleString()})
            </button>
            {availableGenres.map(g => (
              <button
                key={g}
                onClick={() => { setGenreFilter(genreFilter === g ? null : g); setPage(0); }}
                className={`px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                  genreFilter === g ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
              >
                {GENRE_LABEL[g] || g} ({(genreCounts[g] ?? 0).toLocaleString()})
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {!submitted && (
            <div className="text-center py-12 text-[var(--faint)] text-sm">
              Enter an author name to search across all problems
            </div>
          )}

          {submitted && results == null && (
            <div className="text-center py-12 text-[var(--faint)] text-sm">Searching…</div>
          )}

          {results != null && results.length === 0 && (
            <div className="text-center py-12 text-[var(--faint)] text-sm">
              No results found for &ldquo;{submitted}&rdquo;
            </div>
          )}

          {results != null && results.length > 0 && (
            <>
              <div className="px-4 py-1.5 text-xs font-semibold text-[var(--faint)]">
                {total.toLocaleString()} result{total !== 1 ? 's' : ''}
                {totalPages > 1 ? ` — showing ${first}–${last}` : ''}
              </div>
              {/* The composer stays on every tile — the search matches on part of
                  a name, so "yama" answers with Yamashita and Yamada together and
                  a result without its name says nothing. */}
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                {results.map(r => (
                  <ProblemTile key={r.id} result={r} boardSize={boardSize} onSelect={onSelectResult} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* The same clearance the problem list's pager has. Flush with the
            bottom of a `fixed inset-0` overlay means under the iPhone's
            Safari toolbar, which hides the page number. */}
        <div className="shrink-0 px-4 pb-8">
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      </div>
    </div>
  );
}
