import type { ChessProblem } from '../types';
import { getStipulationColorClasses } from '../utils/stipulationColor';

interface ProblemCardProps {
  /** Multi-solution helpmates announce their count, like print does. */
  solutionsTotal?: number;
  problem: ChessProblem;
  problemNumber?: number;
  genrePrefix?: string;
}

function pieceCounts(fen: string): string {
  const board = fen.split(' ')[0];
  let white = 0, black = 0;
  for (const ch of board) {
    if (ch >= 'A' && ch <= 'Z') white++;
    else if (ch >= 'a' && ch <= 'z') black++;
  }
  return `${white}+${black}`;
}

function stipulationDisplay(stip: string): string {
  if (stip.startsWith('h#')) return `h#${stip.slice(2)}`;
  if (stip.startsWith('s#')) return `s#${stip.slice(2)}`;
  if (stip.startsWith('#')) return `#${stip.slice(1)}`;
  if (stip === '+') return 'Win';
  if (stip === '=') return 'Draw';
  return stip;
}

export function ProblemCard({ problem, problemNumber, genrePrefix, solutionsTotal }: ProblemCardProps) {
  const stipColor = getStipulationColorClasses(problem.stipulation, problem.genre);

  return (
    <div className="space-y-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        {problemNumber !== undefined && (
          <span className="text-base font-extrabold text-[var(--ink)] tabular-nums">
            {genrePrefix || ''}{problemNumber}
          </span>
        )}
        <span className={`rounded-full font-extrabold font-mono px-2.5 py-0.5 text-sm border-2 border-[var(--ink)] ${stipColor}`}>
          {stipulationDisplay(problem.stipulation)}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
          {pieceCounts(problem.fen)}
        </span>
        {solutionsTotal != null && solutionsTotal > 1 && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {solutionsTotal} solutions
          </span>
        )}
      </div>

      <div className="text-gray-600 dark:text-gray-400">
        <div className="text-lg font-extrabold text-[var(--ink)] leading-tight truncate">
          {problem.authors.join(', ')}
        </div>
        <div className="text-sm font-semibold text-[var(--faint)] truncate">
          {problem.sourceName}
          {problem.sourceYear && `, ${problem.sourceYear}`}
        </div>
      </div>

    </div>
  );
}
