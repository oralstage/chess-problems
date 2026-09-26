import { useCallback, useEffect, useState } from 'react';
import { Board } from '../src/components/Board';
import { moveFreely, pieceAt } from '../src/utils/freeBoard';
import { EMPTY, readPlacement } from './placement';

/* The analysis board on a page of its own: a position in, and the pocket set
   the solving view hands out -- any man to any square, nothing checked.

   The position comes as a placement and nothing else. The board plays no
   rules, so the side to move, castling and en passant have nothing to act on
   (moveFreely pins them to "w - - 0 1"), and a position read off a book
   diagram does not carry them anyway. Nor is it put through chess.js: a
   reading that took a white king for a black one is still a position to put
   on the board and put right, not one to refuse. */

const asFen = (placement: string) => `${placement} w - - 0 1`;

export function AnalysisApp() {
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
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // The /solve page's sizing, so the two boards are the same board.
  const boardWidth = windowWidth < 640
    ? windowWidth
    : Math.min(windowWidth, 672) - (16 + 8);

  const setPosition = useCallback((text: string) => {
    const placement = readPlacement(text);
    if (!placement) {
      setFieldError('That is not a position this board can read.');
      return;
    }
    setFieldError(null);
    setStart(placement);
    setFen(asFen(placement));
  }, []);

  // As the solving view's analysis board does it: a pawn reaching its last
  // rank comes with the picker's choice ('wQ', 'bN', ...); anything else
  // arrives as a placeholder and moves as it is.
  const handleDrop = useCallback((source: string, target: string, piece?: string): boolean => {
    setFen(prev => {
      const mover = pieceAt(prev, source);
      const isPromo = ((mover === 'P' && target[1] === '8') || (mover === 'p' && target[1] === '1'))
        && !!piece && /^[wb][QRBN]$/.test(piece);
      const replaceWith = isPromo ? (piece![0] === 'w' ? piece![1] : piece![1].toLowerCase()) : undefined;
      return moveFreely(prev, source, target, replaceWith);
    });
    return true;
  }, []);

  const moved = fen !== asFen(start);

  return (
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
