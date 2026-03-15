import { useState, useMemo } from 'react';
import type { ChessProblem, ProblemProgress } from '../types';

interface ProblemListProps {
  problems: ChessProblem[];
  progress: ProblemProgress;
  currentProblemId: number | null;
  onSelectProblem: (problem: ChessProblem) => void;
  onClose: () => void;
}

const COLS = 4;
const ROWS = 5;
const PAGE_SIZE = COLS * ROWS;

export function ProblemList({ problems, progress, currentProblemId, onSelectProblem, onClose }: ProblemListProps) {
  const solved = Object.values(progress).filter(s => s === 'solved').length;

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

  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return problems;
    return problems.filter(p => p.stipulation === filter);
  }, [problems, filter]);

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

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex flex-col" onClick={onClose}>
      <div
        className="flex-1 flex flex-col p-4 max-w-3xl mx-auto w-full"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            Problems <span className="text-base font-normal text-gray-400 dark:text-gray-400">({solved}/{problems.length} solved)</span>
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

        {/* Grid of problems */}
        <div
          className="flex-1 grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridTemplateRows: `repeat(${ROWS}, 1fr)`,
          }}
        >
          {pageProblems.map((p, i) => {
            const status = progress[String(p.id)];
            const isCurrent = p.id === currentProblemId;
            const globalIndex = page * PAGE_SIZE + i + 1;

            return (
              <button
                key={p.id}
                onClick={() => onSelectProblem(p)}
                className={`rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all text-center relative overflow-hidden p-2 ${
                  isCurrent
                    ? 'bg-blue-600 text-white ring-2 ring-blue-400 shadow-lg shadow-blue-500/30'
                    : status === 'solved'
                      ? 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/20'
                }`}
              >
                <span className={`text-2xl font-extrabold leading-tight ${
                  isCurrent ? 'text-white' : status === 'solved' ? 'text-green-600 dark:text-green-400' : 'text-gray-800 dark:text-gray-200'
                }`}>
                  {globalIndex}
                </span>

                <span className={`text-xs font-mono leading-tight ${
                  isCurrent ? 'text-blue-200' : status === 'solved' ? 'text-green-500/60 dark:text-green-400/60' : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {p.stipulation}
                </span>

                <span className={`text-sm font-semibold leading-tight truncate max-w-full px-1 ${
                  isCurrent ? 'text-blue-100' : status === 'solved' ? 'text-green-600/70 dark:text-green-500/70' : 'text-gray-600 dark:text-gray-300'
                }`}>
                  {p.authors[0]?.split(',')[0] || ''}
                </span>

                <span className={`text-xs leading-tight truncate max-w-full px-1 ${
                  isCurrent ? 'text-blue-200/60' : status === 'solved' ? 'text-green-500/50 dark:text-green-600/60' : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {p.sourceName ? `${p.sourceName}${p.sourceYear ? ', ' + p.sourceYear : ''}` : ''}
                </span>

                {status === 'solved' && (
                  <span className="absolute top-1.5 right-2 text-green-500 dark:text-green-400 text-sm font-bold">&#10003;</span>
                )}

                {isCurrent && (
                  <span className="absolute top-1.5 right-2 text-blue-200 text-sm">&#9654;</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center mt-3 shrink-0">
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
