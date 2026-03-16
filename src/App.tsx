import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
import { TermsPage } from './components/TermsPage';
import { ProblemList } from './components/ProblemList';
import { parseSolution } from './services/solutionParser';
import { findTheme } from './data/themes';
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

function KeywordTags({ keywords }: { keywords: string[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {keywords.map(kw => {
          const theme = findTheme(kw);
          const hasDesc = !!theme?.description;
          const isExpanded = expanded === kw;
          return hasDesc ? (
            <button
              key={kw}
              onClick={() => setExpanded(isExpanded ? null : kw)}
              className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${
                isExpanded
                  ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              {kw}
            </button>
          ) : (
            <span
              key={kw}
              className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
            >
              {kw}
            </span>
          );
        })}
      </div>
      {expanded && (() => {
        const theme = findTheme(expanded);
        if (!theme?.description) return null;
        return (
          <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2 leading-relaxed">
            {theme.description}
          </div>
        );
      })()}
    </div>
  );
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
    retro: {},
  });
  const [currentProblemId, setCurrentProblemId] = useLocalStorage<Record<string, number | null>>('cp-current', {});
  const [seenTutorials, setSeenTutorials] = useLocalStorage<string[]>('cp-tutorials-seen', []);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showProblemList, setShowProblemList] = useState(false);
  const [bookmarks, setBookmarks] = useLocalStorage<Record<Genre, string[]>>('cp-bookmarks', {
    direct: [], help: [], self: [], study: [], retro: [],
  });

  const windowWidth = useWindowWidth();
  const boardWidth = Math.min(windowWidth - 32, 480);

  const stockfish = useStockfish();
  const stockfishRef = useRef(stockfish);
  stockfishRef.current = stockfish;
  const problem = useProblem(stockfish);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisActive, setAnalysisActive] = useState(false);
  const analysisActiveRef = useRef(false);
  const [analysisArrow, setAnalysisArrow] = useState<[string, string] | null>(null);
  const [genreData, setGenreData] = useState<Record<Genre, ChessProblem[]>>({
    direct: [], help: [], self: [], study: [], retro: [],
  });
  const [genreLoaded, setGenreLoaded] = useState<Record<Genre, boolean>>({
    direct: false, help: false, self: false, study: false, retro: false,
  });
  const [genreLoading, setGenreLoading] = useState<Genre | null>(null);

  // Cache current problem in localStorage for instant reload
  const cacheProblem = useCallback((p: ChessProblem) => {
    try {
      // Store minimal data needed to display immediately (no solutionTree — too large)
      const { solutionTree, ...rest } = p;
      void solutionTree;
      localStorage.setItem('cp-cached-problem', JSON.stringify(rest));
    } catch { /* quota exceeded — ignore */ }
  }, []);

  // Lazy-load genre data on demand
  const loadGenre = useCallback(async (genre: Genre) => {
    if (genreLoaded[genre]) return genreData[genre];
    setGenreLoading(genre);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let modules: PromiseSettledResult<{ default: any[] }>[];
      if (genre === 'direct') {
        modules = await Promise.allSettled([
          import('./data/problems-direct-1.json'),
          import('./data/problems-direct-2.json'),
        ]);
      } else if (genre === 'help') {
        modules = await Promise.allSettled([import('./data/problems-help.json')]);
      } else if (genre === 'self') {
        modules = await Promise.allSettled([import('./data/problems-self.json')]);
      } else if (genre === 'retro') {
        modules = await Promise.allSettled([import('./data/problems-retro.json')]);
      } else {
        modules = await Promise.allSettled([import('./data/problems-study.json')]);
      }
      const problems: ChessProblem[] = [];
      for (const m of modules) {
        if (m.status === 'fulfilled') {
          const raw = m.value.default as ChessProblem[];
          for (const p of raw) {
            if (!p.solutionTree || p.solutionTree.length === 0) {
              const firstColor = (p.genre === 'help' || (p.genre === 'retro' && p.stipulation.startsWith('h#'))) ? 'b' : 'w';
              p.solutionTree = parseSolution(p.solutionText, firstColor);
            }
            // Retro + {(illegal)}: White's move is illegal → it's Black's turn.
            // Parser assigns wrong colors (1.Kf3*g2 → white), flip them.
            if (p.genre === 'retro' && p.solutionText.includes('{(illegal')) {
              const flipColors = (nodes: typeof p.solutionTree): void => {
                for (const n of nodes) {
                  n.color = n.color === 'w' ? 'b' : 'w';
                  flipColors(n.children);
                }
              };
              flipColors(p.solutionTree);
            }
          }
          for (const p of raw) fixEnPassantFen(p);
          problems.push(...raw);
        }
      }
      problems.sort((a, b) => a.difficultyScore - b.difficultyScore);
      setGenreData(prev => ({ ...prev, [genre]: problems }));
      setGenreLoaded(prev => ({ ...prev, [genre]: true }));
      setGenreLoading(null);
      return problems;
    } catch {
      setGenreLoading(null);
      return [];
    }
  }, [genreLoaded, genreData]);

  // Run analysis when position changes and analysis mode is active
  useEffect(() => {
    analysisActiveRef.current = analysisActive;
    if (!analysisActive) return;
    let cancelled = false;
    setAnalyzing(true);
    setAnalysisResult('Analyzing...');
    setAnalysisArrow(null);

    (async () => {
      try {
        // Check if position has no legal moves (checkmate/stalemate)
        let noLegalMoves = false;
        try {
          const checkChess = new Chess(problem.fen);
          noLegalMoves = checkChess.moves().length === 0;
        } catch { /* ignore */ }

        if (noLegalMoves) {
          if (cancelled || !analysisActiveRef.current) return;
          try {
            const checkChess = new Chess(problem.fen);
            setAnalysisResult(checkChess.isCheckmate() ? 'Checkmate' : checkChess.isStalemate() ? 'Stalemate' : 'No legal moves');
          } catch {
            setAnalysisResult('No legal moves');
          }
          setAnalysisArrow(null);
          setAnalyzing(false);
          return;
        }

        const result = await stockfishRef.current.analyze(problem.fen, 18);
        if (cancelled || !analysisActiveRef.current) return;
        if (result) {
          const evalStr = result.mateIn !== null
            ? (result.mateIn > 0 ? `M${result.mateIn}` : `M${result.mateIn}`)
            : `${result.eval > 0 ? '+' : ''}${result.eval.toFixed(1)}`;
          setAnalysisResult(`Best: ${result.bestMoveSan} (${evalStr})`);
          // Show arrow
          const from = result.bestMove.slice(0, 2);
          const to = result.bestMove.slice(2, 4);
          setAnalysisArrow([from, to]);
        } else {
          setAnalysisResult('No result');
        }
      } catch {
        if (!cancelled) setAnalysisResult('Analysis error');
      }
      if (!cancelled && analysisActiveRef.current) setAnalyzing(false);
    })();

    return () => { cancelled = true; };
  }, [problem.fen, analysisActive]);

  // Clear analysis when problem changes
  useEffect(() => {
    analysisActiveRef.current = false;
    setAnalysisActive(false);
    setAnalysisResult(null);
    setAnalysisArrow(null);
    setAnalyzing(false);
  }, [problem.problem?.id]);


  const handleAnalyze = useCallback(() => {
    if (analysisActive) {
      // Toggle off — set ref immediately to prevent in-flight async from setting arrow
      analysisActiveRef.current = false;
      setAnalysisActive(false);
      setAnalysisResult(null);
      setAnalysisArrow(null);
      setAnalyzing(false);
    } else {
      // Toggle on — analysis will fire via useEffect
      setAnalysisActive(true);
    }
  }, [analysisActive]);

  // Genre data is now loaded lazily — problemsByGenre is just genreData
  const problemsByGenre = genreData;

  // Show actual counts for loaded genres, estimated counts for unloaded
  const ESTIMATED_COUNTS: Record<Genre, number> = { direct: 27463, help: 5842, self: 2196, study: 1274, retro: 93 };
  const problemCounts = useMemo(() => {
    const counts: Record<Genre, number> = {} as Record<Genre, number>;
    for (const g of ['direct', 'help', 'self', 'study', 'retro'] as Genre[]) {
      counts[g] = genreLoaded[g] ? genreData[g].length : ESTIMATED_COUNTS[g];
    }
    return counts;
  }, [genreData, genreLoaded]);

  // ── Hash-based routing ──
  const updateHash = useCallback((genre: Genre | null, problemId?: number | null) => {
    if (!genre) {
      history.replaceState(null, '', window.location.pathname);
      return;
    }
    if (problemId) {
      const problems = problemsByGenre[genre];
      const idx = problems.findIndex(p => p.id === problemId);
      if (idx >= 0) {
        history.replaceState(null, '', `#/${genre}/${idx + 1}`);
        return;
      }
    }
    history.replaceState(null, '', `#/${genre}`);
  }, [problemsByGenre]);

  // Restore from hash on initial load
  const hashRestoredRef = useRef(false);
  useEffect(() => {
    if (hashRestoredRef.current) return;
    hashRestoredRef.current = true;

    const hash = window.location.hash;
    if (hash === '#/terms') {
      setView('terms');
      return;
    }
    const match = hash.match(/^#\/(direct|help|self|study|retro)(?:\/(\d+))?$/);
    if (!match) return;

    const genre = match[1] as Genre;
    const problemNum = match[2] ? parseInt(match[2]) : null;

    setCurrentGenre(genre);
    setView('solving');

    // Instantly show cached problem while genre data loads
    try {
      const cached = localStorage.getItem('cp-cached-problem');
      if (cached) {
        const cachedProblem = JSON.parse(cached) as ChessProblem;
        // Always rebuild solutionTree from text to avoid double-flip issues
        {
          const firstColor = (cachedProblem.genre === 'help' || (cachedProblem.genre === 'retro' && cachedProblem.stipulation.startsWith('h#'))) ? 'b' : 'w';
          cachedProblem.solutionTree = parseSolution(cachedProblem.solutionText, firstColor);
        }
        // Retro + {(illegal)}: flip solution tree colors
        if (cachedProblem.genre === 'retro' && cachedProblem.solutionText.includes('{(illegal')) {
          const flipColors = (nodes: typeof cachedProblem.solutionTree): void => {
            for (const n of nodes) {
              n.color = n.color === 'w' ? 'b' : 'w';
              flipColors(n.children);
            }
          };
          flipColors(cachedProblem.solutionTree);
        }
        fixEnPassantFen(cachedProblem);
        // Only use cache if it matches the hash URL's genre
        if (cachedProblem.genre === genre) {
          problem.loadProblem(cachedProblem);
          setCurrentProblemId(prev => ({ ...prev, [genre]: cachedProblem.id }));
        }
      }
    } catch { /* corrupt cache — ignore */ }

    // Load full genre data in background (needed for problem list, navigation, etc.)
    loadGenre(genre).then(problems => {
      if (problems.length === 0) return;

      // If we showed a cached problem, check if we need to update to the correct one
      if (problemNum && problemNum >= 1 && problemNum <= problems.length) {
        const target = problems[problemNum - 1];
        // Only reload if different from cached
        if (target.id !== problem.problem?.id) {
          problem.loadProblem(target);
          cacheProblem(target);
          setCurrentProblemId(prev => ({ ...prev, [genre]: target.id }));
        }
      } else if (!problem.problem || problem.problem.genre !== genre) {
        // No cached problem matched — find next unsolved
        const genreProgress = progress[genre] || {};
        let nextProblem: ChessProblem | null = null;
        for (const p of problems) {
          if (genreProgress[String(p.id)] !== 'solved' && genreProgress[String(p.id)] !== 'skipped') {
            nextProblem = p;
            break;
          }
        }
        if (!nextProblem) nextProblem = problems[0];
        if (nextProblem) {
          problem.loadProblem(nextProblem);
          cacheProblem(nextProblem);
          setCurrentProblemId(prev => ({ ...prev, [genre]: nextProblem!.id }));
        }
      }
    });
  }, [loadGenre, problem, setCurrentProblemId, progress, cacheProblem]);

  const selectMode = useCallback(async (genre: Genre) => {
    setCurrentGenre(genre);
    setView('solving');

    // Show tutorial if first time
    if (!seenTutorials.includes(genre)) {
      setShowTutorial(true);
    }

    // Load genre data if not loaded yet
    const problems = await loadGenre(genre);

    // Find next unsolved problem from the loaded data
    const genreProgress = progress[genre] || {};
    const currentId = currentProblemId[genre];
    let nextProblem: ChessProblem | null = null;
    if (currentId) {
      const current = problems.find(p => p.id === currentId);
      if (current && genreProgress[String(current.id)] !== 'solved') {
        nextProblem = current;
      }
    }
    if (!nextProblem) {
      for (const p of problems) {
        if (genreProgress[String(p.id)] !== 'solved' && genreProgress[String(p.id)] !== 'skipped') {
          nextProblem = p;
          break;
        }
      }
    }
    if (!nextProblem) nextProblem = problems[0] || null;

    if (nextProblem) {
      problem.loadProblem(nextProblem);
      cacheProblem(nextProblem);
      setCurrentProblemId(prev => ({ ...prev, [genre]: nextProblem!.id }));
      updateHash(genre, nextProblem.id);
    } else {
      updateHash(genre);
    }
  }, [seenTutorials, loadGenre, progress, currentProblemId, problem, setCurrentProblemId, updateHash, cacheProblem]);

  const closeTutorial = useCallback(() => {
    setShowTutorial(false);
    if (currentGenre) {
      setSeenTutorials(prev => [...prev, currentGenre]);
    }
  }, [currentGenre, setSeenTutorials]);

  const goBack = useCallback(() => {
    setView('mode-select');
    setCurrentGenre(null);
    updateHash(null);
  }, [updateHash]);

  const handlePieceDrop = useCallback((source: string, target: string, piece: string): boolean => {
    // Determine promotion: react-chessboard passes the selected piece (e.g. 'wN', 'wQ')
    const isPromotion = target[1] === '8' || target[1] === '1';
    const promoMap: Record<string, string> = { Q: 'q', R: 'r', B: 'b', N: 'n' };
    const promoPiece = isPromotion ? (promoMap[piece[1]] || 'q') : undefined;
    return problem.tryMove(source, target, promoPiece);
  }, [problem]);

  const handleSelectProblem = useCallback((selected: ChessProblem) => {
    if (!currentGenre) return;
    problem.loadProblem(selected);
    cacheProblem(selected);
    setCurrentProblemId(prev => ({ ...prev, [currentGenre]: selected.id }));
    setShowProblemList(false);
    updateHash(currentGenre, selected.id);
  }, [currentGenre, problem, cacheProblem, setCurrentProblemId, updateHash]);

  const handleGiveUp = useCallback(() => {
    if (currentGenre && problem.problem) {
      const pid = String(problem.problem.id);
      setProgress(prev => {
        const genreProgress = prev[currentGenre] || {};
        if (genreProgress[pid] === 'solved') return prev; // don't downgrade
        return { ...prev, [currentGenre]: { ...genreProgress, [pid]: 'failed' as const } };
      });
    }
    problem.showSolution();
  }, [currentGenre, problem, setProgress]);

  const handleNextProblem = useCallback(() => {
    if (!currentGenre || !problem.problem) return;

    // Only mark as solved if actually solved (not just viewing after give up)
    if (problem.status === 'correct') {
      setProgress(prev => ({
        ...prev,
        [currentGenre]: {
          ...prev[currentGenre],
          [String(problem.problem!.id)]: 'solved' as const,
        },
      }));
    }

    // Find next
    const problems = problemsByGenre[currentGenre];
    const currentIdx = problems.findIndex(p => p.id === problem.problem!.id);
    const nextProblem = problems[currentIdx + 1] || problems[0];

    if (nextProblem) {
      problem.loadProblem(nextProblem);
      cacheProblem(nextProblem);
      setCurrentProblemId(prev => ({ ...prev, [currentGenre]: nextProblem.id }));
      updateHash(currentGenre, nextProblem.id);
    }
  }, [currentGenre, problem, problemsByGenre, setProgress, setCurrentProblemId, updateHash, cacheProblem]);

  // Navigate to prev/next problem without marking solved
  const handleNavProblem = useCallback((direction: -1 | 1) => {
    if (!currentGenre || !problem.problem) return;
    const problems = problemsByGenre[currentGenre];
    const currentIdx = problems.findIndex(p => p.id === problem.problem!.id);
    const nextIdx = currentIdx + direction;
    if (nextIdx < 0 || nextIdx >= problems.length) return;
    const next = problems[nextIdx];
    problem.loadProblem(next);
    cacheProblem(next);
    setCurrentProblemId(prev => ({ ...prev, [currentGenre]: next.id }));
    setAnalysisResult(null);
    updateHash(currentGenre, next.id);
  }, [currentGenre, problem, problemsByGenre, setCurrentProblemId, updateHash]);

  const toggleBookmark = useCallback(() => {
    if (!currentGenre || !problem.problem) return;
    const pid = String(problem.problem.id);
    setBookmarks(prev => {
      const list = prev[currentGenre] || [];
      return { ...prev, [currentGenre]: list.includes(pid) ? list.filter(id => id !== pid) : [...list, pid] };
    });
  }, [currentGenre, problem.problem, setBookmarks]);

  const isBookmarked = currentGenre && problem.problem
    ? (bookmarks[currentGenre] || []).includes(String(problem.problem.id))
    : false;

  // Arrows for board: analysis arrow (blue, only when active) or refutation arrow (red)
  // MUST pass [] (not undefined) to react-chessboard to clear arrows
  const boardArrows: [string, string, string][] = (analysisActive && analysisArrow)
    ? [[analysisArrow[0], analysisArrow[1], 'rgba(59, 130, 246, 0.8)']]
    : problem.refutationArrow && problem.status === 'solving'
      ? [[problem.refutationArrow[0], problem.refutationArrow[1], 'rgba(255, 50, 50, 0.8)']]
      : [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
      <div className="max-w-2xl mx-auto">
        <Header
          theme={theme}
          onToggleTheme={toggleTheme}
          view={view}
          currentGenre={currentGenre}
          onBack={goBack}
          onShowHelp={view === 'solving' && currentGenre ? () => setShowTutorial(true) : undefined}
        />

        <main className="px-4 pb-8">
          {view === 'terms' && (
            <TermsPage onBack={goBack} />
          )}

          {view === 'mode-select' && (
            <>
              <ModeSelector
                onSelectMode={selectMode}
                progress={progress}
                problemCounts={problemCounts}
              />
              <div className="flex items-center justify-center gap-3 mt-6">
                <button
                  onClick={() => { setView('terms'); window.location.hash = '#/terms'; }}
                  className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  About &amp; Terms
                </button>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <a
                  href="https://ko-fi.com/A0A21W2W51"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  Buy me a coffee
                </a>
              </div>
            </>
          )}

          {view === 'solving' && genreLoading && !problem.problem && (
            <div className="text-center py-12">
              <div className="text-4xl mb-4 animate-pulse text-gray-800 dark:text-gray-200">♔</div>
              <p className="text-gray-500 dark:text-gray-400">Loading problems...</p>
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
                    problemNumber={currentGenre ? problemsByGenre[currentGenre].findIndex(p => p.id === problem.problem!.id) + 1 : undefined}
                    genrePrefix={currentGenre === 'direct' ? 'D' : currentGenre === 'help' ? 'H' : currentGenre === 'self' ? 'S' : currentGenre === 'study' ? 'St' : ''}
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
                  onClick={toggleBookmark}
                  className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0 ml-1"
                  title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
                >
                  <svg className={`w-5 h-5 ${isBookmarked ? 'text-yellow-500' : 'text-gray-300 dark:text-gray-600'}`}
                    viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </button>
                <button
                  onClick={() => setShowProblemList(prev => !prev)}
                  className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 transition-colors shrink-0 ml-1"
                >
                  {showProblemList ? 'Hide List' : 'Problem List'}
                </button>
              </div>

              {showProblemList && currentGenre && (
                <ProblemList
                  problems={problemsByGenre[currentGenre]}
                  progress={progress[currentGenre] || {}}
                  bookmarks={bookmarks[currentGenre] || []}
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
                  orientation="white"
                  width={boardWidth}
                  feedbackSquare={problem.feedbackSquare}
                  feedbackType={problem.feedbackType}
                  hintSquares={problem.hintSquares}
                  arrows={boardArrows}
                  allowAnyColor={currentGenre === 'retro'}
                />
              </div>

              {/* Playback navigation arrows - directly below the board (hide if no moves computed) */}
              {problem.playback && problem.playback.positions.length > 1 && (problem.status === 'correct' || problem.status === 'viewing') && (
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
                hintActive={!!problem.hintSquares}
                onReset={problem.resetProblem}
                onShowSolution={handleGiveUp}
                onNextProblem={handleNextProblem}
                onShowHint={problem.showHint}
                onAnalyze={handleAnalyze}
                analyzing={analyzing}
                analysisResult={analysisResult}
                stockfishLoading={stockfish.readyState === 'loading'}
                refutationText={problem.refutationText}
                analysisActive={analysisActive}
              />

              {(problem.status === 'correct' || problem.status === 'viewing') && currentGenre === 'retro' && problem.problem.solutionText.includes('{(illegal') && (
                <div className="text-xs bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-red-700 dark:text-red-400">
                  <span className="font-semibold">White's move is illegal</span> — it's Black's turn.
                </div>
              )}


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
                  keywordTags={problem.problem.keywords.length > 0 ? <KeywordTags keywords={problem.problem.keywords} /> : undefined}
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
