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

/** Pre-split key, holding what is now direct's setting. Read, never written. */
const LEGACY_RATED_DIFFICULTY_KEY = 'cp-rated-difficulty';
const RATED_PROBLEM_KEY_PREFIX = 'cp-rated-problem-';
/** Pre-split keys: one slot per difficulty, all of them direct. Read, never written. */
const LEGACY_RATED_PROBLEM_KEY = 'cp-rated-problem';

export type RatedSlotGenre = 'direct' | 'self' | 'help';

export const RATED_SLOT_GENRES: RatedSlotGenre[] = ['direct', 'self', 'help'];

export function ratedProblemKey(genre: RatedSlotGenre, d: RatedDifficulty): string {
  return `${RATED_PROBLEM_KEY_PREFIX}${genre}-${d}`;
}

/* The difficulty offset is per pool. The pools are separate games with separate
   ratings, and a player who wants selfmates easier than their rating has no
   reason to want direct mates easier too — sharing one setting made choosing in
   one pool silently change the other two. */
function difficultyKey(genre: RatedSlotGenre): string {
  return `cp-rated-difficulty-${genre}`;
}

export function loadRatedDifficulty(genre: RatedSlotGenre = 'direct'): RatedDifficulty {
  try {
    const saved = localStorage.getItem(difficultyKey(genre));
    if (saved && (RATED_DIFFICULTIES as string[]).includes(saved)) {
      return saved as RatedDifficulty;
    }
    // Whatever was chosen before the split was chosen for direct mates.
    if (genre === 'direct') {
      const legacy = localStorage.getItem(LEGACY_RATED_DIFFICULTY_KEY);
      if (legacy && (RATED_DIFFICULTIES as string[]).includes(legacy)) {
        return legacy as RatedDifficulty;
      }
    }
  } catch {}
  return 'normal';
}

export function saveRatedDifficulty(genre: RatedSlotGenre, d: RatedDifficulty): void {
  try { localStorage.setItem(difficultyKey(genre), d); } catch {}
}

/** A joke problem asks for a move no board can hold, so it can never be solved
 *  and the slot would hand the same dead end back on every visit. Matchmaking no
 *  longer serves them; this clears out the ones already sitting in a slot. */
function isJokeProblem(data: unknown): boolean {
  const keywords = (data as { keywords?: unknown } | null)?.keywords;
  return Array.isArray(keywords) && keywords.includes('Joke problem');
}

export function loadRatedProblem<T = unknown>(genre: RatedSlotGenre, d: RatedDifficulty): T | null {
  try {
    const keys = [ratedProblemKey(genre, d)];
    // Everything stored before the split was direct, so only direct inherits it.
    if (genre === 'direct') {
      keys.push(`${RATED_PROBLEM_KEY_PREFIX}${d}`);
      if (d === 'normal') keys.push(LEGACY_RATED_PROBLEM_KEY);
    }
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (isJokeProblem(data)) {
        localStorage.removeItem(key);
        continue;
      }
      return data as T;
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
