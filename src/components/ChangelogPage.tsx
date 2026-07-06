interface ChangelogPageProps {
  onClose: () => void;
}

const CHANGELOG = [
  {
    date: '2026-07-06',
    sections: [
      {
        title: 'New',
        items: [
          'Thematic tries — when your wrong first move is actually a "try" from the composition, the board now plays the composer\'s refutation and explains why it fails (e.g. "Thematic try! 1.Qh1? is refuted by 1...e4!"). Works on ~120,000 problems with try data.',
        ],
      },
      {
        title: 'Fixes',
        items: [
          'Bug fixes and performance improvements.',
        ],
      },
    ],
  },
  {
    date: '2026-07-05',
    sections: [
      {
        title: 'Fixes',
        items: [
          'Many bugs fixed by Claude Fable 5 — most importantly, answer checking is now much more accurate in every genre: refuted "try" moves are no longer accepted as correct, and some genuine solutions that were wrongly rejected are now accepted. Review Mode intervals, Sync restore, and problem links were also fixed.',
        ],
      },
    ],
  },
  {
    date: '2026-06-23',
    sections: [
      {
        title: 'Fixes',
        items: [
          'Filters — the Pieces range slider could get stuck showing "Any" with both handles overlapping and impossible to drag when the filter was opened before a category finished loading. It now always shows the correct piece-count range and can be adjusted right away.',
        ],
      },
    ],
  },
  {
    date: '2026-05-10',
    sections: [
      {
        title: 'New',
        items: [
          'Sync — your rating, solved/failed history, bookmarks, and review queue can now be synced across devices, so you no longer have to worry about losing them if your browser data is cleared. Open the menu (☰) > Sync to back up your code or restore from one.',
        ],
      },
    ],
  },
  {
    date: '2026-04-25',
    sections: [
      {
        title: 'New',
        items: [
          'Difficulty selector added to Rated Mode.',
        ],
      },
    ],
  },
  {
    date: '2026-04-22',
    sections: [
      {
        title: 'Updates',
        items: [
          'Stipulation badges are now color-coded by move count in Direct Mate, Rated, and Review modes — #2 green, #3 blue, #4 amber, #5 pink, #6 purple, #7 cyan — making difficulty easier to spot at a glance.',
          'In Rated Mode, a toast now reliably announces "Mate in N" whenever the move count changes between problems.',
        ],
      },
    ],
  },
  {
    date: '2026-04-17',
    sections: [
      {
        title: 'Updates',
        items: [
          'Cooked problems — when a problem has more than one key that mates (an unintended cook), a yellow badge now appears next to the Solution heading after solving, so you know to check the Key variations for alternative solutions.',
        ],
      },
    ],
  },
  {
    date: '2026-04-01',
    sections: [
      {
        title: 'New',
        items: [
          'Review Mode — reinforce problems you\'ve played in Rated Mode using spaced repetition (FSRS algorithm). Problems reappear at growing intervals: 14+ days after a correct solve, 7+ days after a mistake.',
        ],
      },
    ],
  },
  {
    date: '2026-03-22',
    sections: [
      {
        title: 'New',
        items: [
          'Rated Mode — solve Direct Mate problems matched to your skill level with a Glicko-2 rating system. Your rating adjusts based on your performance: solve perfectly to gain points, any mistakes or giving up loses points.',
        ],
      },
      {
        title: 'Updates',
        items: [
          'Redesigned Daily Problem display on the home page.',
          'Twin problems — solutions now show all twin variants (a, b, c...) with navigation buttons to switch between positions.',
          'Various bug fixes.',
        ],
      },
    ],
  },
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
