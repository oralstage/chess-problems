import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { useTheme } from './hooks/useTheme';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useProblem, isUnplayableJokeProblem } from './hooks/useProblem';
import { useStockfish } from './hooks/useStockfish';
import { Header } from './components/Header';
import { ModeSelector } from './components/ModeSelector';
import { Board } from './components/Board';
import { getPromotionForMove } from './services/moveInput';
import { ProblemCard } from './components/ProblemCard';
import { ThemeTags } from './components/ThemeTags';
import { FeedbackPanel } from './components/FeedbackPanel';
import { SolutionTree } from './components/SolutionTree';
import { ThemeInsightCards } from './components/ThemeInsightCard';
import { getThemeInsights } from './utils/themeInsight';
import { composerLine } from './utils/composerName';
import { GenreTutorial } from './components/GenreTutorial';
// import { TermsPage } from './components/TermsPage';
import { ProblemList } from './components/ProblemList';
import { FilterPage } from './components/FilterPage';
import { HamburgerMenu } from './components/HamburgerMenu';
import { RatingSyncModal } from './components/RatingSyncModal';
import { SearchPage } from './components/SearchPage';
import { BookmarksPage } from './components/BookmarksPage';
import { WcscPage } from './components/WcscPage';
import { ThemeGuidePage } from './components/ThemeGuidePage';
import { ChangelogPage } from './components/ChangelogPage';
import { GuidePage } from './components/GuidePage';
import { HistoryPage } from './components/HistoryPage';
import { DailyHistoryPage } from './components/DailyHistoryPage';
import { useSolveStats, SolveStatsModal } from './components/SolveStatsPanel';
import { parseSolution, filterKeyMoves, extractTwinFenMods, applyTwinMods, parseTwins, extractSolutionNotes } from './services/solutionParser';
import { fetchAllProblems, fetchProblemsPage, fetchProblem, fetchProblemIndex, fetchDaily, fetchDailyByDate, fetchStats, metaToChessProblem, fixCastlingRights, submitSolveEvent, submitRatingEvent, fetchRatedProblem, fetchProblemRating, trackEvent, fetchMyProgress, getSessionId, fetchSiteStats, pushBookmark, pushPlayerRating, uploadLocalSyncData, RATED_GENRES, type RatedGenre, type SyncReviewCard } from './services/api';
import { usePlayerRating } from './hooks/usePlayerRating';
import type { Glicko2Rating } from './utils/glicko2';
import { useReviewQueue } from './hooks/useReviewQueue';
import { getStipulationToastClasses, stipulationPhrase } from './utils/stipulationColor';
import { flipDuplexRoots, mainLinePlays } from './utils/duplex';
import { DUPLEX_IDS } from './data/duplexIds';
import { matchesAwardFilter, type AwardFilter } from './utils/award';
import { moveFreely, pieceAt } from './utils/freeBoard';
import { isCookedProblem } from './utils/cookMarker';
import {
  type RatedDifficulty,
  RATED_DIFFICULTY_OFFSET,
  loadRatedDifficulty,
  saveRatedDifficulty as saveRatedDifficultyPref,
  loadRatedProblem as loadRatedProblemSlot,
  saveRatedProblem as saveRatedProblemSlot,
  clearRatedProblems,
} from './utils/ratedDifficulty';
import type { AppView, Genre, Category, ProblemProgress, ChessProblem, PrintMode, SolutionNode } from './types';
import { CATEGORY_DEFS } from './types';

// Deepest line in a solution tree, in plies. A threat node counts double: it is
// the attacker's follow-up, so an opponent ply sits implicitly in front of it
// (computePositions inserts one during playback for the same reason).
function solutionTreeDepth(nodes: SolutionNode[] | undefined): number {
  if (!nodes || nodes.length === 0) return 0;
  let max = 0;
  for (const n of nodes) {
    const d = (n.isThreat ? 2 : 1) + solutionTreeDepth(n.children);
    if (d > max) max = d;
  }
  return max;
}

/** Rows read when opening a category cold, to find the first unsolved problem
 *  without waiting for the genre index. Wide enough that a visitor who has
 *  solved the easiest problems in a category still gets a hit in one request. */
const QUICK_START_PAGE_SIZE = 50;

/* Flawless-solve toast praise. "Brilliant" borrows chess's own "!!". */
const PRAISE_WORDS = ['Excellent!', 'Brilliant!', 'Perfect!', 'Well done!'];

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
  awardFilter: AwardFilter;
}

/** Migrate old localStorage format */
function migrateFilters(raw: unknown): GlobalFilters {
  const defaults: GlobalFilters = { keywords: [], minPieces: 0, maxPieces: 0, minYear: 0, maxYear: 0, minMoves: 0, maxMoves: 0, sortBy: 'difficulty', sortOrder: 'asc', stipulations: [], statusFilter: 'all', awardFilter: 'all' };
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
  if (!['all', 'awarded', 'none'].includes(obj.awardFilter as string)) obj.awardFilter = 'all';
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
  useTheme();
  const [view, setView] = useState<AppView>('mode-select');
  /* Problem opened from the WCSC page: the feedback panel swaps Next/Random
     for Home + "Back to WCSC", because Next would walk off into neighbouring
     YACPDB ids and strand the reader outside the event. */
  const [isWcsc, setIsWcsc] = useState(false);
  /* The free-movement analysis board (null = off). Lives outside useProblem:
     nothing done on it counts as an answer — it is the pocket set a solving
     championship hands out, not the answer sheet. */
  const [analysisFen, setAnalysisFen] = useState<string | null>(null);
  const analysisStartFenRef = useRef<string>('');
  const handleFreeDrop = useCallback((source: string, target: string, piece?: string): boolean => {
    setAnalysisFen(prev => {
      if (!prev) return prev;
      // A pawn reaching its last rank comes with the picker's choice ('wQ',
      // 'bN', ...); anything else arrives as a placeholder and moves as-is.
      const mover = pieceAt(prev, source);
      const isPromo = ((mover === 'P' && target[1] === '8') || (mover === 'p' && target[1] === '1'))
        && !!piece && /^[wb][QRBN]$/.test(piece);
      const replaceWith = isPromo ? (piece![0] === 'w' ? piece![1] : piece![1].toLowerCase()) : undefined;
      return moveFreely(prev, source, target, replaceWith);
    });
    return true;
  }, []);
  // Home is tall enough to scroll; the solving view barely is. Without a reset
  // the browser clamps the carried-over offset to the solving view's max
  // scroll, so every problem opened from home starts pinned to the bottom
  // (header tucked under the phone's URL bar).
  useEffect(() => { window.scrollTo(0, 0); }, [view]);
  const [isDaily, setIsDaily] = useState(false);
  const [dailyDate, setDailyDate] = useState<string | null>(null); // YYYY-MM-DD
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
  const [showRatingSync, setShowRatingSync] = useState(false);
  // Red dot on the hamburger button — clears as soon as the menu is opened.
  const [menuBadgeSeen, setMenuBadgeSeen] = useState<boolean>(() => {
    try { return localStorage.getItem('cp-menu-badge-seen') === '1'; } catch { return true; }
  });
  const markMenuBadgeSeen = useCallback(() => {
    try { localStorage.setItem('cp-menu-badge-seen', '1'); } catch { /* ignore */ }
    setMenuBadgeSeen(true);
  }, []);
  // NEW badge next to Rating sync — only clears when the user actually clicks the item.
  const [ratingSyncSeen, setRatingSyncSeen] = useState<boolean>(() => {
    try { return localStorage.getItem('cp-sync-seen') === '1'; } catch { return true; }
  });
  const markRatingSyncSeen = useCallback(() => {
    try { localStorage.setItem('cp-sync-seen', '1'); } catch { /* ignore */ }
    setRatingSyncSeen(true);
  }, []);
  const [showHistory, setShowHistory] = useState(false);
  const [showDailyHistory, setShowDailyHistory] = useState(false);
  const [showProblemInfo, setShowProblemInfo] = useState(false);
  const [showSolveStats, setShowSolveStats] = useState(false);
  const [showSiteStats, setShowSiteStats] = useState(false);
  const [siteStats, setSiteStats] = useState<import('./services/api').SiteStats | null>(null);
  const [showSearchPage, setShowSearchPage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<import('./services/api').SearchResult[] | null>(null);
  const [showBookmarksPage, setShowBookmarksPage] = useState(false);
  const [showWcscPage, setShowWcscPage] = useState(false);
  const [showThemeGuide, setShowThemeGuide] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  /* Shareable URLs for the static pages — the event page, the guides and
     What's new are overlay state, so their hash is written by hand on open
     and put back on close. Closing restores whatever the address showed
     before (a problem, home), so the solving URL survives a detour. */
  const staticPrevHashRef = useRef<string>('#');
  const openStaticPage = useCallback((route: string, open: () => void) => {
    if (window.location.hash !== route) {
      staticPrevHashRef.current = window.location.hash || '#';
      history.pushState(null, '', route);
    }
    open();
  }, []);
  const closeStaticPage = useCallback((routePrefix: string, close: () => void) => {
    close();
    if (window.location.hash.startsWith(routePrefix)) {
      history.pushState(null, '', staticPrevHashRef.current || '#');
    }
  }, []);
  /* The rules guide, and which genre's section to land on. Opened from the home
     page card with no focus, and from a "?" dialog with the genre it was showing. */
  const [guideFocus, setGuideFocus] = useState<Genre | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const openGuide = useCallback((focus?: Genre) => {
    setGuideFocus(focus ?? null);
    openStaticPage(focus ? `#/guide/${focus}` : '#/guide', () => setShowGuide(true));
  }, [openStaticPage]);
  const [bookmarks, setBookmarks] = useLocalStorage<Record<Genre, string[]>>('cp-bookmarks', {
    direct: [], help: [], self: [], study: [], retro: [],
  });
  const [timestamps, setTimestamps] = useLocalStorage<Record<string, number>>('cp-timestamps', {});

  // Which rated pool is being played. Each genre keeps its own player rating,
  // its own problem ratings and its own cache slots — switching is a switch of
  // game, not a filter over one game.
  const [ratedGenre, setRatedGenreState] = useState<RatedGenre>(() => {
    try {
      const saved = localStorage.getItem('cp-rated-genre');
      if (saved && (RATED_GENRES as string[]).includes(saved)) return saved as RatedGenre;
    } catch { /* ignore */ }
    return 'direct';
  });
  const ratedGenreRef = useRef(ratedGenre);
  ratedGenreRef.current = ratedGenre;
  const setRatedGenre = useCallback((g: RatedGenre) => {
    setRatedGenreState(g);
    ratedGenreRef.current = g;
    try { localStorage.setItem('cp-rated-genre', g); } catch { /* ignore */ }
  }, []);

  // Player rating (Glicko-2), for the pool currently selected
  const { playerRating, ratingsByGenre, isRated, updateAfterSolve, getProblemInitialRating, restoreRating } = usePlayerRating(ratedGenre);
  const ratingsByGenreRef = useRef(ratingsByGenre);
  ratingsByGenreRef.current = ratingsByGenre;
  const [lastRatingDelta, setLastRatingDelta] = useState<number | null>(null);
  const [lastProblemRating, setLastProblemRating] = useState<number | null>(null);
  const [problemRatingBefore, setProblemRatingBefore] = useState<number | null>(null);
  const [isRatedMode, setIsRatedMode] = useState(false);
  // Removed isSpecificRatedProblem - now determined by comparing current problem with cache
  const [, setRecentRatedIds] = useState<number[]>([]);
  const [ratedDifficulty, setRatedDifficultyState] = useState<RatedDifficulty>(() => loadRatedDifficulty(ratedGenre));
  const ratedDifficultyRef = useRef(ratedDifficulty);
  ratedDifficultyRef.current = ratedDifficulty;
  const setRatedDifficulty = useCallback((d: RatedDifficulty) => {
    setRatedDifficultyState(d);
    saveRatedDifficultyPref(ratedGenreRef.current, d);
  }, []);
  /* Entering a pool restores that pool's own setting. Through the ref as well as
     state, because the fetch that follows in the same tick reads the ref. */
  const adoptGenreDifficulty = useCallback((genre: RatedGenre) => {
    const d = loadRatedDifficulty(genre);
    ratedDifficultyRef.current = d;
    setRatedDifficultyState(d);
  }, []);

  // Review Mode (spaced repetition)
  // cp-rated-ids: problem IDs played in Rated Mode (source of truth for review queue)
  const [ratedIds, setRatedIds] = useLocalStorage<string[]>('cp-rated-ids', []);
  const reviewQueue = useReviewQueue();
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [reviewProblemQueue, setReviewProblemQueue] = useState<number[]>([]);
  const [reviewQueueIndex, setReviewQueueIndex] = useState(0);
  const [reviewNextInterval, setReviewNextInterval] = useState<number | null>(null);
  const [stipulationToast, setStipulationToast] = useState<{ label: string; sub?: string; stipulation: string; genre: Genre; tone?: 'good' | 'bad'; subSmall?: boolean } | null>(null);
  const [fetchErrorToast, setFetchErrorToast] = useState<string | null>(null);
  const [activeTwinId, setActiveTwinId] = useState<string | null>(null);
  /* In Rated Mode the twin buttons stay down until the problem is over.
     Only a) is the graded problem — solving b) records nothing and moves no
     rating — so putting every diagram up at once does nothing but ask the
     player which one they are supposed to be solving. Once a) is answered or
     given up, the buttons come out and the other twins are free to play.
     Browsing is untouched: there the buttons are up from the start. */
  const [twinsRevealed, setTwinsRevealed] = useState(false);
  /* What the last problem asked for, as the badge writes it — "#2", "h#3".
      Tracking the stipulation rather than the move count is what lets a switch
      from #2 to h#2 announce itself: the move count is the same, the task is
      not. */
  const prevStipulationRef = useRef<string | null>(null);

  // Any normal-navigation path (problem list, search, go-to-ID, history) must
  // clear ALL special-mode flags. If e.g. isRatedMode leaks onto a searched
  // problem, the rated-mode effects submit rating events for a problem that
  // was never matchmade, permanently corrupting player and problem ratings.
  const exitSpecialModes = useCallback(() => {
    setIsRatedMode(false);
    setIsReviewMode(false);
    setIsDaily(false);
    setIsWcsc(false);
  }, []);

  // Per-genre filters (each genre has its own independent filter settings)
  const defaultFilters: GlobalFilters = { keywords: [], minPieces: 0, maxPieces: 0, minYear: 0, maxYear: 0, minMoves: 0, maxMoves: 0, sortBy: 'difficulty', sortOrder: 'asc', stipulations: [], statusFilter: 'all' as StatusFilter, awardFilter: 'all' as AwardFilter };
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

  // One-time progress migration: downgrade incorrectly 'solved' entries to 'failed'
  // based on server-side solve_events data
  useEffect(() => {
    try {
      if (localStorage.getItem('cp-progress-migrated')) return;
    } catch { return; }

    fetchMyProgress(getSessionId())
      .then(serverProgress => {
        localStorage.setItem('cp-progress-migrated', '1');
        setProgress(prev => {
          const updated = { ...prev };
          let changed = false;
          for (const [problemIdStr, entry] of Object.entries(serverProgress)) {
            const genre = entry.genre as Genre;
            if (!genre || !updated[genre]) continue;
            const currentStatus = updated[genre][problemIdStr];
            // Only downgrade: 'solved' -> 'failed' when server says it wasn't a clean solve
            if (currentStatus === 'solved') {
              const isCleanSolve = entry.correct && entry.wrongMoveCount === 0 && !entry.hintUsed;
              if (!isCleanSolve) {
                if (!changed) {
                  // Deep copy genres on first mutation
                  for (const g of Object.keys(updated) as Genre[]) {
                    updated[g] = { ...updated[g] };
                  }
                  changed = true;
                }
                updated[genre][problemIdStr] = 'failed';
              }
            }
          }
          return changed ? updated : prev;
        });
      })
      .catch(() => {
        // Non-blocking — don't prevent app from working
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One-time upload of existing localStorage bookmarks + review queue to the server,
  // so they become available via Sync (Restore on another device).
  useEffect(() => {
    try {
      if (localStorage.getItem('cp-sync-migrated') === '1') return;
    } catch { return; }

    let bookmarksRaw: Record<string, string[]> = {};
    let reviewRaw: Record<string, SyncReviewCard> = {};
    try {
      const b = localStorage.getItem('cp-bookmarks');
      if (b) bookmarksRaw = JSON.parse(b);
    } catch { /* ignore */ }
    try {
      const r = localStorage.getItem('cp-review-queue');
      if (r) reviewRaw = JSON.parse(r);
    } catch { /* ignore */ }

    const totalBookmarks = Object.values(bookmarksRaw).reduce((s, a) => s + (Array.isArray(a) ? a.length : 0), 0);
    const totalCards = Object.keys(reviewRaw).length;
    if (totalBookmarks === 0 && totalCards === 0) {
      // Nothing to migrate — still mark as done so we don't keep checking
      try { localStorage.setItem('cp-sync-migrated', '1'); } catch { /* ignore */ }
      return;
    }

    uploadLocalSyncData({ bookmarks: bookmarksRaw, reviewQueue: reviewRaw })
      .then(() => {
        try { localStorage.setItem('cp-sync-migrated', '1'); } catch { /* ignore */ }
      })
      .catch(() => {
        // Will retry on next load if it failed
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push current local rating once on first-ever load after this update is
  // installed. We DON'T push on every load because that creates a last-write-wins
  // race when multiple devices have different localStorage values — a stale
  // device reloading would clobber a fresher device's pushed rating.
  useEffect(() => {
    try {
      if (localStorage.getItem('cp-rating-pushed') === '1') return;
      pushPlayerRating(playerRating, ratedIds.length);
      localStorage.setItem('cp-rating-pushed', '1');
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build flat map of rated problem ID → status for review queue seeding.
  // Strictly limited to cp-rated-ids: falling back to all of progress.direct
  // when ratedIds is empty flooded the review queue with every casually-solved
  // direct problem (e.g. right after a Sync restore, which clears ratedIds).
  const ratedProgress = useMemo<Record<string, string>>(() => {
    const directProgress = progress.direct || {};
    const result: Record<string, string> = {};
    for (const id of ratedIds) {
      const status = directProgress[id];
      if (status) result[id] = status;
    }
    return result;
  }, [ratedIds, progress.direct]);

  // Seed review queue from rated progress on mount (so dueCount shows correctly on home screen)
  useEffect(() => {
    reviewQueue.seedOnly(ratedProgress);
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
  // Below sm the sheet drops its side borders and margin (.nb-sheet-bleed), so
  // the board is exactly the viewport wide. From sm up the sheet keeps its
  // frame and the board fills the inside of it: 8px of outer margin plus two
  // 4px ink borders come off. Either way the board row cancels the sheet's own
  // px-1 with -mx-1, so nothing is left over to clip the a-file label.
  const boardWidth = windowWidth < 640
    ? windowWidth
    : Math.min(windowWidth, 672) - (16 + 8);

  const [printMode, setPrintMode] = useState<PrintMode>('off');
  const stockfish = useStockfish();
  const stockfishRef = useRef(stockfish);
  stockfishRef.current = stockfish;
  const problem = useProblem(stockfish);

  /* Finding one solution of several is a win worth announcing: the quiet
     board reset alone read as "nothing happened". Same toast the rated mode
     uses for "Mate in N". */
  const prevFoundRef = useRef(0);
  useEffect(() => {
    const found = problem.foundSolutionCount;
    if (found > prevFoundRef.current && problem.status === 'solving' && problem.problem && problem.totalSolutions > 1) {
      const remaining = problem.totalSolutions - found;
      setStipulationToast({
        label: `Solution ${found}/${problem.totalSolutions} found!`,
        sub: remaining === 1 ? 'One more to find!' : `${remaining} more to find!`,
        stipulation: problem.problem.stipulation,
        genre: problem.problem.genre,
      });
      // Two lines take longer to read than the rated toast's one.
      setTimeout(() => setStipulationToast(null), 3500);
    }
    prevFoundRef.current = found;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem.foundSolutionCount, problem.status]);

  /* Replaying a solution that is already found: the move lands and snaps
     back, and this says why — the note under the board alone was missed. */
  useEffect(() => {
    if (!problem.replayNoticeAt || !problem.problem) return;
    const p = problem.problem;
    setStipulationToast({
      label: 'Already found',
      sub: 'Look for a different solution.',
      stipulation: p.stipulation, genre: p.genre,
    });
    const timer = setTimeout(() => setStipulationToast(null), 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem.replayNoticeAt]);

  /* Thematic-try toast. refutationText appears at the exact moment the
     refutation move is played on the board (its only producer is
     flashTryRefutation), so the sequence reads: your move, the refutation
     lands, a beat, then the toast names what just happened. The persistent
     line under the board keeps the text after the toast is gone. */
  useEffect(() => {
    const text = problem.refutationText;
    if (!text || !problem.problem) return;
    const p = problem.problem;
    // "Thematic try! 1.Qh1? is refuted by 1...e4!" — label / sub split
    const prefix = 'Thematic try! ';
    const sub = text.startsWith(prefix) ? text.slice(prefix.length) : text;
    const timer = setTimeout(() => {
      setStipulationToast({
        label: 'Thematic try!', sub, subSmall: true,
        stipulation: p.stipulation, genre: p.genre, tone: 'bad',
      });
      setTimeout(() => setStipulationToast(null), 3500);
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem.refutationText]);

  /* Toast the moment the problem is fully answered. Multi-solution
     helpmates announce intermediate finds above; the final solution flips
     status to 'correct' before that effect can fire, so this is the only
     toast a finished solve gets. A flawless solve (the site's own "solved"
     bar: no wrong move, no hint) earns real praise — random so it stays
     alive, but never the same word twice in a row; anything less stays a
     matter-of-fact "Solved!" so the praise keeps meaning something. */
  const prevStatusRef = useRef(problem.status);
  const lastPraiseRef = useRef<string | null>(null);
  useEffect(() => {
    const was = prevStatusRef.current;
    prevStatusRef.current = problem.status;
    if (problem.status !== 'correct' || was === 'correct' || !problem.problem) return;
    const p = problem.problem;
    const total = problem.totalSolutions;
    let label = 'Solved!';
    if (problem.wrongMoveCount === 0 && !hintUsedRef.current) {
      const pool = PRAISE_WORDS.filter(w => w !== lastPraiseRef.current);
      label = pool[Math.floor(Math.random() * pool.length)];
      lastPraiseRef.current = label;
    }
    // The spotlight cards live below the fold, especially on phones — the
    // toast's second line is the one moment everyone looks at the screen.
    const spotlightNote = themeInsights.length > 0 ? 'Theme spotlight below ↓' : undefined;
    setStipulationToast({
      label,
      sub: total > 1 ? `All ${total} solutions found!` : spotlightNote,
      subSmall: total <= 1 && !!spotlightNote,
      stipulation: p.stipulation, genre: p.genre, tone: 'good',
    });
    setTimeout(() => setStipulationToast(null), total > 1 ? 3500 : 2500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem.status]);

  /* Post-solve theme appreciation — computed on the position the solver
     actually reached, so cards only appear when the claim verifies there. */
  const themeInsights = useMemo(() => {
    const p = problem.problem;
    if (!p || (problem.status !== 'correct' && problem.status !== 'viewing')) return [];
    return getThemeInsights(p, problem.initialFen || null, problem.playback?.positions || null);
  }, [problem.problem, problem.status, problem.playback, problem.initialFen]);

  const solveStats = useSolveStats(problem.problem?.id ?? null);

  // A twin other than the diagram the problem arrives with. Everything we
  // record -- progress, solve events, ratings, statistics -- is filed under the
  // problem's single ID, which cannot tell a) from b), so those positions are
  // playable but never recorded. See handleSelectTwin.
  const isSecondaryTwin = !!activeTwinId
    && !!problem.problem?.twins?.length
    && activeTwinId !== problem.problem.twins[0].id;

  // The twin buttons come out once a) is answered or given up. Selecting a twin
  // puts the solver back into 'solving', so this only ever latches on: without
  // that, clicking b) would take the buttons away and strand the player there.
  useEffect(() => {
    if (problem.status === 'correct' || problem.status === 'viewing') setTwinsRevealed(true);
  }, [problem.status]);

  // Joke problems whose solution cannot be played here. Nothing the solver does
  // will be accepted, so say so rather than let the user hunt for a move that
  // does not exist.
  const jokeUnplayable = useMemo(
    () => !!problem.problem && isUnplayableJokeProblem(problem.problem),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [problem.problem?.id, problem.problem?.solutionTree],
  );

  // Only read once the problem is over: some of these notes say whose move it
  // is, which is the puzzle itself in a retro. The Solution section they live
  // in is not rendered before then either.
  const solutionNotes = useMemo(
    () => extractSolutionNotes(problem.problem?.solutionText || ''),
    [problem.problem?.solutionText],
  );

  const handleSelectTwin = useCallback((id: string) => {
    const twins = problem.problem?.twins;
    const twin = twins?.find(t => t.id === id);
    if (!twins || !twin) return;
    setActiveTwinId(id);
    problem.startTwin(twin.fen, twin.solutionTree, id === twins[0].id, twin.firstColor);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem.problem, problem.startTwin]);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisActive, setAnalysisActive] = useState(false);
  const analysisActiveRef = useRef(false);

  // Play-vs-engine mode: continue the current position against Stockfish.
  // Lives outside useProblem — it never touches solve state or ratings.
  const [enginePlay, setEnginePlay] = useState<{
    playerColor: 'w' | 'b';
    /** Every position of the game, ply by ply; [0] is the start. A position's
     *  feedback marks the move that produced it: green when the player's move
     *  was the engine's best (or mates), red when the engine's move mated. */
    positions: { fen: string; lastMove: { from: string; to: string } | null; san: string | null; feedback: { square: string; type: 'correct' | 'incorrect' } | null }[];
    /** Which position is on the board. Stepping back and moving resumes
     *  the game from there (later moves are discarded). */
    viewIndex: number;
    thinking: boolean;
    /** Verdict on the FINAL position, if the game there is over. */
    result: string | null;
    /** Engine-on mode: keep showing the best move for whatever position is
     *  on the board, until switched off. */
    hintActive: boolean;
    hint: { text: string; arrow: [string, string] | null } | null;
  } | null>(null);
  // Bumped on exit/problem change so an in-flight engine reply is discarded.
  const enginePlayTokenRef = useRef(0);
  // Best move per position (UCI), prefetched while the player thinks, so a
  // move matching the engine's choice can be marked correct instantly.
  const engineBestByFenRef = useRef<Map<string, string>>(new Map());
  const [analysisArrow, setAnalysisArrow] = useState<[string, string] | null>(null);
  const [genreData, setGenreData] = useState<Record<Genre, ChessProblem[]>>({
    direct: [], help: [], self: [], study: [], retro: [],
  });
  // Lightweight ID index: fetched first, used for problem list and navigation
  const [genreIndex, setGenreIndex] = useState<Record<Genre, import('./services/api').ProblemStub[]>>({
    direct: [], help: [], self: [], study: [], retro: [],
  });
  const [genreLoaded, setGenreLoaded] = useState<Record<Genre, boolean>>({
    direct: false, help: false, self: false, study: false, retro: false,
  });
  const [genreLoading, setGenreLoading] = useState<Genre | null>(null);

  // Cache current problem in localStorage for instant reload
  const cacheProblem = useCallback((p: ChessProblem) => {
    try {
      // Store minimal data needed to display immediately (no solutionTree — too
      // large). Twins go too: they are rebuilt from solutionText on restore, and
      // a cached copy would otherwise pin a stale parse of the twin positions.
      const { solutionTree, twins, ...rest } = p;
      void solutionTree;
      void twins;
      localStorage.setItem('cp-cached-problem', JSON.stringify(rest));
    } catch { /* quota exceeded — ignore */ }
  }, []);

  // Load lightweight ID index for a genre (very fast, cached), then full data in background
  const loadGenre = useCallback(async (genre: Genre) => {
    if (genreLoaded[genre]) return genreIndex[genre];
    setGenreLoading(genre);
    try {
      // 1. Fetch lightweight index first (just IDs + stipulation) — very fast
      const stubs = await fetchProblemIndex(genre);
      setGenreIndex(prev => ({ ...prev, [genre]: stubs }));
      setGenreLoaded(prev => ({ ...prev, [genre]: true }));
      setGenreLoading(null);

      // Full data is NOT loaded here. The index (with years) covers the list,
      // year sort, and navigation; the ~80-request full load only serves the
      // piece/theme filters, so it runs on demand — see ensureGenreData.
      return stubs;
    } catch {
      setGenreLoading(null);
      return [];
    }
  }, [genreLoaded, genreIndex]);

  // On-demand full-data load (fen/keywords/pieces for the filter page).
  // Single-flight per genre so the filter page and the persisted-filter
  // effect don't race two 80-request walks.
  const genreDataLoadingRef = useRef<Partial<Record<Genre, Promise<void>>>>({});
  const ensureGenreData = useCallback((genre: Genre) => {
    if (genreData[genre].length > 0) return;
    if (genreDataLoadingRef.current[genre]) return;
    genreDataLoadingRef.current[genre] = fetchAllProblems(genre).then(metas => {
      const problems: ChessProblem[] = metas.map(m => metaToChessProblem(m));
      problems.sort((a, b) => a.difficultyScore - b.difficultyScore);
      setGenreData(prev => ({ ...prev, [genre]: problems }));
    }).catch(() => {
      delete genreDataLoadingRef.current[genre]; // allow a retry next time
    });
  }, [genreData]);

  // Triggers: the filter page is open, or filters that need full data
  // (themes/pieces) are already active — e.g. persisted from a previous
  // session. Year filters and year sort run on the index alone.
  useEffect(() => {
    if (!currentGenre) return;
    const needsFullData = showFilterPage
      || filters.keywords.length > 0
      || filters.minPieces > 0
      || filters.maxPieces > 0;
    if (needsFullData) ensureGenreData(currentGenre);
  }, [currentGenre, showFilterPage, filters.keywords.length, filters.minPieces, filters.maxPieces, ensureGenreData]);

  // Ensure a problem has solutionTree (fetch solutionText from API if needed)
  const ensureSolution = useCallback(async (p: ChessProblem): Promise<ChessProblem> => {
    // Stub from the genre index (navigation before the full genre data has
    // loaded): everything except id/stipulation is missing — fetch the whole
    // problem, not just solutionText, or the board renders empty (0+0 pieces).
    // Must happen before the originalFen capture below.
    if (!p.fen) {
      const full = await fetchProblem(p.id);
      Object.assign(p, metaToChessProblem(full, full.solutionText));
    }
    // Save original FEN before twin modifications (needed for parseTwins)
    const originalFen = p._twinApplied ? (p._originalFen || p.fen) : p.fen;
    if (!p._originalFen) p._originalFen = originalFen;
    // Apply twin FEN modifications regardless of cache state
    if (p.solutionText && !p._twinApplied) {
      const twinMods = extractTwinFenMods(p.solutionText);
      if (twinMods) {
        p.fen = applyTwinMods(p.fen, twinMods);
        p._twinApplied = true;
      }
    }
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
    // Apply twin FEN modifications if not already done
    if (!p._twinApplied) {
      const twinMods = extractTwinFenMods(p.solutionText);
      if (twinMods) {
        p.fen = applyTwinMods(p.fen, twinMods);
        p._twinApplied = true;
      }
    }
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
    // Duplex helpmate: the diagram is solved twice — Black to play, then
    // White to play with Black and White mating the white king. The source
    // numbers both halves alike, so the parser paints the White-to-play half
    // black; colour it right so it can be played and shown as White's. YACPDB
    // records Duplex in the entry's options (part of the stipulation), which
    // the database does not keep — hence the generated id list; the keyword
    // is a fallback that only about half the duplexes carry.
    const duplexTagged = p.genre === 'help' && (DUPLEX_IDS.has(p.id) || (p.keywords ?? []).includes('Duplex'));
    flipDuplexRoots(allNodes, fixCastlingRights(p.fen, p.solutionText), duplexTagged ? ['Duplex'] : [], p.genre);
    p.fullSolutionTree = allNodes;
    p.solutionTree = filterKeyMoves(allNodes, firstColor);
    // Helpmate set play ("1...Sd5-b6 ...": what would happen if White were
    // to move) is now coloured White by the parser. It is shown after the
    // solve, but it is not a solution to find — only a duplex asks for a
    // White-to-play line. Keep the tree if nothing else would be left.
    if (p.genre === 'help' && !duplexTagged) {
      const own = p.solutionTree.filter(n => n.color === firstColor);
      if (own.length > 0) p.solutionTree = own;
    }
    // Generate twin data for twin problems
    if (!p.twins) {
      p.twins = parseTwins(p.solutionText, p._originalFen || originalFen, parserColor) ?? undefined;
    }
    // Fix castling rights if solution contains O-O but FEN has none
    p.fen = fixCastlingRights(p.fen, p.solutionText);
    fixEnPassantFen(p);
    // Helpmates count their solutions and ask for every one, so only lines
    // the solver can actually play through on this board are counted (user
    // decision, 2026-09-02: err on the safe side). Lines that cannot be
    // entered stay in fullSolutionTree for the display. If nothing survives,
    // keep the tree as it was rather than leave the problem unsolvable.
    if (p.genre === 'help' && p.solutionTree.length > 1) {
      const playable = p.solutionTree.filter(root => mainLinePlays(p.fen, root));
      if (playable.length > 0) p.solutionTree = playable;
    }
    // Retro: flip FEN turn to black if Black to move
    if (isRetroBlack && p.fen.includes(' w ')) {
      p.fen = p.fen.replace(' w ', ' b ');
    }
    // Black-to-move study ("1... Kxb8 2. b7 Ka7 3. Kc7 1-0"): YACPDB has no
    // side-to-move field, so the import filed every study as White to move.
    // When every recorded line opens with a black move, the diagram is
    // Black's turn; the solver (White) takes over after Black's first move,
    // which the board plays itself (useProblem.loadProblem).
    if (p.genre === 'study' && p.fen.includes(' w ')
        && p.solutionTree.length > 0 && p.solutionTree.every(n => n.color === 'b')) {
      p.fen = p.fen.replace(' w ', ' b ');
    }
    return p;
  }, []);

  // Load a problem into the solver (fetches solutionText from API if needed)
  const loadAndStartProblem = useCallback(async (p: ChessProblem) => {
    loadedProblemIdRef.current = p.id;
    solveStartTimeRef.current = Date.now();
    hintUsedRef.current = false;
    setLastRatingDelta(null);
    setLastProblemRating(null);
    setProblemRatingBefore(null);
    setActiveTwinId(null);
    setTwinsRevealed(false);
    trackEvent('problem_started', p.id, { genre: p.genre, stipulation: p.stipulation });
    // Show board immediately if solution needs to be fetched.
    // Skip for index stubs (no FEN yet) — an empty board is worse than the
    // loading state; ensureSolution fetches the full problem right after.
    const needsFetch = p.solutionTree.length === 0;
    if (needsFetch && p.fen) {
      problem.loadProblem(p); // show board with empty solutionTree (hint/give-up won't work yet)
    }
    const ready = await ensureSolution(p);
    // Guard: if another problem was loaded while we were fetching, don't overwrite it
    if (loadedProblemIdRef.current !== p.id) return;
    problem.loadProblem(ready);
  }, [ensureSolution, problem]);

  // ── Hash-based routing with browser history ──
  const updateHash = useCallback((category: Category | Genre | null, problemId?: number | null, replace = false, dailyDateParam?: string, rated = false) => {
    const method = replace ? 'replaceState' : 'pushState';
    if (dailyDateParam) {
      history[method]({ daily: true, date: dailyDateParam }, '', `#/daily/${dailyDateParam}`);
      return;
    }
    if (rated) {
      if (problemId) {
        history[method]({ rated: true, problemId }, '', `#/rated/${ratedGenreRef.current}/yacpdb/${problemId}`);
      } else {
        history[method]({ rated: true }, '', `#/rated/${ratedGenreRef.current}`);
      }
      return;
    }
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
  // Daily problem: hydrate synchronously from a same-day localStorage cache so
  // the home banner renders instantly on repeat visits; the fetch below still
  // runs to populate/refresh the cache (first visit of the day pays one call).
  const localToday = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  const [dailyProblem, setDailyProblem] = useState<ChessProblem | null>(() => {
    try {
      const raw = localStorage.getItem('cp-daily-cache');
      if (raw) {
        const { date, data } = JSON.parse(raw);
        if (date === localToday() && data?.fen) {
          return metaToChessProblem(data, data.solutionText);
        }
      }
    } catch { /* corrupt cache — ignore */ }
    return null;
  });
  const [dailyProblemRating, setDailyProblemRating] = useState<number | null>(null);
  useEffect(() => {
    fetchDaily().then(data => {
      setDailyProblem(metaToChessProblem(data, data.solutionText));
      try {
        localStorage.setItem('cp-daily-cache', JSON.stringify({ date: localToday(), data }));
      } catch { /* quota — ignore */ }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dailyProblem) return;
    let cancelled = false;
    setDailyProblemRating(null);
    fetchProblemRating(dailyProblem.id).then(({ rating }) => {
      if (!cancelled && Number.isFinite(rating)) setDailyProblemRating(rating);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [dailyProblem?.id]);

  const dailySolved = useMemo(() => {
    if (!dailyProblem) return false;
    return progress.direct?.[String(dailyProblem.id)] === 'solved';
  }, [dailyProblem, progress]);

  const handleSolveDaily = useCallback(() => {
    if (!dailyProblem) return;
    trackEvent('daily_started', dailyProblem.id);
    setIsDaily(true);
    setIsRatedMode(false);
    setIsReviewMode(false);
    const now = new Date();
    setDailyDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
    setCurrentGenre('direct');
    setCurrentCategory(null);
    setView('solving');
    loadAndStartProblem(dailyProblem);
    cacheProblem(dailyProblem);
    setCurrentProblemId(prev => ({ ...prev, direct: dailyProblem.id }));
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    updateHash(null, null, false, todayStr);
  }, [dailyProblem, problem, cacheProblem, setCurrentProblemId, updateHash]);

  // ── Rated Mode ──
  // Per-difficulty cache slots: cp-rated-problem-{difficulty}
  // Switching difficulty mid-solve restores that slot's problem (if any) without
  // touching other slots. Solving (Next button) clears ALL slots since rating moved.

  const fetchAndStartRatedProblem = useCallback(async (difficulty?: RatedDifficulty) => {
    const d = difficulty ?? ratedDifficultyRef.current;
    const offset = RATED_DIFFICULTY_OFFSET[d];
    // Both halves of the query have to come from refs. Switching pools sets the
    // genre through a ref and fetches in the same tick, so a rating read from the
    // closure is still the pool you just left — asking for direct problems around
    // a helpmate rating, and landing hundreds of points off.
    const g = ratedGenreRef.current;
    const base = ratingsByGenreRef.current[g].rating;
    try {
      const data = await fetchRatedProblem(base + offset, g);
      const p = metaToChessProblem(data, data.solutionText);
      announceStipulationRef.current(p);
      loadAndStartProblem(p);
      cacheProblem(p);
      saveRatedProblemSlot(g, d, data);
      setLastProblemRating(data.problemRating);
      setRecentRatedIds(prev => [...prev.slice(-49), data.id]);
      updateHash(null, data.id, true, undefined, true);
    } catch (e) {
      const noneInRange = e instanceof Error && e.message === 'no-problems-in-range';
      setFetchErrorToast(noneInRange
        ? `No problems found near rating ${Math.round(base + offset)}. Try a different difficulty.`
        : 'Could not load a problem. Check your connection and try again.');
      setTimeout(() => setFetchErrorToast(null), 4000);
    }
  }, [loadAndStartProblem, cacheProblem, updateHash]);

  const fetchRatedRef = useRef(fetchAndStartRatedProblem);
  fetchRatedRef.current = fetchAndStartRatedProblem;
  /* Announce the task. Shown on the first problem after entering a mode — the
     moment the player is asking "how many moves is this?" and the answer had
     never been given — and after that only when the stipulation actually
     changes. Firing on every problem would make it a ritual rather than a
     signal: ten #2s in a row would say the same thing ten times, over a board
     the player is already reading. The badge carries it the rest of the time. */
  const announceStipulation = useCallback((p: { stipulation: string; genre: Genre; moveCount: number }) => {
    if (prevStipulationRef.current === null || p.stipulation !== prevStipulationRef.current) {
      setStipulationToast({
        label: stipulationPhrase(p.stipulation, p.genre, p.moveCount),
        stipulation: p.stipulation,
        genre: p.genre,
      });
      setTimeout(() => setStipulationToast(null), 2500);
    }
    prevStipulationRef.current = p.stipulation;
  }, []);

  const announceStipulationRef = useRef(announceStipulation);
  announceStipulationRef.current = announceStipulation;

  const loadAndStartProblemRef = useRef(loadAndStartProblem);
  loadAndStartProblemRef.current = loadAndStartProblem;
  const cacheProblemRef = useRef(cacheProblem);
  cacheProblemRef.current = cacheProblem;
  const updateHashRef = useRef(updateHash);
  updateHashRef.current = updateHash;

  const ratedLoadingRef = useRef(false);
  const handleStartRatedImpl = (genre: RatedGenre = 'direct', specificProblemId?: number, _fromCache?: boolean) => {
    // Prevent double invocation (React StrictMode, popstate race, etc.)
    if (ratedLoadingRef.current) return;
    ratedLoadingRef.current = true;
    // Use microtask to ensure the flag is set before any re-invocation in the same tick
    Promise.resolve().then(() => { setTimeout(() => { ratedLoadingRef.current = false; }, 2000); });

    setIsRatedMode(true);
    setIsReviewMode(false);
    setIsDaily(false);
    // Set the pool before anything reads it: fetching, caching and the rating
    // update all key off this, and the ref is what the async paths see.
    setRatedGenre(genre);
    adoptGenreDifficulty(genre);
    setCurrentGenre(genre);
    setCurrentCategory(null);
    setView('solving');
    setRecentRatedIds([]);
    // Show tutorial if first time
    if (!seenTutorials.includes('rated')) {
      setShowTutorial(true);
      setSeenTutorials(prev => [...prev, 'rated']);
    }

    // If navigating from home (URL doesn't already have #/rated), push a history entry
    // Use history.pushState directly to avoid triggering popstate
    const currentHash = window.location.hash;
    const isAlreadyRatedUrl = currentHash.startsWith('#/rated');
    if (!isAlreadyRatedUrl) {
      window.history.pushState(null, '', `#/rated/${genre}`);
    }

    // If a specific problem ID is requested (e.g. from URL or history), load it directly
    // Don't overwrite rated cache — cache preserves the current matchmaking problem
    if (specificProblemId) {
      // No longer tracking isSpecificRatedProblem - determined by cache comparison
      fetchProblem(specificProblemId).then(full => {
        const p = metaToChessProblem(full, full.solutionText);
        announceStipulationRef.current(p);
        loadAndStartProblemRef.current(p);
        updateHashRef.current(null, full.id, true, undefined, true);
        // Fetch current problem rating from server
        fetchProblemRating(full.id).then(res => {
          if (res.rating != null) setLastProblemRating(res.rating);
        }).catch(() => {});
      }).catch(() => {
        // If specific problem not found, fall back to random
        fetchRatedRef.current();
      });
      return;
    }

    // Cache path — read from current difficulty's slot
    try {
      const data = loadRatedProblemSlot<import('./services/api').RatedProblemResponse>(genre, ratedDifficultyRef.current);
      if (data) {
        const pid = String(data.id);
        const currentProgress = JSON.parse(localStorage.getItem('cp-progress') || '{}');
        const alreadyAttempted = currentProgress[genre]?.[pid] === 'solved' || currentProgress[genre]?.[pid] === 'failed';
        if (!alreadyAttempted) {
          const p = metaToChessProblem(data, data.solutionText);
          announceStipulationRef.current(p);
          loadAndStartProblemRef.current(p);
          cacheProblemRef.current(p);
          if (data.problemRating) setLastProblemRating(data.problemRating);
          updateHashRef.current(null, data.id, true, undefined, true);
          return;
        }
      }
    } catch {}
    // No saved problem at current difficulty or already attempted — fetch new
    fetchRatedRef.current();
  };
  const handleStartRatedRef = useRef(handleStartRatedImpl);
  handleStartRatedRef.current = handleStartRatedImpl;
  const handleStartRated = useCallback((genre: RatedGenre = 'direct', specificProblemId?: number, fromCache?: boolean) => {
    handleStartRatedRef.current(genre, specificProblemId, fromCache);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Review Mode ──
  const handleStartReview = useCallback(() => {
    const session = reviewQueue.startOrResume(ratedProgress);
    if (!session) return; // nothing due

    const firstId = session.problemIds[session.index];
    setReviewProblemQueue(session.problemIds);
    setReviewQueueIndex(session.index);
    setIsReviewMode(true);
    setIsRatedMode(false);
    setIsDaily(false);
    setCurrentCategory(null);
    setView('solving');

    fetchProblem(firstId).then(full => {
      const p = metaToChessProblem(full, full.solutionText);
      setCurrentGenre(p.genre);
      announceStipulationRef.current(p);
      loadAndStartProblemRef.current(p);
    }).catch(() => { /* ignore */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewQueue, progress]);

  const handleReviewNext = useCallback(() => {
    if (!problem.problem) return;
    const correct = problem.status === 'correct' && problem.wrongMoveCount === 0 && !hintUsedRef.current;
    const currentSession: import('./hooks/useReviewQueue').ReviewSessionState = {
      problemIds: reviewProblemQueue,
      index: reviewQueueIndex,
    };
    const nextSession = reviewQueue.recordAndAdvance(problem.problem.id, correct, currentSession);

    if (!nextSession) {
      // Queue exhausted — go home
      problem.clearProblem();
      prevStipulationRef.current = null;
      setView('mode-select');
      setIsReviewMode(false);
      setIsDaily(false);
      setCurrentGenre(null);
      setCurrentCategory(null);
      return;
    }

    setReviewQueueIndex(nextSession.index);
    const nextId = nextSession.problemIds[nextSession.index];
    fetchProblem(nextId).then(full => {
      const p = metaToChessProblem(full, full.solutionText);
      setCurrentGenre(p.genre);
      announceStipulationRef.current(p);
      loadAndStartProblemRef.current(p);
    }).catch(() => { /* ignore */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem.problem, problem.status, problem.wrongMoveCount, reviewQueue, reviewQueueIndex, reviewProblemQueue]);

  const handleNextRatedProblem = useCallback(() => {
    if (!problem.problem) return;
    // Clear ALL difficulty slots — rating moved, all cached problems are now stale
    // Only this pool's rating moved, so only its slots are stale. The other
    // pools keep the problem the player was in the middle of.
    clearRatedProblems(ratedGenreRef.current);
    if (problem.status === 'correct' && currentGenre && !isSecondaryTwin) {
      const pid = String(problem.problem.id);
      const perfect = problem.wrongMoveCount === 0 && !hintUsedRef.current;
      const newStatus = perfect ? 'solved' as const : 'failed' as const;
      setProgress(prev => {
        const genreProgress = prev[currentGenre] || {};
        if (genreProgress[pid] === 'solved') return prev;
        return { ...prev, [currentGenre]: { ...genreProgress, [pid]: newStatus } };
      });
    }
    fetchAndStartRatedProblem();
  }, [problem, currentGenre, setProgress, fetchAndStartRatedProblem]);

  /**
   * Switch difficulty in Rated mode.
   * - If the new difficulty has an unattempted cached problem, restore it.
   * - Otherwise, fetch a fresh problem at that difficulty's offset.
   * Other slots are left intact so the user can switch back without losing their thinking.
   */
  const handleChangeDifficulty = useCallback((d: RatedDifficulty) => {
    if (d === ratedDifficultyRef.current) return;
    setRatedDifficulty(d);
    try {
      const data = loadRatedProblemSlot<import('./services/api').RatedProblemResponse>(ratedGenreRef.current, d);
      if (data) {
        const pid = String(data.id);
        const currentProgress = JSON.parse(localStorage.getItem('cp-progress') || '{}');
        const g = ratedGenreRef.current;
        const alreadyAttempted = currentProgress[g]?.[pid] === 'solved' || currentProgress[g]?.[pid] === 'failed';
        if (!alreadyAttempted) {
          const p = metaToChessProblem(data, data.solutionText);
          announceStipulationRef.current(p);
          loadAndStartProblemRef.current(p);
          cacheProblemRef.current(p);
          if (data.problemRating) setLastProblemRating(data.problemRating);
          updateHashRef.current(null, data.id, true, undefined, true);
          return;
        }
      }
    } catch {}
    fetchAndStartRatedProblem(d);
  }, [setRatedDifficulty, fetchAndStartRatedProblem]);

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

    return () => {
      cancelled = true;
      // Abort the engine search too — otherwise it runs to full depth in the
      // background and can delay/poison the next search
      stockfishRef.current.stop();
    };
  }, [problem.fen, analysisActive]);

  // Clear analysis when problem changes
  useEffect(() => {
    analysisActiveRef.current = false;
    setAnalysisActive(false);
    setAnalysisResult(null);
    setAnalysisArrow(null);
    setAnalyzing(false);
    enginePlayTokenRef.current++;
    setEnginePlay(null);
    setAnalysisFen(null);
  }, [problem.problem?.id]);


  // ── Play-vs-engine mode ──────────────────────────────
  const engineGameResult = (chess: Chess, playerColor: 'w' | 'b'): string | null => {
    if (chess.isCheckmate()) return chess.turn() === playerColor ? 'Checkmate — the engine wins.' : 'Checkmate — you win!';
    if (chess.isStalemate()) return 'Stalemate — draw.';
    if (chess.isInsufficientMaterial()) return 'Draw — insufficient material.';
    if (chess.isDraw()) return 'Draw.';
    return null;
  };

  // While the player thinks, ask the engine (idle anyway) what IT would play
  // in the player's position. A later drop matching this gets a green check
  // with no extra wait. Interrupted prefetches store a partial-depth best —
  // occasionally missing a mark is fine, blocking the game is not.
  const prefetchBestMove = useCallback((fen: string) => {
    const token = enginePlayTokenRef.current;
    stockfishRef.current.analyze(fen, 12).then(res => {
      if (res && enginePlayTokenRef.current === token) {
        engineBestByFenRef.current.set(fen, res.bestMove);
      }
    }).catch(() => {});
  }, []);

  const requestEngineMove = useCallback(async (fen: string) => {
    const token = enginePlayTokenRef.current;
    setEnginePlay(ep => (ep ? { ...ep, thinking: true } : ep));
    // Depth 12 keeps replies fast on the lite build while still being far
    // stronger than needed to punish mistakes in these positions.
    const started = Date.now();
    const res = await stockfishRef.current.analyze(fen, 12);
    // In simple positions the search returns near-instantly, and a reply that
    // lands the same moment the player's piece does feels wrong (same reason
    // the solver's auto-play pauses). Hold the move back to a human beat.
    const remaining = 700 - (Date.now() - started);
    if (remaining > 0) await new Promise(r => setTimeout(r, remaining));
    if (enginePlayTokenRef.current !== token) return; // mode exited meanwhile
    setEnginePlay(ep => {
      if (!ep) return ep;
      const last = ep.positions[ep.positions.length - 1];
      if (last.fen !== fen) return ep; // game moved on (takeback) — stale reply
      if (!res) return { ...ep, thinking: false, result: 'Engine unavailable on this device.' };
      const chess = new Chess(fen);
      const from = res.bestMove.slice(0, 2);
      const to = res.bestMove.slice(2, 4);
      const promotion = res.bestMove.length > 4 ? res.bestMove[4] : undefined;
      let mv;
      try {
        mv = chess.move({ from, to, promotion });
      } catch {
        return { ...ep, thinking: false, result: 'Engine unavailable on this device.' };
      }
      const result = engineGameResult(chess, ep.playerColor);
      const newFen = chess.fen();
      const positions = [...ep.positions, {
        fen: newFen,
        lastMove: { from, to },
        san: mv.san,
        feedback: chess.isCheckmate() ? { square: to, type: 'incorrect' as const } : null,
      }];
      if (!result) prefetchBestMove(newFen);
      return {
        ...ep,
        positions,
        viewIndex: positions.length - 1,
        thinking: false,
        result,
        hint: null,
      };
    });
  }, [prefetchBestMove]);

  const startEnginePlay = useCallback(() => {
    // Play mode owns the engine — shut down any running analysis first.
    analysisActiveRef.current = false;
    stockfishRef.current.stop();
    setAnalysisActive(false);
    setAnalysisResult(null);
    setAnalysisArrow(null);
    setAnalyzing(false);

    const fen = problem.fen;
    const playerColor: 'w' | 'b' = 'w'; // entry points are white-solver genres
    enginePlayTokenRef.current++;
    engineBestByFenRef.current = new Map();
    setEnginePlay({
      playerColor,
      positions: [{ fen, lastMove: null, san: null, feedback: null }],
      viewIndex: 0,
      thinking: false,
      result: null,
      hintActive: false,
      hint: null,
    });
    const turn = (fen.split(' ')[1] || 'w') as 'w' | 'b';
    if (turn !== playerColor) requestEngineMove(fen);
    else prefetchBestMove(fen);
  }, [problem.fen, requestEngineMove, prefetchBestMove]);

  const exitEnginePlay = useCallback(() => {
    enginePlayTokenRef.current++;
    stockfishRef.current.stop();
    setEnginePlay(null);
  }, []);

  // Step through the played moves. Viewing an earlier position and moving
  // there resumes the game from that point (the takeback for people who want
  // to keep playing); viewing plus Hint answers "what was best here?".
  const navEnginePlay = useCallback((delta: number) => {
    setEnginePlay(ep => {
      if (!ep) return ep;
      const idx = Math.max(0, Math.min(ep.positions.length - 1, ep.viewIndex + delta));
      if (idx === ep.viewIndex) return ep;
      return { ...ep, viewIndex: idx, hint: null };
    });
  }, []);

  // Engine-on toggle: while on, whatever position is shown gets its best move
  // (the effect below); off clears the hint and aborts the hint search.
  const toggleEngineHint = useCallback(() => {
    setEnginePlay(ep => {
      if (!ep) return ep;
      if (ep.hintActive && !ep.thinking) stockfishRef.current.stop();
      return { ...ep, hintActive: !ep.hintActive, hint: null };
    });
  }, []);

  // While engine-on, follow the board: any position change (move played, list
  // click, prev/next) gets a fresh "best here". Deferred while the engine's
  // REPLY is in flight — a hint search would abort it mid-thought and the
  // reply would come out weak. It fires right after, when thinking clears.
  const epHintActive = enginePlay?.hintActive ?? false;
  const epThinking = enginePlay?.thinking ?? false;
  const epViewFen = enginePlay ? enginePlay.positions[enginePlay.viewIndex].fen : null;
  useEffect(() => {
    if (!epHintActive || epThinking || !epViewFen) return;
    const fen = epViewFen;
    if (new Chess(fen).isGameOver()) {
      setEnginePlay(cur => (cur && cur.hint !== null ? { ...cur, hint: null } : cur));
      return;
    }
    const token = enginePlayTokenRef.current;
    let cancelled = false;
    setEnginePlay(cur => (cur ? { ...cur, hint: { text: 'Thinking…', arrow: null } } : cur));
    // Studies are built around ideas shallow searches miss (trapped pieces,
    // fortresses); their few-piece positions also search fast, so buy depth
    // there. Mate hunting in direct continuations is already exact at 14.
    stockfishRef.current.analyze(fen, currentGenre === 'study' ? 18 : 14).then(res => {
      if (cancelled || enginePlayTokenRef.current !== token) return;
      setEnginePlay(cur => {
        if (!cur || !cur.hintActive || cur.positions[cur.viewIndex].fen !== fen) return cur;
        if (!res) return { ...cur, hint: null };
        // Feed the correctness marker too, so a move matching this hint is
        // judged even if the silent prefetch hadn't finished.
        engineBestByFenRef.current.set(fen, res.bestMove);
        // Score from the player's (White's) side, so a slip is visible as the
        // number falling — "mate in 2" turning into "0.0" says the win became
        // a draw. Stockfish reports from the side to move; flip when black.
        const stm = fen.split(' ')[1] || 'w';
        const mate = res.mateIn != null ? (stm === 'w' ? res.mateIn : -res.mateIn) : null;
        const evalWhite = stm === 'w' ? res.eval : -res.eval;
        const score = mate != null
          ? (mate > 0 ? `mate in ${mate}` : `engine mates in ${-mate}`)
          : `${evalWhite >= 0 ? '+' : ''}${evalWhite.toFixed(1)}`;
        const text = `Best here: ${res.bestMoveSan} (${score})`;
        return { ...cur, hint: { text, arrow: [res.bestMove.slice(0, 2), res.bestMove.slice(2, 4)] } };
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [epHintActive, epThinking, epViewFen, currentGenre]);

  const handleEnginePlayDrop = useCallback((source: string, target: string, piece: string): boolean => {
    if (!enginePlay || enginePlay.thinking) return false;
    const atEnd = enginePlay.viewIndex === enginePlay.positions.length - 1;
    if (atEnd && enginePlay.result) return false; // game over — step back to branch
    const viewFen = enginePlay.positions[enginePlay.viewIndex].fen;
    const chess = new Chess(viewFen);
    if (chess.turn() !== enginePlay.playerColor) return false;
    const promotion = getPromotionForMove(viewFen, source, target, piece);
    let move;
    try {
      move = chess.move({ from: source, to: target, promotion });
    } catch {
      return false;
    }
    if (!move) return false;
    const result = engineGameResult(chess, enginePlay.playerColor);
    // Green check when the move mates, or matches the prefetched engine best
    // ("after the key, the engine's best is normally the right move").
    const best = engineBestByFenRef.current.get(viewFen);
    const matchesBest = !!best
      && best.slice(0, 2) === source
      && best.slice(2, 4) === target
      && (best.length <= 4 || !promotion || best[4] === promotion);
    const feedback = chess.isCheckmate() || matchesBest
      ? { square: target, type: 'correct' as const }
      : null;
    // Moving from an earlier position discards the moves after it.
    const positions = [
      ...enginePlay.positions.slice(0, enginePlay.viewIndex + 1),
      { fen: chess.fen(), lastMove: { from: source, to: target }, san: move.san, feedback },
    ];
    setEnginePlay({
      ...enginePlay,
      positions,
      viewIndex: positions.length - 1,
      result,
      hint: null,
    });
    if (!result) requestEngineMove(chess.fen());
    return true;
  }, [enginePlay, requestEngineMove]);

  const handleAnalyze = useCallback(() => {
    if (analysisActive) {
      // Toggle off — set ref immediately to prevent in-flight async from setting arrow
      analysisActiveRef.current = false;
      stockfishRef.current.stop();
      setAnalysisActive(false);
      setAnalysisResult(null);
      setAnalysisArrow(null);
      setAnalyzing(false);
    } else {
      // Toggle on — analysis will fire via useEffect
      setAnalysisActive(true);
    }
  }, [analysisActive]);

  // Genre data: use full data if available, otherwise create stubs from index for problem list display
  const problemsByGenre = useMemo(() => {
    const result: Record<Genre, ChessProblem[]> = { direct: [], help: [], self: [], study: [], retro: [] };
    for (const genre of ['direct', 'help', 'self', 'study', 'retro'] as Genre[]) {
      if (genreData[genre].length > 0) {
        result[genre] = genreData[genre];
      } else if (genreIndex[genre].length > 0) {
        // Create lightweight stubs for list display (no FEN/authors needed for grid)
        result[genre] = genreIndex[genre].map(s => {
          // Infer moveCount from stipulation: "#2"→2, "#3"→3, "h#2"→2, "s#3"→3, etc.
          const mcMatch = s.stipulation.match(/(\d+)/);
          const moveCount = mcMatch ? parseInt(mcMatch[1]) : 0;
          return {
          id: s.id,
          fen: '',
          authors: [],
          sourceName: '',
          sourceYear: s.sourceYear ?? null,
          stipulation: s.stipulation,
          moveCount,
          genre: genre,
          difficulty: '',
          difficultyScore: 0,
          solutionTree: [],
          fullSolutionTree: [],
          solutionText: '',
          keywords: [],
          pieceCount: 0,
          award: '',
        };});
      }
    }
    return result;
  }, [genreData, genreIndex]);

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
        // Direct subcategories: count by moveCount.
        //
        // The API counts the whole table, so it is preferred over anything
        // local. Counting genreData first was wrong in a way that only showed
        // up mid-load: genreLoaded flips true when the lightweight INDEX
        // arrives while the full genreData streams in behind it, and with
        // ~400k direct problems "some rows have arrived" is the normal state
        // for a long time. Those rows are not a random sample either — the
        // first pages are all #2 — so Twomovers showed a fraction of its real
        // count and Threemovers and Moremovers came out at 0, which the
        // `total === 0` guard in ModeSelector then hid entirely.
        if (apiMoveCounts[def.genre]) {
          let total = 0;
          for (const [mc, cnt] of Object.entries(apiMoveCounts[def.genre])) {
            const m = parseInt(mc);
            if (def.maxMoves === 0) { if (m >= def.minMoves!) total += cnt; }
            else { if (m >= def.minMoves! && m <= def.maxMoves!) total += cnt; }
          }
          counts[def.category] = total;
        } else if (genreLoaded[def.genre] && genreData[def.genre].length > 0) {
          counts[def.category] = genreData[def.genre].filter(p => {
            if (def.maxMoves === 0) return p.moveCount >= def.minMoves!;
            return p.moveCount >= def.minMoves! && p.moveCount <= def.maxMoves!;
          }).length;
        } else {
          // Fallback estimates
          const est: Record<string, number> = { onemover: 350, twomover: 36000, threemover: 11000, moremover: 5800 };
          counts[def.category] = est[def.category] || 0;
        }
      } else {
        // Same order for the whole-genre rows: the API total beats a local
        // index that may still be arriving.
        counts[def.category] = apiCounts[def.genre] || (genreLoaded[def.genre] ? genreIndex[def.genre].length : ESTIMATED_COUNTS[def.genre]);
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
    if (filters.awardFilter !== 'all') result = result.filter(p => matchesAwardFilter(p.award, filters.awardFilter));
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
      // Unknown years sink to the end in BOTH directions — "Newest first"
      // used to open with the year-less problems posing as newest.
      const nullYear = filters.sortOrder === 'desc' ? 0 : 9999;
      result = [...result].sort((a, b) => dir * ((a.sourceYear || nullYear) - (b.sourceYear || nullYear)));
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
    if (filters.awardFilter !== 'all') count++;
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
      // Static pages have their own routes — sync the overlays to the hash,
      // so back/forward opens and closes them like real pages.
      const guidePop = hash.match(/^#\/guide(?:\/(direct|help|self))?$/);
      setShowWcscPage(hash === '#/wcsc2026');
      setShowThemeGuide(hash === '#/themes');
      setShowChangelog(hash === '#/whatsnew');
      setShowGuide(!!guidePop);
      if (guidePop) setGuideFocus((guidePop[1] as Genre) || null);
      if (hash === '#/wcsc2026' || hash === '#/themes' || hash === '#/whatsnew' || guidePop) return;
      if (!hash || hash === '#') {
        // Back to home — same reason as goBack: clear before the next open.
        problem.clearProblem();
        prevStipulationRef.current = null;
        setView('mode-select');
        setCurrentGenre(null);
        setCurrentCategory(null);
        exitSpecialModes();
        setShowProblemList(false);
        setShowFilterPage(false);
        setShowHamburgerMenu(false);
        setShowHistory(false);
        setShowProblemInfo(false);
        return;
      }
      // Rated mode hash: #/rated/{genre}/yacpdb/123 (with specific ID only).
      // The genre segment is optional — links shared before the pools were split
      // have none, and everything rated back then was direct.
      // #/rated without ID is handled by the Rated Mode button click, not popstate
      const ratedMatch = hash.match(/^#\/rated(?:\/(direct|self|help))?\/yacpdb\/(\d+)$/);
      if (ratedMatch) {
        const ratedProblemId = parseInt(ratedMatch[2]);
        handleStartRated((ratedMatch[1] as RatedGenre) || 'direct', ratedProblemId);
        return;
      }
      // #/rated without ID - just set rated mode view without fetching new problem
      if (/^#\/rated(\/(direct|self|help))?$/.test(hash)) {
        setIsRatedMode(true);
        setIsReviewMode(false);
        setIsDaily(false);
        setView('solving');
        return;
      }
      // Daily problem hash: #/daily/YYYY-MM-DD
      const dailyMatch = hash.match(/^#\/daily\/(\d{4}-\d{2}-\d{2})$/);
      if (dailyMatch) {
        const date = dailyMatch[1];
        navigateDaily(date);
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
        exitSpecialModes();
        setCurrentGenre(genre);
        setCurrentCategory(category);
        setView('solving');
        setShowProblemList(false);
        setShowFilterPage(false);
        setShowHamburgerMenu(false);
        setShowHistory(false);
        setShowProblemInfo(false);
        // Fetch problem directly and load genre index in background
        loadGenre(genre);
        fetchProblem(problemId).then(full => {
          const p = metaToChessProblem(full, full.solutionText);
          loadAndStartProblem(p);
          cacheProblem(p);
          setCurrentProblemId(prev => ({ ...prev, [category]: p.id }));
        }).catch(() => {});
      } else if (genreOnlyMatch) {
        const resolved = resolveHashSlug(genreOnlyMatch[1]);
        if (!resolved) return;
        const { category, genre } = resolved;
        exitSpecialModes();
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
  }, [loadGenre, loadAndStartProblem, cacheProblem, setCurrentProblemId, setCurrentCategory, resolveHashSlug, allSlugs, handleStartRated, exitSpecialModes]);

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
  // Track solve timing for solve events
  const solveStartTimeRef = useRef<number | null>(null);
  const hintUsedRef = useRef(false);
  useEffect(() => {
    if (hashRestoredRef.current) return;
    hashRestoredRef.current = true;

    const hash = window.location.hash;
    if (hash === '#/terms') {
      setView('mode-select');
      return;
    }
    // Shareable static pages: the event page, the guides, What's new.
    if (hash === '#/wcsc2026') { setView('mode-select'); setShowWcscPage(true); return; }
    if (hash === '#/themes') { setView('mode-select'); setShowThemeGuide(true); return; }
    if (hash === '#/whatsnew') { setView('mode-select'); setShowChangelog(true); return; }
    const guideHashMatch = hash.match(/^#\/guide(?:\/(direct|help|self))?$/);
    if (guideHashMatch) {
      setView('mode-select');
      setGuideFocus((guideHashMatch[1] as Genre) || null);
      setShowGuide(true);
      return;
    }
    // Rated mode hash: #/rated/{genre} or #/rated/{genre}/yacpdb/123
    const ratedMatch = hash.match(/^#\/rated(?:\/(direct|self|help))?(?:\/yacpdb\/(\d+))?$/);
    if (ratedMatch) {
      const ratedProblemId = ratedMatch[2] ? parseInt(ratedMatch[2]) : undefined;
      handleStartRated((ratedMatch[1] as RatedGenre) || 'direct', ratedProblemId);
      return;
    }
    // Daily problem hash: #/daily/YYYY-MM-DD
    const dailyMatch = hash.match(/^#\/daily\/(\d{4}-\d{2}-\d{2})$/);
    if (dailyMatch) {
      const date = dailyMatch[1];
      setIsDaily(true);
      setDailyDate(date);
      setCurrentGenre('direct');
      setView('solving');
      fetchDailyByDate(date).then(data => {
        const p = metaToChessProblem(data, data.solutionText);
        loadAndStartProblem(p);
        cacheProblem(p);
        setCurrentProblemId(prev => ({ ...prev, direct: p.id }));
      }).catch(() => {});
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
      // Same road as tapping the category on the home screen. The old inline
      // version waited for the FULL genre index (seconds on a fresh device)
      // and then picked the first problem of the GENRE — a #1 in a #/twomover
      // URL. selectMode quick-starts one problem in the right move range and
      // loads the index behind it.
      selectMode(resolved.category);
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

    // Instantly show cached problem while genre data loads.
    // Only usable when the URL doesn't request a specific different problem:
    // for #/slug/yacpdb/{id} the cached problem must be that exact id, and
    // legacy index URLs (#/genre/44) can't be matched against the cache at all.
    let cacheHit = false;
    try {
      const cached = localStorage.getItem('cp-cached-problem');
      if (cached) {
        const cachedProblem = JSON.parse(cached) as ChessProblem;
        const cacheMatchesUrl = !isLegacy && cachedProblem.id === problemNum;
        if (cachedProblem.genre === genre && cacheMatchesUrl && cachedProblem.solutionText) {
          // Rebuild the tree through the exact same path as normal loads
          // (loadAndStartProblem → ensureSolution). The inline rebuild that
          // used to live here diverged for retro problems (black-to-move
          // detection, color-flip ordering), rejecting correct moves after a
          // reload. The board still shows instantly: loadAndStartProblem
          // displays the position first and parses in a microtask.
          cachedProblem.solutionTree = [];
          cachedProblem.fullSolutionTree = [];
          loadAndStartProblem(cachedProblem);
          cacheHit = true;
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
      }).catch(async () => {
        // URL problem unavailable (bad ID / fetch failed) — fall back to first unsolved
        try {
          const stubs = await loadGenre(genre);
          if (stubs.length === 0 || loadedProblemIdRef.current) return;
          const genreProgress = progress[genre] || {};
          let nextId: number | null = null;
          for (const s of stubs) {
            if (genreProgress[String(s.id)] !== 'solved' && genreProgress[String(s.id)] !== 'skipped') {
              nextId = s.id;
              break;
            }
          }
          if (!nextId) nextId = stubs[0].id;
          const full = await fetchProblem(nextId);
          const p = metaToChessProblem(full, full.solutionText);
          loadAndStartProblem(p);
          cacheProblem(p);
          setCurrentProblemId(prev => ({ ...prev, [resolved.category]: p.id }));
          history.replaceState(null, '', `#/${resolved.category}/yacpdb/${p.id}`);
        } catch { /* network down — leave loading state */ }
      });
    }

    // Load genre index in background (for navigation/problem list)
    loadGenre(genre).then(async (stubs) => {
      if (stubs.length === 0) return;

      if (problemNum && isLegacy) {
        // Legacy URL: convert index to YACPDB ID
        if (problemNum >= 1 && problemNum <= stubs.length) {
          const target = stubs[problemNum - 1];
          try {
            const full = await fetchProblem(target.id);
            const p = metaToChessProblem(full, full.solutionText);
            const cat = categoryFromGenreProblem(genre, p.moveCount);
            setCurrentCategory(cat);
            if (!loadedProblemIdRef.current) {
              loadAndStartProblem(p);
              cacheProblem(p);
              setCurrentProblemId(prev => ({ ...prev, [cat]: p.id }));
            }
            history.replaceState(null, '', `#/${cat}/yacpdb/${p.id}`);
          } catch { /* fetch failed */ }
        }
      } else if (!loadedProblemIdRef.current && !problemNum) {
        // Slug-only URL with no problem loaded yet
        const genreProgress = progress[genre] || {};
        let nextId: number | null = null;
        for (const s of stubs) {
          if (genreProgress[String(s.id)] !== 'solved' && genreProgress[String(s.id)] !== 'skipped') {
            nextId = s.id;
            break;
          }
        }
        if (!nextId) nextId = stubs[0].id;
        try {
          const full = await fetchProblem(nextId);
          const p = metaToChessProblem(full, full.solutionText);
          const cat = categoryFromGenreProblem(genre, p.moveCount);
          setCurrentCategory(cat);
          loadAndStartProblem(p);
          cacheProblem(p);
          setCurrentProblemId(prev => ({ ...prev, [cat]: p.id }));
        } catch { /* fetch failed */ }
      }
    });
  }, [loadGenre, loadAndStartProblem, ensureSolution, problem, setCurrentProblemId, setCurrentCategory, progress, cacheProblem, resolveHashSlug, allSlugs, categoryFromGenreProblem]);

  const selectMode = useCallback(async (category: Category, opts?: { skipSavedId?: boolean }) => {
    const def = CATEGORY_DEFS.find(d => d.category === category)!;
    const genre = def.genre;
    exitSpecialModes();
    setCurrentGenre(genre);
    setCurrentCategory(category);
    setView('solving');

    // Show tutorial if first time (use genre for tutorial tracking)
    if (!seenTutorials.includes(genre)) {
      setShowTutorial(true);
    }

    // Quick-start: fetch a single problem immediately while genre data loads in background
    const genreProgress = progress[genre] || {};
    const rawSavedId = opts?.skipSavedId ? null : currentProblemId[category];
    // Skip saved ID if already attempted — show fresh problem instead
    const savedId = rawSavedId && !genreProgress[String(rawSavedId)] ? rawSavedId : null;
    if (!genreLoaded[genre]) {
      let quickStarted = false;
      try {
        if (savedId) {
          // Saved problem (unsolved) — fetch directly
          const full = await fetchProblem(savedId);
          const quickProblem = metaToChessProblem(full, full.solutionText);
          loadAndStartProblem(quickProblem);
          cacheProblem(quickProblem);
          updateHash(category, quickProblem.id);
          quickStarted = true;
        } else {
          // No saved unsolved problem. The genre index is the wrong tool for
          // this: it is one row per problem for the WHOLE genre (direct is
          // ~398k rows / 13MB, and it carries no move count, so opening
          // Twomovers pulled #1..#100 as well) and the first visit blocked on
          // it for ~5s just to answer "which is the first unsolved one".
          // Ask the API that question instead — one page, in this category's
          // own move range, on the same difficulty sort the index uses, so the
          // problem chosen here is the same one the index would have chosen.
          // The page is read past the first row because a returning visitor
          // may have solved the leaders; a first-time visitor takes row 0.
          const filters: Record<string, string> = {};
          if (def.minMoves) filters.minMoves = String(def.minMoves);
          if (def.maxMoves) filters.maxMoves = String(def.maxMoves);
          const { problems: firstPage } = await fetchProblemsPage(genre, 0, QUICK_START_PAGE_SIZE, filters);
          const fresh = firstPage.find(m => !genreProgress[String(m.id)]);
          if (fresh) {
            // Metadata only — no solutionText. loadAndStartProblem paints the
            // board from the FEN straight away and ensureSolution fills the
            // solution in behind it, so the board is up after this one request.
            const quickProblem = metaToChessProblem(fresh);
            updateHash(category, quickProblem.id);
            loadAndStartProblem(quickProblem).then(() => cacheProblem(quickProblem));
            quickStarted = true;
          }
          // Nobody unsolved in the first page — fall through to the full index.
        }
      } catch { /* quick-start failed — will fall through to full load below */ }

      if (quickStarted) {
        // Load genre data in background (don't await), don't replace the displayed problem
        loadGenre(genre);
        return;
      }
      // Quick-start failed — fall through to full load
    }

    // Load ID index (await if not yet loaded)
    const stubs = genreLoaded[genre] ? genreIndex[genre] : await loadGenre(genre);

    // Filter stubs by category's move count range
    const filteredStubs = stubs.filter(s => {
      if (!def.minMoves) return true;
      const mcMatch = s.stipulation.match(/(\d+)/);
      const mc = mcMatch ? parseInt(mcMatch[1]) : 0;
      if (mc < def.minMoves) return false;
      if (def.maxMoves && mc > def.maxMoves) return false;
      return true;
    });

    // Find next unsolved problem ID from the filtered index
    let nextId: number | null = null;
    if (savedId) {
      nextId = savedId;
    }
    if (!nextId) {
      for (const s of filteredStubs) {
        if (!genreProgress[String(s.id)]) {
          nextId = s.id;
          break;
        }
      }
    }
    if (!nextId && filteredStubs.length > 0) nextId = filteredStubs[0].id;

    if (nextId) {
      // Fetch full problem details on demand
      try {
        const full = await fetchProblem(nextId);
        const nextProblem = metaToChessProblem(full, full.solutionText);
        loadAndStartProblem(nextProblem);
        cacheProblem(nextProblem);
        setCurrentProblemId(prev => ({ ...prev, [category]: nextProblem.id }));
        updateHash(category, nextProblem.id);
      } catch { /* fetch failed */ }
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
    // Drop the problem on the way out, not on the way back in. Opening anything
    // from home starts with a network round trip, and until it lands the board,
    // the number and the author are still the last problem's — so the previous
    // position sits there for a beat and then swaps under you. Only React state
    // goes; which problem to resume lives in localStorage and is untouched, and
    // moves played were never persisted in the first place.
    problem.clearProblem();
    prevStipulationRef.current = null;
    setView('mode-select');
    setIsDaily(false);
    setIsRatedMode(false);
    setIsReviewMode(false);
    setIsWcsc(false);
    setPrintMode('off');
    setCurrentGenre(null);
    setCurrentCategory(null);
    updateHash(null, null, false);
  }, [updateHash, setCurrentCategory, problem]);


  const SITE_OPEN_DATE = '2026-03-15';

  const navigateDaily = useCallback(async (targetDate: string) => {
    try {
      const data = await fetchDailyByDate(targetDate);
      const p = metaToChessProblem(data, data.solutionText);
      setDailyDate(targetDate);
      setIsDaily(true);
      setIsRatedMode(false);
      setIsReviewMode(false);
      setCurrentGenre('direct');
      setView('solving');
      loadAndStartProblem(p);
      cacheProblem(p);
      setCurrentProblemId(prev => ({ ...prev, direct: p.id }));
      updateHash(null, null, false, targetDate);
    } catch { /* ignore */ }
  }, [loadAndStartProblem, cacheProblem, setCurrentProblemId, updateHash]);

  const handlePrevDaily = useCallback(() => {
    if (!dailyDate) return;
    const [y, m, d] = dailyDate.split('-').map(Number);
    const prev = new Date(y, m - 1, d);
    prev.setDate(prev.getDate() - 1);
    const prevStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
    if (prevStr < SITE_OPEN_DATE) return;
    navigateDaily(prevStr);
  }, [dailyDate, navigateDaily]);

  const handleNextDaily = useCallback(() => {
    if (!dailyDate) return;
    const [y, m, d] = dailyDate.split('-').map(Number);
    const next = new Date(y, m - 1, d);
    next.setDate(next.getDate() + 1);
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    if (nextStr > todayStr) return;
    navigateDaily(nextStr);
  }, [dailyDate, navigateDaily]);

  const isToday = useMemo(() => {
    if (!dailyDate) return true;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return dailyDate === todayStr;
  }, [dailyDate]);

  const canGoPrevDaily = useMemo(() => {
    if (!dailyDate) return false;
    const [y, m, d] = dailyDate.split('-').map(Number);
    const prev = new Date(y, m - 1, d);
    prev.setDate(prev.getDate() - 1);
    const prevStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
    return prevStr >= SITE_OPEN_DATE;
  }, [dailyDate]);

  const handleHistorySelect = useCallback((genre: Genre, selected: ChessProblem, rated?: boolean) => {
    setShowHistory(false);
    setCurrentGenre(genre);
    setView('solving');
    if (rated) {
      setIsRatedMode(true);
      setIsReviewMode(false);
      setIsDaily(false);
      setCurrentCategory(null);
      loadAndStartProblem(selected);
      cacheProblem(selected);
      updateHash(null, selected.id, false, undefined, true);
    } else {
      exitSpecialModes();
      const cat = categoryFromGenreProblem(genre, selected.moveCount);
      setCurrentCategory(cat);
      loadGenre(genre);
      loadAndStartProblem(selected);
      cacheProblem(selected);
      setCurrentProblemId(prev => ({ ...prev, [cat]: selected.id }));
      updateHash(cat, selected.id);
    }
  }, [loadGenre, loadAndStartProblem, cacheProblem, setCurrentProblemId, updateHash, exitSpecialModes, categoryFromGenreProblem, setCurrentCategory]);

  /* Open one problem by its YACPDB id, whatever genre it turns out to be. Used
     by the hamburger's Go to ID and by the guide's worked examples — both hand
     over a bare number and expect to land on that board. */
  const openProblemById = useCallback(async (id: number, opts?: { fromWcsc?: boolean }) => {
    try {
      const full = await fetchProblem(id);
      const p = metaToChessProblem(full, full.solutionText);
      const genre = p.genre as Genre;
      const cat = categoryFromGenreProblem(genre, p.moveCount);
      exitSpecialModes();
      if (opts?.fromWcsc) setIsWcsc(true);
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
  }, [categoryFromGenreProblem, exitSpecialModes, loadAndStartProblem, cacheProblem, setCurrentProblemId, updateHash, loadGenre, setCurrentCategory]);

  const handlePieceDrop = useCallback((source: string, target: string, piece: string): boolean => {
    // react-chessboard passes the chosen piece (e.g. 'wN') after its
    // promotion dialog. Only attach promotion data when the source is a pawn;
    // ordinary pieces moving to the first/eighth rank are normal moves.
    const promoPiece = getPromotionForMove(problem.fen, source, target, piece);
    return problem.tryMove(source, target, promoPiece);
  }, [problem]);

  const handleSelectProblem = useCallback((selected: ChessProblem) => {
    if (!currentGenre) return;
    exitSpecialModes();
    loadAndStartProblem(selected);
    cacheProblem(selected);
    setCurrentProblemId(prev => ({ ...prev, [currentCategory || currentGenre || '']:selected.id }));
    setShowProblemList(false);
    updateHash(currentCategory || currentGenre, selected.id);
  }, [currentGenre, loadAndStartProblem, cacheProblem, setCurrentProblemId, updateHash, exitSpecialModes]);

  const handleGiveUp = useCallback(() => {
    if (currentGenre && problem.problem && !isSecondaryTwin) {
      const pid = String(problem.problem.id);
      setProgress(prev => {
        const genreProgress = prev[currentGenre] || {};
        if (genreProgress[pid] === 'solved') return prev; // don't downgrade
        return { ...prev, [currentGenre]: { ...genreProgress, [pid]: 'failed' as const } };
      });
      const tsKey = `${currentGenre}:${pid}`;
      setTimestamps(prev => ({ ...prev, [tsKey]: Date.now() }));
      // Submit give-up solve event
      const timeSpent = solveStartTimeRef.current ? Date.now() - solveStartTimeRef.current : undefined;
      submitSolveEvent({
        problemId: problem.problem.id,
        correct: false,
        firstMove: problem.moveHistory[0],
        moves: problem.moveHistory,
        timeSpent,
        hintUsed: hintUsedRef.current,
        wrongMoveCount: problem.wrongMoveCount,
        genre: currentGenre || undefined,
        stipulation: problem.problem?.stipulation,
        source: isRatedMode ? 'rated' : isDaily ? 'daily' : undefined,
      });
      trackEvent('problem_gave_up', problem.problem.id, {
        genre: currentGenre,
        category: currentCategory,
        moveCount: problem.moveHistory.length,
        timeSpent,
      });
      // Track rated problem ID on give-up
      if (isRatedMode) {
        setRatedIds(prev => {
          // Merge with disk: usePlayerRating also writes this key, and our
          // in-memory copy may be stale — a blind overwrite would drop its IDs
          let stored: string[] = [];
          try { stored = JSON.parse(localStorage.getItem('cp-rated-ids') || '[]'); } catch { /* ignore */ }
          return Array.from(new Set([...stored, ...prev, pid]));
        });
      }
      // Rating update on give-up (rated mode only — only if not already locked by wrong move)
      if (isRatedMode && !isRated(problem.problem.id)) {
        const serverRating = lastProblemRating;
        const probRating = serverRating
          ? { rating: serverRating, rd: 350 }
          : getProblemInitialRating(problem.problem.difficultyScore, problem.problem.moveCount, problem.problem.pieceCount);
        setProblemRatingBefore(probRating.rating);
        setLastProblemRating(probRating.rating);
        const result = updateAfterSolve(problem.problem.id, probRating, 0.0);
        if (result) setLastRatingDelta(result.delta);
        submitRatingEvent({
          problemId: problem.problem.id,
          score: 0.0,
          playerRating: playerRating.rating,
          playerRd: playerRating.rd,
          playerVol: playerRating.vol,
          genre: ratedGenreRef.current,
        }).then(res => {
          if (res?.problemRating) setLastProblemRating(res.problemRating.rating);
        });
      }
    }
    problem.showSolution();
  }, [currentGenre, problem, setProgress, setTimestamps, isRatedMode, isRated, getProblemInitialRating, updateAfterSolve, playerRating, isSecondaryTwin]);

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

    // Mark as solved only if perfect (no mistakes, no hints), otherwise failed
    if (problem.status === 'correct') {
      const pid = String(problem.problem!.id);
      const perfect = problem.wrongMoveCount === 0 && !hintUsedRef.current;
      const newStatus = perfect ? 'solved' as const : 'failed' as const;
      setProgress(prev => {
        const genreProgress = prev[currentGenre] || {};
        if (genreProgress[pid] === 'solved') return prev; // don't downgrade
        return { ...prev, [currentGenre]: { ...genreProgress, [pid]: newStatus } };
      });
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
    // The header arrows walk the ordinary filtered list, so the problem they
    // land on is no longer the event's — drop the WCSC framing with it.
    setIsWcsc(false);
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
    const wasBm = (bookmarks[currentGenre] || []).includes(pid);
    trackEvent(wasBm ? 'bookmark_removed' : 'bookmark_added', problem.problem.id, { genre: currentGenre });
    // Sync to server so it persists across devices
    pushBookmark(currentGenre, problem.problem.id, wasBm ? 'remove' : 'add');
    setBookmarks(prev => {
      const list = prev[currentGenre] || [];
      return { ...prev, [currentGenre]: list.includes(pid) ? list.filter(id => id !== pid) : [...list, pid] };
    });
  }, [currentGenre, problem.problem, bookmarks, setBookmarks]);

  const isBookmarked = currentGenre && problem.problem
    ? (bookmarks[currentGenre] || []).includes(String(problem.problem.id))
    : false;

  /* The attempt is over — solved or given up — so the composer, the source, the
     award and the themes come back. Both endings count: someone who gives up
     has earned the credit line as much as someone who finds the key. */
  const creditsRevealed = problem.status === 'correct' || problem.status === 'viewing';

  // One recording per solve (see the auto-save effect below). Reset when the
  // user starts solving again (new problem or Try Again).
  const recordedSolveRef = useRef<number | null>(null);
  useEffect(() => {
    if (problem.status === 'solving') recordedSolveRef.current = null;
  }, [problem.status]);

  // Auto-save progress when problem is completed (correct or with mistakes).
  // Keyed by the problem's OWN genre, not currentGenre: when the user switches
  // genre right after solving, currentGenre (a dependency) changes while the
  // solved problem is still mounted (the new one loads asynchronously), so the
  // effect re-fired and wrote a ghost entry under the NEW genre — inflating
  // solved counts and polluting the history page. recordedSolveRef additionally
  // makes the recording once-per-solve (it resets when status returns to
  // 'solving'), which also stops duplicate problem_solved analytics.
  useEffect(() => {
    if (problem.status === 'correct' && problem.problem && !isSecondaryTwin) {
      if (recordedSolveRef.current === problem.problem.id) return;
      recordedSolveRef.current = problem.problem.id;
      const genre = problem.problem.genre as Genre;
      const pid = String(problem.problem.id);
      const perfect = problem.wrongMoveCount === 0 && !hintUsedRef.current;
      const newStatus = perfect ? 'solved' as const : 'failed' as const;
      setProgress(prev => {
        const genreProgress = prev[genre] || {};
        if (genreProgress[pid] === 'solved') return prev; // don't downgrade
        return { ...prev, [genre]: { ...genreProgress, [pid]: newStatus } };
      });
      const tsKey = `${genre}:${pid}`;
      setTimestamps(prev => prev[tsKey] ? prev : { ...prev, [tsKey]: Date.now() });
      // Submit solve event
      const timeSpent = solveStartTimeRef.current ? Date.now() - solveStartTimeRef.current : undefined;
      submitSolveEvent({
        problemId: problem.problem.id,
        correct: true,
        firstMove: problem.moveHistory[0],
        moves: problem.moveHistory,
        timeSpent,
        hintUsed: hintUsedRef.current,
        wrongMoveCount: problem.wrongMoveCount,
        genre,
        stipulation: problem.problem?.stipulation,
        source: isRatedMode ? 'rated' : isDaily ? 'daily' : undefined,
      });
      trackEvent('problem_solved', problem.problem.id, {
        genre,
        category: categoryFromGenreProblem(genre, problem.problem.moveCount),
        moveCount: problem.moveHistory.length,
        timeSpent,
      });
      // Track rated problem ID
      if (isRatedMode) {
        setRatedIds(prev => {
          // Merge with disk: usePlayerRating also writes this key, and our
          // in-memory copy may be stale — a blind overwrite would drop its IDs
          let stored: string[] = [];
          try { stored = JSON.parse(localStorage.getItem('cp-rated-ids') || '[]'); } catch { /* ignore */ }
          return Array.from(new Set([...stored, ...prev, pid]));
        });
      }
      // Rating update (rated mode only)
      if (isRatedMode && !isRated(problem.problem.id)) {
        const score = perfect ? 1.0 : 0.0;
        const serverRating = lastProblemRating;
        const probRating = serverRating
          ? { rating: serverRating, rd: 350 }
          : getProblemInitialRating(problem.problem.difficultyScore, problem.problem.moveCount, problem.problem.pieceCount);
        setProblemRatingBefore(probRating.rating);
        setLastProblemRating(probRating.rating);
        const result = updateAfterSolve(problem.problem.id, probRating, score);
        if (result) setLastRatingDelta(result.delta);
        submitRatingEvent({
          problemId: problem.problem.id,
          score,
          playerRating: playerRating.rating,
          playerRd: playerRating.rd,
          playerVol: playerRating.vol,
          genre: ratedGenreRef.current,
        }).then(res => {
          if (res?.problemRating) setLastProblemRating(res.problemRating.rating);
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem.status, problem.problem, setProgress, setTimestamps, problem.moveHistory]);

  // Fetch a live problem rating only when it is needed: rated/review modes, or
  // Info on a rated-pool genre. direct/help/self all have problem_ratings rows;
  // study and retro have no pool, so asking for them is a guaranteed 404.
  useEffect(() => {
    const shouldFetch = isRatedMode || isReviewMode || showProblemInfo;
    if (shouldFetch && problem.problem && RATED_GENRES.includes(problem.problem.genre as RatedGenre) && lastProblemRating == null) {
      let cancelled = false;
      fetchProblemRating(problem.problem.id).then(res => {
        if (!cancelled) setLastProblemRating(res.rating);
      }).catch(() => {});
      return () => { cancelled = true; };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRatedMode, isReviewMode, showProblemInfo, problem.status, problem.problem?.id, lastProblemRating]);

  // Compute next review interval when problem completes in review mode
  useEffect(() => {
    if (isReviewMode && problem.problem && problem.status !== 'solving') {
      const correct = problem.status === 'correct' && problem.wrongMoveCount === 0 && !hintUsedRef.current;
      setReviewNextInterval(reviewQueue.peekNextInterval(problem.problem.id, correct));
    } else {
      setReviewNextInterval(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReviewMode, problem.status, problem.problem?.id]);

  // Lock rating on first wrong move in rated mode
  useEffect(() => {
    if (isRatedMode && !isSecondaryTwin && problem.wrongMoveCount === 1 && problem.problem && !isRated(problem.problem.id)) {
      const serverRating = lastProblemRating;
      const probRating = serverRating
        ? { rating: serverRating, rd: 350 }
        : getProblemInitialRating(problem.problem.difficultyScore, problem.problem.moveCount, problem.problem.pieceCount);
      setProblemRatingBefore(probRating.rating);
      setLastProblemRating(probRating.rating);
      const result = updateAfterSolve(problem.problem.id, probRating, 0.0);
      if (result) setLastRatingDelta(result.delta);
      submitRatingEvent({
        problemId: problem.problem.id,
        score: 0.0,
        playerRating: playerRating.rating,
        playerRd: playerRating.rd,
        playerVol: playerRating.vol,
        genre: ratedGenreRef.current,
      }).then(res => {
        if (res?.problemRating) setLastProblemRating(res.problemRating.rating);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem.wrongMoveCount]);

  // Arrows for board: analysis arrow (blue, only when active) or refutation arrow (red)
  // MUST pass [] (not undefined) to react-chessboard to clear arrows
  const boardArrows: [string, string, string][] = (analysisActive && analysisArrow)
    ? [[analysisArrow[0], analysisArrow[1], 'rgba(59, 130, 246, 0.8)']]
    : problem.refutationArrow && problem.status === 'solving'
      ? [[problem.refutationArrow[0], problem.refutationArrow[1], 'rgba(255, 50, 50, 0.8)']]
      : [];

  return (
    // min-h-dvh, not min-h-screen: iOS's 100vh is the URL-bar-collapsed
    // height, which keeps the page scrollable by exactly the bar's height
    // and lets Safari park it with the header tucked under the bar.
    <div className={`min-h-dvh ${view === 'solving' ? 'nb-fine' : ''}`}>
      <div className={view === 'solving'
        ? 'nb-sheet nb-sheet-bleed max-w-2xl mx-2 sm:mx-auto my-3 sm:my-5 px-1 pb-14 overflow-hidden'
        : 'max-w-2xl mx-auto'}>
        <Header
          view={view}
          currentGenre={currentGenre}
          onBack={goBack}
          onShowHelp={view === 'solving' && (currentGenre || isRatedMode || isReviewMode) ? () => setShowTutorial(true) : undefined}
          onOpenMenu={() => {
            markMenuBadgeSeen();
            setShowHamburgerMenu(true);
          }}
          hasMenuBadge={!menuBadgeSeen}
          onShowSiteStats={view === 'mode-select' ? () => {
            setShowSiteStats(true);
            if (!siteStats) fetchSiteStats().then(setSiteStats).catch(() => {});
          } : undefined}
          onOpenProblemList={view === 'solving' && currentGenre && !isRatedMode && !isReviewMode ? () => { setShowProblemList(true); if (currentGenre && !genreLoaded[currentGenre]) loadGenre(currentGenre); } : undefined}
          onOpenFilters={view === 'solving' && currentGenre && !isRatedMode && !isReviewMode ? () => { setFilterOpenedFrom('hamburger'); setShowFilterPage(true); } : undefined}
          activeFilterCount={(isRatedMode || isReviewMode) ? 0 : activeFilterCount}
          ratedMode={isRatedMode}
          reviewMode={isReviewMode}
          printMode={printMode}
          onSetPrintMode={view === 'solving' ? setPrintMode : undefined}
        />

        <main className={view === 'solving' ? 'px-4 pb-1' : 'px-4 pb-8'}>

          {view === 'mode-select' && (
              <ModeSelector
                onSelectMode={selectMode}
                progress={progress}
                problemCounts={problemCounts}
                dailyProblem={dailyProblem}
                dailyProblemRating={dailyProblemRating}
                onSolveDaily={handleSolveDaily}
                dailySolved={dailySolved}
                onShowChangelog={() => openStaticPage('#/whatsnew', () => setShowChangelog(true))}
                onShowGuide={() => openGuide()}
                onShowWcsc={() => openStaticPage('#/wcsc2026', () => setShowWcscPage(true))}
                onShowThemes={() => openStaticPage('#/themes', () => setShowThemeGuide(true))}
                onStartRated={handleStartRated}
                onStartReview={handleStartReview}
                reviewDueCount={reviewQueue.dueCount}
                reviewTotalCount={reviewQueue.totalCount}
                ratingsByGenre={ratingsByGenre}
              />
          )}

          {/* Top-level fetch error toast (shown even during loading state) */}
          {fetchErrorToast && (
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
              <div className="bg-[var(--bad)] text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg max-w-sm text-center">
                {fetchErrorToast}
              </div>
            </div>
          )}

          {view === 'solving' && !problem.problem && (genreLoading || (currentGenre && (!genreLoaded[currentGenre] || (problemsByGenre[currentGenre]?.length ?? 0) > 0))) && (
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
              {isDaily && dailyDate && (
                <div className="text-center">
                  <span className="nb-label-key inline-block text-sm tracking-[0.14em] uppercase px-3 py-1">
                    Daily Problem — {(() => {
                      const [y, m, d] = dailyDate.split('-').map(Number);
                      return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    })()}
                  </span>
                </div>
              )}
              {/* Rated mode header removed — rating shown in bottom bar */}
              {/* Stipulation change toast */}
              {stipulationToast && (
                <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
                  {/* Built like the rest of the page — 4px ink edge, hard shadow,
                      ink type on the colour — rather than the white-on-flat-fill
                      pill it used to be, which belonged to the old look. */}
                  <div
                    className={`text-[var(--ink)] text-3xl font-extrabold px-8 py-4 border-4 border-[var(--ink)] rounded-[var(--radius-nb)] shadow-[var(--hard)] ${stipulationToast.sub ? 'animate-stipulation-toast-slow' : 'animate-stipulation-toast'} max-w-[92vw] text-center ${
                      stipulationToast.tone === 'good' ? 'bg-[var(--ok-bg)]'
                        : stipulationToast.tone === 'bad' ? 'bg-[var(--bad-bg)]'
                          : getStipulationToastClasses(stipulationToast.stipulation, stipulationToast.genre)}`}
                  >
                    {stipulationToast.label}
                    {stipulationToast.sub && (
                      // Long sub lines (refutations, notices) at the label's
                      // size would run off phone screens.
                      <div className={stipulationToast.subSmall ? 'mt-1 text-xl' : 'mt-1'}>{stipulationToast.sub}</div>
                    )}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  {!isRatedMode && !isWcsc && (
                  <button
                    onClick={isDaily ? handlePrevDaily : () => handleNavProblem(-1)}
                    disabled={isDaily ? !canGoPrevDaily : (!currentGenre || !problem.problem || filteredProblems.findIndex(p => p.id === problem.problem!.id) <= 0)}
                    className="nb-icon p-1.5 shrink-0"
                    title={isDaily ? "Previous day" : "Previous problem"}
                  >
                    {/* A solid triangle, not the thin chevron the playback bar
                        uses: this button carries no frame of its own, so the
                        glyph has to hold the weight the rest of the header
                        holds with ink. */}
                    <svg className="w-5 h-5" fill="currentColor" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" viewBox="0 0 20 20">
                      <path d="M12.5 4.5 6.5 10l6 5.5z" />
                    </svg>
                  </button>
                  )}
                  <ProblemCard
                    problem={problem.problem}
                    showCredits={creditsRevealed}
                    solutionsTotal={problem.totalSolutions}
                    duplex={problem.duplex}
                    problemNumber={problem.problem!.id}
                    /* From the problem itself, not from currentGenre: Review Mode
                       and Rated pools serve problems the current genre does not
                       describe, and the prefix would name the wrong one. */
                    genrePrefix={({ direct: 'D', help: 'H', self: 'S', study: 'E', retro: 'R' } as Record<string, string>)[problem.problem.genre || currentGenre || 'direct'] || 'D'}
                  />
                  {!isRatedMode && !isWcsc && (
                  <button
                    onClick={isDaily ? handleNextDaily : () => handleNavProblem(1)}
                    disabled={isDaily ? isToday : (!currentGenre || !problem.problem || filteredProblems.findIndex(p => p.id === problem.problem!.id) >= filteredProblems.length - 1)}
                    className="nb-icon p-1.5 shrink-0"
                    title={isDaily ? "Next day" : "Next problem"}
                  >
                    <svg className="w-5 h-5" fill="currentColor" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" viewBox="0 0 20 20">
                      <path d="M7.5 4.5 13.5 10l-6 5.5z" />
                    </svg>
                  </button>
                  )}
                </div>
                <button
                  onClick={toggleBookmark}
                  className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0 ml-1"
                  title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
                >
                  <svg className={`w-5 h-5 ${isBookmarked ? 'text-[var(--acid)]' : 'text-gray-400 dark:text-gray-500'}`}
                    viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </button>
                {/* Everything left inside this panel while an attempt is running is
                    either withheld (composer, source, award, themes, rating) or
                    already in the line above (stipulation, pieces, solutions), so
                    the button itself goes rather than opening an empty sheet. */}
                {creditsRevealed && (
                <button
                  onClick={() => setShowProblemInfo(true)}
                  className="w-6 h-6 rounded-full border border-gray-400 dark:border-gray-500 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center shrink-0"
                  title="Problem info"
                >
                  i
                </button>
                )}
                {!enginePlay && (problem.status === 'correct' || problem.status === 'viewing') && solveStats && (solveStats.totalAttempts > 0 || (solveStats.movesByNumber && solveStats.movesByNumber.length > 0)) && (
                  <button
                    onClick={() => setShowSolveStats(true)}
                    className="relative w-6 h-6 rounded-full border border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center shrink-0 ml-1"
                    title="Solve statistics"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h4v8H3zM10 9h4v12h-4zM17 5h4v16h-4z" />
                    </svg>
                    {solveStats.uniqueSolvers > 0 ? (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--bad)] text-white text-[10px] font-bold flex items-center justify-center leading-none">
                        {solveStats.uniqueSolvers}
                      </span>
                    ) : (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[var(--bad)]" />
                    )}
                  </button>
                )}
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
                          const genreProgress = progress[currentGenre] || {};
                          const unsolved = matching.find(p => genreProgress[String(p.id)] !== 'solved' && genreProgress[String(p.id)] !== 'failed');
                          const target = unsolved || matching[0];
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
                  categoryMoves={categoryDef?.minMoves != null
                    ? { min: categoryDef.minMoves, max: categoryDef.maxMoves ?? 0 }
                    : null}
                />
              )}

              <div className="sticky top-0 z-10 bg-[var(--surface)] pb-1">
              <div className="flex justify-center -mx-1">
                <Board
                  key={`${problem.problem?.id ?? 'loading'}:${problem.initialFen}`}
                  fen={enginePlay ? enginePlay.positions[enginePlay.viewIndex].fen : analysisFen ?? problem.fen}
                  onPieceDrop={enginePlay ? handleEnginePlayDrop : analysisFen !== null ? handleFreeDrop : handlePieceDrop}
                  lastMove={enginePlay ? enginePlay.positions[enginePlay.viewIndex].lastMove : analysisFen !== null ? null : problem.lastMove}
                  disabled={enginePlay ? enginePlay.thinking : analysisFen !== null ? false : problem.waitingForAutoPlay}
                  orientation="white"
                  width={boardWidth}
                  feedbackSquare={enginePlay ? (enginePlay.positions[enginePlay.viewIndex].feedback?.square ?? null) : analysisFen !== null ? null : problem.feedbackSquare}
                  feedbackType={enginePlay ? (enginePlay.positions[enginePlay.viewIndex].feedback?.type ?? null) : analysisFen !== null ? null : problem.feedbackType}
                  hintSquares={enginePlay || analysisFen !== null ? null : problem.hintSquares}
                  arrows={enginePlay ? (enginePlay.hint?.arrow ? [enginePlay.hint.arrow] : []) : analysisFen !== null ? [] : boardArrows}
                  allowAnyColor={!enginePlay && (currentGenre === 'retro' || problem.anyColorAllowed)}
                  freeMove={!enginePlay && analysisFen !== null}
                  printMode={printMode}
                />
              </div>

              {!enginePlay && analysisFen !== null && (
                <div className="nb-plate nb-shadow-room p-3 mt-2 text-center space-y-2">
                  <p className="text-sm font-bold text-[var(--ink)]">
                    Analysis board — move anything anywhere, nothing is checked
                  </p>
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={() => setAnalysisFen(analysisStartFenRef.current)}
                      className="nb-btn px-4 py-2 text-sm"
                    >
                      Reset
                    </button>
                    <button
                      onClick={() => setAnalysisFen(null)}
                      className="nb-btn nb-btn-key px-4 py-2 text-sm"
                    >
                      Back to solving
                    </button>
                  </div>
                </div>
              )}

              {enginePlay && (() => {
                const atEnd = enginePlay.viewIndex === enginePlay.positions.length - 1;
                // Viewing an earlier position needs no caption — the board and
                // the highlighted move say it; playing from there just works.
                const message = !atEnd
                  ? null
                  : enginePlay.result
                    ?? (enginePlay.thinking
                      ? 'Engine is thinking…'
                      : enginePlay.positions.length === 1
                        ? 'Your move — you are playing White against the engine.'
                        : 'Your move.');
                const messageClass = atEnd && enginePlay.result
                  ? (enginePlay.result.includes('you win') ? 'text-[var(--acid)]'
                    : enginePlay.result.includes('engine wins') ? 'text-[var(--bad)]'
                    : 'text-[var(--ink)]')
                  : 'text-[var(--ink)]';
                return (
                  <div className="nb-plate nb-shadow-room p-3 mt-2 space-y-2 text-center">
                    {message && <p className={`text-sm font-bold ${messageClass}`}>{message}</p>}
                    {enginePlay.hint && (
                      <p className="text-sm font-semibold text-[var(--acid)]">{enginePlay.hint.text}</p>
                    )}
                    {enginePlay.positions.length > 1 && (
                      <div className="text-sm text-[var(--ink)] leading-relaxed">
                        {enginePlay.positions.map((pos, i) => {
                          if (i === 0 || !pos.san) return null;
                          const startColor = (enginePlay.positions[0].fen.split(' ')[1] || 'w') as 'w' | 'b';
                          const plyColor = ((i - 1) % 2 === 0) === (startColor === 'w') ? 'w' : 'b';
                          const moveNo = Math.floor(((startColor === 'w' ? 0 : 1) + i - 1) / 2) + 1;
                          return (
                            <span key={i}>
                              {plyColor === 'w' && <span className="text-[var(--faint)] text-xs">{moveNo}.</span>}
                              {plyColor === 'b' && i === 1 && <span className="text-[var(--faint)] text-xs">{moveNo}…</span>}
                              <button
                                onClick={() => setEnginePlay(ep => (ep ? { ...ep, viewIndex: i, hint: null } : ep))}
                                className={`px-1 rounded font-mono ${i === enginePlay.viewIndex ? 'bg-[var(--ink)] text-[var(--surface)] font-bold' : 'hover:underline'}`}
                              >
                                {pos.san}
                              </button>{' '}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <button
                        onClick={() => navEnginePlay(-1)}
                        disabled={enginePlay.viewIndex === 0}
                        className="nb-icon w-9 h-9"
                        title="Previous position"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M12.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L8.414 10l4.293 4.293a1 1 0 010 1.414z" /></svg>
                      </button>
                      <button
                        onClick={() => navEnginePlay(1)}
                        disabled={enginePlay.viewIndex >= enginePlay.positions.length - 1}
                        className="nb-icon w-9 h-9"
                        title="Next position"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M7.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z" /></svg>
                      </button>
                      <button
                        onClick={toggleEngineHint}
                        className={`nb-btn py-1.5 px-3 text-sm font-bold ${enginePlay.hintActive ? 'bg-[var(--ink)] text-[var(--surface)]' : ''}`}
                      >
                        {enginePlay.hintActive ? 'Stop engine' : 'Best move?'}
                      </button>
                      <button onClick={exitEnginePlay} className="nb-btn py-1.5 px-3 text-sm font-bold">
                        Back to solution
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Playback navigation arrows - directly below the board (hide if no moves computed) */}
              {problem.playback && problem.playback.positions.length > 1 && !enginePlay && (problem.status === 'correct' || problem.status === 'viewing') && (
                <div className="flex items-center justify-center">
                  <button
                    onClick={problem.playbackFirst}
                    disabled={problem.playback.moveIndex <= -1 && !problem.playback.exploring}
                    className="nb-icon w-10 h-10"
                    title="First (Home)"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M15.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 010 1.414zm-6 0a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 1.414L5.414 10l4.293 4.293a1 1 0 010 1.414z" />
                    </svg>
                  </button>
                  <button
                    onClick={problem.playbackPrev}
                    disabled={problem.playback.moveIndex <= -1 && !problem.playback.exploring}
                    className="nb-icon w-10 h-10"
                    title="Previous (←)"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <span className="w-16 text-xs text-gray-400 text-center">
                    {problem.playback.exploring ? '?' : problem.playback.moveIndex + 1}/{problem.playback.positions.length - 1}
                  </span>
                  <button
                    onClick={problem.playbackNext}
                    disabled={problem.playback.moveIndex >= problem.playback.positions.length - 2 && !problem.playback.exploring}
                    className="nb-icon w-10 h-10"
                    title="Next (→)"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    onClick={problem.playbackLast}
                    disabled={problem.playback.moveIndex >= problem.playback.positions.length - 2 && !problem.playback.exploring}
                    className="nb-icon w-10 h-10"
                    title="Last (End)"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M4.293 15.707a1 1 0 010-1.414L8.586 10 4.293 5.707a1 1 0 011.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0zm6 0a1 1 0 010-1.414L14.586 10l-4.293-4.293a1 1 0 011.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" />
                    </svg>
                  </button>
                </div>
              )}
              </div>

              {/* Twin selector. Twins are separate positions with separate
                  solutions, so each one is played in its own right -- the
                  buttons stay up while solving, not just in the solution.
                  Rated Mode is the exception: see twinsRevealed. */}
              {problem.problem.twins && problem.problem.twins.length >= 2 && printMode === 'off'
                && (!isRatedMode || twinsRevealed) && (
                <div className="flex items-center gap-1 flex-wrap mb-2">
                  {problem.problem.twins.map(twin => {
                    const active = (activeTwinId ?? problem.problem!.twins![0].id) === twin.id;
                    return (
                      <button
                        key={twin.id}
                        onClick={() => handleSelectTwin(twin.id)}
                        className={`nb-chip px-2.5 py-1 text-xs ${active ? 'nb-btn-key' : ''}`}
                        title={twin.label}
                      >
                        {twin.id})
                      </button>
                    );
                  })}
                  <span className="text-xs text-[var(--faint)] ml-1 truncate">
                    {(problem.problem.twins.find(t => t.id === (activeTwinId ?? problem.problem!.twins![0].id))?.label || '').replace(/^[a-z]\)\s*/, '')}
                  </span>
                </div>
              )}

              {jokeUnplayable && (
                <div className="nb-panel nb-tile-bad px-3 py-2.5 mb-2">
                  <p className="text-sm font-extrabold">Joke problem — it cannot be played here</p>
                  <p className="text-xs mt-1 leading-snug">
                    The solution needs a move normal chess does not allow: promoting to a
                    king or to the opponent's colour, turning the board around, taking a
                    piece off first. Press Give Up to see it.
                  </p>
                </div>
              )}

              {!enginePlay && analysisFen === null && <FeedbackPanel
                status={problem.status}
                feedback={problem.feedback}
                moveHistory={problem.moveHistory}
                waitingForAutoPlay={problem.waitingForAutoPlay}
                hintActive={!!problem.hintSquares}
                solutionLoading={!problem.problem?.solutionText && (problem.problem?.solutionTree?.length ?? 0) === 0}
                onReset={() => { problem.resetProblem(); setLastRatingDelta(null); analysisActiveRef.current = false; setAnalysisActive(false); setAnalysisResult(null); setAnalysisArrow(null); setAnalyzing(false); }}
                onShowSolution={handleGiveUp}
                onNextProblem={(isDaily || isWcsc) ? undefined : isReviewMode ? (problem.status !== 'solving' ? handleReviewNext : undefined) : isRatedMode ? (problem.status !== 'solving' ? (() => {
                  // Show "Next" only if current problem IS the cached rated problem at current difficulty
                  const cached = loadRatedProblemSlot<{ id: number }>(ratedGenre, ratedDifficulty);
                  if (cached && cached.id === problem.problem?.id) return handleNextRatedProblem;
                  return undefined;
                })() : undefined) : handleNextProblem}
                onBackToRated={isRatedMode && problem.status !== 'solving' && (() => {
                  // Show "Back to Rated" if current problem is NOT the cached rated
                  // problem at current difficulty — including when no slot is cached
                  // at all (fresh device opening #/rated/yacpdb/{id}), otherwise the
                  // user gets neither Next nor Back to Rated after solving
                  const cached = loadRatedProblemSlot<{ id: number }>(ratedGenre, ratedDifficulty);
                  return !cached || cached.id !== problem.problem?.id;
                })() ? () => {
                  const data = loadRatedProblemSlot<{ id: number }>(ratedGenre, ratedDifficulty);
                  if (data) {
                    const pid = String(data.id);
                    try {
                      const prog = JSON.parse(localStorage.getItem('cp-progress') || '{}');
                      if (prog[ratedGenre]?.[pid] !== 'solved' && prog[ratedGenre]?.[pid] !== 'failed') {
                        handleStartRated(ratedGenre, data.id, true);
                        return;
                      }
                    } catch {}
                  }
                  handleStartRated();
                } : undefined}
                onRandomProblem={(isDaily || isRatedMode || isReviewMode || isWcsc) ? undefined : handleRandomProblem}
                onGoHome={isWcsc ? goBack : undefined}
                onMoreProblems={isWcsc ? () => openStaticPage('#/wcsc2026', () => setShowWcscPage(true)) : undefined}
                moreCategoryLabel={isWcsc ? 'Back to special page' : undefined}
                onAnalysisBoard={problem.status === 'solving' && problem.problem
                  // Only while nothing is confirmed: at a championship the first
                  // move on the answer sheet is not known to be right, but here
                  // a played move is — analysing a confirmed line on a free
                  // board would be an aid the real event cannot give. The board
                  // is available again whenever the line is empty (fresh
                  // problem, after a wrong first move, between solutions).
                  && problem.moveHistory.length === 0 ? () => {
                  analysisStartFenRef.current = problem.fen;
                  setAnalysisFen(problem.fen);
                } : undefined}
                onShowHint={() => { hintUsedRef.current = true; problem.showHint(); }}
                onHideHint={problem.hideHint}
                onAnalyze={handleAnalyze}
                analyzing={analyzing}
                analysisResult={analysisResult}
                stockfishLoading={stockfish.readyState === 'loading'}
                refutationText={problem.refutationText}
                analysisActive={analysisActive}
                onPrevDaily={isDaily && canGoPrevDaily ? handlePrevDaily : undefined}
                onNextDaily={isDaily && !isToday ? handleNextDaily : undefined}
                onPlayEngine={currentGenre === 'study' && problem.problem ? startEnginePlay : undefined}
                ratingDelta={isRatedMode ? lastRatingDelta : undefined}
                playerRating={isRatedMode ? playerRating.rating : undefined}
                playerRd={isRatedMode ? playerRating.rd : undefined}
                problemRating={lastProblemRating ?? (problem.problem ? getProblemInitialRating(problem.problem.difficultyScore, problem.problem.moveCount, problem.problem.pieceCount).rating : undefined)}
                problemRatingDelta={isRatedMode && problemRatingBefore != null && lastProblemRating != null ? Math.round(lastProblemRating - problemRatingBefore) : undefined}
                hideHintUntilWrong={isRatedMode || isReviewMode}
                hideHint={jokeUnplayable}
                wrongMoveCount={problem.wrongMoveCount}
                reviewNextDays={isReviewMode && reviewNextInterval != null ? reviewNextInterval : undefined}
                classicBoard={printMode !== 'off'}
                ratedDifficulty={isRatedMode ? ratedDifficulty : undefined}
                onChangeDifficulty={isRatedMode ? handleChangeDifficulty : undefined}
                solutionsTotal={problem.totalSolutions}
                solutionsFound={problem.foundSolutionCount}
                duplex={problem.duplex}
                blackToMoveFirst={problem.problem.genre !== 'help' && problem.initialFen.split(' ')[1] === 'b'}
                difficultyLocked={isRatedMode && problem.totalSolutions > 1 && problem.status === 'solving'
                  && (problem.moveHistory.length > 0 || problem.foundSolutionCount > 0)}
              />}

              {!enginePlay && (problem.status === 'correct' || problem.status === 'viewing') && currentGenre === 'retro' && problem.problem.solutionText && (() => {
                const st = problem.problem.solutionText;
                const start = st.replace(/^\{[^}]*\}\s*/, '').trimStart();
                const isBlack = /\{[^}]*[Bb]lack to move/i.test(st)
                  || /^\.{2,}/.test(start) || /^\d+\.{3}/.test(start);
                const isIllegal = st.includes('{(illegal');
                if (!isBlack && !isIllegal) return null;
                return (
                  <p className="text-xs font-semibold text-[var(--bad)] dark:text-[var(--bad)]">
                    {isIllegal ? "White's move is illegal — it's Black's turn." : 'Black to move'}
                  </p>
                );
              })()}

              {!enginePlay && (problem.status === 'correct' || problem.status === 'viewing') && problem.problem.keywords?.includes('Shortmate') && (
                <p className="text-xs font-semibold text-[var(--ink)] dark:text-[var(--ink)]">
                  This is a known flawed problem ("shortmate"): mate is possible in fewer moves than the stipulation.
                </p>
              )}

              {/* YACPDB sometimes records only the first move(s) of a solution.
                  Solving what exists still counts, but say so and hand the
                  reader straight to the engine for the rest. */}
              {!enginePlay && (problem.status === 'correct' || problem.status === 'viewing') && (() => {
                const p = problem.problem;
                if (p.moveCount <= 0) return null; // studies have no fixed length
                const expected = p.genre === 'direct' ? p.moveCount * 2 - 1
                  : (p.genre === 'help' || p.genre === 'self') ? p.moveCount * 2
                  : null; // retro: mixed conventions, skip
                if (expected == null) return null;
                const depth = solutionTreeDepth(p.solutionTree);
                if (depth === 0 || depth >= expected - 1) return null;
                return (
                  <div className="nb-plate nb-shadow-room p-3 space-y-2">
                    <p className="text-xs font-semibold text-[var(--ink)]">
                      YACPDB has only part of the solution for this problem — the recorded line ends early.
                    </p>
                    {/* Direct mates: play the missing continuation against the
                        engine. Other genres (cooperative/self-mating goals make
                        adversarial engine play meaningless) keep the analysis
                        toggle — which must be its own stop: the person who
                        pressed it never pressed "Analyze". */}
                    {p.genre === 'direct' ? (
                      <button onClick={startEnginePlay} className="nb-btn nb-btn-key py-1.5 px-3 text-sm font-bold">
                        Play the continuation →
                      </button>
                    ) : (
                      <button onClick={handleAnalyze} className="nb-btn nb-btn-key py-1.5 px-3 text-sm font-bold">
                        {analyzing ? '...' : analysisActive ? 'Stop' : 'Show continuation →'}
                      </button>
                    )}
                  </div>
                );
              })()}

              {!enginePlay && (problem.status === 'correct' || problem.status === 'viewing') && (
                <ThemeTags keywords={problem.problem.keywords} />
              )}

              {!enginePlay && (problem.status === 'correct' || problem.status === 'viewing') && (
                <ThemeInsightCards insights={themeInsights} />
              )}

              {!enginePlay && (problem.status === 'correct' || problem.status === 'viewing') && (
                <SolutionTree
                  fullNodes={activeTwinId && problem.problem.twins
                    ? (problem.problem.twins.find(t => t.id === activeTwinId)?.fullSolutionTree || problem.problem.fullSolutionTree)
                    : problem.problem.fullSolutionTree}
                  initialFen={problem.initialFen}
                  solutionText={problem.problem.solutionText}
                  stipulation={activeTwinId ? undefined : problem.problem.stipulation}
                  firstColor={(problem.initialFen.split(' ')[1] || 'w') as 'w' | 'b'}
                  duplex={problem.duplex != null}
                  playback={problem.playback}
                  onGoTo={problem.playbackGoTo}
                  onFirst={problem.playbackFirst}
                  onPrev={problem.playbackPrev}
                  onNext={problem.playbackNext}
                  onLast={problem.playbackLast}
                  onExplore={problem.playbackExplore}
                  onShowLine={problem.playbackShowLine}
                  isCooked={isCookedProblem(problem.problem.keywords, problem.problem.solutionText)}
                  notes={solutionNotes}
                />
              )}
            </div>
          )}

          {view === 'solving' && !problem.problem && !genreLoading && currentGenre && genreLoaded[currentGenre] && (problemsByGenre[currentGenre]?.length ?? 0) === 0 && (
            <div className="text-center py-12 text-gray-400">
              No problems available for this mode.
            </div>
          )}
        </main>
      </div>

      {showTutorial && currentGenre && !isRatedMode && !isReviewMode && (
        <GenreTutorial
          genre={currentGenre}
          // The guide only has direct/help/self sections — no link to a page
          // that cannot answer for study and retro.
          onOpenGuide={['direct', 'help', 'self'].includes(currentGenre) ? () => openGuide(currentGenre) : undefined}
          onClose={closeTutorial}
        />
      )}

      {/* Review Mode tutorial */}
      {showTutorial && isReviewMode && problem.problem && (
        <GenreTutorial
          genre={(problem.problem.genre as Genre) || 'direct'}
          review
          onOpenGuide={['direct', 'help', 'self'].includes(problem.problem.genre)
            ? () => openGuide((problem.problem?.genre as Genre) || 'direct')
            : undefined}
          onClose={() => setShowTutorial(false)}
        />
      )}

      {showTutorial && isRatedMode && (
        <GenreTutorial genre={ratedGenre} rated onOpenGuide={() => openGuide(ratedGenre)} onClose={() => setShowTutorial(false)} />
      )}

      <HamburgerMenu
        isOpen={showHamburgerMenu}
        onClose={() => setShowHamburgerMenu(false)}
        onOpenDailyHistory={() => {
          setShowHamburgerMenu(false);
          setShowDailyHistory(true);
        }}
        onOpenHistory={() => {
          setShowHamburgerMenu(false);
          setShowHistory(true);
        }}
        onGoToId={openProblemById}
        onOpenBookmarks={() => {
          setShowHamburgerMenu(false);
          setShowBookmarksPage(true);
        }}
        onOpenSearch={() => { setShowHamburgerMenu(false); setShowSearchPage(true); }}
        onOpenRatingSync={() => {
          markRatingSyncSeen();
          // Treat opening the Sync modal as an explicit "back up my current state":
          // push the local rating to the server so the code can be used to restore
          // exactly what's on this device.
          pushPlayerRating(playerRating, ratedIds.length);
          setShowHamburgerMenu(false);
          setShowRatingSync(true);
        }}
        ratingSyncSeen={ratingSyncSeen}
      />

      <RatingSyncModal
        open={showRatingSync}
        onClose={() => setShowRatingSync(false)}
        currentRating={playerRating}
        onRestore={(code, snapshot) => {
          // Replace sessionId so future events go to the recovered account
          try { localStorage.setItem('cp-session-id', code); } catch { /* ignore */ }
          // Apply each pool's rating. `ratings` is the per-genre map; `rating`
          // (singular) is the direct pool, kept for snapshots written before the
          // genres were split. Pools the account never played reset to default.
          const restored: Partial<Record<RatedGenre, Glicko2Rating>> = {};
          for (const g of RATED_GENRES) {
            const r = snapshot.ratings?.[g] ?? (g === 'direct' ? snapshot.rating : undefined);
            if (r) restored[g] = { rating: r.rating, rd: r.rd, vol: r.vol };
          }
          restoreRating(code, restored);
          // Mirror the rest into localStorage. We replace wholesale (no merging) — the user
          // explicitly confirmed they want this device to become the synced account.
          try {
            localStorage.setItem('cp-progress', JSON.stringify(snapshot.progress));
            localStorage.setItem('cp-timestamps', JSON.stringify(snapshot.timestamps));
            localStorage.setItem('cp-bookmarks', JSON.stringify(snapshot.bookmarks));
            localStorage.setItem('cp-review-queue', JSON.stringify(snapshot.reviewQueue));
            // Restore the exact rated-problem set (restoreRating cleared it) so
            // isRated() works immediately and the review queue only seeds from
            // problems actually played in Rated Mode
            localStorage.setItem('cp-rated-ids', JSON.stringify(snapshot.ratedIds || []));
            // Drop transient session/cache state that belonged to the old identity
            localStorage.removeItem('cp-review-session');
            localStorage.removeItem('cp-cached-problem');
            // Force the migration flag back on so we don't re-upload the just-restored data
            localStorage.setItem('cp-sync-migrated', '1');
          } catch { /* ignore */ }
          setShowRatingSync(false);
          // Reload so every component re-reads from localStorage
          window.location.reload();
        }}
      />

      {showDailyHistory && (
        <DailyHistoryPage
          progress={progress}
          onSelectProblem={(genre, selected, date) => {
            setShowDailyHistory(false);
            setIsDaily(true);
            setDailyDate(date);
            setCurrentGenre(genre);
            setView('solving');
            loadGenre(genre);
            loadAndStartProblem(selected);
            cacheProblem(selected);
            setCurrentProblemId(prev => ({ ...prev, [genre]: selected.id }));
            updateHash(null, null, false, date);
          }}
          onClose={() => setShowDailyHistory(false)}
        />
      )}

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
            exitSpecialModes();
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
        <ChangelogPage onClose={() => closeStaticPage('#/whatsnew', () => setShowChangelog(false))} />
      )}

      {showGuide && (
        /* Leaving the guide closes the "?" dialog underneath it as well, so the
           reader lands on the board. Dropping them back on the dialog they came
           through would make it rules, guide, rules, board — two screens to
           dismiss for someone who has finished reading and wants to play. The
           three steps are one press of "?" away if they want them again. */
        <GuidePage
          focus={guideFocus ?? undefined}
          fromTutorial={guideFocus !== null}
          onOpenCategory={cat => { setShowGuide(false); setShowTutorial(false); selectMode(cat); }}
          onClose={() => closeStaticPage('#/guide', () => { setShowGuide(false); setShowTutorial(false); })}
        />
      )}

      {showWcscPage && (
        <WcscPage
          onSelectProblem={id => { setShowWcscPage(false); openProblemById(id, { fromWcsc: true }); }}
          onClose={() => closeStaticPage('#/wcsc2026', () => setShowWcscPage(false))}
        />
      )}

      {showThemeGuide && (
        <ThemeGuidePage
          onOpenProblem={id => { setShowThemeGuide(false); openProblemById(id); }}
          onClose={() => closeStaticPage('#/themes', () => setShowThemeGuide(false))}
        />
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

      {/* Solve Stats Modal */}
      {showSolveStats && solveStats && (solveStats.totalAttempts > 0 || (solveStats.movesByNumber && solveStats.movesByNumber.length > 0)) && (
        <SolveStatsModal stats={solveStats} onClose={() => setShowSolveStats(false)} />
      )}

      {/* Problem Info Modal */}
      {showProblemInfo && problem.problem && (() => {
        const p = problem.problem!;
        const pc = pieceCount(p.fen);
        // direct falls back to the client-side initial formula (it matches how
        // the direct pool was seeded). help/self pools were seeded with a
        // different formula, so for them only the fetched rating is shown;
        // study/retro have no pool at all.
        const infoRating = p.genre === 'direct'
          ? Math.round((lastProblemRating ?? getProblemInitialRating(
              p.difficultyScore,
              p.moveCount,
              p.pieceCount,
            ).rating) / 50) * 50
          : (RATED_GENRES.includes(p.genre as RatedGenre) && lastProblemRating != null
              ? Math.round(lastProblemRating / 50) * 50
              : null);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowProblemInfo(false)} />
            {/* Was the last panel on the site still made of bg-white and a
                blurred shadow — a soft rectangle among hard-edged ones. */}
            <div className="nb-sheet relative max-w-sm w-full mx-4 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-[var(--ink)]">Problem Info</h3>
                <button onClick={() => setShowProblemInfo(false)} className="nb-disc" aria-label="Close">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-[var(--faint)] font-semibold">Author: </span>
                  <span className="text-[var(--ink)] font-medium">{composerLine(p.authors)}</span>
                </div>
                <div>
                  <span className="text-[var(--faint)] font-semibold">Source: </span>
                  <span className="text-[var(--ink)]">{p.sourceName}{p.sourceYear ? `, ${p.sourceYear}` : ''}</span>
                </div>
                <div>
                  <span className="text-[var(--faint)] font-semibold">Stipulation: </span>
                  <span className="text-[var(--ink)] font-mono">{p.stipulation}</span>
                  {/* Counted here from YACPDB's solution text — the count is
                      part of the stipulation in print ("h#2, 3 solutions"). */}
                  {problem.totalSolutions > 1 && (
                    <span className="text-[var(--ink)] font-mono"> · {problem.totalSolutions} solutions</span>
                  )}
                </div>
                <div>
                  <span className="text-[var(--faint)] font-semibold">Pieces: </span>
                  <span className="text-[var(--ink)]">{pc}</span>
                </div>
                {p.award && (
                  <div>
                    <span className="text-[var(--faint)] font-semibold">Award: </span>
                    <span className="text-[var(--acid)] dark:text-[var(--acid)]">{p.award}</span>
                  </div>
                )}
                {/* Theme names ("Zugzwang", "Grimshaw"…) all but name the key
                    idea, so like ProblemCard they stay hidden until the solve
                    is decided — in every mode, rated or not. */}
                {p.keywords.length > 0 && problem.status !== 'solving' && (
                  <div>
                    <span className="text-[var(--faint)] font-semibold block mb-1">Themes:</span>
                    <div className="flex flex-wrap gap-1">
                      {p.keywords.map(kw => (
                        <span key={kw} className="nb-chip px-2 py-0.5 text-xs">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <span className="text-[var(--faint)] font-semibold">YACPDB: </span>
                  <a href={`https://www.yacpdb.org/#${p.id}`} target="_blank" rel="noopener noreferrer"
                    className="text-[var(--ink)] font-bold underline decoration-2 underline-offset-2">
                    #{p.id}
                  </a>
                </div>
                {(infoRating != null || (solveStats?.players ?? 0) > 0) && (
                  <div className="pt-2 mt-1 border-t-2 border-[var(--ink)] space-y-2">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--faint)]">On this site</div>
                    {infoRating != null && (
                      <div>
                        <span className="text-[var(--faint)] font-semibold">Rating: </span>
                        <span className="text-[var(--ink)] font-semibold">~{infoRating}</span>
                      </div>
                    )}
                    {(solveStats?.players ?? 0) > 0 && (
                      <>
                        <div>
                          <span className="text-[var(--faint)] font-semibold">Players: </span>
                          <span className="text-[var(--ink)]">{solveStats!.players}</span>
                        </div>
                        <div>
                          <span className="text-[var(--faint)] font-semibold">Solved first try: </span>
                          <span className="text-[var(--ink)]">
                            {solveStats!.firstTrySolved ?? 0} ({Math.round(((solveStats!.firstTrySolved ?? 0) / solveStats!.players!) * 100)}%)
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Site Stats Modal */}
      {showSiteStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSiteStats(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-sm w-full mx-4 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Site Stats</h3>
              <button onClick={() => setShowSiteStats(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {siteStats ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Problems available</span>
                  <span className="text-lg font-bold text-green-600 dark:text-green-400">500,000+</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Problems solved</span>
                  <span className="text-lg font-bold text-green-600 dark:text-green-400">{siteStats.uniqueProblems.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Solvers</span>
                  <span className="text-lg font-bold text-green-600 dark:text-green-400">{siteStats.uniqueSolvers.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Total solves</span>
                  <span className="text-lg font-bold text-green-600 dark:text-green-400">{siteStats.timesSolved.toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-400">Loading...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
