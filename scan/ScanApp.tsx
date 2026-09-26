import { useCallback, useEffect, useRef, useState } from 'react';
import { ChessboardDnDProvider } from 'react-chessboard';
import { useTheme } from '../src/hooks/useTheme';
import type { DiagramReader } from '../analysis/ocr';
import { asFen } from '../analysis/placement';
import { PositionEditor } from '../analysis/PositionEditor';
import { Copyable } from '../analysis/Copyable';

/* A photo of a diagram in, its FEN out -- and the address of an analysis
   board with that position on it.

   Kept apart from the board it hands over to: the analysis board is
   /solve?fen=… with nothing to solve, the same address a problem gets from
   /make or the embed demo, less the problem. This page only makes the FEN.

   What was read opens in the editor under the diagram as it was cut out of
   the photo, and the FEN and the address follow the board as it is put
   right: a reading is a draft to be checked against the page, square by
   square, before it is a position. The reader is ../analysis/ocr.ts, loaded
   with the first photo (51 MB of models) and kept for the next. */

const SITE = 'https://arcade.chessproblem.org';

// The slashes left as they are: a FEN in an address is easier to read, and to
// trust, when it still looks like one.
const fenQuery = (placement: string) => `fen=${encodeURIComponent(placement).replace(/%2F/g, '/')}`;

export function ScanApp() {
  useTheme();
  const readerRef = useRef<Promise<DiagramReader> | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [placement, setPlacement] = useState<string | null>(null);

  // The width the board has to fill, measured off the row it sits in (see
  // the analysis board: worked out from the window, it ran off a phone).
  const boardBoxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  useEffect(() => {
    const el = boardBoxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const boardWidth = Math.min(boxWidth, 648);

  const editPosition = useCallback((update: (prev: string) => string) => {
    setPlacement(prev => (prev === null ? prev : update(prev)));
  }, []);

  const readPhoto = async (file: File) => {
    setReadError(null);
    try {
      setReading('Loading the reader…');
      const ocr = await import('../analysis/ocr');
      if (!readerRef.current) {
        let shown = -1;
        readerRef.current = ocr.DiagramReader.create('/ocr', (got, total) => {
          const mb = Math.floor(got / 1e6);
          if (mb !== shown) { shown = mb; setReading(`Loading the reader — ${mb} of ${Math.round(total / 1e6)} MB (first photo only)`); }
        });
      }
      const reader = await readerRef.current;
      setReading('Reading the diagram…');
      await new Promise(res => setTimeout(res, 30)); // let the line be drawn before the work starts
      const result = await reader.read(await ocr.decodeImage(file));
      if (!result.fen) {
        setReadError('No diagram found in that photo.');
        return;
      }
      const url = result.board ? await ocr.toObjectUrl(result.board) : null;
      setPhoto(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
      setPlacement(result.fen);
    } catch (err) {
      readerRef.current = null; // a failed load is tried again on the next photo
      setReadError(`The photo could not be read (${err instanceof Error ? err.message : String(err)}).`);
    } finally {
      setReading(null);
    }
  };

  return (
    <ChessboardDnDProvider>
      <div className="sober min-h-dvh">
        <div className="nb-sheet max-w-2xl mx-2 sm:mx-auto my-3 sm:my-5 px-1 pb-10 overflow-hidden">
          <main className="px-1 pt-3 space-y-3">
            <div className="px-3">
              <h1 className="text-lg font-semibold text-[var(--ink)]">Diagram to FEN</h1>
              <p className="text-sm text-[var(--muted)] mt-0.5">
                Photograph a printed diagram, or pick a photo of one, and the position is read off it —
                here in your browser; the photo is not sent anywhere.
              </p>
              <label
                className={`nb-btn nb-btn-key inline-block mt-3 py-1.5 px-3 text-sm font-semibold cursor-pointer ${reading ? 'opacity-40 pointer-events-none' : ''}`}
              >
                {placement === null ? 'Take or choose a photo' : 'Another photo'}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={!!reading}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    e.target.value = ''; // the same photo again is a new choice
                    if (file) readPhoto(file);
                  }}
                />
              </label>
              {reading && <p className="mt-2 text-sm text-[var(--muted)]">{reading}</p>}
              {readError && <p className="mt-2 text-sm text-red-700">{readError}</p>}
            </div>

            {placement !== null && photo && (
              <figure className="px-3 flex flex-col items-center gap-1">
                <img
                  src={photo}
                  alt="The diagram as it was cut out of the photo"
                  style={{ width: Math.round(boardWidth * 0.5) }}
                  className="border border-[var(--hairline)]"
                />
                <figcaption className="text-sm text-[var(--muted)] text-center">
                  Read off the photo above — check it square by square and put right what is wrong.
                </figcaption>
              </figure>
            )}

            {/* Measured one step wider than the column, as the board's own row is. */}
            <div ref={boardBoxRef} className="-mx-1">
              <div className="mx-1 space-y-3">
                {placement !== null && boardWidth > 0 && (
                  <PositionEditor placement={placement} onChange={editPosition} boardWidth={boardWidth} />
                )}
              </div>
            </div>

            {placement !== null && (
              <div className="mx-3 nb-plate p-4 bg-[var(--surface-2)]">
                <h2 className="text-base font-semibold text-[var(--ink)]">Take it away</h2>
                <div className="mt-3 sm:flex sm:gap-6">
                  <section className="sm:flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-[var(--ink)]">The position</h3>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      As a FEN, White to play — a diagram does not say whose move it is.
                    </p>
                    <Copyable label="FEN" text={asFen(placement)} />
                  </section>
                  <section className="sm:flex-1 min-w-0 mt-5 pt-4 border-t border-[var(--hairline)] sm:mt-0 sm:pt-0 sm:border-t-0 sm:border-l sm:pl-6">
                    <h3 className="text-sm font-semibold text-[var(--ink)]">An analysis board</h3>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      This position on an analysis board of its own.
                    </p>
                    <a
                      className="nb-btn nb-btn-key inline-block mt-2 py-1.5 px-3 text-sm font-semibold"
                      href={`/solve/?${fenQuery(placement)}`} target="_blank" rel="noopener noreferrer"
                    >
                      Open the board →
                    </a>
                    <Copyable label="Its address" text={`${SITE}/solve?${fenQuery(placement)}`} />
                  </section>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </ChessboardDnDProvider>
  );
}
