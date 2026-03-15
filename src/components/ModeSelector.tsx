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
          <span className="text-5xl sm:text-6xl">♚</span>
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
