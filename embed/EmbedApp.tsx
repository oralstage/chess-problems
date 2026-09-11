import { useCallback, useEffect, useRef, useState } from 'react';
import { Board } from '../src/components/Board';
import { useProblem } from '../src/hooks/useProblem';
import { getPromotionForMove } from '../src/services/moveInput';
import { fetchProblem, metaToChessProblem } from '../src/services/api';
import { pieceCounts } from '../src/utils/pieceCount';
import { stipulationPhrase } from '../src/utils/stipulationColor';
import { composerLine } from '../src/utils/composerName';
import { ensureSolution } from './ensureSolution';

/* Shown when the host page names no problem. A two-mover, so that an embed
   pasted in without parameters is still a problem someone can solve. */
const FALLBACK_ID = 3684;

function problemIdFromUrl(): number {
  const raw = new URLSearchParams(window.location.search).get('id');
  const id = raw ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 ? id : FALLBACK_ID;
}

/** The side of the largest square that fits the box, tracked as it resizes. */
function useSquareSize(ref: React.RefObject<HTMLDivElement | null>): number {
  const [size, setSize] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize(Math.floor(Math.min(el.clientWidth, el.clientHeight)));
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export function EmbedApp() {
  const problem = useProblem();
  const [error, setError] = useState<string | null>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const boardSize = useSquareSize(slotRef);

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

  /* A printed diagram carries the composer above it and the stipulation with
     the material count below. The credit is held back until the solve is
     decided, as a solving tourney's diagram sheet does -- the line keeps its
     height either way so the board does not jump when the name arrives. */
  const credit = p ? [composerLine(p.authors), [p.sourceName, p.sourceYear].filter(Boolean).join(', ')]
    .filter(Boolean).join(' — ') : '';

  return (
    <div className="emb-root">
      <div className="emb-credit">{decided ? credit : ''}</div>

      <div className="emb-slot" ref={slotRef}>
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
          <span className="emb-status">
            {problem.status === 'correct' ? 'Solved!'
              : problem.status === 'viewing' ? 'Solution'
              : problem.totalSolutions > 1
                ? `Found ${problem.foundSolutionCount}/${problem.totalSolutions}. ${problem.feedback}`
                : problem.feedback}
          </span>

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
        </div>
      )}
    </div>
  );
}
