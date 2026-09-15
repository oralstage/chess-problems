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
import { BadRequest, problemFromParams, problemIdFromUrl } from './problemParams';

/* Said once, above the diagram, and only until the solve is decided. A
   diagram is a picture to most of the people who will meet one on somebody
   else's page, and a picture is not something you reach for -- so the board
   says that it can be played rather than waiting to be found out. Worded as
   an invitation to solve: the alternative is that the first thing a reader
   learns about the board is that it has a Give up button on it. */
const INVITE = 'Solve by moving pieces on the board';

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
      const availableW = Math.max(0, rootEl.clientWidth - padX);
      const availableH = Math.max(0, rootEl.clientHeight - padY);

      // Before anything is measured, because every line's height is downstream
      // of it. The frame is what it reads, so this does not feed back.
      rootEl.style.setProperty('--emb-text', `${textSizeFor(rootEl.clientWidth, rootEl.clientHeight)}px`);

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
        if (barEl) barEl.style.minHeight = ghost ? `${Math.ceil(ghost.getBoundingClientRect().height)}px` : '';
        // The lines above the diagram are held at their fullest in the same
        // way: the day, which stays, plus whichever of the invitation and the
        // credit is taller -- those two are never on the page together. So
        // neither the credit nor its arriving can move the board.
        const headEl = head.current;
        const headGhost = headEl?.firstElementChild as HTMLElement | null;
        if (headEl) {
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
        size = Math.max(MIN_BOARD, fits(availableW));
        blockWidth = availableW;
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

export function EmbedApp({ variant = 'arcade' }: { variant?: EmbedVariant } = {}) {
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

  const p = problem.problem;
  const playback = problem.playback;
  const decided = problem.status === 'correct' || problem.status === 'viewing';
  const phrase = p ? stipulationPhrase(p.stipulation, p.genre, p.moveCount) : '';

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
     words mean something, and a domain is a name they can type. */

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
          <div className="emb-head-swap">
            <div>
              {dailyDate && <div className="emb-date">Daily — {dayLabel(dailyDate)}</div>}
              <div className="emb-invite">{INVITE}</div>
            </div>
            <div className="emb-credit">{credit}</div>
          </div>
        </div>
        {decided ? (
          <div className="emb-credit">{credit}</div>
        ) : (
          <>
            {dailyDate && <div className="emb-date">Daily — {dayLabel(dailyDate)}</div>}
            {p && <div className="emb-invite">{INVITE}</div>}
          </>
        )}
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
            <button className="nb-btn emb-nav" tabIndex={-1}>|◀</button>
            <button className="nb-btn emb-nav" tabIndex={-1}>◀</button>
            <span className="emb-count">0/0</span>
            <button className="nb-btn emb-nav" tabIndex={-1}>▶</button>
            <button className="nb-btn emb-nav" tabIndex={-1}>▶|</button>
            <button className="nb-btn emb-btn" tabIndex={-1}>Try again</button>
            {/* The verdict sits at the far end of the row, so on a narrow frame
                it is pushed onto a second line -- and that line costs the gap
                above it whether anything is written on it or not. Empty here
                on purpose: what the row has to be told about is the wrap, not
                the words, which are not the same length twice. */}
            <span className="emb-status" />
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
                  <button className="nb-btn emb-nav" onClick={problem.playbackFirst} aria-label="First move">|◀</button>
                  <button className="nb-btn emb-nav" onClick={problem.playbackPrev} aria-label="Previous move">◀</button>
                  <span className="emb-count">
                    {playback.moveIndex + 1}/{playback.positions.length - 1}
                  </span>
                  <button className="nb-btn emb-nav" onClick={problem.playbackNext} aria-label="Next move">▶</button>
                  <button className="nb-btn emb-nav" onClick={problem.playbackLast} aria-label="Last move">▶|</button>
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
          <span className="emb-status">
            {problem.status === 'correct' ? 'Solved!'
              : problem.status === 'viewing' ? ''
              : problem.totalSolutions > 1
                ? `Found ${problem.foundSolutionCount}/${problem.totalSolutions}. ${problem.feedback}`
                : problem.feedback}
          </span>
        </div>
      )}

      {/* The way out. A problem on the site has a page here already; one
          handed over in the address now gets the same page built from that
          address, which is the only place its variations, its tries and the
          engine can be reached from a frame this size. */}
      {p && (p.id > 0 ? variant === 'arcade' : true) && (
        <div className="emb-link-row">
          <a className="emb-link" href={siteUrl(p, dailyDate)} target="_blank" rel="noopener noreferrer">
            Open on chessproblem.org ↗
          </a>
        </div>
      )}
      </div>
    </div>
  );
}
