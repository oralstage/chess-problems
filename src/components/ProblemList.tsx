import { useState, useMemo, useRef, useEffect } from 'react';
import type { ChessProblem, ProblemProgress } from '../types';
import { getStipulationTextColorClasses } from '../utils/stipulationColor';
import { Pagination } from './Pagination';

type StatusFilter = 'all' | 'unsolved' | 'solved' | 'failed' | 'bookmarked';

interface ProblemListProps {
  problems: ChessProblem[];          // pre-filtered by global filters + status filter
  allProblems: ChessProblem[];       // unfiltered, for stable numbering
  progress: ProblemProgress;
  bookmarks: string[];
  currentProblemId: number | null;
  onSelectProblem: (problem: ChessProblem) => void;
  onClose: () => void;
  onOpenFilters: () => void;
  activeFilterCount: number;
  sortBy: 'difficulty' | 'year';
  sortOrder: 'asc' | 'desc';
  onSortChange: (sort: 'difficulty' | 'year', order: 'asc' | 'desc') => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (f: StatusFilter) => void;
  loading?: boolean;
  genrePrefix?: string;
}

const COLS = 3;
const ROWS = 6;
const PAGE_SIZE = COLS * ROWS;

export function ProblemList({
  problems, allProblems, progress, bookmarks, currentProblemId,
  onSelectProblem, onClose, onOpenFilters, activeFilterCount,
  sortBy, sortOrder, onSortChange,
  statusFilter, onStatusFilterChange,
  loading, genrePrefix = '',
}: ProblemListProps) {
  const solved = Object.values(progress).filter(s => s === 'solved').length;

  // YACPDB ID is used directly as the problem number
  void allProblems; // allProblems kept for prop compatibility

  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  // Close sort menu on outside click
  useEffect(() => {
    if (!showSortMenu) return;
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSortMenu]);

  // problems is already filtered by parent (global filters + status filter)
  const filtered = problems;

  const currentIdx = filtered.findIndex(p => p.id === currentProblemId);
  const initialPage = currentIdx >= 0 ? Math.floor(currentIdx / PAGE_SIZE) : 0;
  const [page, setPage] = useState(initialPage);

  // Update page when filtered list changes and current problem is on a different page
  useEffect(() => {
    const idx = filtered.findIndex(p => p.id === currentProblemId);
    if (idx >= 0) {
      const targetPage = Math.floor(idx / PAGE_SIZE);
      setPage(targetPage);
    }
  }, [filtered, currentProblemId]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageProblems = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page],
  );

  const handleStatusFilterChange = (f: StatusFilter) => {
    onStatusFilterChange(f);
    setPage(0);
  };

  return (
    <div className="nb-ground fixed inset-0 z-50 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col p-4 max-w-3xl mx-auto w-full min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-xl font-extrabold text-[var(--ink)] truncate min-w-0">
              Problems
              <span className="text-sm font-semibold text-[var(--faint)] ml-1.5 whitespace-nowrap">
                {solved}/{allProblems.length}
              </span>
            </h3>
            {/* Filter button */}
            <button
              onClick={onOpenFilters}
              className={`nb-icon relative p-1.5 shrink-0 ${activeFilterCount > 0 ? 'bg-[var(--surface-2)]' : ''}`}
              title="Filters"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--ink)] text-[var(--surface)] text-[10px] font-extrabold rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {/* Sort dropdown */}
            <div className="relative" ref={sortRef}>
              <button
                onClick={() => setShowSortMenu(prev => !prev)}
                className="nb-btn flex items-center gap-1.5 px-3 py-1.5 text-xs"
              >
                <span>{sortBy === 'year'
                  ? (sortOrder === 'desc' ? 'Newest first' : 'Oldest first')
                  : (sortOrder === 'desc' ? 'Hardest first' : 'Easiest first')}</span>
                <svg className="w-3 h-3 opacity-60" fill="currentColor" viewBox="0 0 10 14">
                  <path d="M5 0L9 5H1L5 0Z" />
                  <path d="M5 14L1 9H9L5 14Z" />
                </svg>
              </button>
              {showSortMenu && (
                <div className="nb-plate absolute left-0 top-full mt-2 z-50 py-1.5 min-w-[180px] overflow-hidden">
                  {/* Direction spelled out — "Difficulty ↑" made every reader
                      guess which end page 1 is. "First" says it outright. */}
                  {([
                    ['difficulty', 'asc', 'Easiest first'],
                    ['difficulty', 'desc', 'Hardest first'],
                    ['year', 'desc', 'Newest first'],
                    ['year', 'asc', 'Oldest first'],
                  ] as const).map(([value, order, label]) => (
                    <button
                      key={`${value}-${order}`}
                      onClick={() => { onSortChange(value, order); setShowSortMenu(false); }}
                      className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center gap-2 ${
                        sortBy === value && sortOrder === order
                          ? 'text-gray-900 dark:text-white font-medium'
                          : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                      } hover:bg-gray-50 dark:hover:bg-gray-700`}
                    >
                      <span className="w-4 text-green-600 dark:text-green-400 text-xs">{sortBy === value && sortOrder === order ? '✓' : ''}</span>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="nb-disc"
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status filter */}
        <div className="flex gap-1.5 mb-3 overflow-x-auto scrollbar-hide shrink-0">
          {([
            ['all', 'All'],
            ['unsolved', 'Unsolved'],
            ['solved', 'Solved'],
            ['failed', 'Failed'],
            ['bookmarked', '\u2605 Bookmarked'],
          ] as [StatusFilter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => handleStatusFilterChange(key)}
              className={`nb-chip px-3 py-1 text-sm ${statusFilter === key ? 'nb-chip-on' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filtered count */}
        {filtered.length !== allProblems.length && (
          <div className="text-xs font-semibold text-[var(--faint)] mb-2 shrink-0">
            Showing {filtered.length} of {allProblems.length} problems
          </div>
        )}

        {/* Grid of problems */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {loading && allProblems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="flex gap-1">
                {['♚', '♛', '♜', '♝', '♞'].map((piece, i) => (
                  <div
                    key={i}
                    className="text-2xl text-gray-400 dark:text-gray-500 w-7 text-center"
                    ref={el => {
                      if (el) {
                        el.animate(
                          [
                            { transform: 'translateY(0)', offset: 0 },
                            { transform: 'translateY(-10px)', offset: 0.4 },
                            { transform: 'translateY(0)', offset: 0.8 },
                            { transform: 'translateY(0)', offset: 1 },
                          ],
                          { duration: 1200, iterations: Infinity, easing: 'ease-in-out', delay: i * 150 }
                        );
                      }
                    }}
                  >
                    {piece}
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-400 dark:text-gray-500">Loading problems...</p>
            </div>
          ) : (
          <div
            className="grid gap-2 pb-2"
            style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
          >
            {pageProblems.map((p) => {
              const status = progress[String(p.id)];
              const isCurrent = p.id === currentProblemId;
              const globalIndex = p.id;

              return (
                <button
                  key={p.id}
                  onClick={() => onSelectProblem(p)}
                  className={`nb-tile flex flex-col items-center justify-center gap-0.5 text-center relative overflow-hidden py-2 px-1 ${
                    isCurrent ? 'nb-tile-current' : status === 'solved' ? 'nb-tile-ok' : status === 'failed' ? 'nb-tile-bad' : ''
                  }`}
                >
                  <div className="flex items-baseline gap-0.5 leading-tight">
                    <span className="text-sm font-extrabold">
                      {genrePrefix}{globalIndex}
                    </span>
                  </div>
                  <span className={`text-xs font-bold font-mono ${isCurrent || status ? 'opacity-70' : getStipulationTextColorClasses(p.stipulation, p.genre)}`}>
                    {p.stipulation}
                    {/* Year, when the full data has arrived — sorting by year
                        was unreadable with no year in sight. Index stubs lack
                        it, so early views simply show the stipulation alone. */}
                    {p.sourceYear ? <span className="font-normal opacity-60"> · {p.sourceYear}</span> : null}
                  </span>

                  {status === 'solved' && (
                    <span className="absolute top-0.5 right-1 text-xs font-extrabold">&#10003;</span>
                  )}
                  {status === 'failed' && !isCurrent && (
                    <span className="absolute top-0.5 right-1 text-xs font-extrabold">&#10007;</span>
                  )}
                  {bookmarks.includes(String(p.id)) && (
                    <span className="absolute top-0.5 left-1 text-[var(--acid)] text-[10px]">{'\u2605'}</span>
                  )}
                  {isCurrent && (
                    <span className="absolute top-0.5 right-1 text-xs">&#9654;</span>
                  )}
                </button>
              );
            })}
          </div>
          )}
        </div>

        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>
    </div>
  );
}
