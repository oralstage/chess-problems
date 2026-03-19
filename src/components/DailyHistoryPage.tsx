import { useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Genre, ChessProblem, ProblemProgress } from '../types';
import { fetchDailyHistory, metaToChessProblem, type DailyHistoryEntry } from '../services/api';

interface DailyHistoryPageProps {
  progress: Record<Genre, ProblemProgress>;
  onSelectProblem: (genre: Genre, problem: ChessProblem, date: string) => void;
  onClose: () => void;
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = today.getTime() - target.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return target.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: y !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function DailyHistoryPage({ progress, onSelectProblem, onClose }: DailyHistoryPageProps) {
  const [entries, setEntries] = useState<(DailyHistoryEntry & { problem: ChessProblem })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchDailyHistory(30)
      .then(data => {
        if (cancelled) return;
        setEntries(data.map(entry => ({
          ...entry,
          problem: metaToChessProblem(entry),
        })));
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const directProgress = progress.direct || {};

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col p-4 max-w-3xl mx-auto w-full min-h-0">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            Daily Problems
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          {loading ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">No daily problems available.</div>
          ) : (
            <div className="space-y-0.5">
              {entries.map((entry) => {
                const status = directProgress[String(entry.id)];
                return (
                  <button
                    key={entry.date}
                    onClick={() => onSelectProblem('direct' as Genre, entry.problem, entry.date)}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-colors flex gap-3"
                  >
                    <div className="shrink-0 rounded overflow-hidden relative" style={{ width: 56, height: 56 }}>
                      <Chessboard
                        position={entry.problem.fen}
                        boardWidth={56}
                        arePiecesDraggable={false}
                        animationDuration={0}
                        customBoardStyle={{ borderRadius: '0' }}
                        customDarkSquareStyle={{ backgroundColor: '#779952' }}
                        customLightSquareStyle={{ backgroundColor: '#edeed1' }}
                      />
                      {status && (
                        <span className={`absolute top-0 right-0 w-4 h-4 flex items-center justify-center text-[8px] font-bold text-white rounded-bl ${status === 'solved' ? 'bg-green-500' : 'bg-orange-500'}`}>
                          {status === 'solved' ? '✓' : '✗'}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-green-700 dark:text-green-400">{formatDateLabel(entry.date)}</span>
                        <span className="px-1.5 py-0.5 rounded text-xs font-bold font-mono bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">{entry.stipulation}</span>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 truncate mt-0.5">{entry.authors.join(', ')}</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {entry.sourceName || ''}{entry.sourceYear ? `, ${entry.sourceYear}` : ''}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
