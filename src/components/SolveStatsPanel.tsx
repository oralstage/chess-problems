import { useState, useEffect } from 'react';
import { fetchSolveStats, type SolveStats } from '../services/api';

interface Props {
  problemId: number;
}

export function SolveStatsPanel({ problemId }: Props) {
  const [stats, setStats] = useState<SolveStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setStats(null);
    fetchSolveStats(problemId)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [problemId]);

  if (loading) {
    return (
      <div className="text-xs text-gray-400 mt-2">
        Loading statistics...
      </div>
    );
  }

  if (!stats || stats.totalAttempts === 0) return null;

  const pct = Math.round(stats.accuracyRate * 100);
  const avgSec = stats.avgTimeSpent ? Math.round(stats.avgTimeSpent / 1000) : null;

  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 select-none">
        Solve Statistics ({stats.totalAttempts} attempt{stats.totalAttempts !== 1 ? 's' : ''})
      </summary>
      <div className="mt-2 space-y-2 text-gray-600 dark:text-gray-300">
        {/* Accuracy */}
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-gray-400 w-20">Accuracy</span>
          <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 max-w-32">
            <div
              className="bg-green-600 h-2.5 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-medium tabular-nums">{pct}%</span>
          <span className="text-gray-400">({stats.correctCount}/{stats.totalAttempts})</span>
        </div>

        {/* Average time */}
        {avgSec !== null && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500 dark:text-gray-400 w-20">Avg time</span>
            <span className="font-medium tabular-nums">
              {avgSec >= 60 ? `${Math.floor(avgSec / 60)}m ${avgSec % 60}s` : `${avgSec}s`}
            </span>
          </div>
        )}

        {/* Common first moves */}
        {stats.commonFirstMoves.length > 0 && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">Most tried first moves</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {stats.commonFirstMoves.map(m => (
                <span
                  key={m.move}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-mono"
                >
                  {m.move}
                  <span className="text-gray-400 text-[10px]">{m.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Common wrong first moves */}
        {stats.commonWrongFirstMoves.length > 0 && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">Common wrong first moves</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {stats.commonWrongFirstMoves.map(m => (
                <span
                  key={m.move}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-mono"
                >
                  {m.move}
                  <span className="text-red-400 text-[10px]">{m.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
