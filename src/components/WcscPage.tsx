import { useEffect, useReducer, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { fetchProblemBatch } from '../services/api';
import { WCSC_2026_ROUNDS, WCSC_2026_TITLE, WCSC_2026_SUBTITLE } from '../data/wcsc2026';
import { pieceCounts } from '../utils/pieceCount';

/* Same shape as the bookmarks list: one batch request fills a module-level
   FEN cache that survives the page being closed and reopened. */
const fenCache = new Map<number, string>();

/* Where the reader was. The page unmounts when a problem is opened, so the
   scroll position lives outside it and is restored on the way back —
   "Back to special page" should land on the round being browsed, not the top. */
let savedScrollTop = 0;

interface WcscPageProps {
  onSelectProblem: (id: number) => void;
  onClose: () => void;
}

export function WcscPage({ onSelectProblem, onClose }: WcscPageProps) {
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Three diagrams across, as the sheet prints them — two on a phone, where a
     third would leave each board too small to read. The board takes a pixel
     width, so it is measured off the column rather than left to CSS. */
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const columns = viewportWidth < 640 ? 2 : 3;
  const contentWidth = Math.min(viewportWidth, 672) - 32;
  const boardSize = Math.floor((contentWidth - 8 * (columns - 1) - 16 * columns) / columns);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = savedScrollTop;
  }, []);

  useEffect(() => {
    const missing = WCSC_2026_ROUNDS.flatMap(r => r.problems)
      .filter(p => p.yacpdbId !== null && !fenCache.has(p.yacpdbId))
      .map(p => p.yacpdbId as number);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const results = await fetchProblemBatch(missing);
        if (cancelled) return;
        for (const meta of results) fenCache.set(meta.id, meta.fen);
      } catch { /* thumbnails stay as placeholders */ }
      if (!cancelled) forceUpdate();
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="nb-ground fixed inset-0 z-50 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full min-h-0">
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--ink)] shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{WCSC_2026_TITLE}</h2>
            <div className="text-xs font-semibold text-[var(--muted)]">{WCSC_2026_SUBTITLE}</div>
          </div>
          <button onClick={onClose} className="nb-disc" aria-label="Close">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          ref={scrollRef}
          onScroll={e => { savedScrollTop = e.currentTarget.scrollTop; }}
          className="flex-1 overflow-y-auto px-4 pb-8"
        >
          <p className="text-[15px] text-[var(--ink)] mt-3 mb-1">
            The exact problems from this year's World Chess Solving Championship,
            round by round. At the event each round is solved against the clock —
            try giving yourself the same time.
          </p>
          <p className="text-sm text-[var(--ink)] mb-2">
            Problem set: WFCC, wfcc.ch. Four of the 18 are not in YACPDB (three
            were composed for 2026 events), so they can't be solved here yet.
          </p>

          {WCSC_2026_ROUNDS.map(round => (
            <div key={round.round} className="mt-4">
              <div className="flex items-baseline gap-2 mb-2">
                <h3 className="font-bold text-lg text-gray-900 dark:text-white">Round {round.round} — {round.title}</h3>
                <span className="nb-chip px-2 py-0.5 text-sm font-mono shrink-0">{round.minutes} min</span>
              </div>
              {/* The sheet's own arrangement: diagrams across the page, and under
                  each one the number, the stipulation and the piece count. Nothing
                  else — the composers and sources are printed on the solutions
                  handed out after the round, and this page is for solving the set,
                  not reading about it. The credits stay in wcsc2026.ts and arrive
                  when a problem is decided, like everywhere else on the site. */}
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                {round.problems.map(p => {
                  const fen = p.yacpdbId !== null ? fenCache.get(p.yacpdbId) : undefined;
                  return (
                    <button
                      key={p.no}
                      onClick={() => { if (p.yacpdbId !== null) onSelectProblem(p.yacpdbId); }}
                      disabled={p.yacpdbId === null}
                      className="nb-tile nb-shadow-room-sm w-full p-2 flex flex-col items-center gap-1.5 disabled:opacity-50"
                    >
                      <div className="rounded-[6px] overflow-hidden border-2 border-[var(--ink)]" style={{ width: boardSize, height: boardSize }}>
                        {fen ? (
                          <Chessboard position={fen} boardWidth={boardSize} arePiecesDraggable={false} animationDuration={0}
                            customBoardStyle={{ borderRadius: '0' }} customDarkSquareStyle={{ backgroundColor: '#779952' }} customLightSquareStyle={{ backgroundColor: '#edeed1' }} />
                        ) : (
                          <div className="w-full h-full bg-[var(--surface-2)] flex items-center justify-center">
                            <span className="text-3xl text-gray-300 dark:text-gray-600">♚</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        <span className="font-mono font-bold text-sm text-gray-700 dark:text-gray-200">{p.no}.</span>
                        <span className="nb-chip px-1.5 py-0.5 text-xs font-mono">{p.stipulation}</span>
                        {fen && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{pieceCounts(fen)}</span>
                        )}
                      </div>
                      {p.yacpdbId === null && (
                        <div className="text-xs text-gray-600 dark:text-gray-300 text-center leading-tight">Not in YACPDB yet</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
