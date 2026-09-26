import { useCallback, useEffect, useRef, useState } from 'react';
import { Board } from '../src/components/Board';
import { useTheme } from '../src/hooks/useTheme';
import { pieceCounts } from '../src/utils/pieceCount';
import { composerLine } from '../src/utils/composerName';
import { EMPTY, asFen, creditFromParams, freeDrop, readPlacement } from './placement';

/* The analysis board on a page of its own -- what /solve?fen=… opens when it
   is given a position and nothing to solve. The pocket set the solving view
   hands out: any man to any square, nothing checked.

   Set out as the problem page is, less the problem: the line over the board
   says what it is and the material, the board, and Reset under it. No field
   for a FEN and no editor -- the position is the one in the address, and
   /make is where a position is set up.

   The position comes as a placement and nothing else. The board plays no
   rules, so the side to move, castling and en passant have nothing to act on
   (moveFreely pins them to "w - - 0 1"). Nor is it put through chess.js: a
   position the rules could not reach is still a board to think on. */

export function AnalysisApp() {
  useTheme();
  const [start] = useState(() => readPlacement(new URLSearchParams(window.location.search).get('fen') || ''));
  const [fen, setFen] = useState(() => asFen(start ?? EMPTY));
  const [credit] = useState(() => creditFromParams(new URLSearchParams(window.location.search)));
  // What is asked of the position, when the address says (analysis=1 with a
  // stipulation): it stays on the line where the problem page prints it.
  const [stip] = useState(() => (new URLSearchParams(window.location.search).get('stip') || '').trim());
  const composer = composerLine(credit.authors);

  // The width the board has to fill, measured off the row it sits in.
  const boardBoxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);

  /* Measured rather than worked out from the window: on a phone the sheet's
     margin and padding come off the window's width, and a board given the
     whole of it ran off the right-hand edge (the h-file half hidden). The row
     is a block, so its width does not depend on the board inside it. */
  useEffect(() => {
    const el = boardBoxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const boardWidth = Math.min(boxWidth, 648);

  // The tab says what the page is, as the problem page's says the stipulation.
  useEffect(() => { document.title = stip || 'Analysis board'; }, [stip]);

  const handleDrop = useCallback((source: string, target: string, piece?: string): boolean => {
    setFen(prev => freeDrop(prev, source, target, piece));
    return true;
  }, []);

  if (start === null) {
    return (
      <div className="sober min-h-dvh">
        <div className="nb-sheet max-w-2xl mx-2 sm:mx-auto my-3 sm:my-5 px-4 py-10">
          <p className="text-center font-semibold text-[var(--ink)]">That position could not be read.</p>
        </div>
      </div>
    );
  }

  const moved = fen !== asFen(start);

  return (
    <div className="sober min-h-dvh">
      <div className="nb-sheet max-w-2xl mx-2 sm:mx-auto my-3 sm:my-5 px-1 pb-10 overflow-hidden">
        <main className="px-1 pt-3 space-y-3">
          {/* The problem page's caption line: the stipulation when there is
              one, "Analysis board" where there is not. */}
          <div className="px-3 space-y-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap text-sm text-[var(--muted)]">
              <span className="font-semibold text-[var(--ink)]">{stip || 'Analysis board'}</span>
              <span>{pieceCounts(asFen(start))}</span>
            </div>
            {/* Set as the problem page sets it once the solve is decided. */}
            {credit.show && (composer || credit.source) && (
              <div>
                {composer && <div className="text-base font-semibold text-[var(--ink)] leading-tight break-words">{composer}</div>}
                {credit.source && <div className="text-sm text-[var(--faint)] break-words">{credit.source}</div>}
              </div>
            )}
          </div>

          {/* Measured one step wider than the column, as the board's own row
              is (-mx-1). */}
          <div ref={boardBoxRef} className="-mx-1">
            {boardWidth > 0 && (
              <div className="flex justify-center">
                <Board fen={fen} onPieceDrop={handleDrop} orientation="white" width={boardWidth} freeMove />
              </div>
            )}
          </div>

          <div className="px-3 flex items-center justify-end gap-2">
            <button
              onClick={() => setFen(asFen(start))}
              disabled={!moved}
              className="nb-btn px-4 py-2 text-sm disabled:opacity-40"
            >
              Reset
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
