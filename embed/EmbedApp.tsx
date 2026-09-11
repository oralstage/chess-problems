import { useCallback, useEffect, useRef, useState } from 'react';
import { Board } from '../src/components/Board';
import { useProblem } from '../src/hooks/useProblem';
import { getPromotionForMove } from '../src/services/moveInput';
import { fetchProblem, metaToChessProblem } from '../src/services/api';
import { pieceCounts } from '../src/utils/pieceCount';
import { stipulationPhrase } from '../src/utils/stipulationColor';
import { composerLine } from '../src/utils/composerName';
import { CATEGORY_DEFS } from '../src/types';
import type { ChessProblem } from '../src/types';
import { ensureSolution } from './ensureSolution';

/* Shown when the host page names no problem. A two-mover, so that an embed
   pasted in without parameters is still a problem someone can solve. */
const FALLBACK_ID = 3684;

function problemIdFromUrl(): number {
  const raw = new URLSearchParams(window.location.search).get('id');
  const id = raw ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 ? id : FALLBACK_ID;
}

/* The same problem on the site it came from. The origin is the one serving
   the embed, so a staging embed points at staging and the live one at the
   live site without either being written down. The category slug comes off
   CATEGORY_DEFS rather than a second copy of the move-count ranges; a move
   count in no category (a #1) falls back to the bare genre slug, which the
   app also accepts. */
function siteUrl(p: ChessProblem): string {
  const def = CATEGORY_DEFS.find(d => d.genre === p.genre
    && (d.minMoves == null || p.moveCount >= d.minMoves)
    && (d.maxMoves == null || d.maxMoves === 0 || p.moveCount <= d.maxMoves));
  return `${window.location.origin}/#/${def?.category ?? p.genre}/yacpdb/${p.id}`;
}

/* How big the diagram can be: the width it is given, or the height left once
   the lines around it have taken theirs, whichever is smaller.

   The board is then that square exactly, and the lines are set to its width,
   so the whole thing is one block with the stipulation and the material count
   sitting on the board's own edges. Slack goes outside that block -- above and
   below it -- rather than opening a gap between the diagram and its caption,
   which is what made a tall frame look stretched.

   Measured from the frame and the lines rather than from the board, so that
   the board's own size can never feed back into the number. The 2px deadband
   is for the one place it still could: a credit line that wraps differently at
   the new width would otherwise be able to trade places with itself forever. */
function useBoardSize(
  root: React.RefObject<HTMLDivElement | null>,
  stack: React.RefObject<HTMLDivElement | null>,
  slot: React.RefObject<HTMLDivElement | null>,
): number {
  const [size, setSize] = useState(0);

  useEffect(() => {
    const rootEl = root.current, stackEl = stack.current, slotEl = slot.current;
    if (!rootEl || !stackEl || !slotEl) return;

    const measure = () => {
      const rootStyle = getComputedStyle(rootEl);
      const padX = parseFloat(rootStyle.paddingLeft) + parseFloat(rootStyle.paddingRight);
      const padY = parseFloat(rootStyle.paddingTop) + parseFloat(rootStyle.paddingBottom);
      // Everything in the block that is not the board, gaps and all, taken as
      // one figure: it stays the same when the board's own box changes, so the
      // number the board is given can never chase itself.
      const lines = stackEl.getBoundingClientRect().height - slotEl.getBoundingClientRect().height;
      const availableW = rootEl.clientWidth - padX;
      const availableH = rootEl.clientHeight - padY - lines;
      const next = Math.max(0, Math.floor(Math.min(availableW, availableH)));
      setSize(prev => (Math.abs(prev - next) < 2 ? prev : next));
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
  }, [root, stack, slot]);

  return size;
}

export function EmbedApp() {
  const problem = useProblem();
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const boardSize = useBoardSize(rootRef, stackRef, slotRef);

  const loadProblem = problem.loadProblem;
  useEffect(() => {
    const id = problemIdFromUrl();
    let cancelled = false;
    (async () => {
      try {
        const full = await fetchProblem(id);
        const ready = await ensureSolution(metaToChessProblem(full, full.solutionText));
        if (!cancelled) loadProblem(ready);
      } catch {
        if (!cancelled) setError(`Problem ${id} could not be loaded.`);
      }
    })();
    return () => { cancelled = true; };
  }, [loadProblem]);

  const handlePieceDrop = useCallback((source: string, target: string, piece: string): boolean => {
    const promotion = getPromotionForMove(problem.fen, source, target, piece);
    return problem.tryMove(source, target, promotion);
  }, [problem]);

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
     by it. */

  /* A printed diagram carries the composer above it and the stipulation with
     the material count below. The credit is held back until the solve is
     decided, as a solving tourney's diagram sheet does -- the line keeps its
     height either way so the board does not jump when the name arrives. */
  const credit = p ? [composerLine(p.authors), [p.sourceName, p.sourceYear].filter(Boolean).join(', ')]
    .filter(Boolean).join(' — ') : '';

  return (
    <div className="emb-root" ref={rootRef}>
      <div className="emb-stack" ref={stackRef} style={boardSize ? { width: boardSize } : undefined}>
      <div className="emb-credit">{decided ? credit : ''}</div>

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
        <div className="emb-bar">
          {/* While solving: the three things a solver needs and nothing else. */}
          {problem.status === 'solving' && !problem.waitingForAutoPlay && (
            <>
              {problem.hintSquares ? (
                <button className="nb-btn emb-btn" onClick={problem.hideHint}>Hide hint</button>
              ) : (
                <button className="nb-btn emb-btn" onClick={problem.showHint}>Hint</button>
              )}
              {problem.moveHistory.length > 0 && (
                <button className="nb-btn emb-btn" onClick={problem.resetProblem}>Reset</button>
              )}
              <button className="nb-btn emb-btn" onClick={problem.showSolution}>Give up</button>
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
          <span className="emb-status">
            {problem.status === 'correct' ? 'Solved!'
              : problem.status === 'viewing' ? 'Solution'
              : problem.totalSolutions > 1
                ? `Found ${problem.foundSolutionCount}/${problem.totalSolutions}. ${problem.feedback}`
                : problem.feedback}
          </span>
        </div>
      )}

      <div className="emb-link-row">
        {p && (
          <a className="emb-link" href={siteUrl(p)} target="_blank" rel="noopener noreferrer">
            Open on Chess Problem Arcade ↗
          </a>
        )}
      </div>
      </div>
    </div>
  );
}
