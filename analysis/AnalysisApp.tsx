import { useCallback, useEffect, useRef, useState } from 'react';
import { ChessboardDnDProvider } from 'react-chessboard';
import { Board } from '../src/components/Board';
import { useTheme } from '../src/hooks/useTheme';
import { EMPTY, asFen, freeDrop, placementOf, readPlacement } from './placement';
import { PositionEditor } from './PositionEditor';

/* The analysis board on a page of its own -- what /solve?fen=… opens when it
   is given a position and nothing to solve. The pocket set the solving view
   hands out: any man to any square, nothing checked.

   The position comes as a placement and nothing else. The board plays no
   rules, so the side to move, castling and en passant have nothing to act on
   (moveFreely pins them to "w - - 0 1"), and a position read off a book
   diagram does not carry them anyway. Nor is it put through chess.js: a
   reading that took a white king for a black one is still a position to put
   on the board and put right, not one to refuse.

   Edit position sets it up afresh (./PositionEditor); Done makes what is on
   the board the position Reset goes back to. */

export function AnalysisApp() {
  useTheme();
  const [start, setStart] = useState(() => {
    const given = new URLSearchParams(window.location.search).get('fen');
    return (given && readPlacement(given)) || EMPTY;
  });
  const [fen, setFen] = useState(() => asFen(start));
  const [field, setField] = useState(() => (start === EMPTY ? '' : start));
  const [fieldError, setFieldError] = useState<string | null>(() => {
    const given = new URLSearchParams(window.location.search).get('fen');
    return given && !readPlacement(given) ? 'That is not a position this board can read.' : null;
  });

  // Setting up: the placement being edited (null = analysing). Kept apart
  // from the analysis board's own so that Cancel has something to go back to.
  const [editing, setEditing] = useState<string | null>(null);

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

  const setPosition = useCallback((text: string) => {
    const placement = readPlacement(text);
    if (!placement) {
      setFieldError('That is not a position this board can read.');
      return;
    }
    setFieldError(null);
    setStart(placement);
    setFen(asFen(placement));
    setEditing(null);
  }, []);

  const handleDrop = useCallback((source: string, target: string, piece?: string): boolean => {
    setFen(prev => freeDrop(prev, source, target, piece));
    return true;
  }, []);

  const editPosition = useCallback((update: (prev: string) => string) => {
    setEditing(prev => (prev === null ? prev : update(prev)));
  }, []);

  const doneEditing = () => {
    if (editing === null) return;
    setStart(editing);
    setFen(asFen(editing));
    setField(editing === EMPTY ? '' : editing);
    setFieldError(null);
    setEditing(null);
  };

  const moved = fen !== asFen(start);

  /* One drag-and-drop for the whole page. The board brings its own when it is
     not inside one, and the editor's palette needs one; two at once is an
     error the moment the editor opens ("Cannot have two HTML5 backends"). */
  return (
    <ChessboardDnDProvider>
      <div className="sober min-h-dvh">
        <div className="nb-sheet max-w-2xl mx-2 sm:mx-auto my-3 sm:my-5 px-1 pb-10 overflow-hidden">
          <main className="px-1 pt-3 space-y-3">
            <form
              className="px-3"
              onSubmit={e => { e.preventDefault(); setPosition(field); }}
            >
              <div className="flex gap-2">
                <input
                  value={field}
                  onChange={e => setField(e.target.value)}
                  placeholder="FEN"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="nb-plate flex-1 min-w-0 px-3 py-2 text-sm font-mono bg-[var(--surface)] text-[var(--ink)]"
                  aria-label="Position as FEN"
                />
                <button type="submit" className="nb-btn px-4 py-2 text-sm">Set</button>
              </div>
              {fieldError && <p className="mt-1 text-sm text-red-700">{fieldError}</p>}
            </form>

            {editing !== null && (
              <p className="px-3 text-sm text-[var(--muted)]">
                Setting the position up — pick a man and tap squares, or Move to drag them.
              </p>
            )}

            {/* Measured one step wider than the column, as the board's own row
                is (-mx-1); the content inside keeps the column's width. */}
            <div ref={boardBoxRef} className="-mx-1">
              <div className="mx-1 space-y-3">
                {boardWidth > 0 && (editing !== null ? (
                  <>
                    <PositionEditor placement={editing} onChange={editPosition} boardWidth={boardWidth} />
                    <div className="px-3 flex items-center gap-2">
                      <button onClick={doneEditing} className="nb-btn nb-btn-key px-4 py-2 text-sm">Done</button>
                      <button onClick={() => setEditing(null)} className="nb-btn px-4 py-2 text-sm">Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-center -mx-1">
                      <Board
                        fen={fen}
                        onPieceDrop={handleDrop}
                        orientation="white"
                        width={boardWidth}
                        freeMove
                      />
                    </div>
                    <div className="px-3 flex items-center gap-2">
                      <p className="flex-1 text-sm text-[var(--muted)]">Move anything anywhere — nothing is checked.</p>
                      <button onClick={() => setEditing(placementOf(fen))} className="nb-btn px-4 py-2 text-sm">
                        Edit position
                      </button>
                      <button
                        onClick={() => setFen(asFen(start))}
                        disabled={!moved}
                        className="nb-btn px-4 py-2 text-sm disabled:opacity-40"
                      >
                        Reset
                      </button>
                    </div>
                  </>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    </ChessboardDnDProvider>
  );
}
