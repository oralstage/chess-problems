import { useState, useEffect } from 'react';
import { fetchSolveStats, type SolveStats } from '../services/api';

export function useSolveStats(problemId: number | null) {
  const [stats, setStats] = useState<SolveStats | null>(null);

  useEffect(() => {
    if (!problemId) { setStats(null); return; }
    setStats(null);
    fetchSolveStats(problemId)
      .then(setStats)
      .catch(() => setStats(null));
  }, [problemId]);

  return stats;
}

export function SolveStatsModal({ stats, onClose }: { stats: SolveStats; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-sm w-full mx-4 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Solve Statistics</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <div>
            <span className="text-gray-400 dark:text-gray-500">Solved: </span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">{stats.totalAttempts} time{stats.totalAttempts !== 1 ? 's' : ''}</span>
          </div>
          <div>
            <span className="text-gray-400 dark:text-gray-500">Solvers: </span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">{stats.uniqueSolvers}</span>
          </div>

          {stats.movesByNumber && stats.movesByNumber.length > 0 && (() => {
            const firstMove = stats.movesByNumber.find(g => g.moveNumber === 1);
            if (!firstMove || firstMove.moves.length === 0) return null;
            return (
              <div className="pt-1">
                <span className="text-gray-400 dark:text-gray-500">First moves tried: </span>
                <span className="font-mono">
                  {firstMove.moves.map((m, i) => (
                    <span key={m.move}>
                      {i > 0 ? <span className="text-gray-400">, </span> : ''}
                      <span className={m.correct ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-900 dark:text-gray-100'}>
                        {m.move}
                      </span>
                      <span className="text-gray-400 dark:text-gray-500 text-xs"> ({m.count})</span>
                    </span>
                  ))}
                </span>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
