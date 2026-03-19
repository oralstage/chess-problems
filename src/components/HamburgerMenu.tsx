import { useState } from 'react';

interface HamburgerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDailyHistory: () => void;
  onOpenHistory: () => void;
  onOpenBookmarks: () => void;
  onOpenSearch: () => void;
  onGoToId: (id: number) => void;
}

export function HamburgerMenu({
  isOpen, onClose,
  onOpenDailyHistory, onOpenHistory, onOpenBookmarks, onOpenSearch, onGoToId,
}: HamburgerMenuProps) {
  const [idInput, setIdInput] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Menu panel — slides from right */}
      <div className="relative w-72 max-w-[80vw] bg-white dark:bg-gray-900 h-full shadow-xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Chess Problems</h2>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {/* Daily Problems */}
          <button
            onClick={() => {
              onOpenDailyHistory();
              onClose();
            }}
            className="w-full text-left px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Daily Problems
          </button>

          {/* History */}
          <button
            onClick={() => {
              onOpenHistory();
              onClose();
            }}
            className="w-full text-left px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            History
          </button>

          {/* Bookmarks */}
          <button
            onClick={() => {
              onOpenBookmarks();
              onClose();
            }}
            className="w-full text-left px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            Bookmarks
          </button>

          {/* Search by Author */}
          <button
            onClick={() => {
              onOpenSearch();
              onClose();
            }}
            className="w-full text-left px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Search by Author
          </button>

          <div className="h-px bg-gray-100 dark:bg-gray-800 my-2 mx-5" />

          {/* Go to YACPDB ID */}
          <div className="px-5 py-2">
            <label className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1 block">Go to YACPDB ID</label>
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const id = parseInt(idInput.replace(/[^0-9]/g, ''));
                if (id > 0) {
                  onGoToId(id);
                  onClose();
                  setIdInput('');
                }
              }}
            >
              <input
                type="text"
                inputMode="numeric"
                value={idInput}
                onChange={(e) => setIdInput(e.target.value)}
                placeholder="e.g. 243207"
                className="flex-1 min-w-0 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <button
                type="submit"
                disabled={!idInput.replace(/[^0-9]/g, '')}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Go
              </button>
            </form>
          </div>

          <div className="h-px bg-gray-100 dark:bg-gray-800 my-2 mx-5" />

        </nav>
      </div>

      <style>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
