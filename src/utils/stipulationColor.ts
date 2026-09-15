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

/* The toast that announces a change of stipulation. It takes the stipulation
   and the genre rather than a bare move count, because the move-count coding
   only means anything for direct mates — an h#3 is not a "#3 but helpmate", and
   painting it in #3's hue would say it is. */
export function getStipulationToastClasses(stipulation: string, genre: Genre): string {
  const mc = moveCountOf(stipulation, genre);
  return mc === null ? 'bg-[var(--mc-2)]' : (MOVE_COUNT_BG[mc] ?? 'bg-[var(--mc-x)]');
}

/** "Mate in 3" / "Helpmate in 3" / "Selfmate in 3" — what the badge is short for. */
export function stipulationPhrase(stipulation: string, genre: Genre, moveCount: number): string {
  const noun = genre === 'help' ? 'Helpmate' : genre === 'self' ? 'Selfmate' : 'Mate';
  if (genre === 'study' || genre === 'retro') return stipulation;
  /* A half move belongs in the phrase: an h#2.5 is a helpmate in two and a
     half, and calling it a helpmate in two names a different problem. The
     move count cannot carry it (it is a whole number), so it is read off the
     stipulation, which is where it was written. Nothing in the database has
     one -- fractional stipulations have never been imported -- so this reads
     false for every problem on the site. */
  const half = /\.5$/.test(stipulation.replace(/\s+/g, '')) ? '.5' : '';
  return `${noun} in ${moveCount}${half}`;
}

export function getStipulationTextColorClasses(stipulation: string, genre: Genre): string {
  const mc = moveCountOf(stipulation, genre);
  return mc === null ? 'text-[var(--muted)]' : 'text-[var(--ink)]';
}
