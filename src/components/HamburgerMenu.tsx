import { useState } from 'react';

interface HamburgerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFilters: () => void;
  onOpenProblemList: () => void;
  onOpenHistory: () => void;
  onGoHome: () => void;
  onGoToId: (id: number) => void;
  activeFilterCount: number;
}

export function HamburgerMenu({
  isOpen, onClose,
  onOpenFilters, onOpenProblemList, onOpenHistory, onGoHome, onGoToId, activeFilterCount,
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
          {/* Problem List */}
          <button
            onClick={() => {
              onOpenProblemList();
              onClose();
            }}
            className="w-full text-left px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Problem List
          </button>

          {/* Filters */}
          <button
            onClick={() => {
              onOpenFilters();
              onClose();
            }}
            className="w-full text-left px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold bg-green-600 text-white rounded-full">
                {activeFilterCount}
              </span>
            )}
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

          <div className="h-px bg-gray-100 dark:bg-gray-800 my-2 mx-5" />

          {/* Go to Problem ID */}
          <div className="px-5 py-2">
            <label className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1 block">Go to Problem #</label>
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

          {/* Home */}
          <button
            onClick={() => {
              onGoHome();
              onClose();
            }}
            className="w-full text-left px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
            </svg>
            Home
          </button>
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
