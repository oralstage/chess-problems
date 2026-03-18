import { useState, useMemo, useRef, useEffect } from 'react';
import type { ChessProblem, ProblemProgress } from '../types';

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
  const failed = Object.values(progress).filter(s => s === 'failed').length;

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
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col p-4 max-w-3xl mx-auto w-full min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-2 shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              Problems
              <span className="text-base font-normal text-gray-400 ml-1.5">
                ({solved}/{allProblems.length} solved{failed > 0 ? `, ${failed} failed` : ''})
              </span>
            </h3>
            {/* Filter button */}
            <button
              onClick={onOpenFilters}
              className={`relative p-1.5 rounded-lg transition-colors ${
                activeFilterCount > 0
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                  : 'hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400'
              }`}
              title="Filters"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {/* Sort dropdown */}
            <div className="relative" ref={sortRef}>
              <button
                onClick={() => setShowSortMenu(prev => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-700"
              >
                <span>{sortBy === 'year' ? 'Year' : 'Difficulty'}</span>
                <svg className="w-3 h-3 opacity-60" fill="currentColor" viewBox="0 0 10 14">
                  <path d="M5 0L9 5H1L5 0Z" />
                  <path d="M5 14L1 9H9L5 14Z" />
                </svg>
              </button>
              {showSortMenu && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[180px]">
                  {([['difficulty', 'Difficulty'], ['year', 'Year']] as const).map(([value, label]) => (
                    <div key={value}>
                      <button
                        onClick={() => { onSortChange(value, 'asc'); setShowSortMenu(false); }}
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center gap-2 ${
                          sortBy === value && sortOrder === 'asc'
                            ? 'text-gray-900 dark:text-white font-medium'
                            : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                        } hover:bg-gray-50 dark:hover:bg-gray-700`}
                      >
                        <span className="w-4 text-green-600 dark:text-green-400 text-xs">{sortBy === value && sortOrder === 'asc' ? '✓' : ''}</span>
                        {label} ↑
                      </button>
                      <button
                        onClick={() => { onSortChange(value, 'desc'); setShowSortMenu(false); }}
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center gap-2 ${
                          sortBy === value && sortOrder === 'desc'
                            ? 'text-gray-900 dark:text-white font-medium'
                            : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                        } hover:bg-gray-50 dark:hover:bg-gray-700`}
                      >
                        <span className="w-4 text-green-600 dark:text-green-400 text-xs">{sortBy === value && sortOrder === 'desc' ? '✓' : ''}</span>
                        {label} ↓
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
              className={`px-3 py-1 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                statusFilter === key
                  ? 'bg-green-700 text-white dark:bg-green-600 dark:text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-400 dark:hover:bg-white/20'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filtered count */}
        {filtered.length !== allProblems.length && (
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-2 shrink-0">
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
                  className={`rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all text-center relative overflow-hidden py-2 px-1 ${
                    isCurrent
                      ? 'bg-green-600 text-white ring-2 ring-green-400 shadow-lg shadow-green-500/30'
                      : status === 'solved'
                        ? 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60'
                        : status === 'failed'
                          ? 'bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/40 dark:text-orange-300 dark:hover:bg-orange-900/60'
                          : 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/20'
                  }`}
                >
                  <div className="flex items-baseline gap-0.5 leading-tight">
                    <span className={`text-sm font-extrabold ${
                      isCurrent ? 'text-white' : status === 'solved' ? 'text-green-600 dark:text-green-400' : status === 'failed' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-800 dark:text-gray-200'
                    }`}>
                      {genrePrefix}{globalIndex}
                    </span>
                  </div>
                  <span className={`text-xs font-bold font-mono ${
                    isCurrent ? 'text-green-200' : status === 'solved' ? 'text-green-500/70 dark:text-green-400/70' : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {p.stipulation}
                  </span>

                  {status === 'solved' && (
                    <span className="absolute top-0.5 right-1 text-green-500 dark:text-green-400 text-xs font-bold">&#10003;</span>
                  )}
                  {status === 'failed' && !isCurrent && (
                    <span className="absolute top-0.5 right-1 text-orange-500 dark:text-orange-400 text-xs font-bold">&#10007;</span>
                  )}
                  {bookmarks.includes(String(p.id)) && (
                    <span className="absolute top-0.5 left-1 text-yellow-500 text-[10px]">{'\u2605'}</span>
                  )}
                  {isCurrent && (
                    <span className="absolute top-0.5 right-1 text-green-200 text-xs">&#9654;</span>
                  )}
                </button>
              );
            })}
          </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center mt-3 pb-2 shrink-0">
            <button
              onClick={() => setPage(0)}
              disabled={page === 0}
              className="w-10 h-10 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30 transition-colors text-gray-500 dark:text-gray-300"
            >
              &laquo;
            </button>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="w-10 h-10 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30 transition-colors text-gray-500 dark:text-gray-300"
            >
              &lsaquo;
            </button>

            <div className="flex items-center justify-center w-56">
              {Array.from({ length: totalPages }, (_, i) => i)
                .filter(i => {
                  if (i === 0 || i === totalPages - 1) return true;
                  if (Math.abs(i - page) <= 2) return true;
                  return false;
                })
                .reduce<(number | 'ellipsis')[]>((acc, i) => {
                  const last = acc[acc.length - 1];
                  if (typeof last === 'number' && i - last > 1) {
                    acc.push('ellipsis');
                  }
                  acc.push(i);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === 'ellipsis' ? (
                    <span key={`e${idx}`} className="w-8 text-center text-sm text-gray-400 dark:text-gray-500">&hellip;</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setPage(item)}
                      className={`w-10 h-10 text-sm rounded-lg transition-colors ${
                        page === item
                          ? 'bg-green-700 text-white dark:bg-green-600 dark:text-white font-bold'
                          : 'hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {item + 1}
                    </button>
                  )
                )}
            </div>

            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="w-10 h-10 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30 transition-colors text-gray-500 dark:text-gray-300"
            >
              &rsaquo;
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={page === totalPages - 1}
              className="w-10 h-10 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30 transition-colors text-gray-500 dark:text-gray-300"
            >
              &raquo;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
