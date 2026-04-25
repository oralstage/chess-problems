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
const LEGACY_RATED_PROBLEM_KEY = 'cp-rated-problem';

export function ratedProblemKey(d: RatedDifficulty): string {
  return `${RATED_PROBLEM_KEY_PREFIX}${d}`;
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

export function loadRatedProblem<T = unknown>(d: RatedDifficulty): T | null {
  try {
    const raw = localStorage.getItem(ratedProblemKey(d));
    if (raw) return JSON.parse(raw) as T;
    if (d === 'normal') {
      const legacy = localStorage.getItem(LEGACY_RATED_PROBLEM_KEY);
      if (legacy) return JSON.parse(legacy) as T;
    }
  } catch {}
  return null;
}

export function saveRatedProblem<T>(d: RatedDifficulty, data: T): void {
  try { localStorage.setItem(ratedProblemKey(d), JSON.stringify(data)); } catch {}
}

export function clearAllRatedProblems(): void {
  try {
    for (const d of RATED_DIFFICULTIES) localStorage.removeItem(ratedProblemKey(d));
    localStorage.removeItem(LEGACY_RATED_PROBLEM_KEY);
  } catch {}
}
