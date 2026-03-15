import { useState, useMemo } from 'react';
import type { ChessProblem, ProblemProgress } from '../types';

interface ProblemListProps {
  problems: ChessProblem[];
  progress: ProblemProgress;
  currentProblemId: number | null;
  onSelectProblem: (problem: ChessProblem) => void;
  onClose: () => void;
}

// Grid: 5 columns x 5 rows = 25 per page
const COLS = 5;
const ROWS = 5;
const PAGE_SIZE = COLS * ROWS;

export function ProblemList({ problems, progress, currentProblemId, onSelectProblem, onClose }: ProblemListProps) {
  const solved = Object.values(progress).filter(s => s === 'solved').length;

  const currentIdx = problems.findIndex(p => p.id === currentProblemId);
  const initialPage = currentIdx >= 0 ? Math.floor(currentIdx / PAGE_SIZE) : 0;
  const [page, setPage] = useState(initialPage);

  const totalPages = Math.ceil(problems.length / PAGE_SIZE);
  const pageProblems = useMemo(
    () => problems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [problems, page],
  );

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col" onClick={onClose}>
      <div
        className="flex-1 flex flex-col p-4 max-w-3xl mx-auto w-full"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h3 className="text-lg font-bold text-white">
            Problems <span className="text-sm font-normal text-gray-400">({solved}/{problems.length} solved)</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Grid of problems - fills available space */}
        <div
          className="flex-1 grid gap-1.5"
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
                className={`rounded-lg flex flex-col items-center justify-center gap-1 transition-all text-center relative overflow-hidden ${
                  isCurrent
                    ? 'bg-blue-600 text-white ring-2 ring-blue-400 shadow-lg shadow-blue-500/30'
                    : status === 'solved'
                      ? 'bg-green-900/40 text-green-300 hover:bg-green-900/60'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                {/* Problem number */}
                <span className={`text-xl font-bold leading-tight ${
                  isCurrent ? 'text-white' : status === 'solved' ? 'text-green-400' : 'text-gray-200'
                }`}>
                  {globalIndex}
                </span>

                {/* Author (truncated) */}
                <span className={`text-xs leading-tight truncate max-w-full px-1 ${
                  isCurrent ? 'text-blue-200' : status === 'solved' ? 'text-green-500/70' : 'text-gray-400'
                }`}>
                  {p.authors[0]?.split(',')[0] || ''}
                </span>

                {/* Source + year */}
                <span className={`text-[11px] leading-tight truncate max-w-full px-1 ${
                  isCurrent ? 'text-blue-200/60' : status === 'solved' ? 'text-green-600/60' : 'text-gray-500'
                }`}>
                  {p.sourceName ? `${p.sourceName}${p.sourceYear ? ', ' + p.sourceYear : ''}` : p.stipulation}
                </span>

                {/* Solved check */}
                {status === 'solved' && (
                  <span className="absolute top-1 right-1.5 text-green-400 text-xs font-bold">✓</span>
                )}

                {/* Current indicator */}
                {isCurrent && (
                  <span className="absolute top-1 right-1.5 text-blue-200 text-xs">▶</span>
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
              className="w-10 h-10 text-sm rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors text-gray-300"
            >
              «
            </button>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="w-10 h-10 text-sm rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors text-gray-300"
            >
              ‹
            </button>

            <div className="flex items-center justify-center w-48">
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
                    <span key={`e${idx}`} className="w-8 text-center text-sm text-gray-500">…</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setPage(item)}
                      className={`w-9 h-9 text-sm rounded-lg transition-colors ${
                        page === item
                          ? 'bg-cp-primary text-white font-bold'
                          : 'hover:bg-white/10 text-gray-400'
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
              className="w-10 h-10 text-sm rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors text-gray-300"
            >
              ›
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={page === totalPages - 1}
              className="w-10 h-10 text-sm rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors text-gray-300"
            >
              »
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
