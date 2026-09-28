import { useCallback, useEffect, useRef, useState } from 'react';
import { Board } from '../src/components/Board';
import { useProblem } from '../src/hooks/useProblem';
import { getPromotionForMove } from '../src/services/moveInput';
import { fetchProblem, fetchDailyByDate, metaToChessProblem } from '../src/services/api';
import { pieceCounts } from '../src/utils/pieceCount';
import { stipulationPhrase } from '../src/utils/stipulationColor';
import { composerLine } from '../src/utils/composerName';
import { CATEGORY_DEFS } from '../src/types';
import type { ChessProblem } from '../src/types';
import { ensureSolution } from './ensureSolution';
import { BadRequest, INVITE, problemFromParams, problemIdFromUrl, readStipulation } from './problemParams';
import { asFen, creditFromParams, freeDrop, readPlacement, wantsAnalysis } from '../analysis/placement';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** "September 11" -- the day the problem belongs to. The month is named
 *  rather than numbered because 9/11 and 11/9 are the same day to different
 *  readers, and spelled out in the site's own language rather than the
 *  reader's, so that the order cannot change under it either. */
function dayLabel(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** Today where the reader is. The daily problem turns over by their calendar,
 *  not by UTC, which is the date the site's own daily page is keyed on. */
function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/* The site the link names. Written down rather than taken from wherever the
   embed happens to be served: an embed on staging, or on the old pages.dev
   address, still has only one place to send a reader who wants the rest of
   it. The problems themselves are fetched from the serving origin's own API
   -- same database either way -- so only this one address is fixed. */
const SITE = 'https://arcade.chessproblem.org';

/* The same problem on the site. The category slug comes off CATEGORY_DEFS
   rather than a second copy of the move-count ranges; a move count in no
   category (a #1) falls back to the bare genre slug, which the app also
   accepts. */
function siteUrl(p: ChessProblem, dailyDate: string | null): string {
  /* A problem handed over in the address is in no database and has no page on
     the site -- so it gets one made out of the same address it arrived in.
     Everything the frame was given goes on: the position, what is asked, the
     solution, the credit, and whether Hint and Give up were offered, so a
     board set as an exercise is still one when it is opened full size. */
  if (p.id === 0) return `${SITE}/solve${window.location.search}`;
  // The daily problem has a page of its own, with the days either side of it.
  // Sending its reader to the plain problem page instead would lose the one
  // thing they came with: that this is today's.
  if (dailyDate) return `${SITE}/#/daily/${dailyDate}`;
  const def = CATEGORY_DEFS.find(d => d.genre === p.genre
    && (d.minMoves == null || p.moveCount >= d.minMoves)
    && (d.maxMoves == null || d.maxMoves === 0 || p.moveCount <= d.maxMoves));
  return `${SITE}/#/${def?.category ?? p.genre}/yacpdb/${p.id}`;
}

/* A diagram small enough that the pieces stop being pieces is not worth the
   room it saves, so the board stops shrinking here and the block is allowed
   to run past the bottom of a frame that was never going to hold it. */
const MIN_BOARD = 120;

/* The type is set to the frame, not left at one size for every frame. Held at
   one size the lines take the same 150-odd pixels whether the frame is 700
   tall or 350, which is half the height of a small one gone before the
   diagram gets any -- and the rows that no longer fit on one line wrap, which
   takes more still. Set to the frame, a small embed reads as a small diagram
   with small print rather than a large one squeezed into a corner.

   Keyed on the frame's shorter side, and on nothing else. Keyed on the board
   it would close the same circle the measurement above was written to open:
   type sets the lines, the lines set the board, and the board would be back
   to setting the type. */
const TEXT_MIN = 11, TEXT_MAX = 16;
const FRAME_MIN = 240, FRAME_MAX = 520;

function textSizeFor(width: number, height: number): number {
  const frame = Math.min(width, height);
  const t = Math.min(1, Math.max(0, (frame - FRAME_MIN) / (FRAME_MAX - FRAME_MIN)));
  return Math.round((TEXT_MIN + t * (TEXT_MAX - TEXT_MIN)) * 10) / 10;
}

/* How big the diagram can be: the width it is given, or the height left once
   the lines around it have taken theirs, whichever is smaller.

   The lines are measured across the whole frame, never across the board.
   That is the whole of it: the board's size sets the block's width, the
   block's width decides where the credit, the caption, the buttons and the
   link break, and where they break decides how much height is left for the
   board. Measured at the board's own width, that circle closes -- pressing
   Hint lengthens a button, the row wraps, the board shrinks, the narrower
   block wraps two more lines, and the board shrinks again; pressing Give up
   brings the credit, five playback buttons and the verdict at once, and on a
   small frame there is no size that holds still, so it swings between a
   squeezed board and none at all, which is the flicker. Measured at the
   frame's width the number the board is given depends only on the frame and
   on what the lines say, so it settles on the first pass.

   From that size the block is drawn in onto the board -- so the stipulation
   and the material count sit on the board's own edges, as they do in print --
   and if the narrower block wraps a line, the walk takes the smaller board
   that follows and tries again. It only ever goes down, so it stops; and it
   goes down inside the single measurement, so none of it is drawn. On a frame
   with no size that holds, it stops at MIN_BOARD instead of walking to
   nothing, and there the lines keep the frame's width, where they wrap least,
   and the board is centred in them. A caption reaching wider than the diagram
   is a blemish; on a frame that small it is the price of the frame. */
function useBoardLayout(
  root: React.RefObject<HTMLDivElement | null>,
  stack: React.RefObject<HTMLDivElement | null>,
  slot: React.RefObject<HTMLDivElement | null>,
  bar: React.RefObject<HTMLDivElement | null>,
  head: React.RefObject<HTMLDivElement | null>,
): { size: number; blockWidth: number } {
  const [layout, setLayout] = useState({ size: 0, blockWidth: 0 });

  useEffect(() => {
    const rootEl = root.current, stackEl = stack.current, slotEl = slot.current;
    if (!rootEl || !stackEl || !slotEl) return;

    const measure = () => {
      const rootStyle = getComputedStyle(rootEl);
      const padX = parseFloat(rootStyle.paddingLeft) + parseFloat(rootStyle.paddingRight);
      const padY = parseFloat(rootStyle.paddingTop) + parseFloat(rootStyle.paddingBottom);
      /* The frame is read off its outer box, which a scrollbar does not
         change. clientWidth and clientHeight lose 15px to one once it shows,
         and one did show: the sizes are whole pixels, so in an iframe sized by
         aspect-ratio (287.7 high reads as 288) the block could reach a
         fraction of a pixel into the padding under it, which a scrolling box
         answers with a scrollbar. The lines over the board, set at the frame's
         width, then ran under that one and brought a second; 15px came off
         both ways, the board shrank, the overhang went, the scrollbars went,
         and the board grew back, frame after frame. offsetWidth and
         offsetHeight are the same whole pixels clientWidth and clientHeight
         give with no scrollbar showing -- so every board keeps the size it
         had -- and they do not move when one shows. The fraction of a pixel
         still reaches into the padding, where nothing is drawn, and the frame
         now has no scrollbar to show for it (embed.css). */
      let availableW = Math.max(0, rootEl.offsetWidth - padX);
      const availableH = Math.max(0, rootEl.offsetHeight - padY);

      // Before anything is measured, because every line's height is downstream
      // of it. The frame is what it reads, so this does not feed back.
      rootEl.style.setProperty('--emb-text', `${textSizeFor(rootEl.offsetWidth, rootEl.offsetHeight)}px`);

      /* Everything in the block that is not the board, gaps and all, taken as
         one figure at the given width. The board's own box drops out of it,
         so what the board is told has no way back into the measurement. */
      const linesAt = (width: number) => {
        stackEl.style.width = `${width}px`;
        // The row of controls is held open at the height of its fullest state
        // before anything is added up, so that state arriving later costs the
        // board nothing. The twin is out of the flow, so it is measured at this
        // width without being part of what is measured.
        const barEl = bar.current;
        const ghost = barEl?.firstElementChild as HTMLElement | null;
        /* Where the fullest row does not fit on one line, the first and last
           of the replay buttons stand down (still a step back and forward),
           so the row is one line and holds one line's height: two, held open
           under Hint and Give up from the start, were space the board did
           not get. Decided at the width being tried, so the walk below stays
           a function of the frame. */
        if (barEl && ghost?.classList.contains('emb-bar-ghost')) {
          delete barEl.dataset.compact;
          const wraps = () => {
            const tops = [...ghost.children].filter(c => (c as HTMLElement).offsetParent !== null)
              .map(c => c.getBoundingClientRect().top);
            return tops.length > 0 && Math.max(...tops) - Math.min(...tops) > 4;
          };
          if (wraps()) barEl.dataset.compact = '';
        }
        if (barEl) barEl.style.minHeight = ghost ? `${Math.ceil(ghost.getBoundingClientRect().height)}px` : '';
        // The lines above the diagram are held at their fullest in the same
        // way: the day, which stays, plus whichever of the invitation and the
        // credit is taller -- those two are never on the page together. So
        // neither the credit nor its arriving can move the board.
        const headEl = head.current;
        const headGhost = headEl?.firstElementChild as HTMLElement | null;
        if (headEl) {
          /* The lines over the diagram are centred, so they need not stop at
             the board's edges the way the caption under it does: set at the
             frame's width they wrap less, and every line they give back is
             height the board gets (in a 247-wide frame, three lines were
             two). */
          headEl.style.width = `${availableW}px`;
          headEl.style.minHeight = headGhost
            ? `${Math.ceil(headGhost.getBoundingClientRect().height)}px` : '';
        }
        return stackEl.getBoundingClientRect().height - slotEl.getBoundingClientRect().height;
      };

      const fits = (width: number) =>
        Math.floor(Math.min(availableW, availableH - linesAt(width)));

      // The largest the board could be if the lines never wrapped any harder
      // than they do across the whole frame. Everything below starts here and
      // only ever goes down, so one pass settles it.
      let size = fits(availableW);
      let blockWidth = availableW;

      if (size < availableW && size >= MIN_BOARD) {
        /* Room to spare on the width, so the block can be drawn in to the
           board's own edges. Narrowing it may cost a wrapped line, and that
           line costs the board some height, which draws the block in further
           -- but each step is smaller than the last and the walk stops at the
           first width that pays for itself. Descending inside the one
           measurement is what keeps this off the screen: nothing is drawn
           until it has come to rest, and where it rests depends only on the
           frame. */
        for (let i = 0; i < 4; i += 1) {
          const next = fits(size);
          if (next >= size) break;
          if (next < MIN_BOARD) { size = -1; break; }
          size = next;
        }
        if (size > 0) blockWidth = size;
      }

      if (size < MIN_BOARD) {
        // Nothing this narrow was ever going to hold both a diagram and its
        // lines. The lines keep the frame's width, where they wrap least, and
        // the board takes the smallest size still worth looking at.
        size = fits(availableW);
        blockWidth = availableW;
      }

      /* A frame that holds the block shows no scrollbar, not even for the
         fraction of a pixel a line may be rounded to. Only a frame too short
         for the smallest board scrolls, and that is decided above from the
         frame alone, so the scrollbar arriving cannot undo it; the lines are
         then set in the width the scrollbar leaves them, so that none of them
         runs under it. */
      if (size < MIN_BOARD) {
        rootEl.dataset.scroll = '';
        availableW = Math.max(0, availableW - (rootEl.offsetWidth - rootEl.clientWidth));
        size = Math.max(MIN_BOARD, fits(availableW));
        blockWidth = availableW;
      } else {
        delete rootEl.dataset.scroll;
      }

      // Leave the block at what was decided rather than handing it back bare:
      // React writes the same number on its next render, and nothing is
      // painted at the frame's width in between.
      stackEl.style.width = `${blockWidth}px`;
      setLayout(prev => (prev.size === size && prev.blockWidth === blockWidth
        ? prev
        : { size, blockWidth }));
    };

    if (typeof ResizeObserver === 'undefined') {
      const raf = requestAnimationFrame(measure);
      window.addEventListener('resize', measure);
      return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure); };
    }
    // The frame, and the block inside it. The block is what reports the lines
    // arriving and leaving -- the credit after the solve, a row of buttons
    // wrapping, the caption appearing with the problem -- none of which is a
    // resize from outside. Watching the block rather than the lines it holds
    // is what keeps that true for lines that were not there at the start.
    // The observer's own first callback does the initial measurement.
    const ro = new ResizeObserver(measure);
    ro.observe(rootEl);
    ro.observe(stackEl);
    return () => ro.disconnect();
  }, [root, stack, slot, bar, head]);

  return layout;
}
/* Two doors onto the same board.

   'arcade' is this site's own embed: the type this site is set in, and a line
   out to the problem's page here when it has one.

   'plain' is the door for somebody else's page: it carries no name and no way
   out, a federation putting its own problem on a board having every right to
   keep the reader it brought. The two look the same — the panel is set for
   the page it lands in either way. */
export type EmbedVariant = 'arcade' | 'plain';

/* A position and nothing to solve -- no stipulation, no solution -- is an
   analysis board: the embed demo's builder and the /make page hand out the
   same address with the problem in it, and one without it is a board to think
   on rather than an error in someone's page. Decided before either board's
   hooks, since the two have none in common. */
export function EmbedApp({ variant = 'arcade' }: { variant?: EmbedVariant } = {}) {
  return wantsAnalysis(new URLSearchParams(window.location.search))
    ? <EmbedAnalysis />
    : <EmbedProblem variant={variant} />;
}

/* The analysis board in a frame: the diagram laid out as the problem board is
   (the same measurement, so the two sit the same in a page), any man to any
   square, Reset, and the way out to the same board full size.
   Both doors show the way out, as they do for a problem handed over in the
   address: it has no page anywhere else. */
function EmbedAnalysis() {
  const params = new URLSearchParams(window.location.search);
  const start = readPlacement(params.get('fen') || '');
  const [fen, setFen] = useState(() => asFen(start ?? '8/8/8/8/8/8/8/8'));
  const rootRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const { size: boardSize, blockWidth } = useBoardLayout(rootRef, stackRef, slotRef, barRef, headRef);
  const boardColours = params.get('board') === 'green' ? 'green' : undefined;
  const given = creditFromParams(params);
  // The stipulation said as the problem board says it, when the address keeps
  // one (analysis=1); "Analysis board" when it does not.
  const stipText = (params.get('stip') || '').trim();
  const stipRead = stipText ? readStipulation(stipText) : null;
  const caption = stipRead ? stipulationPhrase(stipText, stipRead.genre, stipRead.moveCount) : stipText || 'Analysis board';
  const credit = given.show ? [composerLine(given.authors), given.source].filter(Boolean).join(' — ') : '';

  const handleDrop = (source: string, target: string, piece?: string): boolean => {
    setFen(prev => freeDrop(prev, source, target, piece));
    return true;
  };

  const moved = start !== null && fen !== asFen(start);

  return (
    <div className="emb-root" data-board={boardColours} ref={rootRef}>
      <div className="emb-stack" ref={stackRef} style={blockWidth ? { width: blockWidth } : undefined}>
        {/* No invitation: the problem board's line over the diagram says how
            to solve, and here there is nothing to solve. The credit, when the
            address asks for it, as the problem board sets it. */}
        <div className="emb-head" ref={headRef}>
          {credit && <div className="emb-credit">{credit}</div>}
        </div>

        <div className="emb-slot" ref={slotRef} style={{ height: boardSize }}>
          <div className="emb-slot-inner">
            {!start ? (
              <p className="emb-msg">That position could not be read.</p>
            ) : boardSize === 0 ? (
              <p className="emb-msg">Loading…</p>
            ) : (
              <Board fen={fen} onPieceDrop={handleDrop} orientation="white" width={boardSize} freeMove />
            )}
          </div>
        </div>

        {start && (
          <div className="emb-caption">
            <span className="emb-stip">{caption}</span>
            <span className="emb-pieces">{pieceCounts(asFen(start))}</span>
          </div>
        )}

        {start && (
          <div className="emb-bar" ref={barRef}>
            <button className="nb-btn emb-btn" onClick={() => setFen(asFen(start))} disabled={!moved}>Reset</button>
          </div>
        )}

        {start && (
          <div className="emb-link-row">
            <a className="emb-link" href={`${SITE}/solve${window.location.search}`} target="_blank" rel="noopener noreferrer">
              chessproblem.org ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function EmbedProblem({ variant }: { variant: EmbedVariant }) {
  const problem = useProblem();
  const [error, setError] = useState<string | null>(null);
  const [dailyDate, setDailyDate] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const { size: boardSize, blockWidth } = useBoardLayout(rootRef, stackRef, slotRef, barRef, headRef);

  const loadProblem = problem.loadProblem;
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const given = params.get('fen');
    const id = problemIdFromUrl(params);
    // No problem named at all: the site's daily, so a frame pasted bare is
    // still worth coming back to.
    const date = given || id !== null ? null : localDate();
    let cancelled = false;
    (async () => {
      try {
        let base: ChessProblem;
        if (given) {
          base = problemFromParams(params);
        } else {
          const full = date ? await fetchDailyByDate(date) : await fetchProblem(id!);
          base = metaToChessProblem(full, full.solutionText);
        }
        const ready = await ensureSolution(base);
        if (cancelled) return;
        setDailyDate(date);
        loadProblem(ready);
      } catch (err) {
        if (cancelled) return;
        // What was wrong with the address is worth saying; a failed fetch is
        // not, so that one keeps its own words.
        setError(err instanceof BadRequest ? err.message
          : date ? 'The daily problem could not be loaded.'
          : `Problem ${id} could not be loaded.`);
      }
    })();
    return () => { cancelled = true; };
  }, [loadProblem]);

  const handlePieceDrop = useCallback((source: string, target: string, piece: string): boolean => {
    const promotion = getPromotionForMove(problem.fen, source, target, piece);
    return problem.tryMove(source, target, promotion);
  }, [problem]);

  /* The board is wooden unless the page asks for the site's green one. Named
     rather than a pair of hex values: a host wants "the green one", not a
     colour-picking exercise, and a name is one word to put in the address. */
  const params = new URLSearchParams(window.location.search);
  const boardColours = params.get('board') === 'green' ? 'green' : undefined;

  /* A board set as an exercise -- a column in a magazine, a round in a class,
     a problem set to be handed in -- is not one to be given up on, and a hint
     is the wrong help when the point is to find it yourself. Both are on
     unless the page says otherwise, because most boards are not exercises. */
  const offerHint = params.get('hint') !== '0';
  const offerGiveUp = params.get('giveup') !== '0';

  /* Who composed it, from the first moment rather than after the solve. The
     holding back is a solving tourney's manner and the right one for a board
     set as an exercise; a board illustrating an article is the other case,
     where the credit is part of what is being shown and withholding it until
     someone solves is withholding the caption. */
  const creditsUpFront = params.get('credits') === '1';

  const p = problem.problem;
  const playback = problem.playback;
  const decided = problem.status === 'correct' || problem.status === 'viewing';
  const phrase = p ? stipulationPhrase(p.stipulation, p.genre, p.moveCount) : '';

  /* What the board is saying: Solved!, or how many of several solutions are
     found. Nothing for a solve that was given up -- the replay controls are
     already standing there. It goes on the way-out line when there is one. */
  const verdict = problem.status === 'correct' ? 'Solved!'
    : problem.status === 'viewing' ? ''
    : problem.totalSolutions > 1
      ? `Found ${problem.foundSolutionCount}/${problem.totalSolutions}. ${problem.feedback}`
      : problem.feedback;
  const verdictBelow = !!p && (p.id > 0 ? variant === 'arcade' : true);

  /* The way out to the site, on the page from the first moment and worded the
     same throughout -- the form every embed uses to name where it came from
     ("Watch on YouTube", "Open in Lichess"). "Open" and not "Solve": the page
     it opens is one page holding the variations, the notes and the way on to
     the next problem, and naming any one of those would send the other two to
     the wrong place. It never comes and goes, so the diagram is never resized
     by it.

     The site is named by its address rather than by "Chess Problem Arcade",
     which wrapped onto a second line in a narrow frame. An abbreviation would
     have been shorter still and would have named nothing: a reader meeting
     "CPA" for the first time learns where the board came from only if the
     words mean something, and a domain is a name they can type.

     The address alone, with the arrow, and no "Open on" in front of it
     (2026-09-26, the user's call): in a small frame "Open on chessproblem.org"
     still wrapped onto a second line, and every line the frame gives to words
     is a line the diagram does not get. A domain with an arrow after it is a
     link to that place as it stands. */

  /* A printed diagram carries the composer above it and the stipulation with
     the material count below. The credit is held back until the solve is
     decided, as a solving tourney's diagram sheet does -- the line keeps its
     height either way so the board does not jump when the name arrives. */
  const credit = p ? [composerLine(p.authors), [p.sourceName, p.sourceYear].filter(Boolean).join(', ')]
    .filter(Boolean).join(' — ') : '';
  /* The daily problem says which day it is, on a line of its own. It had been
     sharing the credit's line and standing down when the credit arrived --
     but which morning this board belongs to is not a thing to take away from
     someone the moment they have solved it. Both lines are held open from the
     start, so the diagram does not move when the credit appears. */

  return (
    <div className="emb-root" data-board={boardColours} ref={rootRef}>
      <div className="emb-stack" ref={stackRef} style={blockWidth ? { width: blockWidth } : undefined}>
      {/* Above the diagram, and it is held at the height of whichever state
          wants more. Until the solve is decided: which day this board belongs
          to, and under it the one thing a reader cannot tell from a picture of
          a position -- that the pieces on it move. After it: who composed the
          problem and where it appeared, which is when both of those have done
          their work.

          The twin below is the same text, drawn out of the flow, so the taller
          of the two states -- the day with its invitation, or a composer's name
          that runs to two lines, a pair of names, a Cyrillic patronymic -- has
          its room taken before the reader ever gets there, and the board does
          not move when the name arrives. */}
      <div className="emb-head" ref={headRef}>
        <div className="emb-head-ghost" aria-hidden="true">
          {/* With the credit held back the block has two states, and it is
              held at the taller. With the credit up front the credit is in
              both, so it is simply one of the lines and the room for all of
              them is taken at once. */}
          {creditsUpFront ? (
            <>
              {dailyDate && <div className="emb-date">Daily — {dayLabel(dailyDate)}</div>}
              <div className="emb-credit">{credit}</div>
              <div className="emb-invite">{INVITE}</div>
            </>
          ) : (
            <div className="emb-head-swap">
              <div>
                {dailyDate && <div className="emb-date">Daily — {dayLabel(dailyDate)}</div>}
                <div className="emb-invite">{INVITE}</div>
              </div>
              <div className="emb-credit">{credit}</div>
            </div>
          )}
        </div>
        {dailyDate && (decided ? creditsUpFront : true) && <div className="emb-date">Daily — {dayLabel(dailyDate)}</div>}
        {(decided || creditsUpFront) && <div className="emb-credit">{credit}</div>}
        {!decided && p && <div className="emb-invite">{INVITE}</div>}
      </div>

      <div className="emb-slot" ref={slotRef} style={{ height: boardSize }}>
        <div className="emb-slot-inner">
          {error ? (
            <p className="emb-msg">{error}</p>
          ) : !p || boardSize === 0 ? (
            <p className="emb-msg">Loading…</p>
          ) : (
            <Board
              key={`${p.id}:${problem.initialFen}`}
              fen={problem.fen}
              onPieceDrop={handlePieceDrop}
              lastMove={problem.lastMove}
              disabled={problem.waitingForAutoPlay}
              orientation="white"
              width={boardSize}
              feedbackSquare={problem.feedbackSquare}
              feedbackType={problem.feedbackType}
              hintSquares={problem.hintSquares}
              allowAnyColor={p.genre === 'retro' || problem.anyColorAllowed}
            />
          )}
        </div>
      </div>

      {p && (
        <div className="emb-caption">
          <span className="emb-stip">
            {phrase}
            {problem.totalSolutions > 1 && `, ${problem.totalSolutions} solutions`}
          </span>
          <span className="emb-pieces">{pieceCounts(problem.initialFen || p.fen)}</span>
        </div>
      )}

      {p && (
        <div className="emb-bar" ref={barRef}>
          {/* The fullest this row ever gets, drawn out of the flow and never
              seen: five playback buttons, the counter and Try again. The row is
              held at that height from the first moment, so the board gives up
              nothing when Reset appears on the first move, or when the solve is
              decided and the playback controls arrive. Measured rather than
              guessed: how many of these fit on a line depends on the frame. */}
          <div className="emb-bar-ghost" aria-hidden="true">
            <button className="nb-btn emb-nav emb-nav-edge" tabIndex={-1}>|◀</button>
            <button className="nb-btn emb-nav" tabIndex={-1}>◀</button>
            <span className="emb-count">0/0</span>
            <button className="nb-btn emb-nav" tabIndex={-1}>▶</button>
            <button className="nb-btn emb-nav emb-nav-edge" tabIndex={-1}>▶|</button>
            <button className="nb-btn emb-btn" tabIndex={-1}>Try again</button>
            {/* The verdict sits at the far end of the row, so on a narrow frame
                it is pushed onto a second line -- and that line costs the gap
                above it whether anything is written on it or not. Empty here
                on purpose: what the row has to be told about is the wrap, not
                the words, which are not the same length twice. Only when the
                verdict is here at all: with a way out under the board, it goes
                on that line instead (below). */}
            {!verdictBelow && <span className="emb-status" />}
          </div>
          {/* While solving: the three things a solver needs and nothing else. */}
          {problem.status === 'solving' && !problem.waitingForAutoPlay && (
            <>
              {offerHint && (problem.hintSquares ? (
                <button className="nb-btn emb-btn" onClick={problem.hideHint}>Hide hint</button>
              ) : (
                <button className="nb-btn emb-btn" onClick={problem.showHint}>Hint</button>
              ))}
              {problem.moveHistory.length > 0 && (
                <button className="nb-btn emb-btn" onClick={problem.resetProblem}>Reset</button>
              )}
              {offerGiveUp && (
                <button className="nb-btn emb-btn" onClick={problem.showSolution}>Give up</button>
              )}
            </>
          )}

          {/* Once it is decided: step through what was played, or start over.
              The moves are the answer, so they get the acid button. */}
          {decided && (
            <>
              {playback && playback.positions.length > 1 && (
                <>
                  <button className="nb-btn emb-nav emb-nav-edge" onClick={problem.playbackFirst} aria-label="First move">|◀</button>
                  <button className="nb-btn emb-nav" onClick={problem.playbackPrev} aria-label="Previous move">◀</button>
                  <span className="emb-count">
                    {playback.moveIndex + 1}/{playback.positions.length - 1}
                  </span>
                  <button className="nb-btn emb-nav" onClick={problem.playbackNext} aria-label="Next move">▶</button>
                  <button className="nb-btn emb-nav emb-nav-edge" onClick={problem.playbackLast} aria-label="Last move">▶|</button>
                </>
              )}
              <button className="nb-btn nb-btn-key emb-btn" onClick={problem.resetProblem}>Try again</button>
            </>
          )}

          {/* What the board is saying, at the far end of the row: the buttons
              are what a hand goes to, so they take the edge it starts from. */}
          {/* Nothing is said for a solve that was given up: the replay controls
              are already standing there, and a reader looking at them does not
              need the word "Solution" to know what they are looking at. */}
          {!verdictBelow && <span className="emb-status">{verdict}</span>}
        </div>
      )}

      {/* The way out. A problem on the site has a page here already; one
          handed over in the address now gets the same page built from that
          address, which is the only place its variations, its tries and the
          engine can be reached from a frame this size. */}
      {p && verdictBelow && (
        <div className="emb-link-row">
          {/* The verdict, on the left of a line that has room for it: on the
              row of buttons a narrow frame pushed it onto a line of its own,
              held empty from the start, and that line was taken from the
              diagram. One line, cut short rather than wrapped, so that what it
              says can never move the board. */}
          <span className="emb-status emb-status-below" title={verdict || undefined}>{verdict}</span>
          <a className="emb-link" href={siteUrl(p, dailyDate)} target="_blank" rel="noopener noreferrer">
            chessproblem.org ↗
          </a>
        </div>
      )}
      </div>
    </div>
  );
}
