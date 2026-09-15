import type { SolveStatus } from '../hooks/useProblem';
import { type RatedDifficulty, RATED_DIFFICULTIES, RATED_DIFFICULTY_LABEL, RATED_DIFFICULTY_OFFSET } from '../utils/ratedDifficulty';

interface FeedbackPanelProps {
  status: SolveStatus;
  feedback: string;
  moveHistory: string[];
  /** True while the opponent's reply is on its way. Nothing under the board
   *  may appear or disappear during that window: the whole point of the pause
   *  is that the only thing moving is the piece. */
  waitingForAutoPlay?: boolean;
  hintActive: boolean;
  onReset: () => void;
  onShowSolution: () => void;
  onNextProblem?: () => void;
  onRandomProblem?: () => void;
  onShowHint: () => void;
  onHideHint?: () => void;
  onAnalyze?: () => void;
  /** Opens the free-movement analysis board (solving state only). */
  onAnalysisBoard?: () => void;
  analyzing?: boolean;
  analysisResult?: string | null;
  stockfishLoading?: boolean;
  refutationText?: string | null;
  analysisActive?: boolean;
  lichessAnalysisUrl?: string;
  onPlayEngine?: () => void;
  onGoHome?: () => void;
  onMoreProblems?: () => void;
  onPrevDaily?: () => void;
  onNextDaily?: () => void;
  moreCategoryLabel?: string;
  solutionLoading?: boolean;
  ratingDelta?: number | null;
  playerRating?: number;
  playerRd?: number;
  problemRating?: number;
  problemRatingDelta?: number | null;
  hideHintUntilWrong?: boolean;
  /** No hint to give: the solution cannot be played on this board. */
  hideHint?: boolean;
  /** A board set as an exercise — a column, a class, a set to be handed in —
      is not one to be given up on. Off by default: most boards are not
      exercises, and the site's own never withholds it. */
  hideGiveUp?: boolean;
  wrongMoveCount?: number;
  onBackToRated?: () => void;
  reviewNextDays?: number;
  classicBoard?: boolean;
  ratedDifficulty?: RatedDifficulty;
  onChangeDifficulty?: (d: RatedDifficulty) => void;
  /** Multi-solution helpmates: how many solutions exist / are found. */
  solutionsTotal?: number;
  solutionsFound?: number;
  duplex?: { black: number; white: number } | null;
  /** The diagram is Black's move (a Black-to-move study, a retro deduced
   *  as Black's turn): the first entry is "1..." and White's moves carry
   *  the numbers. Helpmates keep their own convention (Black's move is 1.). */
  blackToMoveFirst?: boolean;
  /** Rated multi-solution problem underway: the pool can't be changed
   *  mid-match, or switching would be a free escape from the hard half. */
  difficultyLocked?: boolean;
  /** Opens the report sheet. Offered only once the solve is decided:
   *  while solving, nobody can tell a broken problem from a hard one. */
  onReportIssue?: () => void;
}

const COUNT_WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

export function FeedbackPanel({
  status,
  feedback,
  moveHistory,
  waitingForAutoPlay,
  hintActive,
  onReset,
  onShowSolution,
  onNextProblem,
  onRandomProblem,
  onShowHint,
  onHideHint,
  onAnalyze,
  onAnalysisBoard,
  analyzing,
  analysisResult,
  stockfishLoading,
  refutationText,
  analysisActive,
  lichessAnalysisUrl,
  onPlayEngine,
  onGoHome,
  onMoreProblems,
  onPrevDaily,
  onNextDaily,
  moreCategoryLabel,
  solutionLoading,
  ratingDelta,
  playerRating,
  playerRd,
  problemRating,
  problemRatingDelta,
  hideHintUntilWrong,
  hideHint,
  hideGiveUp,
  wrongMoveCount = 0,
  onBackToRated,
  reviewNextDays,
  classicBoard,
  ratedDifficulty,
  onChangeDifficulty,
  solutionsTotal,
  solutionsFound = 0,
  duplex = null,
  blackToMoveFirst = false,
  difficultyLocked,
  onReportIssue,
}: FeedbackPanelProps) {
  return (
    <div className="space-y-3">
      {/* Move history (only during solving — after solving, Solution section shows same info) */}
      {moveHistory.length > 0 && status === 'solving' && !waitingForAutoPlay && (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          <span className="text-xs text-gray-400">Moves: </span>
          {moveHistory.map((m, i) => {
            // Which entries open a numbered pair: even indices normally;
            // with Black to move first, the opening black move reads "1..."
            // and White's moves (odd indices) carry the numbers.
            const numbered = blackToMoveFirst ? i % 2 === 1 : i % 2 === 0;
            const label = blackToMoveFirst
              ? (i === 0 ? '1... ' : numbered ? `${Math.floor((i - 1) / 2) + 2}. ` : '')
              : (numbered ? `${Math.floor(i / 2) + 1}. ` : '');
            return (
              <span key={i}>
                {label && <span className="text-gray-400">{label}</span>}
                <span className={numbered ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}>
                  {m}{' '}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* Multi-solution helpmates: the count is part of the stipulation
          ("h#2, 3 solutions" in print), so it shows before any move. */}
      {solutionsTotal != null && solutionsTotal > 1 && status === 'solving' && (
        <div className="nb-panel flex items-center gap-2 py-1.5 px-3 text-sm">
          <span className="font-bold text-[var(--ink)] shrink-0">
            {duplex ? 'Duplex' : `${solutionsTotal} solutions`}
          </span>
          <span className={duplex ? 'text-[var(--ink)] font-bold' : 'text-[var(--muted)]'}>
            {duplex && (
              <>
                — {solutionsTotal} solutions: {countWord(duplex.black)} with Black to play,{' '}
                {countWord(duplex.white)} with White to play (Black and White mate the white king).{' '}
              </>
            )}
            {duplex ? 'Found' : '— found'} {solutionsFound}/{solutionsTotal}.{' '}
            {feedback || (duplex ? '' : 'All of them make the solve.')}
          </span>
        </div>
      )}

      {/* Next review interval (review mode only, shown after solving) */}
      {!classicBoard && reviewNextDays != null && (
        <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-[var(--surface-2)] dark:bg-[var(--surface-2)] text-[var(--ink)] dark:text-[var(--muted)] text-sm">
          <span>🔁</span>
          <span>Next review: <strong>~{reviewNextDays} day{reviewNextDays !== 1 ? 's' : ''}</strong></span>
        </div>
      )}

      {/* Rating bar (rated mode) */}
      {!classicBoard && playerRating != null && (
        <div className="nb-panel flex items-center gap-3 py-1.5 px-3">
          <span className="text-base font-semibold text-gray-700 dark:text-gray-200">
            Your rating: {(playerRd ?? 350) > 200 ? '~' : ''}{Math.round(ratingDelta != null ? playerRating - ratingDelta : playerRating)}
          </span>
          {ratingDelta != null && (
            <span className={`text-base font-bold ${ratingDelta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-[var(--bad)] dark:text-[var(--bad)]'}`}>
              {ratingDelta >= 0 ? '+' : ''}{ratingDelta}
            </span>
          )}
          {ratedDifficulty && onChangeDifficulty && (
            <select
              value={ratedDifficulty}
              onChange={(e) => onChangeDifficulty(e.target.value as RatedDifficulty)}
              disabled={difficultyLocked}
              title={difficultyLocked ? 'Finish this problem (or give up) first' : undefined}
              className="nb-input ml-auto text-xs px-2.5 py-1 focus:outline-none disabled:opacity-50"
              aria-label="Difficulty"
            >
              {RATED_DIFFICULTIES.map(d => {
                const o = RATED_DIFFICULTY_OFFSET[d];
                return (
                  <option key={d} value={d}>
                    {RATED_DIFFICULTY_LABEL[d]}{o === 0 ? '' : ` (${o > 0 ? '+' : ''}${o})`}
                  </option>
                );
              })}
            </select>
          )}
          {problemRating != null && (status === 'correct' || status === 'viewing') && (
            <span className={`text-xs text-gray-500 dark:text-gray-300 ${ratedDifficulty && onChangeDifficulty ? '' : 'ml-auto'}`}>
              Problem: {Math.round(problemRatingDelta != null ? problemRating - problemRatingDelta : problemRating)}
            </span>
          )}
        </div>
      )}

      {/* Success */}
      {status === 'correct' && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onAnalyze && (
              <button
                onClick={onAnalyze}
                className={`nb-btn px-2.5 py-1.5 text-xs ${
                  analysisActive ? 'bg-[var(--ink)] text-[var(--surface)]' : ''
                }`}
              >
                {analyzing ? '...' : analysisActive ? 'Stop' : 'Engine'}
              </button>
            )}
            {lichessAnalysisUrl && (
              <a href={lichessAnalysisUrl} target="_blank" rel="noopener noreferrer"
                className="nb-btn px-2.5 py-1.5 text-xs">
                Lichess ↗
              </a>
            )}
            {onPlayEngine && (
              <button onClick={onPlayEngine} className="nb-btn nb-btn-key px-4 py-2 text-sm">
                Play vs engine
              </button>
            )}
            {stockfishLoading && (
              <span className="text-xs text-gray-400">Loading Stockfish...</span>
            )}
            {analysisResult && !analyzing && (
              <span className="text-xs text-[var(--ink)] dark:text-[var(--ink)]">{analysisResult}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onReset}
              className="nb-btn px-4 py-2 text-sm"
            >
              Try Again
            </button>
            {onGoHome ? (
              <>
                <button
                  onClick={onGoHome}
                  className="nb-btn px-4 py-2 text-sm"
                >
                  Home
                </button>
                {onMoreProblems && (
                  <button
                    onClick={onMoreProblems}
                    className="nb-btn nb-btn-key px-5 py-2 text-sm"
                  >
                    {moreCategoryLabel || 'More Problems'} →
                  </button>
                )}
              </>
            ) : (
              <>
                {onBackToRated && (
                  <button
                    onClick={onBackToRated}
                    className="nb-btn nb-btn-key px-5 py-2 text-sm"
                  >
                    Back to Rated
                  </button>
                )}
                {onNextProblem && (
                  <button
                    onClick={onNextProblem}
                    className="nb-btn nb-btn-key px-5 py-2 text-sm"
                  >
                    Next
                  </button>
                )}
                {onRandomProblem && (
                  <button
                    onClick={onRandomProblem}
                    className="nb-btn px-3 py-2 text-sm"
                    title="Random problem"
                  >
                    Random
                  </button>
                )}
              </>
            )}
          </div>
          {(onPrevDaily || onNextDaily) && (
            <div className="flex items-center justify-center gap-3 mt-1">
              {onPrevDaily && (
                <button onClick={onPrevDaily} className="nb-btn px-3 py-1.5 text-xs">
                  Previous
                </button>
              )}
              {onNextDaily && (
                <button onClick={onNextDaily} className="nb-btn px-3 py-1.5 text-xs">
                  Next
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Solving state */}
      {status === 'solving' && (
        <div className="flex items-center gap-2">
          {solutionLoading && (
            <span className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">Loading...</span>
          )}
          {!classicBoard && !solutionLoading && !hintActive && !hideHint && !(hideHintUntilWrong && wrongMoveCount === 0) && (
            <button
              onClick={onShowHint}
              className="nb-btn px-3 py-1.5 text-xs"
            >
              Show Hint
            </button>
          )}
          {!classicBoard && !solutionLoading && hintActive && (
            <button
              onClick={onHideHint}
              className="nb-btn px-3 py-1.5 text-xs"
            >
              Hide Hint
            </button>
          )}
          {moveHistory.length > 0 && !waitingForAutoPlay && (
            <button
              onClick={onReset}
              className="nb-btn px-3 py-1.5 text-xs"
            >
              Reset
            </button>
          )}
          {!classicBoard && !solutionLoading && !hideGiveUp && (
            <button
              onClick={onShowSolution}
              className="nb-btn px-3 py-1.5 text-xs"
            >
              Give Up
            </button>
          )}
          {onAnalysisBoard && (
            <button
              onClick={onAnalysisBoard}
              className="nb-btn px-3 py-1.5 text-xs"
              style={{ backgroundColor: 'var(--card-help)' }}
            >
              Analysis board
            </button>
          )}
          {refutationText && (
            <span className="text-xs text-[var(--bad)] dark:text-[var(--bad)] font-medium">
              {refutationText}
            </span>
          )}
          {/* Event problems (WCSC): the way back to the event list stays in
              reach while solving, where Next/Random would otherwise sit. */}
          {!classicBoard && onGoHome && onMoreProblems && (
            <div className="ml-auto">
              <button onClick={onMoreProblems} className="nb-btn nb-btn-key px-3 py-1.5 text-xs">
                {moreCategoryLabel || 'Back'} →
              </button>
            </div>
          )}
          {!classicBoard && !onGoHome && (
            <div className="ml-auto flex items-center gap-1.5">
              {onNextProblem && (
                <button
                  onClick={onNextProblem}
                  className="nb-btn nb-btn-key px-3 py-1.5 text-xs"
                >
                  Next
                </button>
              )}
              {onRandomProblem && (
                <button
                  onClick={onRandomProblem}
                  className="nb-btn px-3 py-1.5 text-xs"
                  title="Random problem"
                >
                  Random
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Viewing solution */}
      {status === 'viewing' && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onAnalyze && (
              <button
                onClick={onAnalyze}
                className={`nb-btn px-2.5 py-1.5 text-xs ${
                  analysisActive ? 'bg-[var(--ink)] text-[var(--surface)]' : ''
                }`}
              >
                {analyzing ? '...' : analysisActive ? 'Stop' : 'Engine'}
              </button>
            )}
            {lichessAnalysisUrl && (
              <a href={lichessAnalysisUrl} target="_blank" rel="noopener noreferrer"
                className="nb-btn px-2.5 py-1.5 text-xs">
                Lichess ↗
              </a>
            )}
            {onPlayEngine && (
              <button onClick={onPlayEngine} className="nb-btn nb-btn-key px-4 py-2 text-sm">
                Play vs engine
              </button>
            )}
            {stockfishLoading && (
              <span className="text-xs text-gray-400">Loading Stockfish...</span>
            )}
            {analysisResult && !analyzing && (
              <span className="text-xs text-[var(--ink)] dark:text-[var(--ink)]">{analysisResult}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onReset}
              className="nb-btn px-3 py-1.5 text-xs"
            >
              Try Again
            </button>
            {onGoHome ? (
              <>
                <button
                  onClick={onGoHome}
                  className="nb-btn px-4 py-2 text-sm"
                >
                  Home
                </button>
                {onMoreProblems && (
                  <button
                    onClick={onMoreProblems}
                    className="nb-btn nb-btn-key px-5 py-2 text-sm"
                  >
                    {moreCategoryLabel || 'More Problems'} →
                  </button>
                )}
              </>
            ) : (
              <>
                {onBackToRated && (
                  <button
                    onClick={onBackToRated}
                    className="nb-btn nb-btn-key px-5 py-2 text-sm"
                  >
                    Back to Rated
                  </button>
                )}
                {onNextProblem && (
                  <button
                    onClick={onNextProblem}
                    className="nb-btn nb-btn-key px-5 py-2 text-sm"
                  >
                    Next
                  </button>
                )}
                {onRandomProblem && (
                  <button
                    onClick={onRandomProblem}
                    className="nb-btn px-3 py-2 text-sm"
                    title="Random problem"
                  >
                    Random
                  </button>
                )}
              </>
            )}
          </div>
          {(onPrevDaily || onNextDaily) && (
            <div className="flex items-center justify-center gap-3 mt-1">
              {onPrevDaily && (
                <button onClick={onPrevDaily} className="nb-btn px-3 py-1.5 text-xs">
                  Previous
                </button>
              )}
              {onNextDaily && (
                <button onClick={onNextDaily} className="nb-btn px-3 py-1.5 text-xs">
                  Next
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* The way to say a problem misbehaved. It sits under both decided
          states rather than inside either: what gets reported is the same
          whether the solve went through or not, and while solving there is
          nothing to tell a broken problem from a hard one. */}
      {!classicBoard && onReportIssue && (status === 'correct' || status === 'viewing') && (
        <div className="flex justify-end">
          <button
            onClick={onReportIssue}
            className="nb-btn px-3 py-1.5 text-xs"
          >
            {/* The button is the signpost, so it says plainly what kind of
                button it is; the sheet it opens does the talking. */}
            ⚠ Bug report
          </button>
        </div>
      )}
    </div>
  );
}
