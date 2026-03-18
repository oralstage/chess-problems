import { useState, useMemo, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Genre, ChessProblem, ProblemProgress } from '../types';
import { fetchProblem, metaToChessProblem } from '../services/api';

const GENRE_LABELS: Record<Genre, string> = {
  direct: 'Direct',
  help: 'Help',
  self: 'Self',
  study: 'Study',
  retro: 'Retro',
};

const GENRE_PREFIX: Record<string, string> = {
  direct: 'D', help: 'H', self: 'S', study: 'E', retro: 'R',
};

type HistoryFilter = 'all' | 'solved' | 'failed';

interface HistoryEntry {
  id: string;
  problem: ChessProblem | null; // null if genre data not loaded yet
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
  const [fetchedProblems, setFetchedProblems] = useState<Map<string, ChessProblem>>(new Map());

  const entries = useMemo(() => {
    const result: HistoryEntry[] = [];
    for (const genre of ['direct', 'help', 'self', 'study', 'retro'] as Genre[]) {
      const prg = progress[genre] || {};
      const problemMap = genreLoaded[genre]
        ? new Map(genreData[genre].map(p => [String(p.id), p]))
        : new Map<string, ChessProblem>();

      for (const [id, status] of Object.entries(prg)) {
        if (status !== 'solved' && status !== 'failed') continue;
        const problem = problemMap.get(id) || fetchedProblems.get(`${genre}:${id}`) || null;
        const tsKey = `${genre}:${id}`;
        result.push({ id, problem, genre, status, timestamp: timestamps[tsKey] || 0 });
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
  }, [genreData, genreLoaded, progress, timestamps, fetchedProblems]);

  // Lazy-fetch problem details for entries without genre data (visible ones only)
  useEffect(() => {
    const toFetch = entries
      .filter(e => !e.problem)
      .slice(0, 20); // limit to avoid too many requests
    if (toFetch.length === 0) return;
    let cancelled = false;
    (async () => {
      const fetched = new Map<string, ChessProblem>();
      for (const entry of toFetch) {
        if (cancelled) break;
        try {
          const full = await fetchProblem(Number(entry.id));
          const p = metaToChessProblem(full, full.solutionText);
          fetched.set(`${entry.genre}:${entry.id}`, p);
        } catch { /* skip */ }
      }
      if (!cancelled && fetched.size > 0) {
        setFetchedProblems(prev => {
          const next = new Map(prev);
          for (const [k, v] of fetched) next.set(k, v);
          return next;
        });
      }
    })();
    return () => { cancelled = true; };
  }, [entries.length]); // re-run when entry count changes

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
                  ? 'bg-green-700 text-white dark:bg-green-600 dark:text-white'
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
                      const prefix = GENRE_PREFIX[entry.genre] || '';
                      return (
                        <button
                          key={`${entry.genre}-${entry.id}`}
                          onClick={() => {
                            if (p) onSelectProblem(entry.genre, p);
                          }}
                          disabled={!p}
                          className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-colors flex gap-3 disabled:opacity-60"
                        >
                          {/* Mini board or placeholder */}
                          <div className="shrink-0 rounded overflow-hidden relative" style={{ width: 56, height: 56 }}>
                            {p ? (
                              <Chessboard
                                position={p.fen}
                                boardWidth={56}
                                arePiecesDraggable={false}
                                animationDuration={0}
                                customBoardStyle={{ borderRadius: '0' }}
                                customDarkSquareStyle={{ backgroundColor: '#779952' }}
                                customLightSquareStyle={{ backgroundColor: '#edeed1' }}
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                <span className="text-lg text-gray-300 dark:text-gray-600">♚</span>
                              </div>
                            )}
                            {/* Status badge on board */}
                            <span className={`absolute top-0 right-0 w-4 h-4 flex items-center justify-center text-[8px] font-bold text-white rounded-bl ${
                              entry.status === 'solved' ? 'bg-green-500' : 'bg-orange-500'
                            }`}>
                              {entry.status === 'solved' ? '✓' : '✗'}
                            </span>
                          </div>

                          {/* Problem info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-sm text-gray-700 dark:text-gray-200">
                                {prefix}{entry.id}
                              </span>
                              {p && (
                                <span className="px-1.5 py-0.5 rounded text-xs font-bold font-mono bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">
                                  {p.stipulation}
                                </span>
                              )}
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                {GENRE_LABELS[entry.genre]}
                              </span>
                            </div>
                            {p ? (
                              <>
                                <div className="text-sm text-gray-600 dark:text-gray-400 truncate mt-0.5">
                                  {p.authors.join(', ')}
                                </div>
                                <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                  {p.sourceName || ''}
                                  {p.sourceYear ? `, ${p.sourceYear}` : ''}
                                </div>
                              </>
                            ) : (
                              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                Loading...
                              </div>
                            )}
                          </div>
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
