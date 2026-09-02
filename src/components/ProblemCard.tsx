import type { ChessProblem } from '../types';
import { getStipulationColorClasses } from '../utils/stipulationColor';
import { composerLine } from '../utils/composerName';
import { pieceCounts } from '../utils/pieceCount';

interface ProblemCardProps {
  /** Multi-solution helpmates announce their count, like print does. */
  solutionsTotal?: number;
  /** Duplex helpmate (solutions starting with each side). Part of the
   *  stipulation in print — "h#2 Duplex" — so it shows while solving. */
  duplex?: { black: number; white: number } | null;
  problem: ChessProblem;
  problemNumber?: number;
  genrePrefix?: string;
  /** The composer, the source and the year are a clue to an experienced solver,
      which is why solving tournaments hand out a diagram and a stipulation and
      keep the rest for the solution sheet. Withheld here while the attempt is
      running; the note standing in their place says they are coming. */
  showCredits?: boolean;
}

function stipulationDisplay(stip: string): string {
  if (stip.startsWith('h#')) return `h#${stip.slice(2)}`;
  if (stip.startsWith('s#')) return `s#${stip.slice(2)}`;
  if (stip.startsWith('#')) return `#${stip.slice(1)}`;
  if (stip === '+') return 'Win';
  if (stip === '=') return 'Draw';
  return stip;
}

export function ProblemCard({ problem, problemNumber, genrePrefix, solutionsTotal, duplex = null, showCredits = true }: ProblemCardProps) {
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
          {stipulationDisplay(problem.stipulation)}{duplex ? ' Duplex' : ''}
        </span>
        {/* A duplex's two halves are not "2 solutions": the panel under the
            board spells out how many start with each side. */}
        {!duplex && solutionsTotal != null && solutionsTotal > 1 && (
          <span className="nb-chip px-2.5 py-0.5 text-sm font-bold">
            {solutionsTotal} solutions
          </span>
        )}
        <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
          {pieceCounts(problem.fen)}
        </span>
      </div>

      {/* One box, one height, whichever half is showing. The credit arrives the
          moment the solve is decided, and the board must not jump when it does. */}
      <div className="text-gray-600 dark:text-gray-400 min-h-[2.75rem] flex flex-col justify-center">
        {showCredits ? (
          <>
            {/* Not clipped. A name cut in half is a wrong name — the complaint
                that started this was a Russian composer reduced to "Мар…". */}
            <div className="text-lg font-extrabold text-[var(--ink)] leading-tight break-words">
              {composerLine(problem.authors)}
            </div>
            <div className="text-sm font-semibold text-[var(--faint)] break-words">
              {problem.sourceName}
              {problem.sourceYear && `, ${problem.sourceYear}`}
            </div>
          </>
        ) : (
          <div className="text-sm font-semibold text-[var(--faint)]">
            Composer and source &mdash; shown after the solve
          </div>
        )}
      </div>

    </div>
  );
}
