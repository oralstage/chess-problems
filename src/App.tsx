import { useState, useCallback, useMemo, useEffect } from 'react';
import { Chess } from 'chess.js';
import { useTheme } from './hooks/useTheme';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useProblem } from './hooks/useProblem';
import { useStockfish } from './hooks/useStockfish';
import { Header } from './components/Header';
import { ModeSelector } from './components/ModeSelector';
import { Board } from './components/Board';
import { ProblemCard } from './components/ProblemCard';
import { FeedbackPanel } from './components/FeedbackPanel';
import { SolutionTree } from './components/SolutionTree';
import { GenreTutorial } from './components/GenreTutorial';
import { ProblemList } from './components/ProblemList';
import { parseSolution } from './services/solutionParser';
import type { AppView, Genre, ProblemProgress, ChessProblem } from './types';

/**
 * Fix FEN for problems where the solution requires en passant but the FEN
 * doesn't have the en passant square set (common in retro problems).
 * Mutates p.fen in-place if a fix is needed.
 */
function fixEnPassantFen(p: ChessProblem): void {
  if (p.solutionTree.length === 0) return;

  const firstColor = p.genre === 'help' ? 'b' : 'w';
  const firstNodes = p.solutionTree.filter(n => n.color === firstColor);

  for (const node of firstNodes) {
    // Check if the move is already playable
    try {
      const chess = new Chess(p.fen);
      const uci = node.moveUci;
      let move;
      if (uci.startsWith('san:')) {
        move = chess.move(uci.slice(4));
      } else if (uci.length >= 4) {
        move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
      }
      if (move) continue; // already works
    } catch { /* fall through to fix attempt */ }

    // Check if this looks like an en passant capture (pawn diagonal move to empty square)
    const uci = node.moveUci;
    if (uci.length < 4 || uci.startsWith('san:')) continue;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const fromCol = from.charCodeAt(0) - 97;
    const toCol = to.charCodeAt(0) - 97;
    const fromRow = parseInt(from[1]);
    const toRow = parseInt(to[1]);

    // En passant: pawn moves diagonally (col differs by 1, row differs by 1)
    if (Math.abs(fromCol - toCol) !== 1 || Math.abs(fromRow - toRow) !== 1) continue;

    // Verify the from-square has a pawn
    try {
      const chess = new Chess(p.fen);
      const piece = chess.get(from as never);
      if (!piece || piece.type !== 'p') continue;
    } catch { continue; }

    // The en passant target square is 'to' — patch the FEN
    const fenParts = p.fen.split(' ');
    if (fenParts.length >= 4 && fenParts[3] === '-') {
      fenParts[3] = to;
      const newFen = fenParts.join(' ');
      // Verify the fix works
      try {
        const chess = new Chess(newFen);
        const move = chess.move({ from, to });
        if (move) {
          p.fen = newFen;
          return;
        }
      } catch { /* patch didn't help */ }
    }
  }
}

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handle = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);
  return width;
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [view, setView] = useState<AppView>('mode-select');
  const [currentGenre, setCurrentGenre] = useState<Genre | null>(null);
  const [progress, setProgress] = useLocalStorage<Record<Genre, ProblemProgress>>('cp-progress', {
    direct: {},
    help: {},
    self: {},
    study: {},
  });
  const [currentProblemId, setCurrentProblemId] = useLocalStorage<Record<string, number | null>>('cp-current', {});
  const [seenTutorials, setSeenTutorials] = useLocalStorage<string[]>('cp-tutorials-seen', []);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showProblemList, setShowProblemList] = useState(false);

  const windowWidth = useWindowWidth();
  const boardWidth = Math.min(windowWidth - 32, 480);

  const problem = useProblem();
  const stockfish = useStockfish();
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [allProblems, setAllProblems] = useState<ChessProblem[]>([]);
  const [loading, setLoading] = useState(true);

  // Load problem data from JSON files
  useEffect(() => {
    async function loadProblems() {
      try {
        const modules = await Promise.allSettled([
          import('./data/problems-direct.json'),
          import('./data/problems-help.json'),
          import('./data/problems-self.json'),
        ]);
        const problems: ChessProblem[] = [];
        for (const m of modules) {
          if (m.status === 'fulfilled') {
            const raw = m.value.default as ChessProblem[];
            for (const p of raw) {
              if (!p.solutionTree || p.solutionTree.length === 0) {
                p.solutionTree = parseSolution(p.solutionText, p.genre === 'help' ? 'b' : 'w');
              }
            }
            // Fix FEN for en passant retro problems
            for (const p of raw) fixEnPassantFen(p);
            problems.push(...raw);
          }
        }
        setAllProblems(problems);
      } catch {
        // If separate files don't exist, try starter set
        try {
          const starter = await import('./data/problems-starter.json');
          const raw = starter.default as ChessProblem[];
          for (const p of raw) {
            if (!p.solutionTree || p.solutionTree.length === 0) {
              p.solutionTree = parseSolution(p.solutionText, p.genre === 'help' ? 'b' : 'w');
            }
          }
          for (const p of raw) fixEnPassantFen(p);
          setAllProblems(raw);
        } catch {
          setAllProblems([]);
        }
      }
      setLoading(false);
    }
    loadProblems();
  }, []);

  // Clear analysis when position changes
  useEffect(() => {
    setAnalysisResult(null);
  }, [problem.fen]);

  const handleAnalyze = useCallback(async () => {
    if (analyzing) return;
    setAnalyzing(true);
    setAnalysisResult('分析中...');
    try {
      const result = await stockfish.analyze(problem.fen, 18);
      if (result) {
        const evalStr = Math.abs(result.eval) >= 9999
          ? (result.eval > 0 ? 'メイトあり' : '被メイト')
          : `${result.eval > 0 ? '+' : ''}${result.eval.toFixed(1)}`;
        setAnalysisResult(`最善手: ${result.bestMoveSan}  (${evalStr})`);
      } else {
        setAnalysisResult('分析結果なし');
      }
    } catch {
      setAnalysisResult('分析エラー');
    }
    setAnalyzing(false);
  }, [problem.fen, stockfish, analyzing]);

  // Group problems by genre
  const problemsByGenre = useMemo(() => {
    const grouped: Record<Genre, ChessProblem[]> = { direct: [], help: [], self: [], study: [] };
    for (const p of allProblems) {
      if (grouped[p.genre]) {
        grouped[p.genre].push(p);
      }
    }
    // Sort by difficulty
    for (const genre of Object.keys(grouped) as Genre[]) {
      grouped[genre].sort((a, b) => a.difficultyScore - b.difficultyScore);
    }
    return grouped;
  }, [allProblems]);

  const problemCounts = useMemo(() => ({
    direct: problemsByGenre.direct.length,
    help: problemsByGenre.help.length,
    self: problemsByGenre.self.length,
    study: problemsByGenre.study.length,
  }), [problemsByGenre]);

  // Find next unsolved problem in genre
  const getNextProblem = useCallback((genre: Genre): ChessProblem | null => {
    const problems = problemsByGenre[genre];
    const genreProgress = progress[genre] || {};

    // First try to resume current problem
    const currentId = currentProblemId[genre];
    if (currentId) {
      const current = problems.find(p => p.id === currentId);
      if (current && genreProgress[String(current.id)] !== 'solved') {
        return current;
      }
    }

    // Otherwise find next unsolved
    for (const p of problems) {
      if (genreProgress[String(p.id)] !== 'solved' && genreProgress[String(p.id)] !== 'skipped') {
        return p;
      }
    }

    // All solved/skipped - return first problem
    return problems[0] || null;
  }, [problemsByGenre, progress, currentProblemId]);

  const selectMode = useCallback((genre: Genre) => {
    setCurrentGenre(genre);
    setView('solving');

    // Show tutorial if first time
    if (!seenTutorials.includes(genre)) {
      setShowTutorial(true);
    }

    const nextProblem = getNextProblem(genre);
    if (nextProblem) {
      problem.loadProblem(nextProblem);
      setCurrentProblemId(prev => ({ ...prev, [genre]: nextProblem.id }));
    }
  }, [seenTutorials, getNextProblem, problem, setCurrentProblemId]);

  const closeTutorial = useCallback(() => {
    setShowTutorial(false);
    if (currentGenre) {
      setSeenTutorials(prev => [...prev, currentGenre]);
    }
  }, [currentGenre, setSeenTutorials]);

  const goBack = useCallback(() => {
    setView('mode-select');
    setCurrentGenre(null);
  }, []);

  const handlePieceDrop = useCallback((source: string, target: string, piece: string): boolean => {
    // Determine promotion
    const isPromotion = piece[1] === 'P' && (target[1] === '8' || target[1] === '1');
    return problem.tryMove(source, target, isPromotion ? 'q' : undefined);
  }, [problem]);

  const handleSelectProblem = useCallback((selected: ChessProblem) => {
    if (!currentGenre) return;
    problem.loadProblem(selected);
    setCurrentProblemId(prev => ({ ...prev, [currentGenre]: selected.id }));
    setShowProblemList(false);
  }, [currentGenre, problem, setCurrentProblemId]);

  const handleNextProblem = useCallback(() => {
    if (!currentGenre || !problem.problem) return;

    // Mark current as solved
    setProgress(prev => ({
      ...prev,
      [currentGenre]: {
        ...prev[currentGenre],
        [String(problem.problem!.id)]: 'solved' as const,
      },
    }));

    // Find next
    const problems = problemsByGenre[currentGenre];
    const currentIdx = problems.findIndex(p => p.id === problem.problem!.id);
    const nextProblem = problems[currentIdx + 1] || problems[0];

    if (nextProblem) {
      problem.loadProblem(nextProblem);
      setCurrentProblemId(prev => ({ ...prev, [currentGenre]: nextProblem.id }));
    }
  }, [currentGenre, problem, problemsByGenre, setProgress, setCurrentProblemId]);

  // Navigate to prev/next problem without marking solved
  const handleNavProblem = useCallback((direction: -1 | 1) => {
    if (!currentGenre || !problem.problem) return;
    const problems = problemsByGenre[currentGenre];
    const currentIdx = problems.findIndex(p => p.id === problem.problem!.id);
    const nextIdx = currentIdx + direction;
    if (nextIdx < 0 || nextIdx >= problems.length) return;
    const next = problems[nextIdx];
    problem.loadProblem(next);
    setCurrentProblemId(prev => ({ ...prev, [currentGenre]: next.id }));
    setAnalysisResult(null);
  }, [currentGenre, problem, problemsByGenre, setCurrentProblemId]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
      <div className="max-w-2xl mx-auto">
        <Header
          theme={theme}
          onToggleTheme={toggleTheme}
          view={view}
          currentGenre={currentGenre}
          onBack={goBack}
        />

        <main className="px-4 pb-8">
          {loading && (
            <div className="text-center py-12">
              <div className="text-4xl mb-4 animate-pulse text-gray-800 dark:text-gray-200">♔</div>
              <p className="text-gray-500 dark:text-gray-400">Loading problems...</p>
            </div>
          )}

          {!loading && view === 'mode-select' && (
            <div className="space-y-6">
              <div className="text-center py-6">
                <div className="text-5xl mb-3 text-gray-800 dark:text-gray-200">♔</div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  Chess Problems
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  YACPDB Collection - Composed Chess Art
                </p>
              </div>
              <ModeSelector
                onSelectMode={selectMode}
                progress={progress}
                problemCounts={problemCounts}
              />
            </div>
          )}

          {view === 'solving' && problem.problem && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <button
                    onClick={() => handleNavProblem(-1)}
                    disabled={!currentGenre || !problem.problem || problemsByGenre[currentGenre].findIndex(p => p.id === problem.problem!.id) <= 0}
                    className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-20 transition-colors shrink-0"
                    title="Previous problem"
                  >
                    <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <ProblemCard
                    problem={problem.problem}
                    showThemes={problem.status === 'correct' || problem.status === 'viewing'}
                  />
                  <button
                    onClick={() => handleNavProblem(1)}
                    disabled={!currentGenre || !problem.problem || problemsByGenre[currentGenre].findIndex(p => p.id === problem.problem!.id) >= problemsByGenre[currentGenre].length - 1}
                    className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-20 transition-colors shrink-0"
                    title="Next problem"
                  >
                    <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
                <button
                  onClick={() => setShowProblemList(prev => !prev)}
                  className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 transition-colors shrink-0 ml-2"
                >
                  {showProblemList ? 'Hide List' : 'Problem List'}
                </button>
              </div>

              {showProblemList && currentGenre && (
                <ProblemList
                  problems={problemsByGenre[currentGenre]}
                  progress={progress[currentGenre] || {}}
                  currentProblemId={problem.problem.id}
                  onSelectProblem={handleSelectProblem}
                  onClose={() => setShowProblemList(false)}
                />
              )}

              <div className="flex justify-center">
                <Board
                  fen={problem.fen}
                  onPieceDrop={handlePieceDrop}
                  lastMove={problem.lastMove}
                  disabled={problem.waitingForAutoPlay}
                  orientation={currentGenre === 'help' ? 'black' : 'white'}
                  width={boardWidth}
                  feedbackSquare={problem.feedbackSquare}
                  feedbackType={problem.feedbackType}
                  hintSquares={problem.hintSquares}
                />
              </div>

              {/* Playback navigation arrows - directly below the board */}
              {problem.playback && (problem.status === 'correct' || problem.status === 'viewing') && (
                <div className="flex items-center justify-center">
                  <button
                    onClick={problem.playbackFirst}
                    disabled={problem.playback.moveIndex <= -1 && !problem.playback.exploring}
                    className="w-10 h-10 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
                    title="First (Home)"
                  >
                    <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M15.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 010 1.414zm-6 0a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 1.414L5.414 10l4.293 4.293a1 1 0 010 1.414z" />
                    </svg>
                  </button>
                  <button
                    onClick={problem.playbackPrev}
                    disabled={problem.playback.moveIndex <= -1 && !problem.playback.exploring}
                    className="w-10 h-10 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
                    title="Previous (←)"
                  >
                    <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <span className="w-16 text-xs text-gray-400 text-center">
                    {problem.playback.exploring ? '?' : problem.playback.moveIndex + 1}/{problem.playback.positions.length - 1}
                  </span>
                  <button
                    onClick={problem.playbackNext}
                    disabled={problem.playback.moveIndex >= problem.playback.positions.length - 2 && !problem.playback.exploring}
                    className="w-10 h-10 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
                    title="Next (→)"
                  >
                    <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    onClick={problem.playbackLast}
                    disabled={problem.playback.moveIndex >= problem.playback.positions.length - 2 && !problem.playback.exploring}
                    className="w-10 h-10 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
                    title="Last (End)"
                  >
                    <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M4.293 15.707a1 1 0 010-1.414L8.586 10 4.293 5.707a1 1 0 011.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0zm6 0a1 1 0 010-1.414L14.586 10l-4.293-4.293a1 1 0 011.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" />
                    </svg>
                  </button>
                </div>
              )}

              <FeedbackPanel
                status={problem.status}
                feedback={problem.feedback}
                moveHistory={problem.moveHistory}
                wrongMoveCount={problem.wrongMoveCount}
                hintActive={!!problem.hintSquares}
                onReset={problem.resetProblem}
                onShowSolution={problem.showSolution}
                onNextProblem={handleNextProblem}
                onShowHint={problem.showHint}
                onAnalyze={handleAnalyze}
                analyzing={analyzing}
                analysisResult={analysisResult}
                stockfishLoading={stockfish.readyState === 'loading'}
              />

              {(problem.status === 'correct' || problem.status === 'viewing') && (
                <SolutionTree
                  nodes={problem.problem.solutionTree}
                  solutionText={problem.problem.solutionText}
                  playback={problem.playback}
                  onGoTo={problem.playbackGoTo}
                  onFirst={problem.playbackFirst}
                  onPrev={problem.playbackPrev}
                  onNext={problem.playbackNext}
                  onLast={problem.playbackLast}
                />
              )}
            </div>
          )}

          {view === 'solving' && !problem.problem && (
            <div className="text-center py-12 text-gray-400">
              No problems available for this mode.
            </div>
          )}
        </main>
      </div>

      {showTutorial && currentGenre && (
        <GenreTutorial genre={currentGenre} onClose={closeTutorial} />
      )}
    </div>
  );
}
