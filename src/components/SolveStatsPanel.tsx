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
      <div className="absolute inset-0 bg-[var(--ink)]/45" onClick={onClose} />
      <div className="nb-card nb-shadow-nudge relative max-w-sm w-full mx-4 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">Solve Statistics</h3>
          <button onClick={onClose} className="nb-icon p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-2 text-sm">
          {/* Same word as the info modal for the same number — and "Solved"
              now counts solves, not attempts (it said "Solved: 8 times" when
              8 included the give-ups). */}
          <div>
            <span className="text-[var(--faint)] font-semibold">Players: </span>
            <span className="text-[var(--ink)] font-extrabold">{stats.players ?? stats.uniqueSolvers}</span>
          </div>
          <div>
            <span className="text-[var(--faint)] font-semibold">Solved: </span>
            <span className="text-[var(--ink)] font-extrabold">{stats.correctCount} time{stats.correctCount !== 1 ? 's' : ''}</span>
          </div>

          {stats.movesByNumber && stats.movesByNumber.length > 0 && (() => {
            const firstMove = stats.movesByNumber.find(g => g.moveNumber === 1);
            if (!firstMove || firstMove.moves.length === 0) return null;
            return (
              <div className="pt-1">
                <span className="text-[var(--faint)] font-semibold">First moves tried: </span>
                <span className="font-mono">
                  {firstMove.moves.map((m, i) => (
                    <span key={m.move}>
                      {i > 0 ? <span className="text-[var(--faint)]">, </span> : ''}
                      <span className={m.correct ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-900 dark:text-gray-100'}>
                        {m.move}
                      </span>
                      <span className="text-[var(--faint)] text-xs font-semibold"> ({m.count})</span>
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
