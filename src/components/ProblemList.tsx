import { useState, useMemo } from 'react';
import type { ChessProblem, ProblemProgress } from '../types';

interface ProblemListProps {
  problems: ChessProblem[];
  progress: ProblemProgress;
  bookmarks: string[];
  currentProblemId: number | null;
  onSelectProblem: (problem: ChessProblem) => void;
  onClose: () => void;
}

type StatusFilter = 'all' | 'unsolved' | 'solved' | 'failed' | 'bookmarked';

const COLS = 4;
const ROWS = 5;
const PAGE_SIZE = COLS * ROWS;

export function ProblemList({ problems, progress, bookmarks, currentProblemId, onSelectProblem, onClose }: ProblemListProps) {
  const solved = Object.values(progress).filter(s => s === 'solved').length;
  const failed = Object.values(progress).filter(s => s === 'failed').length;

  // Move count filter
  const moveCounts = useMemo(() => {
    const counts = new Set<string>();
    for (const p of problems) {
      counts.add(p.stipulation);
    }
    return ['all', ...Array.from(counts).sort((a, b) => {
      const order = (s: string) => {
        if (s.startsWith('h#')) return 100 + parseInt(s.slice(2) || '0');
        if (s.startsWith('s#')) return 200 + parseInt(s.slice(2) || '0');
        if (s.startsWith('#')) return parseInt(s.slice(1) || '0');
        if (s === '+') return 300;
        if (s === '=') return 301;
        return 999;
      };
      return order(a) - order(b);
    })];
  }, [problems]);

  // Map problem ID → original index (1-based) for stable numbering across filters
  const problemIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    problems.forEach((p, i) => map.set(p.id, i + 1));
    return map;
  }, [problems]);

  const [filter, setFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filtered = useMemo(() => {
    let result = problems;
    if (filter !== 'all') {
      result = result.filter(p => p.stipulation === filter);
    }
    if (statusFilter !== 'all') {
      result = result.filter(p => {
        const s = progress[String(p.id)];
        switch (statusFilter) {
          case 'solved': return s === 'solved';
          case 'failed': return s === 'failed';
          case 'unsolved': return s !== 'solved' && s !== 'failed';
          case 'bookmarked': return bookmarks.includes(String(p.id));
          default: return true;
        }
      });
    }
    return result;
  }, [problems, filter, statusFilter, progress, bookmarks]);

  const currentIdx = filtered.findIndex(p => p.id === currentProblemId);
  const initialPage = currentIdx >= 0 ? Math.floor(currentIdx / PAGE_SIZE) : 0;
  const [page, setPage] = useState(initialPage);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageProblems = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page],
  );

  const handleFilterChange = (f: string) => {
    setFilter(f);
    setPage(0);
  };

  const handleStatusFilterChange = (f: StatusFilter) => {
    setStatusFilter(f);
    setPage(0);
  };

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex flex-col overflow-hidden">
      <div
        className="flex-1 flex flex-col p-4 max-w-3xl mx-auto w-full min-h-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            Problems <span className="text-base font-normal text-gray-400 dark:text-gray-400">({solved}/{problems.length} solved{failed > 0 ? `, ${failed} failed` : ''})</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Move count filter */}
        {moveCounts.length > 2 && (
          <div className="flex gap-1.5 mb-3 overflow-x-auto scrollbar-hide shrink-0">
            {moveCounts.map(mc => (
              <button
                key={mc}
                onClick={() => handleFilterChange(mc)}
                className={`px-3 py-1 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  filter === mc
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-400 dark:hover:bg-white/20'
                }`}
              >
                {mc === 'all' ? `All (${problems.length})` : `${mc} (${problems.filter(p => p.stipulation === mc).length})`}
              </button>
            ))}
          </div>
        )}

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
                  ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-400 dark:hover:bg-white/20'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Grid of problems */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div
            className="grid gap-2 pb-2"
            style={{
              gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            }}
          >
          {pageProblems.map((p) => {
            const status = progress[String(p.id)];
            const isCurrent = p.id === currentProblemId;
            const globalIndex = problemIndexMap.get(p.id) ?? 0;

            return (
              <button
                key={p.id}
                onClick={() => onSelectProblem(p)}
                className={`rounded-lg flex flex-col items-center justify-center gap-0 transition-all text-center relative overflow-hidden py-1 px-1 ${
                  isCurrent
                    ? 'bg-blue-600 text-white ring-2 ring-blue-400 shadow-lg shadow-blue-500/30'
                    : status === 'solved'
                      ? 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60'
                      : status === 'failed'
                        ? 'bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/40 dark:text-orange-300 dark:hover:bg-orange-900/60'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/20'
                }`}
              >
                <div className="flex items-baseline gap-1 leading-tight">
                  <span className={`text-lg font-extrabold ${
                    isCurrent ? 'text-white' : status === 'solved' ? 'text-green-600 dark:text-green-400' : status === 'failed' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-800 dark:text-gray-200'
                  }`}>
                    {globalIndex}
                  </span>
                  <span className={`text-sm font-bold font-mono ${
                    isCurrent ? 'text-blue-200' : status === 'solved' ? 'text-green-500/70 dark:text-green-400/70' : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {p.stipulation}
                  </span>
                </div>

                <span className={`text-[11px] font-semibold leading-tight truncate max-w-full ${
                  isCurrent ? 'text-blue-100' : status === 'solved' ? 'text-green-600/70 dark:text-green-500/70' : status === 'failed' ? 'text-orange-600/70' : 'text-gray-600 dark:text-gray-300'
                }`}>
                  {p.authors[0]?.split(',')[0] || ''}
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
                  <span className="absolute top-0.5 right-1 text-blue-200 text-xs">&#9654;</span>
                )}
              </button>
            );
          })}
          </div>
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
                          ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 font-bold'
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
