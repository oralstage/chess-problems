import type { Genre, ProblemProgress } from '../types';

interface ModeSelectorProps {
  onSelectMode: (genre: Genre) => void;
  progress: Record<Genre, ProblemProgress>;
  problemCounts: Record<Genre, number>;
}

const MODES: {
  genre: Genre;
  title: string;
  brief: string;
}[] = [
  {
    genre: 'direct',
    title: 'Direct Mate',
    brief: 'White to move and force checkmate',
  },
  {
    genre: 'help',
    title: 'Helpmate',
    brief: 'Both sides cooperate to achieve mate',
  },
  {
    genre: 'self',
    title: 'Selfmate',
    brief: 'White forces Black to deliver mate',
  },
  {
    genre: 'study',
    title: 'Study',
    brief: 'Win or draw with no move limit',
  },
];

export function ModeSelector({ onSelectMode, progress, problemCounts }: ModeSelectorProps) {
  const availableModes = MODES.filter(m => (problemCounts[m.genre] || 0) > 0);
  const totalProblems = Object.values(problemCounts).reduce((s, c) => s + c, 0);

  return (
    <div className="min-h-[80vh] flex flex-col justify-center py-12">
      {/* ── Hero ── */}
      <div className="px-5 mb-10">
        <div className="flex items-center gap-4 mb-3">
          <svg className="w-12 h-12 sm:w-14 sm:h-14 text-gray-900 dark:text-white" viewBox="0 0 45 45" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 22.5,11.63 L 22.5,6" />
            <path d="M 20,8 L 25,8" />
            <path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 25.5,14.5 24.5,12 22.5,12 C 20.5,12 19.5,14.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25" />
            <path d="M 12.5,37 C 18,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 41.5,25.5 38.5,19.5 C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 19,16 9.5,13 6.5,19.5 C 3.5,25.5 12.5,30 12.5,30 L 12.5,37" />
            <path d="M 12.5,30 C 18,27 27,27 32.5,30" opacity="0.5" />
            <path d="M 12.5,33.5 C 18,30.5 27,30.5 32.5,33.5" opacity="0.5" />
            <path d="M 12.5,37 C 18,34 27,34 32.5,37" opacity="0.5" />
          </svg>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-gray-900 dark:text-white">
            Chess Problems
          </h1>
        </div>
        <p className="text-base text-gray-500 dark:text-gray-400 max-w-lg leading-relaxed">
          Chess problems are composed puzzles — not from real games, but crafted as art.
          Find the unique winning idea in {totalProblems.toLocaleString()} curated positions.
        </p>
      </div>

      {/* ── Modes ── */}
      <nav className="space-y-2 px-4">
        {availableModes.map(mode => {
          const genreProgress = progress[mode.genre] || {};
          const solved = Object.values(genreProgress).filter(s => s === 'solved').length;
          const total = problemCounts[mode.genre] || 0;

          return (
            <button
              key={mode.genre}
              onClick={() => onSelectMode(mode.genre)}
              className="group w-full text-left px-5 py-4 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors duration-150"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                    {mode.title}
                  </h2>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
                    {mode.brief}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span className="text-sm text-gray-400 dark:text-gray-500 tabular-nums">
                    {solved > 0 && <span className="font-semibold text-gray-600 dark:text-gray-300">{solved}/</span>}
                    {total}
                  </span>
                  <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* ── Footer ── */}
      <footer className="text-center mt-16 px-4">
        <p className="text-[11px] text-gray-400 dark:text-gray-600">
          <a href="https://www.yacpdb.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-500 dark:hover:text-gray-400 transition-colors">
            YACPDB
          </a>
          {' '}— Yet Another Chess Problem Database
        </p>
      </footer>
    </div>
  );
}
