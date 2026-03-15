import type { Genre, ProblemProgress } from '../types';

interface ModeSelectorProps {
  onSelectMode: (genre: Genre) => void;
  progress: Record<Genre, ProblemProgress>;
  problemCounts: Record<Genre, number>;
}

const MODES: {
  genre: Genre;
  title: string;
  tag: string;
  accent: string;
  accentBg: string;
  description: string;
  detail: string;
}[] = [
  {
    genre: 'direct',
    title: 'Direct Mate',
    tag: '#2 — #6',
    accent: 'text-blue-500 dark:text-blue-400',
    accentBg: 'bg-blue-500',
    description: 'The classical form. White plays first and forces checkmate in a specified number of moves, no matter how Black defends.',
    detail: 'The key move — the unique correct first move — is the heart of every direct mate. Great composers hide it behind surprising sacrifices, quiet moves, and zugzwang.',
  },
  {
    genre: 'help',
    title: 'Helpmate',
    tag: 'h#2 — h#3',
    accent: 'text-emerald-500 dark:text-emerald-400',
    accentBg: 'bg-emerald-500',
    description: 'Both sides cooperate. Black moves first, and together they achieve checkmate of the Black king.',
    detail: 'A reversed logic — enemies become allies. Helpmates often feature geometric harmony and multiple solutions with completely different play.',
  },
  {
    genre: 'self',
    title: 'Selfmate',
    tag: 's#2 — s#3',
    accent: 'text-violet-500 dark:text-violet-400',
    accentBg: 'bg-violet-500',
    description: 'White forces Black to deliver checkmate. Black resists — but every defense leads to giving mate.',
    detail: 'The most paradoxical genre. White\'s goal is to get checkmated, but Black doesn\'t want to cooperate. A battle of wills with an inverted objective.',
  },
  {
    genre: 'study',
    title: 'Study',
    tag: '+ / =',
    accent: 'text-amber-500 dark:text-amber-400',
    accentBg: 'bg-amber-500',
    description: 'Win or draw with no move limit. The form closest to real game play.',
    detail: 'Endgame compositions by masters like Réti, Troitsky, and Kasparyan. Elegant ideas distilled into positions with very few pieces.',
  },
];

export function ModeSelector({ onSelectMode, progress, problemCounts }: ModeSelectorProps) {
  const totalSolved = Object.values(progress).reduce(
    (sum, p) => sum + Object.values(p).filter(s => s === 'solved').length, 0
  );
  const totalProblems = Object.values(problemCounts).reduce((sum, c) => sum + c, 0);

  return (
    <div className="pb-12">
      {/* ── Hero ── */}
      <section className="text-center pt-16 pb-12 px-4">
        <p className="text-sm font-semibold tracking-widest uppercase text-cp-primary mb-4">
          YACPDB Collection
        </p>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-[1.1]">
          The art of{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cp-primary to-teal-400">
            composed chess
          </span>
        </h1>
        <p className="mt-4 text-lg text-gray-500 dark:text-gray-400 max-w-lg mx-auto leading-relaxed">
          Solve handcrafted chess problems by world-class composers. From classic mates to paradoxical selfmates.
        </p>

        <button
          onClick={() => onSelectMode('direct')}
          className="mt-8 inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-cp-primary hover:bg-cp-dark text-white font-semibold text-base shadow-lg shadow-cp-primary/20 hover:shadow-cp-primary/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          Start Solving
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
        <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
          No signup required
        </p>
      </section>

      {/* ── Stats ── */}
      <section className="grid grid-cols-3 gap-4 max-w-md mx-auto px-4 py-8">
        <div className="text-center">
          <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tabular-nums">
            {totalProblems.toLocaleString()}
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-medium">
            Problems
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
            4
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-medium">
            Categories
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl sm:text-3xl font-extrabold text-cp-primary tabular-nums">
            {totalSolved}
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-medium">
            Solved
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="mx-auto w-12 h-px bg-gray-200 dark:bg-gray-700 my-4" />

      {/* ── Problem Types ── */}
      <section className="px-4 pt-8 space-y-4">
        <h2 className="text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500 text-center mb-6">
          Choose your challenge
        </h2>

        {MODES.map(mode => {
          const genreProgress = progress[mode.genre] || {};
          const solved = Object.values(genreProgress).filter(s => s === 'solved').length;
          const total = problemCounts[mode.genre] || 0;
          const pct = total > 0 ? (solved / total) * 100 : 0;

          return (
            <button
              key={mode.genre}
              onClick={() => onSelectMode(mode.genre)}
              disabled={total === 0}
              className="group w-full text-left p-5 rounded-2xl border border-gray-200/70 dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.02] hover:bg-white dark:hover:bg-white/[0.04] hover:border-gray-300 dark:hover:border-white/10 transition-all duration-200 disabled:opacity-30 disabled:pointer-events-none"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <h3 className={`text-xl font-bold tracking-tight ${mode.accent}`}>
                      {mode.title}
                    </h3>
                    <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                      {mode.tag}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                    {mode.description}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 leading-relaxed">
                    {mode.detail}
                  </p>
                </div>
                <svg className="w-5 h-5 mt-1 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>

              {total > 0 && (
                <div className="flex items-center gap-3 mt-4">
                  <div className={`w-1.5 h-1.5 rounded-full ${mode.accentBg} shrink-0`} />
                  <div className="flex-1 h-1 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${mode.accentBg} rounded-full transition-all duration-700 ease-out opacity-70`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-mono tabular-nums shrink-0">
                    {solved}/{total}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </section>

      {/* ── Footer ── */}
      <footer className="text-center mt-12 px-4">
        <p className="text-xs text-gray-400 dark:text-gray-600">
          Problems sourced from{' '}
          <a href="https://www.yacpdb.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-500 dark:hover:text-gray-400 transition-colors">
            YACPDB
          </a>
          {' '}— Yet Another Chess Problem Database
        </p>
      </footer>
    </div>
  );
}
