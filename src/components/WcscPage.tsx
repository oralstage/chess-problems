import { useEffect, useReducer } from 'react';
import { Chessboard } from 'react-chessboard';
import { fetchProblemBatch } from '../services/api';
import { WCSC_2026_ROUNDS, WCSC_2026_TITLE, WCSC_2026_SUBTITLE } from '../data/wcsc2026';

/* Same shape as the bookmarks list: one batch request fills a module-level
   FEN cache that survives the page being closed and reopened. */
const fenCache = new Map<number, string>();

interface WcscPageProps {
  onSelectProblem: (id: number) => void;
  onClose: () => void;
}

export function WcscPage({ onSelectProblem, onClose }: WcscPageProps) {
  const [, forceUpdate] = useReducer(x => x + 1, 0);

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
            <div className="text-xs text-[var(--faint)]">{WCSC_2026_SUBTITLE}</div>
          </div>
          <button onClick={onClose} className="nb-disc" aria-label="Close">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-8">
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 mb-1">
            The exact problems from this year's World Chess Solving Championship,
            round by round. At the event each round is solved against the clock —
            try giving yourself the same time.
          </p>
          <p className="text-xs text-[var(--faint)] mb-2">
            Problem set: WFCC, wfcc.ch. Four of the 18 are not in YACPDB (three
            were composed for 2026 events), so they can't be solved here yet.
          </p>

          {WCSC_2026_ROUNDS.map(round => (
            <div key={round.round} className="mt-4">
              <div className="flex items-baseline gap-2 mb-2">
                <h3 className="font-bold text-gray-900 dark:text-white">Round {round.round} — {round.title}</h3>
                <span className="nb-chip px-2 py-0.5 text-xs font-mono shrink-0">{round.minutes} min</span>
              </div>
              {round.problems.map(p => {
                const fen = p.yacpdbId !== null ? fenCache.get(p.yacpdbId) : undefined;
                return (
                  <button
                    key={p.no}
                    onClick={() => { if (p.yacpdbId !== null) onSelectProblem(p.yacpdbId); }}
                    disabled={p.yacpdbId === null}
                    className="nb-tile nb-shadow-room-sm w-full text-left px-3 py-2.5 mb-2 flex gap-3 items-center disabled:opacity-50"
                  >
                    <div className="shrink-0 rounded-[6px] overflow-hidden border-2 border-[var(--ink)]" style={{ width: 56, height: 56 }}>
                      {fen ? (
                        <Chessboard position={fen} boardWidth={56} arePiecesDraggable={false} animationDuration={0}
                          customBoardStyle={{ borderRadius: '0' }} customDarkSquareStyle={{ backgroundColor: '#779952' }} customLightSquareStyle={{ backgroundColor: '#edeed1' }} />
                      ) : (
                        <div className="w-full h-full bg-[var(--surface-2)] flex items-center justify-center">
                          <span className="text-lg text-gray-300 dark:text-gray-600">♚</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-gray-700 dark:text-gray-200">{p.no}.</span>
                        <span className="nb-chip px-2 py-0.5 text-xs font-mono">{p.stipulation}</span>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 truncate mt-0.5">{p.author}</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                        {p.yacpdbId === null ? 'Not in YACPDB yet' : p.source}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
