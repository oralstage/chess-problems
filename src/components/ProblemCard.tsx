import type { ChessProblem } from '../types';
import { findTheme } from '../data/themes';

interface ProblemCardProps {
  problem: ChessProblem;
  showThemes?: boolean;
}

const GENRE_LABELS: Record<string, { label: string; color: string }> = {
  direct: { label: 'Direct Mate', color: 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' },
  help: { label: 'Helpmate', color: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' },
  self: { label: 'Selfmate', color: 'bg-violet-500/10 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400' },
  study: { label: 'Study', color: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400' },
};

function stipulationDisplay(stip: string): string {
  if (stip.startsWith('h#')) return `Helpmate in ${stip.slice(2)}`;
  if (stip.startsWith('s#')) return `Selfmate in ${stip.slice(2)}`;
  if (stip.startsWith('#')) return `Mate in ${stip.slice(1)}`;
  if (stip === '+') return 'White wins';
  if (stip === '=') return 'Draw';
  return stip;
}

export function ProblemCard({ problem, showThemes }: ProblemCardProps) {
  const genre = GENRE_LABELS[problem.genre];

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`px-2 py-0.5 rounded-md text-xs font-semibold tracking-wide ${genre?.color}`}>
          {genre?.label}
        </span>
        <span className="text-base font-bold text-gray-900 dark:text-gray-100 tracking-tight">
          {stipulationDisplay(problem.stipulation)}
        </span>
        {problem.award && (
          <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-yellow-500/10 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400">
            {problem.award}
          </span>
        )}
      </div>

      <div className="text-gray-600 dark:text-gray-400">
        <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
          {problem.authors.join(', ')}
        </div>
        <div className="text-sm truncate">
          {problem.sourceName}
          {problem.sourceYear && `, ${problem.sourceYear}`}
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500 font-mono">
          YACPDB #{problem.id}
        </div>
      </div>

      {showThemes && problem.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {problem.keywords.map(kw => {
            const theme = findTheme(kw);
            return (
              <span
                key={kw}
                className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                title={theme?.description}
              >
                {kw}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
