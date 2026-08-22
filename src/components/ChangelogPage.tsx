interface ChangelogPageProps {
  onClose: () => void;
}

const CHANGELOG = [
  {
    date: '2026-08-21',
    sections: [
      {
        title: 'New',
        items: [
          'The site has a new look.',
        ],
      },
      {
        title: 'Improved',
        items: [
          'The rules for each genre have been rewritten.',
        ],
      },
    ],
  },
  {
    date: '2026-07-19',
    sections: [
      {
        title: 'Improved',
        items: [
          'Known flawed problems that can be mated sooner than stipulated ("shortmates") are now excluded from the Daily Problem and Rated Mode. When you meet one while browsing, a note explains the flaw after you solve it.',
        ],
      },
      {
        title: 'Fixes',
        items: [
          'Moves to the first and eighth ranks now respond reliably: regular pieces no longer enter promotion handling, and pawn promotion is processed only once.',
        ],
      },
    ],
  },
  {
    date: '2026-07-18',
    sections: [
      {
        title: 'Improved',
        items: [
          'Snappier board — piece animations are faster and the opponent replies sooner after your move, so the board settles in about half the time it used to.',
        ],
      },
      {
        title: 'Fixes',
        items: [
          'On phones and tablets, tapping a piece and then its destination in quick succession sometimes did nothing — the browser mistook the fast second tap for a double-tap zoom. Quick tap-tap moves now register reliably.',
        ],
      },
    ],
  },
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

/* Dates are stored as plain YYYY-MM-DD, so they are split rather than fed to
   Date(): "2026-07-19" parses as UTC midnight, and formatting that in a
   local calendar puts every entry a day early west of Greenwich. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function ChangelogPage({ onClose }: ChangelogPageProps) {
  return (
    /* Restyled onto the sheet grammar the rest of the site uses. What was here
       predated it: no outline, no shadow, a bullet character for a marker, and
       a literal #fff background — the gray and green ramps were retinted so
       the old utilities still land in the palette, but white was not, which
       made this the one pure-white surface on the site. */
    <div className="nb-ground fixed inset-0 z-50 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col p-4 max-w-2xl mx-auto w-full min-h-0">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h2 className="nb-shadow-type text-2xl font-extrabold tracking-tight text-[var(--ink)]">
            What&rsquo;s new
          </h2>
          <button onClick={onClose} className="nb-disc" aria-label="Close">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="nb-sheet nb-shadow-room flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">
          {CHANGELOG.map((entry, entryIndex) => (
            <section key={entry.date} className={entryIndex > 0 ? 'mt-7 pt-7 border-t-2 border-[var(--hairline)]' : ''}>
              <div className="nb-pill inline-block px-3 py-1 text-xs tracking-wide mb-3">
                {formatDate(entry.date)}
              </div>
              {entry.sections.map(section => (
                <div key={section.title} className="mb-4 last:mb-0">
                  <h3 className="text-[0.7rem] font-extrabold uppercase tracking-[0.16em] text-[var(--muted)] mb-1.5">
                    {section.title}
                  </h3>
                  <ul className="space-y-2">
                    {section.items.map((item, i) => (
                      <li key={i} className="text-sm leading-relaxed text-[var(--ink)] flex gap-2.5">
                        {/* A square, not a dot: it is the one marker shape this
                            site already has eight hundred of. */}
                        <span className="mt-[0.5em] h-[7px] w-[7px] shrink-0 rounded-[1px] bg-[var(--board-d)]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
