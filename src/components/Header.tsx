import type { ThemeMode } from '../hooks/useTheme';
import type { AppView, Genre } from '../types';

interface HeaderProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  view: AppView;
  currentGenre: Genre | null;
  onBack: () => void;
  onShowHelp?: () => void;
  onOpenMenu?: () => void;
  onOpenProblemList?: () => void;
  onOpenFilters?: () => void;
  activeFilterCount?: number;
}

const GENRE_NAMES: Record<Genre, string> = {
  direct: 'Direct Mate',
  help: 'Helpmate',
  self: 'Selfmate',
  study: 'Study',
  retro: 'Retro',
};

function KofiButton() {
  return (
    <a
      href="https://ko-fi.com/A0A21W2W51"
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0"
    >
      <img
        src="https://storage.ko-fi.com/cdn/kofi2.png?v=6"
        alt="Buy Me a Coffee at ko-fi.com"
        className="h-7 hover:opacity-80 transition-opacity"
      />
    </a>
  );
}

function ThemeToggle({ theme, onToggleTheme }: { theme: ThemeMode; onToggleTheme: () => void }) {
  return (
    <button
      onClick={onToggleTheme}
      className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400"
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
}

export function Header({ theme, onToggleTheme, view, currentGenre, onBack, onShowHelp, onOpenMenu, onOpenProblemList, onOpenFilters, activeFilterCount }: HeaderProps) {
  if (view === 'mode-select') {
    return (
      <header className="flex items-center justify-end gap-2 py-3 px-4">
        <KofiButton />
        <ThemeToggle theme={theme} onToggleTheme={onToggleTheme} />
        {onOpenMenu && (
          <button
            onClick={onOpenMenu}
            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400"
            title="Menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
      </header>
    );
  }

  return (
    <header className="flex items-center justify-between py-3 px-4">
      <div className="flex items-center gap-3">
        {/* Home button */}
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400"
          title="Home"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          {currentGenre ? GENRE_NAMES[currentGenre] : 'Chess Problems'}
        </h1>
        {onShowHelp && (
          <button
            onClick={onShowHelp}
            className="w-6 h-6 rounded-full border border-gray-400 dark:border-gray-500 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
            title={`What is ${currentGenre ? GENRE_NAMES[currentGenre] : ''}?`}
          >
            ?
          </button>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        {/* Problem List button (grid icon) */}
        {onOpenProblemList && (
          <button
            onClick={onOpenProblemList}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400"
            title="Problem List"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
        )}
        {/* Filters button */}
        {onOpenFilters && (
          <button
            onClick={onOpenFilters}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400 relative"
            title="Filters"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {(activeFilterCount || 0) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center text-[9px] font-bold bg-green-600 text-white rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}
        <ThemeToggle theme={theme} onToggleTheme={onToggleTheme} />
        {/* Hamburger menu button */}
        {onOpenMenu && (
          <button
            onClick={onOpenMenu}
            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400"
            title="Menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
