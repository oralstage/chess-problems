import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChessboardDnDProvider, SparePiece } from 'react-chessboard';
import type { Piece } from 'react-chessboard/dist/chessboard/types';
import { Board } from '../src/components/Board';
import { useTheme } from '../src/hooks/useTheme';
import { moveFreely, pieceAt } from '../src/utils/freeBoard';
import { stipulationPhrase } from '../src/utils/stipulationColor';
import { INVITE, readStipulation } from '../embed/problemParams';
import { fetchProblem } from '../src/services/api';
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

/** A YACPDB id, named however it came to hand: the bare number, the D/H/S/E/R
 *  form this site prints in front of it, or an address with one in it.
 *  Anything with a slash in it is a position, not an id. */
function readProblemId(text: string): number | null {
  const t = text.trim();
  if (!t || /\s/.test(t.replace(/^[a-zA-Z]+/, '')) ) { /* fall through */ }
  const bare = /^[DHSER]?(\d{1,7})$/i.exec(t);
  if (bare) return Number(bare[1]);
  const inUrl = /(?:yacpdb\.org\/#?\w*\/|\/yacpdb\/|[?&]id=|#\/daily\/)?(?:^|\/)([DHSER]?\d{1,7})\s*$/i.exec(t);
  if (inUrl && /^https?:|yacpdb|chessproblem/i.test(t)) return Number(inUrl[1].replace(/^[A-Za-z]/, ''));
  return null;
}

/* The unit is picked, not typed. A box that turns a bare number into pixels
   turns "50" from somebody who meant half the column into a board fifty
   pixels wide, and the mistake only shows up on the page they pasted it
   into. */
const UNITS = ['%', 'px'] as const;
type Unit = typeof UNITS[number];

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

  /* How wide the frame is where it lands. "100%" follows the column it is
     dropped into, which is what an article wants and what keeps it inside a
     phone; a bare number is a fixed width, for a sidebar or a slide. There is
     no height to give: the frame keeps a printed diagram's proportion, and a
     frame given both in pixels stops matching its column the moment the
     column changes. */
  const [frameWidth, setFrameWidth] = useState('100');
  const [frameUnit, setFrameUnit] = useState<Unit>('%');

  /* A board set as an exercise is not one to be given up on. */
  const [offerHint, setOfferHint] = useState(true);
  const [offerGiveUp, setOfferGiveUp] = useState(true);

  /* A solving tourney holds the composer's name back until the round is over,
     and a board set as an exercise does the same. A board illustrating an
     article is the other case: the credit is part of what is being shown, and
     withholding it until someone solves is withholding the caption. */
  const [creditsUpFront, setCreditsUpFront] = useState(false);

  const [solution, setSolution] = useState('');
  /* Shut to begin with, opened by a solve so its result can be read, and shut
     again from the same button: Popeye's output runs to a dozen lines and more
     for a long helpmate, and it should not sit there once it has been seen. */
  const [solutionOpen, setSolutionOpen] = useState(false);

  /* Pressed, rather than arrived at. The addresses could appear the moment a
     solution lands, but then the page decides when it is finished and the
     appearance below is offered after the thing it changes -- so the last
     word is a button, and what is missing is said when it is pressed rather
     than written against every field that could be. */
  const [wanted, setWanted] = useState(false);
  /* What was missing when the button was last pressed. It is an answer to a
     press, not a running commentary: a page that lists what it is still
     waiting for while you are typing it is scolding you for not having
     finished. Cleared the moment anything it named is touched. */
  const [complaint, setComplaint] = useState<string[] | null>(null);

  /* What was typed in the top field, kept as typed. It is a position most of
     the time, but an id is a shorter thing to have to hand and the site prints
     one on every problem it holds -- so the field takes either, and says which
     it read. */
  const [source0, setSource0] = useState('');
  const [looking, setLooking] = useState(false);
  const topRef = useRef<HTMLInputElement>(null);
  const [solving, setSolving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Small. This board is a field being filled in, not a diagram being read --
     the reading happens on the page it makes -- and at full width it pushed
     everything that has to be typed below the fold. */
  const boardSize = () => Math.min(window.innerWidth - 48, 260);
  const [boardWidth, setBoardWidth] = useState(boardSize);
  useEffect(() => {
    const onResize = () => setBoardWidth(boardSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const men = countMen(fen);
  // How much is in there, said on the button rather than by opening it.
  const solutionLines = solution.split('\n').filter(l => /\d\./.test(l)).length;

  /* The line under the diagram, said the way the finished board says it: "Mate
     in 2" rather than "#2" while there is enough to say it with, and whatever
     has been typed so far while there is not. */
  const read = readStipulation(stipulation);
  const caption = read
    ? stipulationPhrase(stipulation, read.genre, read.moveCount)
    : stipulation.trim();

  const credit = [author.trim(), [source.trim(), year.trim()].filter(Boolean).join(', ')]
    .filter(Boolean).join(' — ');

  /* Whether anything has been said yet. Typed into the top field, put on the
     board by hand, or in the middle of being put there. */
  const started = source0.trim() !== '' || !boardIsEmpty(fen) || editing;

  /* A problem fetched by its number arrives finished: the position, what is
     asked of it and the solution all came together. Asking for them again
     would be asking the reader to supply what is already on the page. */
  const fromId = readProblemId(source0) !== null;

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
    setComplaint(null);
  }, []);

  const setAsked = useCallback(<T,>(set: (v: T) => void, value: T) => {
    set(value);
    setSolution('');
    setNote(null);
    setComplaint(null);
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
      setComplaint(null);
      // Opened, so that what was found can be read. It folds away again from
      // the same button, which is the part that was missing before.
      setSolutionOpen(true);
    };

    worker.onerror = () => { stopWorker(); setNote('Popeye could not be started.'); };
  }, [fen, stipulation, showTries, stopWorker]);

  /* Fetch a problem the site already holds and fill the form in from it --
     position, what is asked, the credit and the solution, which between them
     are the whole of what this page asks for. */
  const lookUp = useCallback(async (id: number) => {
    setLooking(true);
    setNote(null);
    try {
      const p = await fetchProblem(id);
      setFen(p.fen);
      setStipulation(p.stipulation);
      setAuthor((p.authors || []).join('; '));
      setSource(p.sourceName || '');
      setYear(p.sourceYear ? String(p.sourceYear) : '');
      setSolution(p.solutionText || '');
      setComplaint(null);
    } catch {
      setNote(`No problem ${id} on this site.`);
    } finally {
      setLooking(false);
    }
  }, []);

  /* Typed into the top field. A position goes straight onto the board; an id
     is looked up once typing has stopped, so that "3" on the way to "3684"
     does not fetch three problems. */
  const readTop = useCallback((text: string) => {
    setSource0(text);
    setComplaint(null);
    const id = readProblemId(text);
    if (id === null) setPosition(text.trim() ? text : EMPTY_FEN);
    return id;
  }, [setPosition]);

  useEffect(() => {
    const id = readProblemId(source0);
    if (id === null) return;
    const t = setTimeout(() => { void lookUp(id); }, 500);
    return () => clearTimeout(t);
  }, [source0, lookUp]);

  /* Back to an empty page. The field is where the problem came from, so
     emptying it empties what came with it -- otherwise the board keeps a
     position that nothing on the page still names. */
  const clearAll = useCallback(() => {
    setSource0('');
    setFen(EMPTY_FEN);
    setStipulation('');
    setAuthor('');
    setSource('');
    setYear('');
    setSolution('');
    setSolutionOpen(false);
    setNote(null);
    setComplaint(null);
    setWanted(false);
    topRef.current?.focus();
  }, []);

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

  /* Both addresses carry the switches. A set of problems that withholds the
     answer in the frame and hands it over on the page it links to has not
     withheld anything. */
  const boardQuery = useMemo(() => {
    const q = new URLSearchParams(query);
    if (!offerHint) q.set('hint', '0');
    if (!offerGiveUp) q.set('giveup', '0');
    if (creditsUpFront) q.set('credits', '1');
    return q.toString();
  }, [query, offerHint, offerGiveUp, creditsUpFront]);

  /* Said when the button is pressed, in the order the page asks for them, and
     worded as the thing to do rather than as a list of what is absent. */
  const missing = [
    boardIsEmpty(fen) && 'Set the position up — press Edit position and place the men, or paste a FEN.',
    !stipulation.trim() && 'Enter the stipulation (e.g. #2, h#3, s#4) — it is what the board will ask.',
    !solution.trim() && 'Press Solve with Popeye, or enter a solution yourself — the board plays against it.',
  ].filter(Boolean) as string[];

  const ready = missing.length === 0;
  const width = `${frameWidth.trim() || '100'}${frameUnit}`;
  const frameStyle = `width:${width}; aspect-ratio:4/5; border:0`;
  const markup = `<iframe src="${SITE}/board?${boardQuery}"\n        style="${frameStyle}"\n        title="Chess problem"></iframe>`;

  return (
    <div className="sober min-h-dvh">
      <div className="nb-sheet max-w-3xl mx-2 sm:mx-auto my-3 sm:my-5 px-4 pb-10">
        <header className="py-3">
          <h1 className="text-lg font-semibold text-[var(--ink)]">Make a solvable diagram</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Turn a chess problem into an interactive diagram people can actually solve — embedded in your
            own page, or at an address you can send.
          </p>
        </header>

        {/* The three that are the problem, across the top and in the order they
            are settled: where the men are, what is asked of them, and the
            solution -- which is asked of Popeye rather than of the reader. The
            precedent finder puts the same three in the same place. */}
        {/* The problem across the top with the button that finishes the job at
            the end of it, where the finder puts Search -- and it takes either
            way of naming one. A position is the case this page was built for;
            an id is shorter to have to hand, the site prints one on every
            problem it holds, and it brings the credit and the solution with
            it. */}
        <div className="mt-2">
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                ref={topRef}
                value={source0}
                onChange={e => readTop(e.target.value)}
                placeholder="FEN or YACPDB ID"
                spellCheck={false}
                className={`nb-plate w-full px-3 py-2 text-sm font-mono bg-[var(--surface)] text-[var(--ink)] ${source0 ? 'pr-8' : ''}`}
              />
              {/* Inside the field, at the end of what it holds: starting again
                  is a thing you do to the field, not a thing beside it. */}
              {source0 && (
                <button
                  onClick={clearAll}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 rounded text-[var(--faint)] hover:text-[var(--ink)] text-base leading-none"
                  title="Clear"
                  aria-label="Clear the input"
                >
                  ×
                </button>
              )}
            </div>
            {/* A FEN is a long line of punctuation that arrives from somewhere
                else, and on a phone the clipboard is easier to reach from a
                button than from a long press. Only while the field is empty:
                once it holds something, pasting over it is not the next thing
                anyone wants. */}
            {!source0 && (
              <button
                onClick={async () => {
                  try { const t = await navigator.clipboard.readText(); if (t.trim()) readTop(t.trim()); } catch { /* denied */ }
                }}
                className="nb-btn shrink-0 py-2 px-3"
              >
                Paste
              </button>
            )}
            <button
              onClick={() => { setComplaint(missing.length ? missing : null); setWanted(missing.length === 0); }}
              className="nb-btn nb-btn-key shrink-0 py-2 px-4 font-semibold"
            >
              Generate
            </button>
          </div>
          <span className="block text-xs text-[var(--faint)] mt-0.5">
            {looking ? 'Looking it up…'
              : 'FEN · YACPDB ID or URL — nothing you type here is sent anywhere'}
          </span>
        </div>

        {/* Nothing below until there is a problem to say it about. A form that
            lays all of itself out before anything has been entered is asking
            eight questions at once; the finder shows the stipulation once its
            top field has something in it, and so does this. */}
        {!started ? (
          <p className="text-sm text-[var(--muted)] mt-4">
            Paste a position or a problem number above, or{' '}
            <button onClick={() => setEditing(true)} className="underline font-semibold">set one up on a board</button>.
          </p>
        ) : (
        <>
        {!fromId && (
        <div className="flex flex-wrap items-start gap-2 mt-3">
          <label className="block w-28">
            <span className="text-xs font-semibold text-[var(--muted)]">Stipulation</span>
            <input
              value={stipulation}
              onChange={e => setAsked(setStipulation, e.target.value)}
              spellCheck={false}
              className="nb-plate w-full mt-1 px-3 py-1.5 text-sm font-mono bg-[var(--surface)] text-[var(--ink)]"
            />
            <span className="block text-xs text-[var(--faint)] mt-0.5">e.g. #2 h#3 s#2 + =</span>
          </label>

          <div className="flex flex-wrap items-center gap-2 pt-[1.35rem]">
            {solving ? (
              <button onClick={stopWorker} className="nb-btn py-1.5 px-3 font-semibold">Stop</button>
            ) : (
              <button
                onClick={solve}
                disabled={!hasKings || !stipulation.trim()}
                className="nb-btn py-1.5 px-3 font-semibold disabled:opacity-50"
              >
                Solve with Popeye
              </button>
            )}
            {/* A setting for the solve, so it stands with the solve rather
                than after the other way of getting a solution in. */}
            <label className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
              <input type="checkbox" checked={showTries} onChange={e => setAsked(setShowTries, e.target.checked)} />
              Tries
            </label>
            {/* The other way a solution gets here, and the same size as the
                solve. Its own label is the state it is in -- dashed and
                inviting while there is nothing in it, counting the lines it
                holds once there are. */}
            <button
              onClick={() => setSolutionOpen(v => !v)}
              className={`nb-btn py-1.5 px-3 ${solutionOpen || solution.trim() ? '' : 'border-dashed'}`}
            >
              {solutionOpen ? 'Solution ▾'
                : solution.trim() ? `Solution · ${solutionLines} lines ▸`
                : 'Enter a solution yourself ▸'}
            </button>
            {solving && <span className="text-sm text-[var(--muted)]">Solving…</span>}
            {!solving && stipulation.trim() && !hasKings && (
              <span className="text-sm text-[var(--muted)]">Both sides need a king.</span>
            )}
          </div>
        </div>

        )}

        {/* Plain red under the row it is about, as the finder says the same
            thing: a sentence, not a boxed notice. */}
        {complaint?.map(line => (
          <p key={line} className="text-sm text-[var(--bad)] mt-1.5">{line}</p>
        ))}

        {!fromId && solutionOpen && (
          <textarea
            value={solution}
            onChange={e => { setSolution(e.target.value); setComplaint(null); }}
            spellCheck={false}
            rows={8}
            placeholder="Popeye's output, as it printed it"
            className="nb-plate w-full mt-2 px-3 py-2 text-xs font-mono whitespace-pre bg-[var(--surface)] text-[var(--ink)]"
          />
        )}

        {note && (
          <pre className="nb-plate mt-3 p-3 text-xs whitespace-pre-wrap text-[var(--ink)]">{note}</pre>
        )}

        {/* Below the line: the board as it will be met, and everything a board
            can do without. The position, what is asked of it and the solution
            are the problem; a name, a source and how the frame is dressed are
            what is said about it. */}
        <hr className="mt-6 mb-4 border-0 border-t border-[var(--hairline)]" />

        <div className="sm:flex sm:items-start sm:gap-5">
          <div className="shrink-0">
            {/* One board, in two states. Being set up, it is the board itself,
                with the men picked up and put down on it; the rest of the time
                the lines a reader will meet are drawn around it, so that what
                the switches beside it do can be seen being done.

                Drawn here rather than by running the real thing in a frame. A
                frame would be the real thing, and would therefore refuse a
                position still being typed -- no stipulation yet, no solution
                yet -- and show an error where the board should be. This is a
                picture of the finished board, and a picture can be of
                something not finished. */}
            <div className={editing ? '' : 'nb-plate p-2'} style={{ width: boardWidth }}>
              {!editing && (
                <>
                  {creditsUpFront && credit && (
                    <p className="text-xs text-center text-[var(--ink)]">{credit}</p>
                  )}
                  <p className="text-xs text-center text-[var(--faint)] min-h-[1.25rem]">{INVITE}</p>
                </>
              )}
              <div className="flex justify-center">
                <Board
                  fen={fen}
                  onPieceDrop={handleDrop}
                  width={editing ? boardWidth : boardWidth - 16}
                  orientation="white"
                  freeMove={editing}
                  disabled={!editing}
                  onSquareTool={editing && tool.kind !== 'move' ? handleSquare : undefined}
                />
              </div>
              {!editing && (
                <>
                  <div className="flex items-baseline justify-between text-xs text-[var(--muted)] mt-1">
                    <span>{caption}</span>
                    <span>{men.white}+{men.black}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    {offerHint && <span className="nb-btn px-2 py-0.5 text-xs">Hint</span>}
                    {offerGiveUp && <span className="nb-btn px-2 py-0.5 text-xs">Give up</span>}
                  </div>
                  <p className="text-right text-[11px] text-[var(--faint)] underline mt-1.5">
                    Open on chessproblem.org ↗
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button
                onClick={() => setEditing(v => !v)}
                className={`nb-btn py-1 px-2.5 text-sm ${editing ? 'nb-btn-key' : ''}`}
              >
                {editing ? 'Done' : 'Edit position'}
              </button>
              {editing && (
                <>
                  <button onClick={() => setPosition(EMPTY_FEN)} className="nb-btn py-1 px-2.5 text-sm" title="Take everything off">
                    Clear
                  </button>
                  <span className="text-sm text-[var(--muted)] ml-auto">{men.white}+{men.black}</span>
                </>
              )}
            </div>

            {editing && (
              <ChessboardDnDProvider>
                <div className="flex flex-wrap items-center gap-1 mt-2" style={{ width: boardWidth }}>
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
                    >
                      {/* The drawing takes no pointer of its own: this is a
                          button to choose with, not a man to drag. */}
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
                </div>
              </ChessboardDnDProvider>
            )}
          </div>

          <div className="flex-1 min-w-0 mt-4 sm:mt-0">
            {/* None of this changes the problem, and none of it has to be
                filled in. Said once, over the lot, rather than tagged onto
                every field: a column of "optional" reads as a form nagging
                about things it does not need. */}
            <h2 className="text-sm font-semibold text-[var(--ink)]">Appearance</h2>
            <p className="text-xs text-[var(--faint)] mt-0.5 mb-2">
              How the board is dressed and what it offers. Leave it all alone and the board still works.
            </p>
            <div className="flex flex-wrap gap-3">
              <label className="block flex-1 min-w-[10rem]">
                <span className="text-xs text-[var(--muted)]">Composer</span>
                <input value={author} onChange={e => setAuthor(e.target.value)}
                  className="nb-plate w-full mt-1 px-3 py-2 text-sm bg-[var(--surface)] text-[var(--ink)]" />
              </label>
              <label className="block w-24">
                <span className="text-xs text-[var(--muted)]">Year</span>
                <input value={year} onChange={e => setYear(e.target.value)} spellCheck={false}
                  className="nb-plate w-full mt-1 px-3 py-2 text-sm bg-[var(--surface)] text-[var(--ink)]" />
              </label>
              <label className="block w-full">
                <span className="text-xs text-[var(--muted)]">Source</span>
                <input value={source} onChange={e => setSource(e.target.value)}
                  className="nb-plate w-full mt-1 px-3 py-2 text-sm bg-[var(--surface)] text-[var(--ink)]" />
              </label>
            </div>

            <div className="mt-4 space-y-2">
              <label className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
                <input type="checkbox" checked={offerHint} onChange={e => setOfferHint(e.target.checked)} />
                Offer Hint
              </label>
              <label className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
                <input type="checkbox" checked={offerGiveUp} onChange={e => setOfferGiveUp(e.target.checked)} />
                Offer Give up
              </label>
              <label className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
                <input type="checkbox" checked={creditsUpFront} onChange={e => setCreditsUpFront(e.target.checked)} />
                Show the composer from the start
              </label>
              {/* The unit is picked, not typed: a box that turns a bare number
                  into pixels turns "50" from somebody who meant half the
                  column into a board fifty pixels wide, and the mistake only
                  shows up on the page they pasted it into. */}
              <span className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
                <span>Width</span>
                <input
                  value={frameWidth}
                  onChange={e => setFrameWidth(e.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="numeric"
                  spellCheck={false}
                  className="nb-plate w-16 px-2 py-1 text-sm font-mono bg-[var(--surface)] text-[var(--ink)]"
                />
                {UNITS.map(u => (
                  <button
                    key={u}
                    onClick={() => setFrameUnit(u)}
                    className={`nb-btn px-2 py-1 text-sm font-mono ${frameUnit === u ? 'nb-btn-key' : ''}`}
                  >
                    {u}
                  </button>
                ))}
              </span>
            </div>
            <p className="text-xs text-[var(--faint)] mt-2">
              Turn the first two off and the problem can only be solved. <code>100%</code> follows the column
              it lands in, <code>50%</code> half of it; pixels are a fixed size.
            </p>
          </div>
        </div>

        {/* Nothing to take until the button has been pressed and there is
            something to take: a heading over an explanation of why the thing
            below it is missing is furniture for an absence.

            In a panel of its own, because everything above it is a question
            being asked and everything in it is the answer. Run together in one
            column they read as one long form, and the two addresses -- the
            things this page exists to hand over -- end up looking like two
            more fields. */}
        </>
        )}
        {wanted && ready && (
          <div className="nb-plate mt-4 p-4 bg-[var(--surface-2)]">
            <h2 className="text-base font-semibold text-[var(--ink)]">Take it away</h2>

            {/* Two things, side by side and each the width of what it holds.
                Stacked, with the door across the whole panel, the block was
                mostly air: a button as wide as a paragraph reads as a banner
                rather than as something to press. */}
            <div className="mt-3 sm:flex sm:gap-6">
              <section className="sm:flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-[var(--ink)]">A page of its own</h3>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  The board, every variation and the engine, at one address.
                </p>
                <a
                  className="nb-btn nb-btn-key inline-block mt-2 py-1.5 px-3 text-sm font-semibold"
                  href={`/solve/?${boardQuery}`} target="_blank" rel="noopener noreferrer"
                >
                  Open the page →
                </a>
                <Copyable label="Its address" text={`${SITE}/solve?${boardQuery}`} />
              </section>

              <section className="sm:flex-1 min-w-0 mt-5 pt-4 border-t border-[var(--hairline)] sm:mt-0 sm:pt-0 sm:border-t-0 sm:border-l sm:pl-6">
                <h3 className="text-sm font-semibold text-[var(--ink)]">The board in a page of yours</h3>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  The markup that draws it, wherever you paste it.
                </p>
                <Copyable label="Its markup" text={markup} />
              </section>
            </div>
          </div>
        )}
        {/* Named where it is used, not only in the licence list. It is a
            GPL program running on this page, and the offer of its source has
            to be findable from the page it runs on. */}
        <p className="text-xs text-[var(--faint)] mt-8">
          Solving is done in your browser by{' '}
          <a className="underline" href="https://github.com/thomas-maeder/popeye" target="_blank" rel="noopener noreferrer">Popeye</a>
          {' '}4.103, the chess problem solving program, under the{' '}
          <a className="underline" href="/popeye/COPYING.txt">GNU GPL v2</a> —{' '}
          <a className="underline" href="/licenses">source and build</a>.
          Nothing you type here is sent anywhere.
        </p>
      </div>
    </div>
  );
}
