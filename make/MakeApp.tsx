import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChessboardDnDProvider, SparePiece } from 'react-chessboard';
import type { Piece } from 'react-chessboard/dist/chessboard/types';
import { Board } from '../src/components/Board';
import { useTheme } from '../src/hooks/useTheme';
import { moveFreely, pieceAt } from '../src/utils/freeBoard';
import { buildInput, cleanOutput, inputComplaints, outputIsComplete, splitFen } from './popeye';

/* Putting a problem of your own on a board.
 *
 * Set the position up, say what is asked of it, and Popeye -- the program the
 * composing world solves with, running here in the browser -- works out the
 * solution. Out of that come the two ways to hand the problem on: a board to
 * put in a page, and a page of its own.
 *
 * Popeye rather than a form to paste a solution into, because the solution is
 * the part nobody wants to type. It is also the part that has to be right:
 * what this site plays against is the solution text, so a typo in it is a
 * problem that cannot be solved. Popeye's own output cannot be mistyped, and
 * the parser here was written against exactly that text.
 */

const SITE = 'https://arcade.chessproblem.org';
const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

/* Long enough for the searches a page like this is given, short enough that a
   runaway is not mistaken for a page that has died. Popeye is told the same
   figure for its own memory ceiling. */
const TIMEOUT_MS = 30_000;

type Tool = { kind: 'move' } | { kind: 'place'; piece: string } | { kind: 'erase' };

/* The men, in the order a diagram lists them. Upper case is White, as in a
   FEN; the board draws them from the same letters. */
const PALETTE = ['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p'];

/* The board's own men, not the Unicode chess characters. Those are text: they
   are drawn by whichever font the reader has, they do not match the pieces on
   the board beside them, and on some systems they arrive as emoji. The
   palette is showing what will be put down, so it shows the same drawing. */
const pieceCode = (fenChar: string): Piece =>
  ((fenChar === fenChar.toUpperCase() ? 'w' : 'b') + fenChar.toUpperCase()) as Piece;

/** Put a man on a square, or take the one that is there off. The placement
 *  field is edited directly, because a position under construction passes
 *  through states no rulebook accepts on its way to a legal one. */
function setSquare(fen: string, square: string, piece: string | null): string {
  const parts = fen.split(' ');
  const rows = parts[0].split('/').map(row => {
    const cells: string[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) cells.push(...Array(Number(ch)).fill(''));
      else cells.push(ch);
    }
    return cells;
  });
  const r = 8 - Number(square[1]);
  const c = square.charCodeAt(0) - 97;
  if (!rows[r]) return fen;
  rows[r][c] = piece ?? '';
  const placement = rows.map(cells => {
    let outRow = '';
    let run = 0;
    for (const cell of cells) {
      if (cell === '') { run++; continue; }
      if (run > 0) { outRow += run; run = 0; }
      outRow += cell;
    }
    if (run > 0) outRow += run;
    return outRow;
  }).join('/');
  return [placement, ...parts.slice(1)].join(' ');
}

/** Nothing on it yet. The address of an empty board is still a FEN, and
 *  printing it in the field on arrival makes a page that has been filled in
 *  already out of one that has not been started. */
function boardIsEmpty(fen: string): boolean {
  return !/[a-zA-Z]/.test(splitFen(fen).placement);
}

function countMen(fen: string): { white: number; black: number } {
  const placement = splitFen(fen).placement.replace(/[^a-zA-Z]/g, '');
  return {
    white: placement.replace(/[^A-Z]/g, '').length,
    black: placement.replace(/[^a-z]/g, '').length,
  };
}

/* Which fields have to be filled in, said on every one of them rather than on
   some of them. A form that marks only what is required leaves the reader to
   work out that the unmarked ones are not -- and the unmarked ones here are
   the composer's name and where the problem appeared, which plenty of people
   would rather not put on a page at all. */
function FieldLabel({ children, need }: { children: React.ReactNode; need: 'required' | 'optional' }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-xs font-semibold text-[var(--muted)]">{children}</span>
      <span className={`text-xs ${need === 'required' ? 'text-[var(--bad)] font-semibold' : 'text-[var(--faint)]'}`}>
        {need}
      </span>
    </span>
  );
}

/* Copying is the point of the two blocks at the bottom: what is in them is
   meant to end up in somebody's page or somebody's address bar, and selecting
   a wrapped line of text by hand is a poor way to get it there. */
function Copyable({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-[var(--muted)]">{label}</span>
        <button
          onClick={() => { navigator.clipboard?.writeText(text).then(() => setCopied(true), () => {}); }}
          className="nb-btn py-0.5 px-2 text-xs font-bold"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="nb-plate mt-1 p-3 text-xs overflow-x-auto text-[var(--ink)]">{text}</pre>
    </div>
  );
}

export function MakeApp() {
  useTheme();

  const [fen, setFen] = useState(EMPTY_FEN);
  /* Empty, both of them. What is asked of a position is the composer's to say
     -- offering "#2" would have most of them publishing a two-mover by not
     noticing -- and the board has nothing on it yet either. */
  const [stipulation, setStipulation] = useState('');
  const [author, setAuthor] = useState('');
  const [source, setSource] = useState('');
  const [year, setYear] = useState('');
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<Tool>({ kind: 'place', piece: 'K' });
  const [showTries, setShowTries] = useState(false);

  const [solution, setSolution] = useState('');
  /* Folded away, like the note under the stipulation: Popeye's output is a
     dozen lines of notation, and what most people want to do with it is
     nothing at all. It opens itself when a solve lands, because that is the
     one moment it is worth reading -- and because a page that answered by
     changing nothing visible would look as if it had not answered. */
  const [solutionOpen, setSolutionOpen] = useState(false);
  const [solving, setSolving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [boardWidth, setBoardWidth] = useState(() => Math.min(window.innerWidth - 32, 420));
  useEffect(() => {
    const onResize = () => setBoardWidth(Math.min(window.innerWidth - 32, 420));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const men = countMen(fen);
  const hasKings = /K/.test(splitFen(fen).placement) && /k/.test(splitFen(fen).placement);

  const stopWorker = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    workerRef.current?.terminate();
    workerRef.current = null;
    setSolving(false);
  }, []);

  useEffect(() => stopWorker, [stopWorker]);

  /* Anything that changes what Popeye would be asked drops what it said last
     time: a solution belonging to a different diagram is worse than none, and
     the board downstream would play it against a position it does not fit. */
  const setPosition = useCallback((next: string | ((prev: string) => string)) => {
    setFen(next);
    setSolution('');
    setNote(null);
  }, []);

  const setAsked = useCallback(<T,>(set: (v: T) => void, value: T) => {
    set(value);
    setSolution('');
    setNote(null);
  }, []);

  const solve = useCallback(() => {
    stopWorker();
    setSolution('');
    setNote(null);
    setSolving(true);

    const worker = new Worker(new URL('./popeye.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    timerRef.current = setTimeout(() => {
      stopWorker();
      setNote(`Popeye was still going after ${TIMEOUT_MS / 1000} seconds and was stopped. Long helpmates and moremovers can take longer than a page should wait.`);
    }, TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data || {};
      if (data.type === 'ready') {
        worker.postMessage({ input: buildInput({ fen, stipulation, showTries }), maxmemMB: 256 });
        return;
      }
      if (data.type === 'fatal') {
        stopWorker();
        setNote(`Popeye could not be started: ${data.detail}`);
        return;
      }
      if (data.type !== 'result') return;
      stopWorker();

      const complaints = inputComplaints(data.out, data.err);
      if (complaints.length) { setNote(complaints.join('\n')); return; }
      // The wasm build can overflow its own stack on a deep search and stop
      // mid-sentence with a zero exit code, so the end-of-problem marker is
      // what says the text is whole. Half a solution is worse than none: the
      // board would play it and then refuse the rest.
      if (data.thrown || !outputIsComplete(data.out)) {
        setNote('Popeye stopped before it finished. The search was too deep for the browser — try a shorter stipulation.');
        return;
      }
      const text = cleanOutput(data.out);
      if (!text) { setNote('Popeye found no solution to this position.'); return; }
      setSolution(text);
      setSolutionOpen(true);
    };

    worker.onerror = () => { stopWorker(); setNote('Popeye could not be started.'); };
  }, [fen, stipulation, showTries, stopWorker]);

  const handleSquare = useCallback((square: string) => {
    if (tool.kind === 'place') { setPosition(prev => setSquare(prev, square, tool.piece)); return; }
    if (tool.kind === 'erase') { setPosition(prev => setSquare(prev, square, null)); return; }
  }, [tool, setPosition]);

  /* Move mode is the board's own free dragging: pick a man up, put it down,
     nothing checked. Placing and erasing are taps, which the board hands over
     without deciding anything. */
  const handleDrop = useCallback((from: string, to: string): boolean => {
    if (!pieceAt(fen, from)) return false;
    setPosition(moveFreely(fen, from, to));
    return true;
  }, [fen, setPosition]);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    q.set('fen', fen);
    q.set('stip', stipulation);
    if (solution) q.set('sol', solution);
    if (author.trim()) q.set('author', author.trim());
    if (source.trim()) q.set('source', source.trim());
    if (year.trim()) q.set('year', year.trim());
    return q.toString();
  }, [fen, stipulation, solution, author, source, year]);

  const ready = solution !== '';
  const markup = `<iframe src="${SITE}/board?${query}"\n        style="width:100%; aspect-ratio:4/5; border:0"\n        title="Chess problem"></iframe>`;

  return (
    <div className="sober min-h-dvh">
      <div className="nb-sheet max-w-2xl mx-2 sm:mx-auto my-3 sm:my-5 px-4 pb-10">
        <header className="py-3">
          <h1 className="text-lg font-semibold text-[var(--ink)]">Put a problem on a board</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Set the position up, say what is asked of it, and Popeye solves it here in your browser.
            Then take away a board to put in a page of yours, or a page of its own.
          </p>
        </header>

        <div className="flex justify-center">
          <Board
            fen={fen}
            onPieceDrop={handleDrop}
            width={boardWidth}
            orientation="white"
            freeMove={editing}
            disabled={!editing}
            onSquareTool={editing && tool.kind !== 'move' ? handleSquare : undefined}
          />
        </div>

        {/* A position usually arrives already written down -- out of Popeye,
            out of a magazine, out of another program -- so the address is what
            the page opens with, and the board is there to be looked at. Setting
            one up by hand is the other way round, and it is asked for. */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button
            onClick={() => setEditing(v => !v)}
            className={`nb-btn py-1 px-2.5 text-sm font-bold ${editing ? 'nb-btn-key' : ''}`}
          >
            {editing ? 'Done' : 'Edit position'}
          </button>
          {editing && (
            <button onClick={() => setPosition(EMPTY_FEN)} className="nb-btn py-1 px-2.5 text-sm font-bold" title="Take everything off">
              Clear
            </button>
          )}
          <span className="text-sm font-bold text-[var(--muted)] ml-auto">{men.white}+{men.black}</span>
        </div>

        {editing && (
          <ChessboardDnDProvider>
            <div className="flex flex-wrap items-center gap-1 mt-2">
              <button
                onClick={() => setTool({ kind: 'move' })}
                className={`nb-btn py-1 px-2.5 text-sm font-bold ${tool.kind === 'move' ? 'nb-btn-key' : ''}`}
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
                >
                  {/* The drawing takes no pointer of its own: this is a button
                      to choose with, not a man to drag. */}
                  <span className="pointer-events-none">
                    <SparePiece piece={pieceCode(piece)} width={26} dndId="palette" />
                  </span>
                </button>
              ))}
              <button
                onClick={() => setTool({ kind: 'erase' })}
                className={`nb-btn py-1 px-2.5 text-sm font-bold ${tool.kind === 'erase' ? 'nb-btn-key' : ''}`}
                title="Tap a man to take it off"
              >
                Erase
              </button>
            </div>
          </ChessboardDnDProvider>
        )}

        <label className="block mt-3">
          <FieldLabel need="required">Position (FEN)</FieldLabel>
          <input
            value={boardIsEmpty(fen) ? '' : fen}
            onChange={e => setPosition(e.target.value.trim() ? e.target.value : EMPTY_FEN)}
            spellCheck={false}
            className="nb-plate w-full mt-1 px-3 py-2 text-sm font-mono bg-[var(--surface)] text-[var(--ink)]"
          />
          <span className="block text-xs text-[var(--faint)] mt-0.5">
            Paste one, or press Edit position and set the men out
          </span>
        </label>

        <div className="flex flex-wrap gap-3 mt-3">
          <label className="block w-32">
            <FieldLabel need="required">Stipulation</FieldLabel>
            <input
              value={stipulation}
              onChange={e => setAsked(setStipulation, e.target.value)}
              spellCheck={false}
              className="nb-plate w-full mt-1 px-3 py-2 text-sm font-mono bg-[var(--surface)] text-[var(--ink)]"
            />
            <span className="block text-xs text-[var(--faint)] mt-0.5">e.g. #2 h#3 s#2 + =</span>
          </label>
          <label className="block flex-1 min-w-[10rem]">
            <FieldLabel need="optional">Composer</FieldLabel>
            <input value={author} onChange={e => setAuthor(e.target.value)}
              className="nb-plate w-full mt-1 px-3 py-2 text-sm bg-[var(--surface)] text-[var(--ink)]" />
          </label>
          <label className="block flex-1 min-w-[10rem]">
            <FieldLabel need="optional">Source</FieldLabel>
            <input value={source} onChange={e => setSource(e.target.value)}
              className="nb-plate w-full mt-1 px-3 py-2 text-sm bg-[var(--surface)] text-[var(--ink)]" />
          </label>
          <label className="block w-24">
            <FieldLabel need="optional">Year</FieldLabel>
            <input value={year} onChange={e => setYear(e.target.value)} spellCheck={false}
              className="nb-plate w-full mt-1 px-3 py-2 text-sm bg-[var(--surface)] text-[var(--ink)]" />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          {solving ? (
            <button onClick={stopWorker} className="nb-btn py-1.5 px-3 font-bold">Stop</button>
          ) : (
            <button
              onClick={solve}
              disabled={!hasKings || !stipulation.trim()}
              className="nb-btn nb-btn-key py-1.5 px-3 font-bold disabled:opacity-50"
            >
              Solve with Popeye
            </button>
          )}
          <label className="flex items-center gap-1.5 text-sm font-bold text-[var(--muted)]">
            <input type="checkbox" checked={showTries} onChange={e => setAsked(setShowTries, e.target.checked)} />
            Tries
          </label>
          {solving && <span className="text-sm font-semibold text-[var(--muted)]">Solving…</span>}
          {!stipulation.trim()
            ? <span className="text-sm text-[var(--muted)]">Say what is asked of the position first.</span>
            : !hasKings
              ? <span className="text-sm text-[var(--muted)]">Both sides need a king.</span>
              /* Not marked "required" -- it is a button, not a field -- but it
                 is the step nothing downstream can happen without, so the
                 reason it has to be pressed is said in the colour the required
                 fields are marked in. */
              : !solving && !solution && <span className="text-sm text-[var(--bad)]">Without the solution there is nothing to take away.</span>}
        </div>

        {note && (
          <pre className="nb-plate mt-3 p-3 text-xs whitespace-pre-wrap text-[var(--ink)]">{note}</pre>
        )}

        <label className="block mt-4">
          <span className="text-xs text-[var(--muted)]">
            Solution — Popeye's own output. Edit it if you want, or paste one you already had.
          </span>
          {/* One line high until it is wanted, as the precedent finder's own
              solution box is: a dozen lines of notation held open permanently
              push everything that matters off the screen. Going into it opens
              it, and so does a solve landing -- a page that answered by
              changing nothing visible would look as if it had not answered. */}
          <textarea
            value={solution}
            onChange={e => setSolution(e.target.value)}
            onFocus={() => setSolutionOpen(true)}
            spellCheck={false}
            className={`nb-plate w-full mt-1 px-3 py-2 text-xs font-mono whitespace-pre overflow-auto bg-[var(--surface)] text-[var(--ink)] transition-[height] ${solutionOpen ? 'h-40' : 'h-9'}`}
          />
        </label>

        {/* Nothing to take until there is a solution, and a heading over an
            explanation of why the thing below it is missing is furniture for
            an absence. */}
        {ready && (
          <>
            <h2 className="text-base font-semibold text-[var(--ink)] mt-6">Take it away</h2>
            {/* The page is what most people came for, so it is a door and not a
                footnote: the two blocks below are for putting the problem
                somewhere else, which is the rarer thing to want. */}
            <a
              className="nb-btn nb-btn-key block text-center mt-3 py-3 px-4 text-base font-extrabold"
              href={`/solve/?${query}`} target="_blank" rel="noopener noreferrer"
            >
              Open the page →
            </a>
            <p className="text-xs text-[var(--muted)] mt-1.5">
              The board, every variation and the engine, at one address you can send to anybody.
            </p>

            <Copyable label="The address of that page" text={`${SITE}/solve?${query}`} />
            <Copyable label="Or put the board in a page of yours" text={markup} />
          </>
        )}
      </div>
    </div>
  );
}
