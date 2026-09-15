import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const GLYPH: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

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

function countMen(fen: string): { white: number; black: number } {
  const placement = splitFen(fen).placement.replace(/[^a-zA-Z]/g, '');
  return {
    white: placement.replace(/[^A-Z]/g, '').length,
    black: placement.replace(/[^a-z]/g, '').length,
  };
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
  const [stipulation, setStipulation] = useState('#2');
  const [author, setAuthor] = useState('');
  const [source, setSource] = useState('');
  const [year, setYear] = useState('');
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<Tool>({ kind: 'place', piece: 'K' });
  const [showTries, setShowTries] = useState(false);

  const [solution, setSolution] = useState('');
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
    <div className="min-h-dvh nb-fine">
      <div className="nb-sheet nb-sheet-bleed max-w-2xl mx-2 sm:mx-auto my-3 sm:my-5 px-4 pb-14">
        <header className="py-3">
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">Put a problem on a board</h1>
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
                className={`nb-btn w-9 h-9 text-xl leading-none ${tool.kind === 'place' && tool.piece === piece ? 'nb-btn-key' : ''}`}
                title={`Put a ${piece === piece.toUpperCase() ? 'white' : 'black'} man on a square`}
              >
                {GLYPH[piece]}
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
        )}

        <label className="block mt-3">
          <span className="text-xs font-bold text-[var(--muted)]">Position (FEN)</span>
          <input
            value={fen}
            onChange={e => setPosition(e.target.value)}
            spellCheck={false}
            className="nb-plate w-full mt-1 px-3 py-2 text-sm font-mono bg-[var(--surface)] text-[var(--ink)]"
          />
        </label>

        <div className="flex flex-wrap gap-3 mt-3">
          <label className="block w-28">
            <span className="text-xs font-bold text-[var(--muted)]">Stipulation</span>
            <input
              value={stipulation}
              onChange={e => setAsked(setStipulation, e.target.value)}
              spellCheck={false}
              className="nb-plate w-full mt-1 px-3 py-2 text-sm font-mono bg-[var(--surface)] text-[var(--ink)]"
            />
          </label>
          <label className="block flex-1 min-w-[10rem]">
            <span className="text-xs font-bold text-[var(--muted)]">Composer</span>
            <input value={author} onChange={e => setAuthor(e.target.value)}
              className="nb-plate w-full mt-1 px-3 py-2 text-sm bg-[var(--surface)] text-[var(--ink)]" />
          </label>
          <label className="block flex-1 min-w-[10rem]">
            <span className="text-xs font-bold text-[var(--muted)]">Source</span>
            <input value={source} onChange={e => setSource(e.target.value)}
              className="nb-plate w-full mt-1 px-3 py-2 text-sm bg-[var(--surface)] text-[var(--ink)]" />
          </label>
          <label className="block w-24">
            <span className="text-xs font-bold text-[var(--muted)]">Year</span>
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
          {solving && <span className="text-sm font-bold text-[var(--muted)]">Solving…</span>}
          {!hasKings && <span className="text-sm text-[var(--muted)]">Both sides need a king.</span>}
        </div>

        {note && (
          <pre className="nb-plate mt-3 p-3 text-xs whitespace-pre-wrap text-[var(--ink)]">{note}</pre>
        )}

        <label className="block mt-4">
          <span className="text-xs font-bold text-[var(--muted)]">
            Solution — Popeye's own output. Edit it if you want, or paste one you already had.
          </span>
          <textarea
            value={solution}
            onChange={e => setSolution(e.target.value)}
            spellCheck={false}
            rows={8}
            className="nb-plate w-full mt-1 px-3 py-2 text-xs font-mono whitespace-pre bg-[var(--surface)] text-[var(--ink)]"
          />
        </label>

        <h2 className="text-base font-extrabold text-[var(--ink)] mt-6">Take it away</h2>
        {!ready ? (
          <p className="text-sm text-[var(--muted)] mt-1">
            Solve the position first — without the solution there is nothing for the board to play against.
          </p>
        ) : (
          <>
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
