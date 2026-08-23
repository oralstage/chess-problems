import { useState, useCallback, useRef } from 'react';
import { updateRating, defaultRating, difficultyToRating, type Glicko2Rating } from '../utils/glicko2';
import { pushPlayerRating, RATED_GENRES, type RatedGenre } from '../services/api';

/** Pre-split key, holding what is now the direct rating. Read as a fallback, never written. */
const LEGACY_RATING_KEY = 'cp-player-rating';
const RATED_IDS_KEY = 'cp-rated-ids';
const SESSION_ID_KEY = 'cp-session-id';
const MAX_RATED_IDS = 5000;

function ratingKey(genre: RatedGenre): string {
  return `cp-player-rating-${genre}`;
}


type RatingByGenre = Record<RatedGenre, Glicko2Rating>;

interface PlayerRatingState {
  ratings: RatingByGenre;
  /** Problem IDs already rated (first attempt only). Shared across genres — YACPDB
   *  IDs are unique, and the review queue seeds from this one ledger. */
  ratedIds: Set<string>;
}

function loadRating(genre: RatedGenre): Glicko2Rating {
  try {
    const raw = localStorage.getItem(ratingKey(genre));
    if (raw) return JSON.parse(raw) as Glicko2Rating;
    // Players who rated problems before the split have their direct rating under
    // the old single key. Adopt it rather than sending them back to 800.
    if (genre === 'direct') {
      const legacy = localStorage.getItem(LEGACY_RATING_KEY);
      if (legacy) return JSON.parse(legacy) as Glicko2Rating;
    }
  } catch { /* ignore */ }
  return defaultRating();
}

function loadState(): PlayerRatingState {
  const ratings = {} as RatingByGenre;
  for (const g of RATED_GENRES) ratings[g] = loadRating(g);

  let ratedIds = new Set<string>();
  try {
    const idsRaw = localStorage.getItem(RATED_IDS_KEY);
    const idsArr: string[] = idsRaw ? JSON.parse(idsRaw) : [];
    ratedIds = new Set(idsArr);
  } catch { /* ignore */ }

  return { ratings, ratedIds };
}

function saveRating(genre: RatedGenre, rating: Glicko2Rating): void {
  try {
    localStorage.setItem(ratingKey(genre), JSON.stringify(rating));
  } catch { /* ignore */ }
}

function saveRatedIds(ids: Set<string>): void {
  try {
    // Merge with what's currently stored: App.tsx also appends to this key via
    // its own in-memory copy, and a blind overwrite from either writer would
    // silently drop the other's additions (a lost ID means the problem can be
    // rated a second time). Clearing is done explicitly by reset/restore, not
    // through this function.
    let stored: string[] = [];
    try { stored = JSON.parse(localStorage.getItem(RATED_IDS_KEY) || '[]'); } catch { /* ignore */ }
    let arr = Array.from(new Set([...stored, ...ids]));
    // Trim oldest half if exceeding max
    if (arr.length > MAX_RATED_IDS) {
      arr = arr.slice(arr.length - MAX_RATED_IDS / 2);
    }
    localStorage.setItem(RATED_IDS_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}

function clearRatedProblemSlots(): void {
  try {
    const difficulties = ['very-easy', 'easy', 'normal', 'hard', 'very-hard'];
    for (const g of RATED_GENRES) {
      for (const d of difficulties) localStorage.removeItem(`cp-rated-problem-${g}-${d}`);
    }
    for (const d of difficulties) localStorage.removeItem(`cp-rated-problem-${d}`);
    localStorage.removeItem('cp-rated-problem');
  } catch { /* ignore */ }
}

export interface RatingUpdate {
  newRating: Glicko2Rating;
  delta: number;
}

/**
 * @param genre which rated pool the caller is currently playing. Each pool carries
 *   its own rating; switching genres must not drag the other genres' numbers along.
 */
export function usePlayerRating(genre: RatedGenre = 'direct') {
  const [state, setState] = useState<PlayerRatingState>(loadState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const genreRef = useRef(genre);
  genreRef.current = genre;

  const isRated = useCallback((problemId: number): boolean => {
    return stateRef.current.ratedIds.has(String(problemId));
  }, []);

  /**
   * Update player rating after solving a problem.
   * Returns null if already rated (duplicate).
   *
   * @param problemId - The problem ID
   * @param problemRating - Problem's current Glicko-2 rating (from server response)
   * @param score - 1.0 (perfect) or 0.0 (fail)
   */
  const updateAfterSolve = useCallback((
    problemId: number,
    problemRating: { rating: number; rd: number },
    score: number,
  ): RatingUpdate | null => {
    const pid = String(problemId);
    if (stateRef.current.ratedIds.has(pid)) return null;

    const g = genreRef.current;
    const oldRating = stateRef.current.ratings[g];
    const newRating = updateRating(oldRating, problemRating, score);
    const delta = Math.round(newRating.rating - oldRating.rating);

    const newIds = new Set(stateRef.current.ratedIds);
    newIds.add(pid);

    saveRating(g, newRating);
    saveRatedIds(newIds);
    // Push to server so it persists across devices
    pushPlayerRating(newRating, newIds.size, g);

    setState(prev => ({
      ratings: { ...prev.ratings, [g]: newRating },
      ratedIds: newIds,
    }));
    return { newRating, delta };
  }, []);

  /**
   * Get the initial Glicko-2 rating for a problem based on its difficultyScore.
   * Used as fallback when server hasn't returned a rating yet. Pass the problem's
   * own genre and solution length so this matches the seeded value — difficultyScore
   * carries a per-genre offset, and solution length breaks ties within a genre.
   */
  const getProblemInitialRating = useCallback((
    difficultyScore: number,
    moveCount?: number,
    pieceCount?: number,
    problemGenre?: string,
    solutionLength?: number,
  ): { rating: number; rd: number } => {
    return {
      rating: difficultyToRating(difficultyScore, moveCount, pieceCount, problemGenre, solutionLength),
      rd: 350,
    };
  }, []);

  /** Reset every pool. A partial reset would leave the genres inconsistent with
   *  the shared rated-ID ledger, which is what decides whether a problem counts. */
  const resetRating = useCallback(() => {
    const fresh = {} as RatingByGenre;
    for (const g of RATED_GENRES) {
      fresh[g] = defaultRating();
      saveRating(g, fresh[g]);
    }
    try { localStorage.setItem(RATED_IDS_KEY, '[]'); } catch { /* ignore */ }
    try { localStorage.removeItem(LEGACY_RATING_KEY); } catch { /* ignore */ }
    clearRatedProblemSlots();
    setState({ ratings: fresh, ratedIds: new Set() });
  }, []);

  /**
   * Restore ratings from a recovery code (= sessionId).
   * Replaces the local sessionId with the provided code, then sets each pool's
   * rating from the server snapshot. Genres absent from the snapshot reset to
   * the default — the account simply never played them.
   *
   * Caller is responsible for fetching the ratings from /api/my-snapshot first.
   */
  const restoreRating = useCallback((code: string, restored: Partial<Record<RatedGenre, Glicko2Rating>>) => {
    try {
      // Replace sessionId so future events are attributed to the recovered identity
      localStorage.setItem(SESSION_ID_KEY, code);
      localStorage.removeItem(LEGACY_RATING_KEY);
    } catch { /* ignore */ }
    // Cached rated problems belonged to the old session
    clearRatedProblemSlots();

    const next = {} as RatingByGenre;
    for (const g of RATED_GENRES) {
      next[g] = restored[g] ?? defaultRating();
      saveRating(g, next[g]);
    }
    // Explicitly clear ratedIds (the restore handler in App.tsx immediately
    // rewrites the key with the server's exact rated-ID set from the snapshot)
    try { localStorage.setItem(RATED_IDS_KEY, '[]'); } catch { /* ignore */ }
    setState({ ratings: next, ratedIds: new Set() });
  }, []);

  return {
    playerRating: state.ratings[genre],
    ratingsByGenre: state.ratings,
    isRated,
    updateAfterSolve,
    getProblemInitialRating,
    resetRating,
    restoreRating,
  };
}
