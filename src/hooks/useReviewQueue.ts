import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { pushReviewCard } from '../services/api';

// ── Storage keys ──────────────────────────────────────────────
const QUEUE_KEY   = 'cp-review-queue';
const SESSION_KEY = 'cp-review-session';

// ── FSRS-4.5 default parameters ───────────────────────────────
// w[0]-w[3]: initial stability for ratings Again/Hard/Good/Easy
// w[4]-w[6]: difficulty init & update
// w[7]:      difficulty mean reversion weight
// w[8]-w[10]: recall stability
// w[11]-w[14]: forget stability
// w[15]-w[16]: Hard/Easy modifiers
const W = [
  0.40,  // w[0]  Again initial stability
  0.60,  // w[1]  Hard  initial stability
  2.40,  // w[2]  Good  initial stability
  5.80,  // w[3]  Easy  initial stability
  4.93,  // w[4]  difficulty init base
  0.94,  // w[5]  difficulty init scale
  0.86,  // w[6]  difficulty update weight
  0.01,  // w[7]  mean reversion weight
  1.49,  // w[8]  recall stability exp
  0.14,  // w[9]  recall stability S exponent
  0.94,  // w[10] recall stability R factor
  2.18,  // w[11] forget stability base
  0.05,  // w[12] forget stability D exponent
  0.34,  // w[13] forget stability S exponent
  1.26,  // w[14] forget stability R factor
  0.29,  // w[15] Hard penalty
  2.61,  // w[16] Easy bonus
];

const DECAY  = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // ≈ 0.2346

// ── Types ──────────────────────────────────────────────────────
export interface ReviewCard {
  problemId: number;
  stability:  number;    // S — days before 90% chance of forgetting
  difficulty: number;    // D — 1 (easy) to 10 (hard)
  isNew:      boolean;   // true = never reviewed in Review Mode yet
  dueDate:    string;    // YYYY-MM-DD
  lastReview?: string;   // YYYY-MM-DD of the last review (absent on legacy/synced cards)
}

export interface ReviewSessionState {
  problemIds: number[];  // shuffled queue for this session
  index:      number;    // current position
}

// ── Helpers ────────────────────────────────────────────────────
// All dates use the user's LOCAL calendar day. Mixing toISOString (UTC) with
// local parsing shifted due dates by a day for UTC+ timezones.
function formatLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayStr(): string {
  return formatLocal(new Date());
}

function addDays(base: string, days: number, jitter = 0): string {
  const d = new Date(base + 'T00:00:00');
  const offset = jitter > 0 ? Math.floor(Math.random() * (jitter * 2 + 1)) - jitter : 0;
  d.setDate(d.getDate() + Math.max(1, Math.round(days) + offset));
  return formatLocal(d);
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

// ── FSRS core ──────────────────────────────────────────────────
// rating: 1=Again(fail), 3=Good(pass)
function initStability(rating: number): number {
  return Math.max(0.1, W[rating - 1]);
}

function initDifficulty(rating: number): number {
  return clamp(W[4] - Math.exp(W[5] * (rating - 1)) + 1, 1, 10);
}

function retrievability(elapsedDays: number, s: number): number {
  return Math.pow(1 + FACTOR * elapsedDays / s, DECAY);
}

// interval that achieves requestedRetention (default 0.9)
function targetInterval(s: number, retention = 0.9): number {
  return Math.max(1, Math.round(
    (s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1)
  ));
}

function nextDifficulty(d: number, rating: number): number {
  const meanReversion = W[7] * (initDifficulty(3) - d);
  return clamp(d - W[6] * (rating - 3) + meanReversion, 1, 10);
}

function nextRecallStability(d: number, s: number, r: number, rating: number): number {
  const hardPenalty = rating === 2 ? W[15] : 1;
  const easyBonus   = rating === 4 ? W[16] : 1;
  return s * (
    Math.exp(W[8]) *
    (11 - d) *
    Math.pow(s, -W[9]) *
    (Math.exp(W[10] * (1 - r)) - 1) *
    hardPenalty * easyBonus + 1
  );
}

function nextForgetStability(d: number, s: number, r: number): number {
  return W[11] *
    Math.pow(d, -W[12]) *
    (Math.pow(s + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - r));
}

const MIN_INTERVAL_WRONG   = 7;   // never show a failed card before 7 days
const MIN_INTERVAL_CORRECT = 14;  // correct is always longer than wrong

/**
 * Days elapsed since the card was last reviewed — the input FSRS needs.
 * Previously this was measured from dueDate, so an on-time review always got
 * elapsed=0 → retrievability=1 → stability never grew and intervals stayed at
 * the 14-day minimum forever. lastReview is stored from now on; for legacy or
 * synced cards without it, approximate elapsed as the scheduled interval plus
 * any lateness.
 */
function elapsedSinceLastReview(card: ReviewCard, today: string): number {
  const dayMs = 86_400_000;
  if (card.lastReview) {
    return Math.max(0, (new Date(today).getTime() - new Date(card.lastReview).getTime()) / dayMs);
  }
  const lateDays = Math.max(0, (new Date(today).getTime() - new Date(card.dueDate).getTime()) / dayMs);
  return Math.max(1, targetInterval(card.stability)) + lateDays;
}

function fsrsNext(
  card: ReviewCard,
  correct: boolean,
  elapsedDays: number,
): Pick<ReviewCard, 'stability' | 'difficulty'> & { interval: number } {
  const rating = correct ? 3 : 1; // Good=3, Again=1

  if (card.isNew) {
    const s = initStability(rating);
    const d = initDifficulty(rating);
    const interval = Math.max(
      correct ? MIN_INTERVAL_CORRECT : MIN_INTERVAL_WRONG,
      targetInterval(s),
    );
    return { stability: s, difficulty: d, interval };
  }

  const r = retrievability(elapsedDays, card.stability);
  const newD = nextDifficulty(card.difficulty, rating);

  let newS: number;
  if (correct) {
    newS = nextRecallStability(card.difficulty, card.stability, r, rating);
  } else {
    newS = nextForgetStability(card.difficulty, card.stability, r);
  }

  const interval = Math.max(
    correct ? MIN_INTERVAL_CORRECT : MIN_INTERVAL_WRONG,
    targetInterval(newS),
  );
  return { stability: Math.max(0.1, newS), difficulty: newD, interval };
}

// ── Hook ───────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function readQueue(): Record<string, ReviewCard> {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function readSession(): ReviewSessionState | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeSession(s: ReviewSessionState | null) {
  if (s) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

export function useReviewQueue() {
  const [queue, setQueue] = useLocalStorage<Record<string, ReviewCard>>(QUEUE_KEY, {});

  const t = todayStr();
  const dueCount  = Object.values(queue).filter(c => c.dueDate <= t).length;
  const totalCount = Object.keys(queue).length;

  /**
   * Seed new problems from cp-progress, then return a session:
   * - If a previous session exists and its current problem is still due,
   *   resume it (same problem persists after going home).
   * - Otherwise build a fresh shuffled queue from all due problems.
   */
  const startOrResume = useCallback((ratedProgress: Record<string, string>): ReviewSessionState | null => {
    // ── 1. Seed queue (non-destructive: keep all current entries, add missing ones) ──
    const current = readQueue();
    const next: Record<string, ReviewCard> = { ...current };
    let changed = false;

    for (const [idStr, status] of Object.entries(ratedProgress)) {
      if (status === 'skipped') continue;
      if (current[idStr]) continue;
      const initDays = status === 'failed' ? MIN_INTERVAL_WRONG : MIN_INTERVAL_CORRECT;
      next[idStr] = {
        problemId: parseInt(idStr),
        stability:  status === 'failed' ? W[0] : W[2],
        difficulty: status === 'failed' ? initDifficulty(1) : initDifficulty(3),
        isNew:      true,
        dueDate:    addDays(t, initDays, 1),
      };
      changed = true;
    }

    if (changed) {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
      setQueue(next);
    }

    // ── 2. Try to resume existing session ──
    const existing = readSession();
    if (existing && existing.problemIds.length > existing.index) {
      const currentId = String(existing.problemIds[existing.index]);
      const card = next[currentId];
      // Resume if the problem exists in queue (regardless of dueDate — it was already selected)
      if (card) return existing;
    }

    // ── 3. Build fresh session from all due problems ──
    const dueIds = Object.values(next)
      .filter(c => c.dueDate <= t)
      .map(c => c.problemId);

    if (dueIds.length === 0) {
      writeSession(null);
      return null;
    }

    const session: ReviewSessionState = { problemIds: shuffle(dueIds), index: 0 };
    writeSession(session);
    return session;
  }, [t, setQueue]);

  /**
   * Record a review result (Review Mode only).
   * Returns the next session state (index advanced), or null if queue exhausted.
   */
  const recordAndAdvance = useCallback((
    problemId: number,
    correct: boolean,
    session: ReviewSessionState,
  ): ReviewSessionState | null => {
    const key = String(problemId);
    const card = readQueue()[key];
    const elapsedDays = card && !card.isNew ? elapsedSinceLastReview(card, t) : 0;

    const { stability, difficulty, interval } = fsrsNext(
      card ?? { problemId, stability: W[2], difficulty: initDifficulty(3), isNew: true, dueDate: t },
      correct,
      elapsedDays,
    );

    // Update queue (and sync to server)
    const updatedCard: ReviewCard = {
      problemId,
      stability,
      difficulty,
      isNew: false,
      dueDate: addDays(t, interval, 1),
      lastReview: t,
    };
    setQueue(prev => ({ ...prev, [key]: updatedCard }));
    pushReviewCard(updatedCard);

    // Advance session
    const nextIndex = session.index + 1;
    if (nextIndex >= session.problemIds.length) {
      writeSession(null);
      return null; // done
    }
    const nextSession: ReviewSessionState = { ...session, index: nextIndex };
    writeSession(nextSession);
    return nextSession;
  }, [t, setQueue]);

  /**
   * Seed new entries from a flat map of problemId → status (only Rated Mode problems).
   * Call this on app mount so dueCount is accurate on the home screen.
   *
   * Non-destructive: existing entries are always preserved (including those that may
   * not appear in ratedProgress, e.g. cards restored from another device via Sync).
   * Only adds missing entries.
   */
  const seedOnly = useCallback((ratedProgress: Record<string, string>) => {
    const current = readQueue();
    const next: Record<string, ReviewCard> = { ...current };
    let changed = false;
    const today = todayStr();

    for (const [idStr, status] of Object.entries(ratedProgress)) {
      if (status === 'skipped') continue;
      if (current[idStr]) continue; // already tracked — keep as-is
      // New entry
      const initDays = status === 'failed' ? MIN_INTERVAL_WRONG : MIN_INTERVAL_CORRECT;
      next[idStr] = {
        problemId: parseInt(idStr),
        stability:  status === 'failed' ? W[0] : W[2],
        difficulty: status === 'failed' ? initDifficulty(1) : initDifficulty(3),
        isNew:      true,
        dueDate:    addDays(today, initDays, 1),
      };
      changed = true;
    }

    if (changed) {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
      setQueue(next);
    }
  }, [setQueue]);

  /** Compute what the next interval would be without recording it */
  const peekNextInterval = useCallback((problemId: number, correct: boolean): number => {
    const key = String(problemId);
    const current = readQueue();
    const card = current[key];
    if (!card) return correct ? Math.round(W[2]) : 1;
    const elapsed = card.isNew ? 0 : elapsedSinceLastReview(card, todayStr());
    return fsrsNext(card, correct, elapsed).interval;
  }, []);

  return { dueCount, totalCount, startOrResume, recordAndAdvance, seedOnly, peekNextInterval };
}
