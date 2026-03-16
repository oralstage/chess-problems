import { useState, useMemo } from 'react';
import type { Genre, ChessProblem, ProblemProgress } from '../types';

const GENRE_LABELS: Record<Genre, string> = {
  direct: 'Direct',
  help: 'Help',
  self: 'Self',
  study: 'Study',
  retro: 'Retro',
};

type HistoryFilter = 'all' | 'solved' | 'failed';

interface HistoryEntry {
  problem: ChessProblem;
  genre: Genre;
  status: 'solved' | 'failed';
  timestamp: number; // epoch ms, 0 = unknown
}

interface HistoryPageProps {
  genreData: Record<Genre, ChessProblem[]>;
  genreLoaded: Record<Genre, boolean>;
  progress: Record<Genre, ProblemProgress>;
  timestamps: Record<string, number>;
  onSelectProblem: (genre: Genre, problem: ChessProblem) => void;
  onClose: () => void;
}

function formatDateLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today.getTime() - target.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function dateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function HistoryPage({
  genreData, genreLoaded, progress, timestamps, onSelectProblem, onClose,
}: HistoryPageProps) {
  const [filter, setFilter] = useState<HistoryFilter>('all');

  const entries = useMemo(() => {
    const result: HistoryEntry[] = [];
    for (const genre of ['direct', 'help', 'self', 'study', 'retro'] as Genre[]) {
      if (!genreLoaded[genre]) continue;
      const prg = progress[genre] || {};
      const problems = genreData[genre];
      const problemMap = new Map(problems.map(p => [String(p.id), p]));

      for (const [id, status] of Object.entries(prg)) {
        if (status !== 'solved' && status !== 'failed') continue;
        const problem = problemMap.get(id);
        if (problem) {
          const tsKey = `${genre}:${id}`;
          result.push({ problem, genre, status, timestamp: timestamps[tsKey] || 0 });
        }
      }
    }
    // Sort by timestamp descending (newest first), unknowns (0) at the end
    result.sort((a, b) => {
      if (a.timestamp === 0 && b.timestamp === 0) return 0;
      if (a.timestamp === 0) return 1;
      if (b.timestamp === 0) return -1;
      return b.timestamp - a.timestamp;
    });
    return result;
  }, [genreData, genreLoaded, progress, timestamps]);

  const filtered = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter(e => e.status === filter);
  }, [entries, filter]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: { label: string; key: string; entries: HistoryEntry[] }[] = [];
    let currentKey = '';
    for (const entry of filtered) {
      const key = entry.timestamp > 0 ? dateKey(entry.timestamp) : '__unknown';
      if (key !== currentKey) {
        currentKey = key;
        groups.push({
          label: entry.timestamp > 0 ? formatDateLabel(entry.timestamp) : 'Earlier',
          key,
          entries: [],
        });
      }
      groups[groups.length - 1].entries.push(entry);
    }
    return groups;
  }, [filtered]);

  const solvedCount = entries.filter(e => e.status === 'solved').length;
  const failedCount = entries.filter(e => e.status === 'failed').length;

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col p-4 max-w-3xl mx-auto w-full min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            History
            <span className="text-base font-normal text-gray-400 ml-1.5">
              ({solvedCount} solved{failedCount > 0 ? `, ${failedCount} failed` : ''})
            </span>
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

        {/* Filter pills */}
        <div className="flex gap-1.5 mb-3 shrink-0">
          {([
            ['all', 'All'],
            ['solved', 'Solved'],
            ['failed', 'Failed'],
          ] as [HistoryFilter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                filter === key
                  ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-400 dark:hover:bg-white/20'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* List */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              {entries.length === 0
                ? 'No problems attempted yet. Start solving!'
                : 'No matching problems.'}
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map((group) => (
                <div key={group.key}>
                  <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 mb-1">
                    {group.label}
                  </div>
                  <div className="space-y-0.5">
                    {group.entries.map((entry) => {
                      const p = entry.problem;
                      return (
                        <button
                          key={`${entry.genre}-${p.id}`}
                          onClick={() => onSelectProblem(entry.genre, p)}
                          className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-colors flex items-center gap-3"
                        >
                          {/* Status icon */}
                          <span className={`text-sm font-bold shrink-0 ${
                            entry.status === 'solved'
                              ? 'text-green-500 dark:text-green-400'
                              : 'text-orange-500 dark:text-orange-400'
                          }`}>
                            {entry.status === 'solved' ? '✓' : '✗'}
                          </span>

                          {/* Problem info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="font-bold text-sm text-gray-800 dark:text-gray-200 font-mono">
                                {p.stipulation}
                              </span>
                              <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                                {p.authors[0]?.split(',')[0] || 'Unknown'}
                                {p.sourceYear ? ` (${p.sourceYear})` : ''}
                              </span>
                            </div>
                          </div>

                          {/* Genre badge */}
                          <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            entry.genre === 'direct' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' :
                            entry.genre === 'help' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400' :
                            entry.genre === 'self' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400' :
                            entry.genre === 'study' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' :
                            'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400'
                          }`}>
                            {GENRE_LABELS[entry.genre]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
