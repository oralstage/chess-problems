import type { Genre } from '../types';

/* The move-count coding lives on tokens (--mc-*) rather than on Tailwind's
   ramps: those ramps are not retinted, so they painted outside the palette.
   The badge carries an ink border and ink type in every case — the hue only
   has to separate #2 from #3 at a glance, not carry the contrast itself. */
const MOVE_COUNT_BG: Record<number, string> = {
  2: 'bg-[var(--mc-2)]',
  3: 'bg-[var(--mc-3)]',
  4: 'bg-[var(--mc-4)]',
  5: 'bg-[var(--mc-5)]',
  6: 'bg-[var(--mc-6)]',
  7: 'bg-[var(--mc-7)]',
};

function moveCountOf(stipulation: string, genre: Genre): number | null {
  if (genre !== 'direct' || !stipulation.startsWith('#')) return null;
  const mc = parseInt(stipulation.slice(1), 10);
  return Number.isFinite(mc) ? mc : null;
}

export function getStipulationColorClasses(stipulation: string, genre: Genre): string {
  const mc = moveCountOf(stipulation, genre);
  if (mc === null) return 'bg-[var(--mc-2)] text-[var(--ink)]';
  return `${MOVE_COUNT_BG[mc] ?? 'bg-[var(--mc-x)]'} text-[var(--ink)]`;
}

export function getStipulationToastClasses(moveCount: number): string {
  return MOVE_COUNT_BG[moveCount] ?? 'bg-[var(--mc-x)]';
}

export function getStipulationTextColorClasses(stipulation: string, genre: Genre): string {
  const mc = moveCountOf(stipulation, genre);
  return mc === null ? 'text-[var(--muted)]' : 'text-[var(--ink)]';
}
