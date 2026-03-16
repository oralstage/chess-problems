import type { SolveStatus } from '../hooks/useProblem';

interface FeedbackPanelProps {
  status: SolveStatus;
  feedback: string;
  moveHistory: string[];
  hintActive: boolean;
  onReset: () => void;
  onShowSolution: () => void;
  onNextProblem: () => void;
  onShowHint: () => void;
  onHideHint?: () => void;
  onAnalyze?: () => void;
  analyzing?: boolean;
  analysisResult?: string | null;
  stockfishLoading?: boolean;
  refutationText?: string | null;
  analysisActive?: boolean;
}

export function FeedbackPanel({
  status,
  moveHistory,
  hintActive,
  onReset,
  onShowSolution,
  onNextProblem,
  onShowHint,
  onHideHint,
  onAnalyze,
  analyzing,
  analysisResult,
  stockfishLoading,
  refutationText,
  analysisActive,
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

      {/* Success */}
      {status === 'correct' && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onReset}
              className="px-3 py-1.5 text-xs bg-gray-200 text-gray-600 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 transition-colors"
            >
              Try Again
            </button>
            {onAnalyze && (
              <button
                onClick={onAnalyze}
                className={`px-2.5 py-1.5 text-xs rounded transition-colors ${
                  analysisActive
                    ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                    : 'bg-gray-200 text-gray-500 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                }`}
              >
                {analyzing ? '...' : analysisActive ? 'Stop' : 'Analyze'}
              </button>
            )}
            {stockfishLoading && (
              <span className="text-xs text-gray-400">Loading Stockfish...</span>
            )}
            {analysisResult && !analyzing && (
              <span className="text-xs text-amber-600 dark:text-amber-400">{analysisResult}</span>
            )}
          </div>
          <button
            onClick={onNextProblem}
            className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            Next →
          </button>
        </div>
      )}

      {/* Solving state */}
      {status === 'solving' && (
        <div className="flex gap-2">
          {!hintActive && (
            <button
              onClick={onShowHint}
              className="px-3 py-1.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60 transition-colors font-medium"
            >
              Show Hint
            </button>
          )}
          {hintActive && (
            <button
              onClick={onHideHint}
              className="px-3 py-1.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60 transition-colors font-medium"
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
          <button
            onClick={onShowSolution}
            className="px-3 py-1.5 text-xs bg-gray-200 text-gray-600 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 transition-colors"
          >
            Give Up
          </button>
          {refutationText && (
            <span className="text-xs text-orange-600 dark:text-orange-400 font-medium ml-auto">
              Refutation: {refutationText}
            </span>
          )}
        </div>
      )}

      {/* Viewing solution */}
      {status === 'viewing' && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onReset}
              className="px-3 py-1.5 text-xs bg-gray-200 text-gray-600 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 transition-colors"
            >
              Try Again
            </button>
            {onAnalyze && (
              <button
                onClick={onAnalyze}
                className={`px-2.5 py-1.5 text-xs rounded transition-colors ${
                  analysisActive
                    ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                    : 'bg-gray-200 text-gray-500 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                }`}
              >
                {analyzing ? '...' : analysisActive ? 'Stop' : 'Analyze'}
              </button>
            )}
            {stockfishLoading && (
              <span className="text-xs text-gray-400">Loading Stockfish...</span>
            )}
            {analysisResult && !analyzing && (
              <span className="text-xs text-amber-600 dark:text-amber-400">{analysisResult}</span>
            )}
          </div>
          <button
            onClick={onNextProblem}
            className="px-5 py-2 bg-cp-primary text-white rounded-lg hover:bg-cp-dark transition-colors text-sm font-medium"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
