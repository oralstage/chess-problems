import { useCallback, useEffect, useRef, useState } from 'react';
import { ChessboardDnDProvider, SparePiece } from 'react-chessboard';
import type { Piece } from 'react-chessboard/dist/chessboard/types';
import { Board } from '../src/components/Board';
import { moveFreely, pieceAt } from '../src/utils/freeBoard';
import { EMPTY, kingNotice, readPlacement, rotate180, setSquare } from './placement';
import type { DiagramReader } from './ocr';

/* The analysis board on a page of its own: a position in, and the pocket set
   the solving view hands out -- any man to any square, nothing checked.

   The position comes as a placement and nothing else. The board plays no
   rules, so the side to move, castling and en passant have nothing to act on
   (moveFreely pins them to "w - - 0 1"), and a position read off a book
   diagram does not carry them anyway. Nor is it put through chess.js: a
   reading that took a white king for a black one is still a position to put
   on the board and put right, not one to refuse.

   Putting it right is the other half of the page: the /make page's way of
   setting men up (pick a man, tap squares; Erase; Clear), with Done making
   what is on the board the position to go back to.

   And the position can come off a photo of a diagram (./ocr). What was read
   opens in the editor, under the board as it was cut out of the photo, since
   a reading is a draft to be checked against the page before it is a
   position to think about. */

const asFen = (placement: string) => `${placement} w - - 0 1`;
const placementOf = (fen: string) => fen.split(' ')[0];

type Tool = { kind: 'move' } | { kind: 'place'; piece: string } | { kind: 'erase' };

// The men in the order a diagram lists them, upper case White, as in a FEN.
const PALETTE = ['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p'];

// The board's own drawing of a man, so the palette shows what will be put down.
const pieceCode = (fenChar: string): Piece =>
  ((fenChar === fenChar.toUpperCase() ? 'w' : 'b') + fenChar.toUpperCase()) as Piece;

function menCount(placement: string) {
  return {
    white: (placement.match(/[PNBRQK]/g) || []).length,
    black: (placement.match(/[pnbrqk]/g) || []).length,
  };
}

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
  // The width the board has to fill, measured off the row it sits in.
  const boardBoxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);

  /* Setting up: the placement being edited (null = analysing). It is kept
     apart from the analysis board's own so that Cancel has something to go
     back to. */
  const [editing, setEditing] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>({ kind: 'move' });

  /* Reading a photo. The reader is made once and kept: it is 142 MB of
     models, fetched on the first photo and not before. */
  const readerRef = useRef<Promise<DiagramReader> | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const dropPhoto = useCallback(() => {
    setPhoto(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
  }, []);

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

  // Setting up moves a man as it stands: a pawn dropped on the last rank is
  // being put there, not promoted.
  const handleEditDrop = useCallback((source: string, target: string): boolean => {
    setEditing(prev => (prev && pieceAt(asFen(prev), source) ? placementOf(moveFreely(asFen(prev), source, target)) : prev));
    return true;
  }, []);

  const handleSquare = useCallback((square: string) => {
    if (tool.kind === 'place') setEditing(prev => prev && setSquare(prev, square, tool.piece));
    else if (tool.kind === 'erase') setEditing(prev => prev && setSquare(prev, square, null));
  }, [tool]);

  const doneEditing = () => {
    if (editing === null) return;
    setStart(editing);
    setFen(asFen(editing));
    setField(editing === EMPTY ? '' : editing);
    setFieldError(null);
    setEditing(null);
    dropPhoto();
  };

  const cancelEditing = () => {
    setEditing(null);
    dropPhoto();
  };

  const readPhoto = async (file: File) => {
    setReadError(null);
    try {
      setReading('Loading the reader…');
      const ocr = await import('./ocr');
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
      setTool({ kind: 'move' });
      setEditing(result.fen);
    } catch (err) {
      readerRef.current = null; // a failed load is tried again on the next photo
      setReadError(`The photo could not be read (${err instanceof Error ? err.message : String(err)}).`);
    } finally {
      setReading(null);
    }
  };

  const moved = fen !== asFen(start);
  const men = menCount(editing ?? placementOf(fen));
  const kings = editing !== null ? kingNotice(editing) : null;

  /* One drag-and-drop for the whole page. The board brings its own when it is
     not inside one, and the palette needs one; two at once is an error the
     moment the editor opens ("Cannot have two HTML5 backends"). */
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
                <label
                  className={`nb-btn px-3 py-2 text-sm cursor-pointer ${reading ? 'opacity-40 pointer-events-none' : ''}`}
                  title="Read the position off a photo of a diagram"
                >
                  Photo
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
              {reading && <p className="mt-1 text-sm text-[var(--muted)]">{reading}</p>}
              {readError && <p className="mt-1 text-sm text-red-700">{readError}</p>}
            </form>

            {editing !== null && photo && (
              <figure className="px-3 flex flex-col items-center gap-1">
                <img
                  src={photo}
                  alt="The diagram as it was cut out of the photo"
                  style={{ width: Math.round(boardWidth * 0.5) }}
                  className="border border-[var(--hairline)]"
                />
                <figcaption className="text-sm text-[var(--muted)] text-center">
                  Read off the photo above — check it square by square and put right what is wrong, then Done.
                </figcaption>
              </figure>
            )}
            {editing !== null && !photo && (
              <p className="px-3 text-sm text-[var(--muted)]">
                Setting the position up — pick a man and tap squares, or Move to drag them.
              </p>
            )}

            <div ref={boardBoxRef} className="flex justify-center -mx-1">
              {boardWidth === 0 ? null : editing !== null ? (
                <Board
                  key="edit"
                  fen={asFen(editing)}
                  onPieceDrop={handleEditDrop}
                  orientation="white"
                  width={boardWidth}
                  freeMove
                  onSquareTool={tool.kind !== 'move' ? handleSquare : undefined}
                />
              ) : (
                <Board
                  key="analyse"
                  fen={fen}
                  onPieceDrop={handleDrop}
                  orientation="white"
                  width={boardWidth}
                  freeMove
                />
              )}
            </div>

            {editing !== null ? (
              <div className="px-3 space-y-2">
                {kings && <p className="text-sm font-semibold text-amber-700">{kings}</p>}
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    onClick={() => setTool({ kind: 'move' })}
                    className={`nb-btn py-1 px-2.5 text-sm ${tool.kind === 'move' ? 'nb-btn-key' : ''}`}
                    title="Drag a man to another square"
                  >
                    Move
                  </button>
                  {PALETTE.map(piece => (
                    <button
                      key={piece}
                      onClick={() => setTool({ kind: 'place', piece })}
                      className={`nb-btn w-9 h-9 flex items-center justify-center ${tool.kind === 'place' && tool.piece === piece ? 'nb-btn-key' : ''}`}
                      title={`Put a ${piece === piece.toUpperCase() ? 'white' : 'black'} man on a square`}
                      aria-label={`${piece === piece.toUpperCase() ? 'White' : 'Black'} ${({ k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' } as Record<string, string>)[piece.toLowerCase()]}`}
                    >
                      <span className="pointer-events-none">
                        <SparePiece piece={pieceCode(piece)} width={26} dndId="palette" />
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={() => setTool({ kind: 'erase' })}
                    className={`nb-btn py-1 px-2.5 text-sm ${tool.kind === 'erase' ? 'nb-btn-key' : ''}`}
                    title="Tap a man to take it off"
                  >
                    Erase
                  </button>
                  <button
                    onClick={() => setEditing(EMPTY)}
                    className="nb-btn py-1 px-2.5 text-sm"
                    title="Take everything off"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setEditing(prev => prev && rotate180(prev))}
                    className="nb-btn py-1 px-2.5 text-sm"
                    title="For a diagram printed with Black at the foot"
                  >
                    Rotate 180°
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={doneEditing} className="nb-btn nb-btn-key px-4 py-2 text-sm">Done</button>
                  <button onClick={cancelEditing} className="nb-btn px-4 py-2 text-sm">Cancel</button>
                  <span className="ml-auto text-sm text-[var(--muted)] tabular-nums">{men.white}+{men.black}</span>
                </div>
              </div>
            ) : (
              <div className="px-3 flex items-center gap-2">
                <p className="flex-1 text-sm text-[var(--muted)]">Move anything anywhere — nothing is checked.</p>
                <button
                  onClick={() => { setTool({ kind: 'move' }); setEditing(placementOf(fen)); }}
                  className="nb-btn px-4 py-2 text-sm"
                >
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
            )}
          </main>
        </div>
      </div>
    </ChessboardDnDProvider>
  );
}
