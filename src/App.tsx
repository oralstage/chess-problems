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
// import { TermsPage } from './components/TermsPage';
import { ProblemList } from './components/ProblemList';
import { FilterPage } from './components/FilterPage';
import { HamburgerMenu } from './components/HamburgerMenu';
import { SearchPage } from './components/SearchPage';
import { BookmarksPage } from './components/BookmarksPage';
import { ChangelogPage } from './components/ChangelogPage';
import { HistoryPage } from './components/HistoryPage';
import { parseSolution, filterKeyMoves } from './services/solutionParser';
import { fetchAllProblems, fetchProblemsPage, fetchProblem, fetchDaily, fetchStats, metaToChessProblem, fixCastlingRights } from './services/api';
import type { AppView, Genre, Category, ProblemProgress, ChessProblem } from './types';
import { CATEGORY_DEFS } from './types';

/**
 * Fix FEN for problems where the solution requires en passant but the FEN
 * doesn't have the en passant square set (common in retro problems).
 * Mutates p.fen in-place if a fix is needed.
 */
function fixEnPassantFen(p: ChessProblem): void {
  if (p.solutionTree.length === 0) return;

  // Determine first move color from FEN turn
  const fenTurn = p.fen.split(' ')[1] as 'w' | 'b';
  const firstColor = p.genre === 'help' ? 'b'
    : (p.genre === 'retro' && p.stipulation?.startsWith('h#')) ? 'b'
    : fenTurn;
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


function pieceCount(fen: string): number {
  return fen.split(' ')[0].replace(/[0-9/]/g, '').length;
}

type StatusFilter = 'all' | 'unsolved' | 'solved' | 'failed' | 'bookmarked';

interface GlobalFilters {
  keywords: string[];
  minPieces: number;
  maxPieces: number;
  minYear: number;
  maxYear: number;
  minMoves: number;
  maxMoves: number;
  sortBy: 'difficulty' | 'year';
  sortOrder: 'asc' | 'desc';
  stipulations: string[];
  statusFilter: StatusFilter;
}

/** Migrate old localStorage format */
function migrateFilters(raw: unknown): GlobalFilters {
  const defaults: GlobalFilters = { keywords: [], minPieces: 0, maxPieces: 0, minYear: 0, maxYear: 0, minMoves: 0, maxMoves: 0, sortBy: 'difficulty', sortOrder: 'asc', stipulations: [], statusFilter: 'all' };
  if (!raw || typeof raw !== 'object') return defaults;
  const obj = raw as Record<string, unknown>;
  // Migrate old single keyword
  if (typeof obj.keyword === 'string' && !Array.isArray(obj.keywords)) {
    obj.keywords = obj.keyword ? [obj.keyword as string] : [];
    delete obj.keyword;
  }
  // Migrate old single stipulation to array
  if (typeof obj.stipulation === 'string') {
    obj.stipulations = obj.stipulation && obj.stipulation !== 'all' ? [obj.stipulation as string] : [];
    delete obj.stipulation;
  }
  if (!Array.isArray(obj.keywords)) obj.keywords = [];
  if (!Array.isArray(obj.stipulations)) obj.stipulations = [];
  if (obj.sortOrder !== 'asc' && obj.sortOrder !== 'desc') obj.sortOrder = 'asc';
  const validStatuses: StatusFilter[] = ['all', 'unsolved', 'solved', 'failed', 'bookmarked'];
  if (!validStatuses.includes(obj.statusFilter as StatusFilter)) obj.statusFilter = 'all';
  return { ...defaults, ...obj } as GlobalFilters;
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
  const [isDaily, setIsDaily] = useState(false);
  const [currentGenre, setCurrentGenre] = useState<Genre | null>(null);
  const [currentCategory, setCurrentCategory] = useLocalStorage<Category | null>('cp-current-category', null);
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
  const [showFilterPage, setShowFilterPage] = useState(false);
  const [filterOpenedFrom, setFilterOpenedFrom] = useState<'problemList' | 'hamburger'>('hamburger');
  const [showHamburgerMenu, setShowHamburgerMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showProblemInfo, setShowProblemInfo] = useState(false);
  const [showSearchPage, setShowSearchPage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<import('./services/api').SearchResult[] | null>(null);
  const [showBookmarksPage, setShowBookmarksPage] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [bookmarks, setBookmarks] = useLocalStorage<Record<Genre, string[]>>('cp-bookmarks', {
    direct: [], help: [], self: [], study: [], retro: [],
  });
  const [timestamps, setTimestamps] = useLocalStorage<Record<string, number>>('cp-timestamps', {});

  // Per-genre filters (each genre has its own independent filter settings)
  const defaultFilters: GlobalFilters = { keywords: [], minPieces: 0, maxPieces: 0, minYear: 0, maxYear: 0, minMoves: 0, maxMoves: 0, sortBy: 'difficulty', sortOrder: 'asc', stipulations: [], statusFilter: 'all' as StatusFilter };
  const [allFiltersRaw, setAllFilters] = useLocalStorage<Record<string, GlobalFilters>>('cp-filters-by-genre', {});
  // One-time migration from old global cp-filters
  useEffect(() => {
    try {
      const old = localStorage.getItem('cp-filters');
      if (old) {
        const parsed = migrateFilters(JSON.parse(old));
        localStorage.removeItem('cp-filters');
        setAllFilters(prev => {
          // Only migrate if no per-genre filters exist yet
          if (Object.keys(prev).length === 0) {
            return { direct: parsed, help: defaultFilters, self: defaultFilters, study: defaultFilters, retro: defaultFilters };
          }
          return prev;
        });
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const filterKey = currentCategory || currentGenre || '';
  const filtersRaw = filterKey ? allFiltersRaw[filterKey] || defaultFilters : defaultFilters;
  const setFilters = useCallback((value: GlobalFilters) => {
    if (!filterKey) return;
    setAllFilters(prev => ({ ...prev, [filterKey]: value }));
  }, [filterKey, setAllFilters]);
  const filters = useMemo(() => migrateFilters(filtersRaw), [filtersRaw]);

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

  // Lazy-load genre data on demand (from D1 API) with progressive updates
  const loadGenre = useCallback(async (genre: Genre) => {
    if (genreLoaded[genre]) return genreData[genre];
    setGenreLoading(genre);
    try {
      const metas = await fetchAllProblems(genre, (partial, _total, done) => {
        const problems: ChessProblem[] = partial.map(m => metaToChessProblem(m));
        problems.sort((a, b) => a.difficultyScore - b.difficultyScore);
        setGenreData(prev => ({ ...prev, [genre]: problems }));
        if (done) {
          setGenreLoaded(prev => ({ ...prev, [genre]: true }));
          setGenreLoading(null);
        }
      });
      const problems: ChessProblem[] = metas.map(m => metaToChessProblem(m));
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

  // Ensure a problem has solutionTree (fetch solutionText from API if needed)
  const ensureSolution = useCallback(async (p: ChessProblem): Promise<ChessProblem> => {
    if (p.solutionTree.length > 0) return p; // already has solution
    if (!p.solutionText) {
      // Fetch solutionText from API
      const full = await fetchProblem(p.id);
      p.solutionText = full.solutionText;
    }
    // Retro: detect Black to move from solution text
    // Patterns: {Black to move}, solution starting with "..." or "...." (black move notation)
    const solutionStart = p.solutionText.replace(/^\{[^}]*\}\s*/, '').trimStart();
    const isRetroBlack = p.genre === 'retro' && (
      /\{[^}]*[Bb]lack to move/i.test(p.solutionText)
      || /^\.{2,}/.test(solutionStart)
      || /^\d+\.{3}/.test(solutionStart)
      || /^\d+\.\s+\.{2,}/.test(solutionStart)
    );
    // Logical first color: who moves first in this problem
    const firstColor = (p.genre === 'help' || (p.genre === 'retro' && p.stipulation.startsWith('h#'))) ? 'b'
      : isRetroBlack ? 'b' : 'w';
    // Parser color: for solutions with "..." notation, the dots already encode colors,
    // so parser should use 'w' to avoid double-flip
    const solutionHasDots = /\.{3}/.test(p.solutionText) || /\.\s+\.{2}/.test(p.solutionText);
    const parserColor = (isRetroBlack && solutionHasDots) ? 'w' : firstColor;
    const allNodes = parseSolution(p.solutionText, parserColor);
    // Retro + {(illegal)}: flip colors
    if (p.genre === 'retro' && p.solutionText.includes('{(illegal')) {
      const flipColors = (nodes: typeof allNodes): void => {
        for (const n of nodes) {
          n.color = n.color === 'w' ? 'b' : 'w';
          flipColors(n.children);
        }
      };
      flipColors(allNodes);
    }
    p.fullSolutionTree = allNodes;
    p.solutionTree = filterKeyMoves(allNodes, firstColor);
    // Fix castling rights if solution contains O-O but FEN has none
    p.fen = fixCastlingRights(p.fen, p.solutionText);
    fixEnPassantFen(p);
    // Retro: flip FEN turn to black if Black to move
    if (isRetroBlack && p.fen.includes(' w ')) {
      p.fen = p.fen.replace(' w ', ' b ');
    }
    return p;
  }, []);

  // Load a problem into the solver (fetches solutionText from API if needed)
  const loadAndStartProblem = useCallback(async (p: ChessProblem) => {
    loadedProblemIdRef.current = p.id;
    // Show board immediately if solution needs to be fetched
    const needsFetch = p.solutionTree.length === 0;
    if (needsFetch) {
      problem.loadProblem(p); // show board with empty solutionTree (hint/give-up won't work yet)
    }
    const ready = await ensureSolution(p);
    // Guard: if another problem was loaded while we were fetching, don't overwrite it
    if (loadedProblemIdRef.current !== p.id) return;
    problem.loadProblem(ready);
  }, [ensureSolution, problem]);

  // ── Hash-based routing with browser history ──
  const updateHash = useCallback((category: Category | Genre | null, problemId?: number | null, replace = false) => {
    const method = replace ? 'replaceState' : 'pushState';
    if (!category) {
      history[method](null, '', window.location.pathname);
      return;
    }
    if (problemId) {
      history[method]({ category, problemId }, '', `#/${category}/yacpdb/${problemId}`);
      return;
    }
    history[method]({ category }, '', `#/${category}`);
  }, []);

  // ── Daily Problem (fetched from /api/daily, no need to load all direct problems) ──
  const [dailyProblem, setDailyProblem] = useState<ChessProblem | null>(null);
  useEffect(() => {
    fetchDaily().then(data => {
      setDailyProblem(metaToChessProblem(data, data.solutionText));
    }).catch(() => {});
  }, []);

  const dailySolved = useMemo(() => {
    if (!dailyProblem) return false;
    return progress.direct?.[String(dailyProblem.id)] === 'solved';
  }, [dailyProblem, progress]);

  const handleSolveDaily = useCallback(() => {
    if (!dailyProblem) return;
    setIsDaily(true);
    setCurrentGenre('direct');
    setCurrentCategory(null);
    setView('solving');
    loadAndStartProblem(dailyProblem);
    cacheProblem(dailyProblem);
    setCurrentProblemId(prev => ({ ...prev, direct: dailyProblem.id }));
    updateHash('direct', dailyProblem.id);
  }, [dailyProblem, problem, cacheProblem, setCurrentProblemId, updateHash]);

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

  // Fetch genre counts from API on mount
  const [apiCounts, setApiCounts] = useState<Record<string, number>>({});
  const [apiMoveCounts, setApiMoveCounts] = useState<Record<string, Record<string, number>>>({});
  const [genreStats, setGenreStats] = useState<{ yearRange: { min: number; max: number }; pieceRange: { min: number; max: number }; moveRange: { min: number; max: number } } | null>(null);
  useEffect(() => {
    fetchStats().then(stats => {
      setApiCounts(stats.counts);
      if (stats.moveCounts) setApiMoveCounts(stats.moveCounts);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (currentGenre) {
      fetchStats(currentGenre).then(stats => setGenreStats({ yearRange: stats.yearRange, pieceRange: stats.pieceRange, moveRange: stats.moveRange })).catch(() => {});
    }
  }, [currentGenre]);

  const problemCounts = useMemo(() => {
    const ESTIMATED_COUNTS: Record<Genre, number> = { direct: 53177, help: 16457, self: 6164, study: 3077, retro: 178 };
    const counts: Record<Category, number> = {} as Record<Category, number>;
    for (const def of CATEGORY_DEFS) {
      if (def.minMoves != null) {
        // Direct subcategories: count by moveCount
        if (genreLoaded[def.genre]) {
          counts[def.category] = genreData[def.genre].filter(p => {
            if (def.maxMoves === 0) return p.moveCount >= def.minMoves!;
            return p.moveCount >= def.minMoves! && p.moveCount <= def.maxMoves!;
          }).length;
        } else if (apiMoveCounts[def.genre]) {
          // Use API move counts for accurate numbers
          let total = 0;
          for (const [mc, cnt] of Object.entries(apiMoveCounts[def.genre])) {
            const m = parseInt(mc);
            if (def.maxMoves === 0) { if (m >= def.minMoves!) total += cnt; }
            else { if (m >= def.minMoves! && m <= def.maxMoves!) total += cnt; }
          }
          counts[def.category] = total;
        } else {
          // Fallback estimates
          const est: Record<string, number> = { onemover: 350, twomover: 36000, threemover: 11000, moremover: 5800 };
          counts[def.category] = est[def.category] || 0;
        }
      } else {
        counts[def.category] = genreLoaded[def.genre] ? genreData[def.genre].length : (apiCounts[def.genre] || ESTIMATED_COUNTS[def.genre]);
      }
    }
    return counts;
  }, [genreData, genreLoaded, apiCounts, apiMoveCounts]);

  // Category-level move filter (from CATEGORY_DEFS)
  const categoryDef = currentCategory ? CATEGORY_DEFS.find(d => d.category === currentCategory) : null;

  const filteredProblems = useMemo(() => {
    if (!currentGenre) return [];
    let result = problemsByGenre[currentGenre] || [];
    if (filters.minPieces > 0) result = result.filter(p => pieceCount(p.fen) >= filters.minPieces);
    if (filters.maxPieces > 0) result = result.filter(p => pieceCount(p.fen) <= filters.maxPieces);
    if (filters.minYear > 0) result = result.filter(p => (p.sourceYear || 0) >= filters.minYear);
    if (filters.maxYear > 0) result = result.filter(p => (p.sourceYear || 9999) <= filters.maxYear);
    // Move count filter: category-level (from CATEGORY_DEFS) takes priority
    const catDef = currentCategory ? CATEGORY_DEFS.find(d => d.category === currentCategory) : null;
    const minMoves = catDef?.minMoves ?? filters.minMoves;
    const maxMoves = catDef?.maxMoves != null
      ? (catDef.maxMoves === 0 ? (filters.maxMoves > 0 ? Math.max(filters.maxMoves, catDef.minMoves ?? 0) : 0) : catDef.maxMoves)
      : filters.maxMoves;
    if (minMoves > 0) result = result.filter(p => p.moveCount >= minMoves);
    if (maxMoves > 0) result = result.filter(p => p.moveCount <= maxMoves);
    if (filters.keywords.length > 0) {
      const lowerKws = filters.keywords.map(k => k.toLowerCase());
      result = result.filter(p => lowerKws.some(lk => p.keywords?.some(pk => pk.toLowerCase() === lk)));
    }
    if (filters.stipulations.length > 0) result = result.filter(p => filters.stipulations.includes(p.stipulation));
    // Status filter
    if (filters.statusFilter !== 'all' && currentGenre) {
      const genreProgress = progress[currentGenre] || {};
      const genreBookmarks = bookmarks[currentGenre] || [];
      result = result.filter(p => {
        const s = genreProgress[String(p.id)];
        switch (filters.statusFilter) {
          case 'solved': return s === 'solved';
          case 'failed': return s === 'failed';
          case 'unsolved': return s !== 'solved' && s !== 'failed';
          case 'bookmarked': return genreBookmarks.includes(String(p.id));
          default: return true;
        }
      });
    }
    if (filters.sortBy === 'year') {
      const dir = filters.sortOrder === 'desc' ? -1 : 1;
      result = [...result].sort((a, b) => dir * ((a.sourceYear || 9999) - (b.sourceYear || 9999)));
    } else if (filters.sortOrder === 'desc') {
      result = [...result].slice().reverse();
    }
    return result;
  }, [currentGenre, currentCategory, problemsByGenre, filters, progress, bookmarks]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.keywords.length > 0) count++;
    if (filters.minPieces > 0) count++;
    if (filters.maxPieces > 0) count++;
    if (filters.minYear > 0) count++;
    if (filters.maxYear > 0) count++;
    if (filters.minMoves > 0) count++;
    if (filters.maxMoves > 0) count++;
    if (filters.stipulations.length > 0) count++;
    if (filters.statusFilter !== 'all') count++;
    return count;
  }, [filters]);

  // Helper: resolve a hash slug to category + genre
  const resolveHashSlug = useCallback((slug: string): { category: Category; genre: Genre } | null => {
    // Category slugs (onemover, twomover, help2, etc.)
    const catDef = CATEGORY_DEFS.find(d => d.category === slug);
    if (catDef) return { category: catDef.category, genre: catDef.genre };
    // Legacy genre slugs (direct, help, self, study, retro)
    const genreSlug = slug as Genre;
    if (['direct', 'help', 'self', 'study', 'retro'].includes(genreSlug)) {
      // Map legacy genre to first available category for that genre
      const cat = CATEGORY_DEFS.find(d => d.genre === genreSlug);
      if (cat) return { category: cat.category, genre: genreSlug };
    }
    return null;
  }, []);

  // All valid slugs for hash matching
  const allSlugs = CATEGORY_DEFS.map(d => d.category).join('|') + '|direct|help|self|study|retro';

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash;
      if (!hash || hash === '#') {
        // Back to home
        setView('mode-select');
        setCurrentGenre(null);
        setCurrentCategory(null);
        setShowProblemList(false);
        setShowFilterPage(false);
        setShowHamburgerMenu(false);
        setShowHistory(false);
        setShowProblemInfo(false);
        return;
      }
      const slugRegex = new RegExp(`^#\\/(${allSlugs})\\/yacpdb\\/(\\d+)$`);
      const yacpdbMatch = hash.match(slugRegex);
      const slugOnlyRegex = new RegExp(`^#\\/(${allSlugs})$`);
      const genreOnlyMatch = hash.match(slugOnlyRegex);
      if (yacpdbMatch) {
        const resolved = resolveHashSlug(yacpdbMatch[1]);
        if (!resolved) return;
        const { category, genre } = resolved;
        const problemId = parseInt(yacpdbMatch[2]);
        setCurrentGenre(genre);
        setCurrentCategory(category);
        setView('solving');
        setShowProblemList(false);
        setShowFilterPage(false);
        setShowHamburgerMenu(false);
        setShowHistory(false);
        setShowProblemInfo(false);
        // Load genre data if needed, then navigate to problem
        loadGenre(genre).then(problems => {
          const target = problems.find(p => p.id === problemId);
          if (target) {
            loadAndStartProblem(target);
            cacheProblem(target);
            setCurrentProblemId(prev => ({ ...prev, [category]: target.id }));
          }
        });
      } else if (genreOnlyMatch) {
        const resolved = resolveHashSlug(genreOnlyMatch[1]);
        if (!resolved) return;
        const { category, genre } = resolved;
        setCurrentGenre(genre);
        setCurrentCategory(category);
        setView('solving');
        setShowProblemList(false);
        setShowFilterPage(false);
        setShowHamburgerMenu(false);
        setShowHistory(false);
        setShowProblemInfo(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [loadGenre, loadAndStartProblem, cacheProblem, setCurrentProblemId, setCurrentCategory, resolveHashSlug, allSlugs]);

  // Helper: determine category from genre + problem moveCount (for legacy URLs)
  const categoryFromGenreProblem = useCallback((genre: Genre, moveCount?: number): Category => {
    if (moveCount == null) {
      return CATEGORY_DEFS.find(d => d.genre === genre)?.category || genre as Category;
    }
    if (genre === 'direct') {
      if (moveCount <= 2) return 'twomover';
      if (moveCount === 3) return 'threemover';
      return 'moremover';
    }
    if (genre === 'help') {
      if (moveCount <= 2) return 'help2';
      if (moveCount === 3) return 'help3';
      return 'helpmore';
    }
    return CATEGORY_DEFS.find(d => d.genre === genre)?.category || genre as Category;
  }, []);

  // Restore from hash on initial load
  const hashRestoredRef = useRef(false);
  // Track which problem ID was loaded to prevent late async callbacks from resetting state
  const loadedProblemIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (hashRestoredRef.current) return;
    hashRestoredRef.current = true;

    const hash = window.location.hash;
    if (hash === '#/terms') {
      setView('mode-select');
      return;
    }
    // New format: #/slug/yacpdb/12345 (slug = category or legacy genre)
    const slugRegex = new RegExp(`^#\\/(${allSlugs})\\/yacpdb\\/(\\d+)$`);
    const yacpdbMatch = hash.match(slugRegex);
    // Legacy format: #/genre/12345 (1-based index)
    const legacyMatch = hash.match(/^#\/(direct|help|self|study|retro)\/(\d+)$/);
    const match = yacpdbMatch || legacyMatch;
    if (!match) {
      // Check if it's just a slug without problem number
      const slugOnlyRegex = new RegExp(`^#\\/(${allSlugs})$`);
      const genreOnly = hash.match(slugOnlyRegex);
      if (!genreOnly) return;
      const resolved = resolveHashSlug(genreOnly[1]);
      if (!resolved) return;
      setCurrentGenre(resolved.genre);
      setCurrentCategory(resolved.category);
      setView('solving');
      loadGenre(resolved.genre).then(problems => {
        if (problems.length === 0) return;
        const genreProgress = progress[resolved.genre] || {};
        let nextProblem: ChessProblem | null = null;
        for (const p of problems) {
          if (genreProgress[String(p.id)] !== 'solved' && genreProgress[String(p.id)] !== 'skipped') {
            nextProblem = p;
            break;
          }
        }
        if (!nextProblem) nextProblem = problems[0];
        if (nextProblem) {
          loadAndStartProblem(nextProblem);
          cacheProblem(nextProblem);
          setCurrentProblemId(prev => ({ ...prev, [resolved.category]: nextProblem!.id }));
          history.replaceState(null, '', `#/${resolved.category}/yacpdb/${nextProblem.id}`);
        }
      });
      return;
    }

    const slug = match[1];
    const resolved = resolveHashSlug(slug);
    if (!resolved) return;
    const { genre } = resolved;
    const isLegacy = !yacpdbMatch;
    const problemNum = match[2] ? parseInt(match[2]) : null;

    setCurrentGenre(genre);
    // Category will be determined after we know moveCount
    setView('solving');

    // Instantly show cached problem while genre data loads
    let cacheHit = false;
    try {
      const cached = localStorage.getItem('cp-cached-problem');
      if (cached) {
        const cachedProblem = JSON.parse(cached) as ChessProblem;
        if (cachedProblem.genre === genre) {
          if (cachedProblem.solutionText && (!cachedProblem.solutionTree || cachedProblem.solutionTree.length === 0)) {
            const firstColor = (cachedProblem.genre === 'help' || (cachedProblem.genre === 'retro' && cachedProblem.stipulation.startsWith('h#'))) ? 'b' : 'w';
            cachedProblem.solutionTree = parseSolution(cachedProblem.solutionText, firstColor);
            if (cachedProblem.genre === 'retro' && cachedProblem.solutionText.includes('{(illegal')) {
              const flipColors = (nodes: typeof cachedProblem.solutionTree): void => {
                for (const n of nodes) { n.color = n.color === 'w' ? 'b' : 'w'; flipColors(n.children); }
              };
              flipColors(cachedProblem.solutionTree);
            }
            fixEnPassantFen(cachedProblem);
          }
          if (cachedProblem.solutionTree?.length > 0) {
            problem.loadProblem(cachedProblem);
            cacheHit = true;
          }
          const cat = isLegacy ? categoryFromGenreProblem(genre, cachedProblem.moveCount) : resolved.category;
          setCurrentCategory(cat);
          setCurrentProblemId(prev => ({ ...prev, [cat]: cachedProblem.id }));
        }
      }
    } catch { /* corrupt cache — ignore */ }

    // Quick-start: if no cache hit and we have a specific problem ID, fetch it directly
    if (!cacheHit && problemNum && !isLegacy) {
      setCurrentCategory(resolved.category);
      fetchProblem(problemNum).then(full => {
        const quickProblem = metaToChessProblem(full, full.solutionText);
        loadAndStartProblem(quickProblem);
        cacheProblem(quickProblem);
        setCurrentProblemId(prev => ({ ...prev, [resolved.category]: quickProblem.id }));
      }).catch(() => {});
    }

    // Load full genre data in background
    loadGenre(genre).then(problems => {
      if (problems.length === 0) return;

      if (problemNum) {
        let target: ChessProblem | undefined;
        if (isLegacy) {
          if (problemNum >= 1 && problemNum <= problems.length) {
            target = problems[problemNum - 1];
          }
        } else {
          target = problems.find(p => p.id === problemNum);
        }
        if (target) {
          const cat = isLegacy ? categoryFromGenreProblem(genre, target.moveCount) : resolved.category;
          setCurrentCategory(cat);
          if (target.id !== loadedProblemIdRef.current) {
            loadAndStartProblem(target);
            cacheProblem(target);
            setCurrentProblemId(prev => ({ ...prev, [cat]: target!.id }));
          }
          if (isLegacy) {
            history.replaceState(null, '', `#/${cat}/yacpdb/${target.id}`);
          }
        }
      } else if (!problem.problem || problem.problem.genre !== genre) {
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
          const cat = categoryFromGenreProblem(genre, nextProblem.moveCount);
          setCurrentCategory(cat);
          loadAndStartProblem(nextProblem);
          cacheProblem(nextProblem);
          setCurrentProblemId(prev => ({ ...prev, [cat]: nextProblem!.id }));
        }
      }
    });
  }, [loadGenre, loadAndStartProblem, ensureSolution, problem, setCurrentProblemId, setCurrentCategory, progress, cacheProblem, resolveHashSlug, allSlugs, categoryFromGenreProblem]);

  const selectMode = useCallback(async (category: Category, opts?: { skipSavedId?: boolean }) => {
    const def = CATEGORY_DEFS.find(d => d.category === category)!;
    const genre = def.genre;
    setIsDaily(false);
    setCurrentGenre(genre);
    setCurrentCategory(category);
    setView('solving');

    // Show tutorial if first time (use genre for tutorial tracking)
    if (!seenTutorials.includes(genre)) {
      setShowTutorial(true);
    }

    // Quick-start: fetch a single problem immediately while genre data loads in background
    const savedId = opts?.skipSavedId ? null : currentProblemId[category];
    if (!genreLoaded[genre]) {
      let quickStarted = false;
      try {
        if (savedId) {
          // Saved problem — fetch directly
          const full = await fetchProblem(savedId);
          const quickProblem = metaToChessProblem(full, full.solutionText);
          loadAndStartProblem(quickProblem);
          cacheProblem(quickProblem);
          updateHash(category, quickProblem.id);
          quickStarted = true;
        } else {
          // No saved problem — fetch first problem from API with category filters
          const params: Record<string, string> = {};
          if (def.minMoves != null) params.minMoves = String(def.minMoves);
          if (def.maxMoves != null && def.maxMoves > 0) params.maxMoves = String(def.maxMoves);
          const { problems: firstPage } = await fetchProblemsPage(genre, 0, 1, params);
          if (firstPage.length > 0) {
            const full = await fetchProblem(firstPage[0].id);
            const quickProblem = metaToChessProblem(full, full.solutionText);
            loadAndStartProblem(quickProblem);
            cacheProblem(quickProblem);
            setCurrentProblemId(prev => ({ ...prev, [category]: quickProblem.id }));
            updateHash(category, quickProblem.id);
            quickStarted = true;
          }
        }
      } catch { /* quick-start failed — will fall through to full load below */ }

      if (quickStarted) {
        // Load genre data in background (don't await), don't replace the displayed problem
        loadGenre(genre);
        return;
      }
      // Quick-start failed — fall through to full load
    }

    // Load genre data (await if not yet loaded)
    let problems = genreLoaded[genre] ? genreData[genre] : await loadGenre(genre);

    // Apply category-level move filter
    if (def.minMoves != null) {
      problems = problems.filter(p => {
        if (def.maxMoves === 0) return p.moveCount >= def.minMoves!;
        return p.moveCount >= def.minMoves! && p.moveCount <= def.maxMoves!;
      });
    }

    // Find next unsolved problem from the loaded data
    const genreProgress = progress[genre] || {};
    let nextProblem: ChessProblem | null = null;
    if (savedId) {
      const current = problems.find(p => p.id === savedId);
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
      loadAndStartProblem(nextProblem);
      cacheProblem(nextProblem);
      setCurrentProblemId(prev => ({ ...prev, [category]: nextProblem!.id }));
      updateHash(category, nextProblem.id);
    } else {
      updateHash(category);
    }
  }, [seenTutorials, loadGenre, loadAndStartProblem, progress, currentProblemId, problem, setCurrentProblemId, setCurrentCategory, cacheProblem, updateHash, genreLoaded]);

  const closeTutorial = useCallback(() => {
    setShowTutorial(false);
    if (currentGenre) {
      setSeenTutorials(prev => [...prev, currentGenre]);
    }
  }, [currentGenre, setSeenTutorials]);

  const goBack = useCallback(() => {
    setView('mode-select');
    setIsDaily(false);
    setCurrentGenre(null);
    setCurrentCategory(null);
    updateHash(null, null, false);
  }, [updateHash, setCurrentCategory]);

  const handleDailyMore = useCallback(async () => {
    const dailyProblemId = problem.problem?.id;
    setIsDaily(false);
    if (genreLoaded.direct) {
      // Genre already loaded — find and show next problem instantly
      setCurrentGenre('direct');
      setCurrentCategory('twomover');
      const def = CATEGORY_DEFS.find(d => d.category === 'twomover')!;
      let problems = genreData.direct;
      if (def.minMoves != null) {
        problems = problems.filter(p => def.maxMoves === 0 ? p.moveCount >= def.minMoves! : p.moveCount >= def.minMoves! && p.moveCount <= def.maxMoves!);
      }
      const genreProgress = progress.direct || {};
      const savedTwomoverId = currentProblemId['twomover'];
      let next: ChessProblem | undefined;

      // Resume from saved twomover position if available
      if (savedTwomoverId) {
        const savedIdx = problems.findIndex(p => p.id === savedTwomoverId);
        if (savedIdx >= 0) {
          // If saved problem is already solved, find next unsolved after it
          if (genreProgress[String(savedTwomoverId)] === 'solved' || savedTwomoverId === dailyProblemId) {
            next = problems.slice(savedIdx + 1).find(p =>
              p.id !== dailyProblemId &&
              genreProgress[String(p.id)] !== 'solved' &&
              genreProgress[String(p.id)] !== 'skipped'
            );
          } else {
            next = problems[savedIdx];
          }
        }
      }

      // Fallback: find first unsolved problem (excluding daily)
      if (!next) {
        next = problems.find(p =>
          p.id !== dailyProblemId &&
          genreProgress[String(p.id)] !== 'solved' &&
          genreProgress[String(p.id)] !== 'skipped'
        );
      }
      if (!next) next = problems.find(p => p.id !== dailyProblemId);
      if (!next) next = problems[0];
      if (next) {
        loadAndStartProblem(next);
        cacheProblem(next);
        setCurrentProblemId(prev => ({ ...prev, twomover: next!.id }));
        updateHash('twomover', next.id);
      }
    } else {
      // Genre not loaded — selectMode will quick-start from saved position or API
      selectMode('twomover');
    }
  }, [selectMode, problem, genreLoaded, genreData, progress, currentProblemId, loadAndStartProblem, cacheProblem, setCurrentProblemId, updateHash, setCurrentCategory]);

  const handleHistorySelect = useCallback(async (genre: Genre, selected: ChessProblem) => {
    setShowHistory(false);
    setCurrentGenre(genre);
    setView('solving');
    // Ensure genre data is loaded
    await loadGenre(genre);
    loadAndStartProblem(selected);
    cacheProblem(selected);
    setCurrentProblemId(prev => ({ ...prev, [genre]: selected.id }));
    updateHash(genre, selected.id);
  }, [loadGenre, loadAndStartProblem, problem, cacheProblem, setCurrentProblemId, updateHash]);

  const handlePieceDrop = useCallback((source: string, target: string, piece: string): boolean => {
    // Determine promotion: react-chessboard passes the selected piece (e.g. 'wN', 'wQ')
    const isPromotion = target[1] === '8' || target[1] === '1';
    const promoMap: Record<string, string> = { Q: 'q', R: 'r', B: 'b', N: 'n' };
    const promoPiece = isPromotion ? (promoMap[piece[1]] || 'q') : undefined;
    return problem.tryMove(source, target, promoPiece);
  }, [problem]);

  const handleSelectProblem = useCallback((selected: ChessProblem) => {
    if (!currentGenre) return;
    loadAndStartProblem(selected);
    cacheProblem(selected);
    setCurrentProblemId(prev => ({ ...prev, [currentCategory || currentGenre || '']:selected.id }));
    setShowProblemList(false);
    updateHash(currentCategory || currentGenre, selected.id);
  }, [currentGenre, loadAndStartProblem, cacheProblem, setCurrentProblemId, updateHash]);

  const handleGiveUp = useCallback(() => {
    if (currentGenre && problem.problem) {
      const pid = String(problem.problem.id);
      setProgress(prev => {
        const genreProgress = prev[currentGenre] || {};
        if (genreProgress[pid] === 'solved') return prev; // don't downgrade
        return { ...prev, [currentGenre]: { ...genreProgress, [pid]: 'failed' as const } };
      });
      const tsKey = `${currentGenre}:${pid}`;
      setTimestamps(prev => ({ ...prev, [tsKey]: Date.now() }));
    }
    problem.showSolution();
  }, [currentGenre, problem, setProgress, setTimestamps]);

  // Fetch a random problem via API (used when genre data hasn't loaded yet)
  const fetchRandomFromApi = useCallback(async () => {
    if (!currentGenre) return;
    const catDef = currentCategory ? CATEGORY_DEFS.find(d => d.category === currentCategory) : null;
    const params: Record<string, string> = {};
    if (catDef?.minMoves != null) params.minMoves = String(catDef.minMoves);
    if (catDef?.maxMoves != null && catDef.maxMoves > 0) params.maxMoves = String(catDef.maxMoves);
    const total = problemCounts[currentCategory || currentGenre as Category] || 1000;
    const randomOffset = Math.floor(Math.random() * total);
    try {
      const { problems: page } = await fetchProblemsPage(currentGenre, randomOffset, 1, params);
      if (page.length > 0 && page[0].id !== problem.problem?.id) {
        const full = await fetchProblem(page[0].id);
        const p = metaToChessProblem(full, full.solutionText);
        loadAndStartProblem(p);
        cacheProblem(p);
        setCurrentProblemId(prev => ({ ...prev, [currentCategory || currentGenre || '']: p.id }));
        updateHash(currentCategory || currentGenre, p.id);
      }
    } catch { /* API error — ignore */ }
  }, [currentGenre, currentCategory, problemCounts, problem.problem, loadAndStartProblem, cacheProblem, setCurrentProblemId, updateHash]);

  const handleNextProblem = useCallback(() => {
    if (!currentGenre || !problem.problem) return;

    // Only mark as solved if actually solved (not just viewing after give up)
    if (problem.status === 'correct') {
      const pid = String(problem.problem!.id);
      setProgress(prev => ({
        ...prev,
        [currentGenre]: {
          ...prev[currentGenre],
          [pid]: 'solved' as const,
        },
      }));
      const tsKey = `${currentGenre}:${pid}`;
      setTimestamps(prev => ({ ...prev, [tsKey]: Date.now() }));
    }

    // Find next from in-memory data, or fall back to API
    const problems = filteredProblems;
    if (problems.length === 0) {
      fetchRandomFromApi();
      return;
    }
    const currentIdx = problems.findIndex(p => p.id === problem.problem!.id);
    const nextProblem = problems[currentIdx + 1] || problems[0];

    if (nextProblem) {
      loadAndStartProblem(nextProblem);
      cacheProblem(nextProblem);
      setCurrentProblemId(prev => ({ ...prev, [currentCategory || currentGenre || '']:nextProblem.id }));
      updateHash(currentCategory || currentGenre, nextProblem.id);
    }
  }, [currentGenre, problem, loadAndStartProblem, filteredProblems, setProgress, setTimestamps, setCurrentProblemId, updateHash, cacheProblem, fetchRandomFromApi]);

  // Navigate to prev/next problem without marking solved
  const handleNavProblem = useCallback((direction: -1 | 1) => {
    if (!currentGenre || !problem.problem) return;
    const problems = filteredProblems;
    if (problems.length === 0) {
      fetchRandomFromApi();
      return;
    }
    const currentIdx = problems.findIndex(p => p.id === problem.problem!.id);
    if (currentIdx === -1) {
      // Current problem not in filtered set — go to first
      const next = problems[0];
      loadAndStartProblem(next);
      cacheProblem(next);
      setCurrentProblemId(prev => ({ ...prev, [currentCategory || currentGenre || '']:next.id }));
      setAnalysisResult(null);
      updateHash(currentCategory || currentGenre, next.id);
      return;
    }
    const nextIdx = currentIdx + direction;
    if (nextIdx < 0 || nextIdx >= problems.length) return;
    const next = problems[nextIdx];
    loadAndStartProblem(next);
    cacheProblem(next);
    setCurrentProblemId(prev => ({ ...prev, [currentCategory || currentGenre || '']:next.id }));
    setAnalysisResult(null);
    updateHash(currentCategory || currentGenre, next.id);
  }, [currentGenre, problem, loadAndStartProblem, filteredProblems, setCurrentProblemId, updateHash, cacheProblem, fetchRandomFromApi]);

  const handleRandomProblem = useCallback(() => {
    if (!currentGenre) return;
    const problems = filteredProblems;
    if (problems.length === 0) {
      fetchRandomFromApi();
      return;
    }
    if (problems.length <= 1) return;
    const genreProgress = progress[currentGenre] || {};
    // Only pick problems not yet attempted (not solved, not failed)
    const unseen = problems.filter(p =>
      p.id !== problem.problem?.id &&
      !genreProgress[String(p.id)]
    );
    const pool = unseen.length > 0 ? unseen : problems;
    let next: typeof problems[0];
    do {
      const idx = Math.floor(Math.random() * pool.length);
      next = pool[idx];
    } while (next.id === problem.problem?.id && pool.length > 1);
    loadAndStartProblem(next);
    cacheProblem(next);
    setCurrentProblemId(prev => ({ ...prev, [currentCategory || currentGenre || '']:next.id }));
    updateHash(currentCategory || currentGenre, next.id);
  }, [currentGenre, problem, loadAndStartProblem, filteredProblems, progress, setCurrentProblemId, updateHash, cacheProblem, fetchRandomFromApi]);

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

  // Auto-save progress when problem is solved correctly (don't wait for Next click)
  useEffect(() => {
    if (problem.status === 'correct' && problem.problem && currentGenre) {
      const pid = String(problem.problem.id);
      setProgress(prev => {
        const genreProgress = prev[currentGenre] || {};
        if (genreProgress[pid] === 'solved') return prev; // already saved
        return { ...prev, [currentGenre]: { ...genreProgress, [pid]: 'solved' as const } };
      });
      const tsKey = `${currentGenre}:${pid}`;
      setTimestamps(prev => prev[tsKey] ? prev : { ...prev, [tsKey]: Date.now() });
    }
  }, [problem.status, problem.problem, currentGenre, setProgress, setTimestamps]);

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
          onOpenMenu={() => setShowHamburgerMenu(true)}
          onOpenProblemList={view === 'solving' && currentGenre ? () => { setShowProblemList(true); if (currentGenre && !genreLoaded[currentGenre]) loadGenre(currentGenre); } : undefined}
          onOpenFilters={view === 'solving' && currentGenre ? () => { setFilterOpenedFrom('hamburger'); setShowFilterPage(true); } : undefined}
          activeFilterCount={activeFilterCount}
        />

        <main className="px-4 pb-8">

          {view === 'mode-select' && (
              <ModeSelector
                onSelectMode={selectMode}
                progress={progress}
                problemCounts={problemCounts}
                dailyProblem={dailyProblem}
                onSolveDaily={handleSolveDaily}
                dailySolved={dailySolved}
                onShowChangelog={() => setShowChangelog(true)}
              />
          )}

          {view === 'solving' && !problem.problem && (genreLoading || (currentGenre && !genreLoaded[currentGenre])) && (
            <div className="text-center py-16">
              <div className="flex justify-center gap-1 mb-4">
                {['♚', '♛', '♜', '♝', '♞'].map((piece, i) => (
                  <div
                    key={i}
                    className="text-3xl text-gray-700 dark:text-gray-300 w-9 text-center"
                    ref={el => {
                      if (el) {
                        el.animate(
                          [
                            { transform: 'translateY(0)', offset: 0 },
                            { transform: 'translateY(-12px)', offset: 0.4 },
                            { transform: 'translateY(0)', offset: 0.8 },
                            { transform: 'translateY(0)', offset: 1 },
                          ],
                          { duration: 1200, iterations: Infinity, easing: 'ease-in-out', delay: i * 150 }
                        );
                      }
                    }}
                  >
                    {piece}
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading problems...</p>
            </div>
          )}

          {view === 'solving' && problem.problem && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <button
                    onClick={() => handleNavProblem(-1)}
                    disabled={!currentGenre || !problem.problem || filteredProblems.findIndex(p => p.id === problem.problem!.id) <= 0}
                    className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-20 transition-colors shrink-0"
                    title="Previous problem"
                  >
                    <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <ProblemCard
                    problem={problem.problem}
                    problemNumber={problem.problem!.id}
                    genrePrefix={({ direct: 'D', help: 'H', self: 'S', study: 'E', retro: 'R' } as Record<string, string>)[currentGenre || 'direct'] || 'D'}
                    showThemes={problem.status === 'correct' || problem.status === 'viewing'}
                  />
                  <button
                    onClick={() => handleNavProblem(1)}
                    disabled={!currentGenre || !problem.problem || filteredProblems.findIndex(p => p.id === problem.problem!.id) >= filteredProblems.length - 1}
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
                  <svg className={`w-5 h-5 ${isBookmarked ? 'text-yellow-500' : 'text-gray-400 dark:text-gray-500'}`}
                    viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </button>
                <button
                  onClick={() => setShowProblemInfo(true)}
                  className="w-6 h-6 rounded-full border border-gray-400 dark:border-gray-500 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center shrink-0"
                  title="Problem info"
                >
                  i
                </button>
              </div>

              {showProblemList && currentGenre && (
                <ProblemList
                  problems={filteredProblems}
                  allProblems={problemsByGenre[currentGenre]}
                  progress={progress[currentGenre] || {}}
                  bookmarks={bookmarks[currentGenre] || []}
                  currentProblemId={problem.problem.id}
                  onSelectProblem={handleSelectProblem}
                  onClose={() => setShowProblemList(false)}
                  onOpenFilters={() => { setShowProblemList(false); setFilterOpenedFrom('problemList'); setShowFilterPage(true); }}
                  activeFilterCount={activeFilterCount}
                  sortBy={filters.sortBy}
                  sortOrder={filters.sortOrder}
                  onSortChange={(sort, order) => setFilters({ ...filters, sortBy: sort, sortOrder: order })}
                  statusFilter={filters.statusFilter}
                  onStatusFilterChange={(f) => setFilters({ ...filters, statusFilter: f })}
                  loading={!!genreLoading || !genreLoaded[currentGenre]}
                  genrePrefix={({ direct: 'D', help: 'H', self: 'S', study: 'E', retro: 'R' } as Record<string, string>)[currentGenre] || ''}
                />
              )}

              {showFilterPage && currentGenre && (
                <FilterPage
                  allProblems={problemsByGenre[currentGenre]}
                  filters={filters}
                  onFiltersChange={setFilters}
                  onClose={() => {
                    setShowFilterPage(false);
                    if (filterOpenedFrom === 'problemList') {
                      setShowProblemList(true);
                    } else if (currentGenre) {
                      // From hamburger (problem page): navigate to a matching problem
                      const currentId = problem.problem?.id;
                      const matching = filteredProblems;
                      if (matching.length > 0) {
                        // If current problem already matches, stay on it
                        const alreadyMatches = matching.some(p => p.id === currentId);
                        if (!alreadyMatches) {
                          const target = matching[0];
                          loadAndStartProblem(target);
                          cacheProblem(target);
                          setCurrentProblemId(prev => ({ ...prev, [currentCategory || currentGenre || '']:target.id }));
                          updateHash(currentCategory || currentGenre, target.id);
                        }
                      }
                    }
                  }}
                  genreStats={genreStats}
                  hideMoveFilter={categoryDef?.maxMoves != null && categoryDef.maxMoves > 0}
                  moveFilterMin={categoryDef?.maxMoves === 0 ? categoryDef.minMoves : undefined}
                  showStipulationFilter={currentGenre === 'retro' || currentGenre === 'study'}
                />
              )}

              <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 pb-1">
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
              </div>

              <FeedbackPanel
                status={problem.status}
                feedback={problem.feedback}
                moveHistory={problem.moveHistory}
                hintActive={!!problem.hintSquares}
                solutionLoading={problem.problem?.solutionTree?.length === 0}
                onReset={problem.resetProblem}
                onShowSolution={handleGiveUp}
                onNextProblem={isDaily ? undefined : handleNextProblem}
                onRandomProblem={isDaily ? undefined : handleRandomProblem}
                onShowHint={problem.showHint}
                onHideHint={problem.hideHint}
                onAnalyze={handleAnalyze}
                analyzing={analyzing}
                analysisResult={analysisResult}
                stockfishLoading={stockfish.readyState === 'loading'}
                refutationText={problem.refutationText}
                analysisActive={analysisActive}
                onGoHome={isDaily ? goBack : undefined}
                onMoreProblems={isDaily ? handleDailyMore : undefined}
                moreCategoryLabel="More Twomovers"
                lichessAnalysisUrl={currentGenre === 'study' && problem.problem ? `https://lichess.org/analysis/${problem.problem.fen.replace(/ /g, '_')}` : undefined}
                lichessPlayUrl={currentGenre === 'study' && problem.problem ? `https://lichess.org/editor/${problem.problem.fen.replace(/ /g, '_')}` : undefined}
              />

              {(problem.status === 'correct' || problem.status === 'viewing') && currentGenre === 'retro' && problem.problem.solutionText && (() => {
                const st = problem.problem.solutionText;
                const start = st.replace(/^\{[^}]*\}\s*/, '').trimStart();
                const isBlack = /\{[^}]*[Bb]lack to move/i.test(st)
                  || /^\.{2,}/.test(start) || /^\d+\.{3}/.test(start);
                const isIllegal = st.includes('{(illegal');
                if (!isBlack && !isIllegal) return null;
                return (
                  <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                    {isIllegal ? "White's move is illegal — it's Black's turn." : 'Black to move'}
                  </p>
                );
              })()}


              {(problem.status === 'correct' || problem.status === 'viewing') && (
                <SolutionTree
                  fullNodes={problem.problem.fullSolutionTree}
                  initialFen={problem.initialFen}
                  solutionText={problem.problem.solutionText}
                  firstColor={(problem.initialFen.split(' ')[1] || 'w') as 'w' | 'b'}
                  playback={problem.playback}
                  onGoTo={problem.playbackGoTo}
                  onFirst={problem.playbackFirst}
                  onPrev={problem.playbackPrev}
                  onNext={problem.playbackNext}
                  onLast={problem.playbackLast}
                  onExplore={problem.playbackExplore}
                />
              )}
            </div>
          )}

          {view === 'solving' && !problem.problem && !genreLoading && currentGenre && genreLoaded[currentGenre] && (
            <div className="text-center py-12 text-gray-400">
              No problems available for this mode.
            </div>
          )}
        </main>
      </div>

      {showTutorial && currentGenre && (
        <GenreTutorial genre={currentGenre} onClose={closeTutorial} />
      )}

      <HamburgerMenu
        isOpen={showHamburgerMenu}
        onClose={() => setShowHamburgerMenu(false)}
        onOpenHistory={() => {
          setShowHamburgerMenu(false);
          setShowHistory(true);
          // Load all genres that have progress data
          for (const g of ['direct', 'help', 'self', 'study', 'retro'] as Genre[]) {
            const prg = progress[g] || {};
            if (Object.keys(prg).length > 0 && !genreLoaded[g]) {
              loadGenre(g);
            }
          }
        }}
        onGoToId={async (id: number) => {
          try {
            const full = await fetchProblem(id);
            const p = metaToChessProblem(full, full.solutionText);
            const genre = p.genre as Genre;
            const cat = categoryFromGenreProblem(genre, p.moveCount);
            setCurrentGenre(genre);
            setCurrentCategory(cat);
            setView('solving');
            loadAndStartProblem(p);
            cacheProblem(p);
            setCurrentProblemId(prev => ({ ...prev, [cat]: p.id }));
            updateHash(cat, p.id);
            loadGenre(genre);
          } catch {
            // Problem not found — ignore silently
          }
        }}
        onOpenBookmarks={() => {
          setShowHamburgerMenu(false);
          setShowBookmarksPage(true);
          // Load all genres that have bookmarks
          for (const g of ['direct', 'help', 'self', 'study', 'retro'] as Genre[]) {
            if ((bookmarks[g] || []).length > 0 && !genreLoaded[g]) loadGenre(g);
          }
        }}
        onOpenSearch={() => { setShowHamburgerMenu(false); setShowSearchPage(true); }}
      />

      {showHistory && (
        <HistoryPage
          genreData={genreData}
          genreLoaded={genreLoaded}
          progress={progress}
          timestamps={timestamps}
          onSelectProblem={handleHistorySelect}
          onClose={() => setShowHistory(false)}
        />
      )}

      {showSearchPage && (
        <SearchPage
          onClose={() => setShowSearchPage(false)}
          initialQuery={searchQuery}
          onQueryChange={setSearchQuery}
          cachedResults={searchResults}
          onResultsChange={setSearchResults}
          onSelectResult={async (result) => {
            setShowSearchPage(false);
            const genre = result.genre as Genre;
            setCurrentGenre(genre);
            setView('solving');
            const cat = categoryFromGenreProblem(genre, result.moveCount);
            setCurrentCategory(cat);
            try {
              const full = await fetchProblem(result.id);
              const p = metaToChessProblem(full, full.solutionText);
              loadAndStartProblem(p);
              cacheProblem(p);
              setCurrentProblemId(prev => ({ ...prev, [cat]: p.id }));
              updateHash(cat, p.id);
              loadGenre(genre);
            } catch { /* ignore */ }
          }}
        />
      )}

      {showChangelog && (
        <ChangelogPage onClose={() => setShowChangelog(false)} />
      )}

      {showBookmarksPage && (
        <BookmarksPage
          genreData={genreData}
          genreLoaded={genreLoaded}
          bookmarks={bookmarks}
          onSelectProblem={(genre, selected) => {
            setShowBookmarksPage(false);
            handleHistorySelect(genre, selected);
          }}
          onClose={() => setShowBookmarksPage(false)}
        />
      )}

      {/* Problem Info Modal */}
      {showProblemInfo && problem.problem && (() => {
        const p = problem.problem!;
        const pc = pieceCount(p.fen);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowProblemInfo(false)} />
            <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-sm w-full mx-4 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Problem Info</h3>
                <button onClick={() => setShowProblemInfo(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-400 dark:text-gray-500">Author: </span>
                  <span className="text-gray-900 dark:text-gray-100 font-medium">{p.authors.join(', ')}</span>
                </div>
                <div>
                  <span className="text-gray-400 dark:text-gray-500">Source: </span>
                  <span className="text-gray-900 dark:text-gray-100">{p.sourceName}{p.sourceYear ? `, ${p.sourceYear}` : ''}</span>
                </div>
                <div>
                  <span className="text-gray-400 dark:text-gray-500">YACPDB: </span>
                  <a href={`https://www.yacpdb.org/#${p.id}`} target="_blank" rel="noopener noreferrer"
                    className="text-green-600 dark:text-green-400 underline hover:text-green-700">
                    #{p.id}
                  </a>
                </div>
                <div>
                  <span className="text-gray-400 dark:text-gray-500">Stipulation: </span>
                  <span className="text-gray-900 dark:text-gray-100 font-mono">{p.stipulation}</span>
                </div>
                <div>
                  <span className="text-gray-400 dark:text-gray-500">Pieces: </span>
                  <span className="text-gray-900 dark:text-gray-100">{pc}</span>
                </div>
                {p.award && (
                  <div>
                    <span className="text-gray-400 dark:text-gray-500">Award: </span>
                    <span className="text-yellow-600 dark:text-yellow-400">{p.award}</span>
                  </div>
                )}
                {p.keywords.length > 0 && (
                  <div>
                    <span className="text-gray-400 dark:text-gray-500 block mb-1">Themes:</span>
                    <div className="flex flex-wrap gap-1">
                      {p.keywords.map(kw => (
                        <span key={kw} className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
