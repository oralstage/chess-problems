interface ChangelogPageProps {
  onClose: () => void;
}

const CHANGELOG = [
  {
    date: '2026-03-19',
    sections: [
      {
        title: 'Updates',
        items: [
          'Solve statistics — after solving, tap the stats icon to see what moves others tried. Share your favorite problems and see how solvers approach them.',
          'Daily Problem archive — browse past daily problems from the hamburger menu.',
          'Site statistics on the home page — see how many solvers and problems solved.',
          'Various bug fixes.',
        ],
      },
    ],
  },
  {
    date: '2026-03-18',
    sections: [
      {
        title: 'Updates',
        items: [
          'Browse by category — Twomovers, Threemovers, Moremovers, and Helpmates by move count from the home screen.',
          'Search problems by composer name.',
          'Bookmarks and History pages with board thumbnails.',
          'Piece count (W+B) shown next to stipulation badge.',
          'Retro problems: Black-to-move detection and display.',
          'Studies: Lichess links for analysis and playing against the computer.',
          'Fairy problems excluded (~4,600 removed).',
          'Faster problem loading.',
          'Various solution parsing and playback fixes.',
        ],
      },
    ],
  },
  {
    date: '2026-03-15',
    sections: [
      {
        title: 'Launch',
        items: [
          'Interactive solver for YACPDB chess problems with move validation, Stockfish hints, and solution playback.',
        ],
      },
    ],
  },
];

export function ChangelogPage({ onClose }: ChangelogPageProps) {
  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">What's New</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-8">
          {CHANGELOG.map(entry => (
            <div key={entry.date}>
              <h3 className="text-sm font-bold text-green-600 dark:text-green-400 uppercase tracking-wider mb-3">
                {entry.date}
              </h3>
              {entry.sections.map(section => (
                <div key={section.title} className="mb-4">
                  <h4 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">
                    {section.title}
                  </h4>
                  <ul className="space-y-1.5">
                    {section.items.map((item, i) => (
                      <li key={i} className="text-sm text-gray-600 dark:text-gray-400 flex gap-2">
                        <span className="text-green-500 shrink-0 mt-0.5">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
