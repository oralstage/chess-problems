export type RatedDifficulty = 'very-easy' | 'easy' | 'normal' | 'hard' | 'very-hard';

export const RATED_DIFFICULTIES: RatedDifficulty[] = ['very-easy', 'easy', 'normal', 'hard', 'very-hard'];

export const RATED_DIFFICULTY_OFFSET: Record<RatedDifficulty, number> = {
  'very-easy': -400,
  'easy': -200,
  'normal': 0,
  'hard': 200,
  'very-hard': 400,
};

export const RATED_DIFFICULTY_LABEL: Record<RatedDifficulty, string> = {
  'very-easy': 'Very Easy',
  'easy': 'Easy',
  'normal': 'Normal',
  'hard': 'Hard',
  'very-hard': 'Very Hard',
};

const RATED_DIFFICULTY_KEY = 'cp-rated-difficulty';
const RATED_PROBLEM_KEY_PREFIX = 'cp-rated-problem-';
/** Pre-split keys: one slot per difficulty, all of them direct. Read, never written. */
const LEGACY_RATED_PROBLEM_KEY = 'cp-rated-problem';

export type RatedSlotGenre = 'direct' | 'self' | 'help';

export const RATED_SLOT_GENRES: RatedSlotGenre[] = ['direct', 'self', 'help'];

export function ratedProblemKey(genre: RatedSlotGenre, d: RatedDifficulty): string {
  return `${RATED_PROBLEM_KEY_PREFIX}${genre}-${d}`;
}

export function loadRatedDifficulty(): RatedDifficulty {
  try {
    const saved = localStorage.getItem(RATED_DIFFICULTY_KEY);
    if (saved && (RATED_DIFFICULTIES as string[]).includes(saved)) {
      return saved as RatedDifficulty;
    }
  } catch {}
  return 'normal';
}

export function saveRatedDifficulty(d: RatedDifficulty): void {
  try { localStorage.setItem(RATED_DIFFICULTY_KEY, d); } catch {}
}

export function loadRatedProblem<T = unknown>(genre: RatedSlotGenre, d: RatedDifficulty): T | null {
  try {
    const raw = localStorage.getItem(ratedProblemKey(genre, d));
    if (raw) return JSON.parse(raw) as T;
    // Everything stored before the split was direct, so only direct inherits it.
    if (genre === 'direct') {
      const preGenre = localStorage.getItem(`${RATED_PROBLEM_KEY_PREFIX}${d}`);
      if (preGenre) return JSON.parse(preGenre) as T;
      if (d === 'normal') {
        const legacy = localStorage.getItem(LEGACY_RATED_PROBLEM_KEY);
        if (legacy) return JSON.parse(legacy) as T;
      }
    }
  } catch {}
  return null;
}

export function saveRatedProblem<T>(genre: RatedSlotGenre, d: RatedDifficulty, data: T): void {
  try { localStorage.setItem(ratedProblemKey(genre, d), JSON.stringify(data)); } catch {}
}

/** Clear every slot in one genre — used when that genre's rating moved, which
 *  invalidates the matchmaking that produced its cached problems. */
export function clearRatedProblems(genre: RatedSlotGenre): void {
  try {
    for (const d of RATED_DIFFICULTIES) localStorage.removeItem(ratedProblemKey(genre, d));
    if (genre === 'direct') {
      for (const d of RATED_DIFFICULTIES) localStorage.removeItem(`${RATED_PROBLEM_KEY_PREFIX}${d}`);
      localStorage.removeItem(LEGACY_RATED_PROBLEM_KEY);
    }
  } catch {}
}

export function clearAllRatedProblems(): void {
  for (const g of RATED_SLOT_GENRES) clearRatedProblems(g);
}
