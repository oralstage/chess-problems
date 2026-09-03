import { useEffect, useMemo, useState } from 'react';
import { useTileGrid } from '../hooks/useTileGrid';
import { ProblemTile } from './ProblemTile';
import { Pagination } from './Pagination';
import { GENRE_LABEL } from '../utils/genreLabels';
import type { SearchResult, SearchListEntry } from '../services/api';
import { searchByAuthor, fetchSearchPage, SEARCH_GENRE } from '../services/api';

/** Enough to come back to where the search was left. */
export interface SearchViewState {
  query: string;
  list: SearchListEntry[];
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
const GENRES = ['direct', 'help', 'self', 'study', 'retro'];

export function SearchPage({
  onClose, onSelectResult, initialQuery, onQueryChange, cachedView, onViewChange,
}: SearchPageProps) {
  const { columns, boardSize } = useTileGrid(672);
  const [query, setQuery] = useState(initialQuery ?? cachedView?.query ?? '');
  // What was actually searched, as opposed to what is being typed.
  const [submitted, setSubmitted] = useState(cachedView?.query ?? '');
  const [list, setList] = useState<SearchListEntry[] | null>(cachedView?.list ?? null);
  const [listFor, setListFor] = useState(cachedView?.query ?? '');
  const [page, setPage] = useState(0);
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('year-desc');
  const [pageRows, setPageRows] = useState<SearchResult[] | null>(null);
  const [pageRowsKey, setPageRowsKey] = useState('');

  // The match list: one call per search. The author index is a ~21k-row scan
  // and must not be re-run to turn a page.
  const searching = !!submitted && listFor !== submitted;
  useEffect(() => {
    if (!submitted || listFor === submitted) return;
    let cancelled = false;
    searchByAuthor(submitted)
      .then(data => {
        if (cancelled) return;
        setList(data);
        setListFor(submitted);
        onViewChange?.({ query: submitted, list: data });
      })
      .catch(() => {
        if (cancelled) return;
        setList([]);
        setListFor(submitted);
        onViewChange?.({ query: submitted, list: [] });
      });
    return () => { cancelled = true; };
  }, [submitted, listFor, onViewChange]);

  const genreCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of list ?? []) {
      const g = SEARCH_GENRE[e[1]] ?? e[1];
      counts[g] = (counts[g] || 0) + 1;
    }
    return counts;
  }, [list]);

  const ordered = useMemo(() => {
    let rows = list ?? [];
    if (genreFilter) rows = rows.filter(e => SEARCH_GENRE[e[1]] === genreFilter);
    if (sortBy === 'year-asc') {
      // Not simply the reverse: the easiest of a year stays first either way.
      rows = [...rows].sort((a, b) => {
        const ya = a[2], yb = b[2];
        if (ya == null && yb == null) return a[4] - b[4];
        if (ya == null) return 1;
        if (yb == null) return -1;
        if (ya !== yb) return ya - yb;
        return a[4] - b[4];
      });
    } else if (sortBy === 'stipulation') {
      rows = [...rows].sort((a, b) => a[3].localeCompare(b[3]));
    }
    return rows;
  }, [list, genreFilter, sortBy]);

  const total = ordered.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pageIds = useMemo(
    () => ordered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(e => e[0]),
    [ordered, page]
  );
  const wantKey = pageIds.join(',');

  // Only the ids on screen are read in full.
  useEffect(() => {
    if (!wantKey || pageRowsKey === wantKey) return;
    let cancelled = false;
    fetchSearchPage(wantKey.split(',').map(Number))
      .then(rows => { if (!cancelled) { setPageRows(rows); setPageRowsKey(wantKey); } })
      .catch(() => { if (!cancelled) { setPageRows([]); setPageRowsKey(wantKey); } });
    return () => { cancelled = true; };
  }, [wantKey, pageRowsKey]);

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setPage(0);
    setGenreFilter(null);
    setSubmitted(q);
  };

  const availableGenres = GENRES.filter(g => (genreCounts[g] ?? 0) > 0);
  const allCount = list?.length ?? 0;
  const rows = pageRowsKey === wantKey ? pageRows : null;
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
                    setSubmitted(''); setListFor(''); setList(null); onViewChange?.(null);
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

          {submitted && (searching || (total > 0 && rows == null)) && (
            <div className="text-center py-12 text-[var(--faint)] text-sm">Searching…</div>
          )}

          {!searching && list != null && total === 0 && (
            <div className="text-center py-12 text-[var(--faint)] text-sm">
              No results found for &ldquo;{submitted}&rdquo;
            </div>
          )}

          {rows != null && rows.length > 0 && (
            <>
              <div className="px-4 py-1.5 text-xs font-semibold text-[var(--faint)]">
                {total.toLocaleString()} result{total !== 1 ? 's' : ''}
                {totalPages > 1 ? ` — showing ${first}–${last}` : ''}
              </div>
              {/* The composer stays on every tile — the search matches on part of
                  a name, so "yama" answers with Yamashita and Yamada together and
                  a result without its name says nothing. */}
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                {rows.map(r => (
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
