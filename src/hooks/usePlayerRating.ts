import { useState, useCallback, useRef } from 'react';
import { updateRating, defaultRating, difficultyToRating, type Glicko2Rating } from '../utils/glicko2';

const RATING_KEY = 'cp-player-rating';
const RATED_IDS_KEY = 'cp-rated-ids';
const MAX_RATED_IDS = 5000;

interface PlayerRatingState {
  rating: Glicko2Rating;
  /** Problem IDs already rated (first attempt only) */
  ratedIds: Set<string>;
}

function loadState(): PlayerRatingState {
  try {
    const raw = localStorage.getItem(RATING_KEY);
    const rating = raw ? JSON.parse(raw) as Glicko2Rating : defaultRating();

    const idsRaw = localStorage.getItem(RATED_IDS_KEY);
    const idsArr: string[] = idsRaw ? JSON.parse(idsRaw) : [];
    return { rating, ratedIds: new Set(idsArr) };
  } catch {
    return { rating: defaultRating(), ratedIds: new Set() };
  }
}

function saveRating(rating: Glicko2Rating): void {
  try {
    localStorage.setItem(RATING_KEY, JSON.stringify(rating));
  } catch { /* ignore */ }
}

function saveRatedIds(ids: Set<string>): void {
  try {
    let arr = Array.from(ids);
    // Trim oldest half if exceeding max
    if (arr.length > MAX_RATED_IDS) {
      arr = arr.slice(arr.length - MAX_RATED_IDS / 2);
    }
    localStorage.setItem(RATED_IDS_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}

export interface RatingUpdate {
  newRating: Glicko2Rating;
  delta: number;
}

export function usePlayerRating() {
  const [state, setState] = useState<PlayerRatingState>(loadState);
  const stateRef = useRef(state);
  stateRef.current = state;

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

    const oldRating = stateRef.current.rating;
    const newRating = updateRating(oldRating, problemRating, score);
    const delta = Math.round(newRating.rating - oldRating.rating);

    const newIds = new Set(stateRef.current.ratedIds);
    newIds.add(pid);

    saveRating(newRating);
    saveRatedIds(newIds);

    setState({ rating: newRating, ratedIds: newIds });
    return { newRating, delta };
  }, []);

  /**
   * Get the initial Glicko-2 rating for a problem based on its difficultyScore.
   * Used as fallback when server hasn't returned a rating yet.
   */
  const getProblemInitialRating = useCallback((difficultyScore: number, moveCount?: number, pieceCount?: number): { rating: number; rd: number } => {
    return { rating: difficultyToRating(difficultyScore, moveCount, pieceCount), rd: 350 };
  }, []);

  const resetRating = useCallback(() => {
    const fresh = defaultRating();
    saveRating(fresh);
    saveRatedIds(new Set());
    try { localStorage.removeItem('cp-rated-problem'); } catch {}
    setState({ rating: fresh, ratedIds: new Set() });
  }, []);

  return {
    playerRating: state.rating,
    isRated,
    updateAfterSolve,
    getProblemInitialRating,
    resetRating,
  };
}
