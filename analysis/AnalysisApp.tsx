import { useCallback, useEffect, useRef, useState } from 'react';
import { Board } from '../src/components/Board';
import { useTheme } from '../src/hooks/useTheme';
import { pieceCounts } from '../src/utils/pieceCount';
import { EMPTY, asFen, freeDrop, readPlacement } from './placement';

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
  useEffect(() => { document.title = 'Analysis board'; }, []);

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
          {/* The problem page's caption line, with "Analysis board" where the
              stipulation would be. */}
          <div className="px-3 flex items-baseline gap-2 flex-wrap text-sm text-[var(--muted)]">
            <span className="font-semibold text-[var(--ink)]">Analysis board</span>
            <span>{pieceCounts(asFen(start))}</span>
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

          <div className="px-3 flex items-center gap-2">
            <p className="flex-1 text-sm text-[var(--muted)]">Move anything anywhere — nothing is checked.</p>
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
