import type { SolveStatus } from '../hooks/useProblem';

interface FeedbackPanelProps {
  status: SolveStatus;
  feedback: string;
  moveHistory: string[];
  hintActive: boolean;
  onReset: () => void;
  onShowSolution: () => void;
  onNextProblem?: () => void;
  onRandomProblem?: () => void;
  onShowHint: () => void;
  onHideHint?: () => void;
  onAnalyze?: () => void;
  analyzing?: boolean;
  analysisResult?: string | null;
  stockfishLoading?: boolean;
  refutationText?: string | null;
  analysisActive?: boolean;
  lichessAnalysisUrl?: string;
  lichessPlayUrl?: string;
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
  wrongMoveCount?: number;
  onBackToRated?: () => void;
  reviewNextDays?: number;
}

export function FeedbackPanel({
  status,
  moveHistory,
  hintActive,
  onReset,
  onShowSolution,
  onNextProblem,
  onRandomProblem,
  onShowHint,
  onHideHint,
  onAnalyze,
  analyzing,
  analysisResult,
  stockfishLoading,
  refutationText,
  analysisActive,
  lichessAnalysisUrl,
  lichessPlayUrl,
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
  wrongMoveCount = 0,
  onBackToRated,
  reviewNextDays,
}: FeedbackPanelProps) {
  return (
    <div className="space-y-3">
      {/* Move history (only during solving — after solving, Solution section shows same info) */}
      {moveHistory.length > 0 && status === 'solving' && (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          <span className="text-xs text-gray-400">Moves: </span>
          {moveHistory.map((m, i) => (
            <span key={i}>
              {i % 2 === 0 && <span className="text-gray-400">{Math.floor(i / 2) + 1}. </span>}
              <span className={i % 2 === 0 ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}>
                {m}{' '}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Next review interval (review mode only, shown after solving) */}
      {reviewNextDays != null && (
        <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-sm">
          <span>🔁</span>
          <span>Next review: <strong>~{reviewNextDays} day{reviewNextDays !== 1 ? 's' : ''}</strong></span>
        </div>
      )}

      {/* Rating bar (rated mode) */}
      {playerRating != null && (
        <div className="flex items-center gap-3 py-1.5 px-3 rounded-lg bg-gray-100 dark:bg-gray-800/60">
          <span className="text-base font-semibold text-gray-700 dark:text-gray-200">
            Rating: {(playerRd ?? 350) > 200 ? '~' : ''}{Math.round(ratingDelta != null ? playerRating - ratingDelta : playerRating)}
          </span>
          {ratingDelta != null && (
            <span className={`text-base font-bold ${ratingDelta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
              {ratingDelta >= 0 ? '+' : ''}{ratingDelta}
            </span>
          )}
          {problemRating != null && (status === 'correct' || status === 'viewing') && (
            <span className="text-xs text-gray-500 dark:text-gray-300 ml-auto">
              Problem: {Math.round(problemRatingDelta != null ? problemRating - problemRatingDelta : problemRating)}
            </span>
          )}
        </div>
      )}

      {/* Problem rating (review mode — no player rating shown) */}
      {playerRating == null && problemRating != null && (status === 'correct' || status === 'viewing') && (
        <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-gray-100 dark:bg-gray-800/60">
          <span className="text-xs text-gray-500 dark:text-gray-400">Problem rating:</span>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{Math.round(problemRating)}</span>
        </div>
      )}

      {/* Success */}
      {status === 'correct' && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onAnalyze && (
              <button
                onClick={onAnalyze}
                className={`px-2.5 py-1.5 text-xs rounded transition-colors ${
                  analysisActive
                    ? 'bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600'
                    : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60'
                }`}
              >
                {analyzing ? '...' : analysisActive ? 'Stop' : 'Analyze'}
              </button>
            )}
            {lichessAnalysisUrl && (
              <a href={lichessAnalysisUrl} target="_blank" rel="noopener noreferrer"
                className="px-2.5 py-1.5 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors">
                Analysis ↗
              </a>
            )}
            {lichessPlayUrl && (
              <a href={lichessPlayUrl} target="_blank" rel="noopener noreferrer"
                className="px-2.5 py-1.5 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors">
                Play ↗
              </a>
            )}
            {stockfishLoading && (
              <span className="text-xs text-gray-400">Loading Stockfish...</span>
            )}
            {analysisResult && !analyzing && (
              <span className="text-xs text-amber-600 dark:text-amber-400">{analysisResult}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onReset}
              className="px-4 py-2 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60 transition-colors"
            >
              Try Again
            </button>
            {onGoHome ? (
              <>
                <button
                  onClick={onGoHome}
                  className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Home
                </button>
                {onMoreProblems && (
                  <button
                    onClick={onMoreProblems}
                    className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
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
                    className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    Back to Rated
                  </button>
                )}
                {onNextProblem && (
                  <button
                    onClick={onNextProblem}
                    className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    Next
                  </button>
                )}
                {onRandomProblem && (
                  <button
                    onClick={onRandomProblem}
                    className="px-3 py-2 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60 transition-colors"
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
                <button onClick={onPrevDaily} className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors">
                  Previous
                </button>
              )}
              {onNextDaily && (
                <button onClick={onNextDaily} className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors">
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
          {!solutionLoading && !hintActive && !(hideHintUntilWrong && wrongMoveCount === 0) && (
            <button
              onClick={onShowHint}
              className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60 transition-colors font-medium"
            >
              Show Hint
            </button>
          )}
          {!solutionLoading && hintActive && (
            <button
              onClick={onHideHint}
              className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60 transition-colors font-medium"
            >
              Hide Hint
            </button>
          )}
          {moveHistory.length > 0 && (
            <button
              onClick={onReset}
              className="px-3 py-1.5 text-xs bg-gray-200 text-gray-600 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 transition-colors"
            >
              Reset
            </button>
          )}
          {!solutionLoading && (
            <button
              onClick={onShowSolution}
              className="px-3 py-1.5 text-xs bg-gray-200 text-gray-600 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 transition-colors"
            >
              Give Up
            </button>
          )}
          {refutationText && (
            <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
              Refutation: {refutationText}
            </span>
          )}
          {!onGoHome && (
            <div className="ml-auto flex items-center gap-1.5">
              {onNextProblem && (
                <button
                  onClick={onNextProblem}
                  className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-medium"
                >
                  Next
                </button>
              )}
              {onRandomProblem && (
                <button
                  onClick={onRandomProblem}
                  className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60 transition-colors font-medium"
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
                className={`px-2.5 py-1.5 text-xs rounded transition-colors ${
                  analysisActive
                    ? 'bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600'
                    : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60'
                }`}
              >
                {analyzing ? '...' : analysisActive ? 'Stop' : 'Analyze'}
              </button>
            )}
            {lichessAnalysisUrl && (
              <a href={lichessAnalysisUrl} target="_blank" rel="noopener noreferrer"
                className="px-2.5 py-1.5 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors">
                Analysis ↗
              </a>
            )}
            {lichessPlayUrl && (
              <a href={lichessPlayUrl} target="_blank" rel="noopener noreferrer"
                className="px-2.5 py-1.5 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors">
                Play ↗
              </a>
            )}
            {stockfishLoading && (
              <span className="text-xs text-gray-400">Loading Stockfish...</span>
            )}
            {analysisResult && !analyzing && (
              <span className="text-xs text-amber-600 dark:text-amber-400">{analysisResult}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onReset}
              className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60 transition-colors"
            >
              Try Again
            </button>
            {onGoHome ? (
              <>
                <button
                  onClick={onGoHome}
                  className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Home
                </button>
                {onMoreProblems && (
                  <button
                    onClick={onMoreProblems}
                    className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
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
                    className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    Back to Rated
                  </button>
                )}
                {onNextProblem && (
                  <button
                    onClick={onNextProblem}
                    className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    Next
                  </button>
                )}
                {onRandomProblem && (
                  <button
                    onClick={onRandomProblem}
                    className="px-3 py-2 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60 transition-colors"
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
                <button onClick={onPrevDaily} className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors">
                  Previous
                </button>
              )}
              {onNextDaily && (
                <button onClick={onNextDaily} className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors">
                  Next
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
