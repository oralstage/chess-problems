import type { ChessProblem } from '../types';
import { findTheme } from '../data/themes';

interface ProblemCardProps {
  problem: ChessProblem;
  showThemes?: boolean;
}

const GENRE_LABELS: Record<string, { label: string; labelJa: string; color: string }> = {
  direct: { label: 'Direct Mate', labelJa: 'ダイレクトメイト', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  help: { label: 'Helpmate', labelJa: 'ヘルプメイト', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  self: { label: 'Selfmate', labelJa: 'セルフメイト', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  study: { label: 'Study', labelJa: 'スタディ', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
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
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${genre?.color}`}>
          {genre?.labelJa}
        </span>
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
          {stipulationDisplay(problem.stipulation)}
        </span>
        {problem.award && (
          <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            {problem.award}
          </span>
        )}
      </div>

      <div className="text-sm text-gray-600 dark:text-gray-400">
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {problem.authors.join(', ')}
        </div>
        <div>
          {problem.sourceName}
          {problem.sourceYear && `, ${problem.sourceYear}`}
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500">
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
                className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                title={theme?.description}
              >
                {theme?.nameJa || kw}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
