import { useState, useCallback, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Category, ChessProblem, ProblemProgress } from '../types';
import { CATEGORY_DEFS } from '../types';
import { fetchSiteStats, type SiteStats } from '../services/api';

const EXPANDED_GROUPS_KEY = 'cp-expanded-groups';

interface ModeSelectorProps {
  onSelectMode: (category: Category) => void;
  progress: Record<string, ProblemProgress>;
  problemCounts: Record<Category, number>;
  dailyProblem: ChessProblem | null;
  onSolveDaily: () => void;
  dailySolved: boolean;
  onShowChangelog?: () => void;
}

// Group categories by their group label
function groupCategories() {
  const groups: { label: string | null; categories: typeof CATEGORY_DEFS }[] = [];
  let currentGroup: string | null = null;
  let currentItems: typeof CATEGORY_DEFS = [];

  for (const def of CATEGORY_DEFS) {
    if (def.group !== currentGroup) {
      if (currentItems.length > 0) {
        groups.push({ label: currentGroup, categories: currentItems });
      }
      currentGroup = def.group || null;
      currentItems = [];
    }
    currentItems.push(def);
  }
  if (currentItems.length > 0) {
    groups.push({ label: currentGroup, categories: currentItems });
  }
  return groups;
}

const GROUPS = groupCategories();

const GROUP_BRIEFS: Record<string, string> = {
  'Direct Mates': 'White to move and force checkmate',
  'Helpmates': 'Both sides cooperate to achieve mate',
};

export function ModeSelector({ onSelectMode, progress, problemCounts, dailyProblem, onSolveDaily, dailySolved, onShowChangelog }: ModeSelectorProps) {
  const [siteStats, setSiteStats] = useState<SiteStats | null>(null);
  useEffect(() => {
    fetchSiteStats().then(setSiteStats).catch(() => {});
  }, []);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(EXPANDED_GROUPS_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const toggleGroup = useCallback((label: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      try { localStorage.setItem(EXPANDED_GROUPS_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  // Sum counts for a group
  const groupTotal = (categories: typeof CATEGORY_DEFS) =>
    categories.reduce((sum, c) => sum + (problemCounts[c.category] || 0), 0);

  // Sum solved for a group
  const groupSolved = (categories: typeof CATEGORY_DEFS) =>
    categories.reduce((sum, c) => {
      const p = progress[c.category] || {};
      return sum + Object.values(p).filter(s => s === 'solved').length;
    }, 0);

  return (
    <div className="min-h-[80vh] flex flex-col justify-center py-12">
      {/* ── Hero ── */}
      <div className="px-5 mb-10">
        <div className="flex items-center gap-4 mb-3">
          <svg className="w-14 h-14 sm:w-16 sm:h-16 text-gray-900 dark:text-white" viewBox="0 0 45 45" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 22.5,11.63 L 22.5,6" />
            <path d="M 20,8 L 25,8" />
            <path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 25.5,14.5 24.5,12 22.5,12 C 20.5,12 19.5,14.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25" />
            <path d="M 12.5,37 C 18,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 41.5,25.5 38.5,19.5 C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 19,16 9.5,13 6.5,19.5 C 3.5,25.5 12.5,30 12.5,30 L 12.5,37" />
            <path d="M 12.5,30 C 18,27 27,27 32.5,30" opacity="0.5" />
            <path d="M 12.5,33.5 C 18,30.5 27,30.5 32.5,33.5" opacity="0.5" />
            <path d="M 12.5,37 C 18,34 27,34 32.5,37" opacity="0.5" />
          </svg>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-gray-900 dark:text-white">
            Chess Problems
          </h1>
        </div>
        <p className="text-base text-gray-500 dark:text-gray-400 max-w-lg leading-relaxed">
          Chess problems are composed positions with a unique solution — not tactics from real games, but crafted works of art.
          This site lets you solve them interactively on the board with move validation, Stockfish hints, and solution playback.
          All problems from{' '}
          <a href="https://www.yacpdb.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            YACPDB
          </a>.
        </p>
        {siteStats && siteStats.problemsSolved > 0 && (
          <div className="flex justify-center gap-10 mt-6">
            <div className="text-center">
              <div className="text-4xl sm:text-5xl font-extrabold text-green-600 dark:text-green-400 tabular-nums leading-none">
                {siteStats.uniqueSolvers.toLocaleString()}
              </div>
              <div className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-1.5">
                solvers
              </div>
            </div>
            <div className="text-center">
              <div className="text-4xl sm:text-5xl font-extrabold text-green-600 dark:text-green-400 tabular-nums leading-none">
                {siteStats.problemsSolved.toLocaleString()}
              </div>
              <div className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-1.5">
                problems solved
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Daily Problem ── */}
      {dailyProblem && (
        <div className="px-5 mb-8">
          <button
            onClick={onSolveDaily}
            className="group w-full text-left transition-colors"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold uppercase tracking-wider text-green-600 dark:text-green-400">
                  Daily Problem — {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                {dailySolved && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">
                    Solved &#10003;
                  </span>
                )}
              </div>
              <div className="shrink-0 rounded-lg overflow-hidden shadow-sm" style={{ width: 320, height: 320 }}>
                <Chessboard
                  position={dailyProblem.fen}
                  boardWidth={320}
                  arePiecesDraggable={false}
                  animationDuration={0}
                  customBoardStyle={{ borderRadius: '0' }}
                  customDarkSquareStyle={{ backgroundColor: '#779952' }}
                  customLightSquareStyle={{ backgroundColor: '#edeed1' }}
                />
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white mb-1">
                  Mate in {dailyProblem.moveCount}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {dailyProblem.authors[0]?.split(',')[0] || 'Unknown'}
                  {dailyProblem.sourceYear ? `, ${dailyProblem.sourceYear}` : ''}
                </div>
                <div className="mt-3 flex items-center justify-center gap-1 text-sm font-semibold text-green-600 dark:text-green-400 group-hover:gap-2 transition-all">
                  {dailySolved ? 'View solution' : 'Solve'}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* ── Categories ── */}
      <nav className="space-y-1 px-4">
        {GROUPS.map(group => {
          if (group.label) {
            // Accordion group (Direct Mates, Helpmates)
            const isExpanded = expandedGroups.has(group.label);
            const total = groupTotal(group.categories);
            const solved = groupSolved(group.categories);
            if (total === 0) return null;

            return (
              <div key={group.label}>
                {/* Group header — click to expand/collapse */}
                <button
                  onClick={() => toggleGroup(group.label!)}
                  className="group w-full text-left px-5 py-4 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors duration-150"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                        {group.label}
                      </h2>
                      <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
                        {GROUP_BRIEFS[group.label!] || ''}
                      </p>
                    </div>
                    <span className="text-sm text-gray-400 dark:text-gray-500 tabular-nums shrink-0 ml-4">
                      {solved > 0 && <span className="font-semibold text-gray-600 dark:text-gray-300">{solved}/</span>}
                      {total.toLocaleString()}
                    </span>
                  </div>
                </button>

                {/* Expanded children */}
                {isExpanded && (
                  <div className="ml-6 space-y-0.5">
                    {group.categories.map(mode => {
                      const catTotal = problemCounts[mode.category] || 0;
                      if (catTotal === 0) return null;
                      const catProgress = progress[mode.category] || {};
                      const catSolved = Object.values(catProgress).filter(s => s === 'solved').length;

                      return (
                        <button
                          key={mode.category}
                          onClick={() => onSelectMode(mode.category)}
                          className="group w-full text-left px-5 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors duration-150"
                        >
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200">
                                {mode.title}
                              </h3>
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                {mode.brief}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 ml-4">
                              <span className="text-sm text-gray-400 dark:text-gray-500 tabular-nums">
                                {catSolved > 0 && <span className="font-semibold text-gray-600 dark:text-gray-300">{catSolved}/</span>}
                                {catTotal.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          } else {
            // Standalone categories (Selfmates, Studies, Retros)
            return group.categories.map(mode => {
              const total = problemCounts[mode.category] || 0;
              if (total === 0) return null;
              const catProgress = progress[mode.category] || {};
              const solved = Object.values(catProgress).filter(s => s === 'solved').length;

              return (
                <button
                  key={mode.category}
                  onClick={() => onSelectMode(mode.category)}
                  className="group w-full text-left px-5 py-4 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors duration-150"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                        {mode.title}
                      </h2>
                      <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
                        {mode.brief}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <span className="text-sm text-gray-400 dark:text-gray-500 tabular-nums">
                        {solved > 0 && <span className="font-semibold text-gray-600 dark:text-gray-300">{solved}/</span>}
                        {total.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </button>
              );
            });
          }
        })}
      </nav>

      {/* ── Footer ── */}
      <footer className="text-center mt-16 px-4 space-y-1">
        <div className="flex items-center justify-center gap-3">
          {onShowChangelog && (
            <button
              onClick={onShowChangelog}
              className="text-[11px] text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 underline transition-colors"
            >
              What's new
            </button>
          )}
          <a
            href="https://github.com/oralstage/chess-problems/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 underline transition-colors"
          >
            Feedback &amp; Bug Reports
          </a>
        </div>
        <div className="flex justify-center mt-2">
          <a href="https://ko-fi.com/A0A21W2W51" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#779952] hover:bg-[#6b8a49] text-white text-xs font-medium rounded-full transition-colors"
          >
            ☕ Support on Ko-fi
          </a>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-3">
          Anonymous usage data is collected to improve the site. No personal information is stored.
        </p>
      </footer>
    </div>
  );
}
