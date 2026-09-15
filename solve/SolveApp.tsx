import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Board } from '../src/components/Board';
import { FeedbackPanel } from '../src/components/FeedbackPanel';
import { composerLine } from '../src/utils/composerName';
import { pieceCounts } from '../src/utils/pieceCount';
import { SolutionTree } from '../src/components/SolutionTree';
import { useProblem } from '../src/hooks/useProblem';
import { useStockfish } from '../src/hooks/useStockfish';
import { useTheme } from '../src/hooks/useTheme';
import { getPromotionForMove } from '../src/services/moveInput';
import { fetchProblem, fetchDailyByDate, metaToChessProblem } from '../src/services/api';
import { isCookedProblem } from '../src/utils/cookMarker';
import type { ChessProblem } from '../src/types';
import { ensureSolution } from '../embed/ensureSolution';
import { BadRequest, problemFromParams, problemIdFromUrl } from '../embed/problemParams';

/* One problem, full size, on a page of its own.

   The board that goes in someone else's page is a place to solve; this is the
   place to read afterwards -- every variation, every try, the engine. It is
   handed its problem the same way the board is, by id or by position and
   Popeye text in the address, so a problem that is in no database still has a
   page somewhere. That is the whole reason this exists: the embedded board
   can send a reader to the site when the problem is the site's, and had
   nowhere at all to send them when it was not.

   Built out of the site's own components rather than beside them -- the same
   card, the same panel, the same solution tree -- so what a solver learns
   here is what they meet on the site. What is missing is everything that
   belongs to an account: rating, history, review, the problem list. There is
   one problem here and no next one. */

/** "September 15". The month is named rather than numbered, because 9/11 and
 *  11/9 are the same day to different readers, and the locale is named rather
 *  than left to the reader's, so the order cannot change under it either. */
function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

/** Today where the reader is, the way the daily page is keyed. */
function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function SolveApp() {
  useTheme();
  const stockfish = useStockfish();
  const stockfishRef = useRef(stockfish);
  stockfishRef.current = stockfish;
  const problem = useProblem(stockfish);

  const [error, setError] = useState<string | null>(null);
  const [dailyDate, setDailyDate] = useState<string | null>(null);
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);

  /* The engine, on the position in front of the solver. It is the site's own
     arrangement: a toggle rather than a one-shot button, because the question
     it answers ("what does Black have here?") is asked of one position after
     another, and re-arming it every time would be a click per move. */
  const [analysisActive, setAnalysisActive] = useState(false);
  const analysisActiveRef = useRef(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analysisArrow, setAnalysisArrow] = useState<[string, string] | null>(null);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const boardWidth = windowWidth < 640
    ? windowWidth
    : Math.min(windowWidth, 672) - (16 + 8);

  const loadProblem = problem.loadProblem;
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const given = params.get('fen');
    const id = problemIdFromUrl(params);
    // Nothing named at all: the site's daily, so the bare address is still a
    // problem worth opening.
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
        setError(err instanceof BadRequest ? err.message
          : date ? 'The daily problem could not be loaded.'
          : `Problem ${id} could not be loaded.`);
      }
    })();
    return () => { cancelled = true; };
  }, [loadProblem]);

  /* The tab carries the problem, because these pages are all the same address
     with a different position in it -- a row of them open at once is
     otherwise a row of identical tabs. */
  const p = problem.problem;
  useEffect(() => {
    if (!p) return;
    const who = p.authors?.length ? ` — ${p.authors[0]}` : '';
    document.title = `${p.stipulation}${who}`;
  }, [p]);

  const handlePieceDrop = useCallback((source: string, target: string, piece: string): boolean => {
    const promotion = getPromotionForMove(problem.fen, source, target, piece);
    return problem.tryMove(source, target, promotion);
  }, [problem]);

  /* Stopping has to take effect here, not only in the effect's cleanup: the
     search in flight can resolve between the state going down and the cleanup
     running, and its answer would be painted onto a board the reader has
     already stopped asking about. */
  const handleAnalyze = useCallback(() => {
    setAnalysisActive(prev => {
      const next = !prev;
      analysisActiveRef.current = next;
      if (!next) {
        stockfishRef.current.stop();
        setAnalyzing(false);
        setAnalysisResult(null);
        setAnalysisArrow(null);
      }
      return next;
    });
  }, []);

  /* Back to solving -- Try again, or a helpmate's next solution -- and the
     engine goes quiet. It is left switched on across a reset otherwise, and
     what it draws on a board being solved again is an arrow along the key. */
  const solving = problem.status === 'solving';
  useEffect(() => {
    if (!solving) return;
    setAnalysisActive(prev => {
      if (!prev) return prev;
      analysisActiveRef.current = false;
      stockfishRef.current.stop();
      return false;
    });
    setAnalyzing(false);
    setAnalysisResult(null);
    setAnalysisArrow(null);
  }, [solving]);

  const fen = problem.fen;
  useEffect(() => {
    if (!analysisActive || !fen) return;
    let cancelled = false;
    setAnalyzing(true);
    setAnalysisResult('Thinking…');
    (async () => {
      try {
        const board = new Chess(fen);
        if (board.moves().length === 0) {
          if (cancelled) return;
          setAnalysisResult(board.isCheckmate() ? 'Checkmate' : board.isStalemate() ? 'Stalemate' : 'No legal moves');
          setAnalysisArrow(null);
          setAnalyzing(false);
          return;
        }
        // Studies turn on ideas a shallow search walks past -- a trapped
        // piece, a fortress -- and their few pieces search fast, so the depth
        // is worth buying there. Mate hunting is already exact at 18.
        const res = await stockfishRef.current.analyze(fen, 18);
        if (cancelled || !analysisActiveRef.current) return;
        if (res) {
          const score = res.mateIn !== null ? `M${res.mateIn}`
            : `${res.eval > 0 ? '+' : ''}${res.eval.toFixed(1)}`;
          setAnalysisResult(`Best: ${res.bestMoveSan} (${score})`);
          setAnalysisArrow([res.bestMove.slice(0, 2), res.bestMove.slice(2, 4)]);
        } else {
          setAnalysisResult('No result');
          setAnalysisArrow(null);
        }
      } catch {
        if (!cancelled) setAnalysisResult('Analysis error');
      } finally {
        if (!cancelled) setAnalyzing(false);
      }
    })();
    return () => { cancelled = true; stockfishRef.current.stop(); };
  }, [fen, analysisActive]);

  const decided = problem.status === 'correct' || problem.status === 'viewing';
  /* The hook already hands back the position the walk is standing on -- and
     the wrong move being held up, and the variation being explored -- as its
     fen, so the board takes that as it stands. */
  const playback = problem.playback;
  /* The engine's move, in the blue the site draws it in -- pale enough to read
     the piece it starts from through. An empty array, never undefined:
     react-chessboard leaves the last arrows it was given on the board when the
     prop goes away. */
  const boardArrows: [string, string, string][] = analysisActive && analysisArrow
    ? [[analysisArrow[0], analysisArrow[1], 'rgba(59, 130, 246, 0.8)']]
    : [];

  if (error) {
    return (
      <div className="sober min-h-dvh">
        <div className="nb-sheet max-w-2xl mx-2 sm:mx-auto my-3 sm:my-5 px-4 py-10">
          <p className="text-center font-semibold text-[var(--ink)]">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sober min-h-dvh">
      <div className="nb-sheet max-w-2xl mx-2 sm:mx-auto my-3 sm:my-5 px-1 pb-10 overflow-hidden">
        {/* No heading over the diagram. "Helpmate" in twenty-point type is the
            arcade announcing which room you are in; here there is one problem
            on the page, and what it asks is printed under the board, where a
            diagram has always carried it. */}
        {dailyDate && (
          <p className="text-sm text-[var(--faint)] px-4 pt-3">Daily — {dayLabel(dailyDate)}</p>
        )}

        <main className="px-1 pt-3">
          {!p ? (
            <p className="text-center py-16 text-[var(--muted)] font-bold">Loading…</p>
          ) : (
            <div className="space-y-3">
              {/* Set the way a diagram's caption is set: what is asked and the
                  material said plainly, no pill round either. The composer
                  keeps out of sight until the solve is decided, as a solving
                  tourney's diagram sheet does. */}
              <div className="px-3 space-y-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap text-sm text-[var(--muted)]">
                  {p.id > 0 && (
                    <span className="tabular-nums">
                      {({ direct: 'D', help: 'H', self: 'S', study: 'E', retro: 'R' } as Record<string, string>)[p.genre] || 'D'}{p.id}
                    </span>
                  )}
                  <span className="font-semibold text-[var(--ink)]">
                    {p.stipulation}{problem.duplex ? ' duplex' : ''}
                  </span>
                  {!problem.duplex && problem.totalSolutions > 1 && (
                    <span>{problem.totalSolutions} solutions</span>
                  )}
                  <span>{pieceCounts(p.fen)}</span>
                </div>
                <div className="min-h-[2.5rem] flex flex-col justify-center">
                  {decided ? (
                    <>
                      <div className="text-base font-semibold text-[var(--ink)] leading-tight break-words">
                        {composerLine(p.authors)}
                      </div>
                      <div className="text-sm text-[var(--faint)] break-words">
                        {p.sourceName}{p.sourceYear ? `, ${p.sourceYear}` : ''}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-[var(--faint)]">Composer and source — shown after the solve</div>
                  )}
                </div>
              </div>

              <div className="sticky top-0 z-10 bg-[var(--surface)] pb-1">
                <div className="flex justify-center -mx-1">
                  <Board
                    key={`${p.id}:${problem.initialFen}`}
                    fen={problem.fen}
                    onPieceDrop={handlePieceDrop}
                    lastMove={problem.lastMove}
                    disabled={problem.waitingForAutoPlay}
                    orientation="white"
                    width={boardWidth}
                    feedbackSquare={problem.feedbackSquare}
                    feedbackType={problem.feedbackType}
                    hintSquares={problem.hintSquares}
                    arrows={boardArrows}
                    allowAnyColor={p.genre === 'retro' || problem.anyColorAllowed}
                  />
                </div>

                {/* Walking the solution, directly under the board, where the
                    site puts it. The keyboard reaches the same four through
                    the solution tree: Home, arrows, End. */}
                {playback && playback.positions.length > 1 && decided && (
                  <div className="flex items-center justify-center">
                    <button
                      onClick={problem.playbackFirst}
                      disabled={playback.moveIndex <= -1 && !playback.exploring}
                      className="nb-icon w-10 h-10"
                      title="First (Home)"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M15.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 010 1.414zm-6 0a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 1.414L5.414 10l4.293 4.293a1 1 0 010 1.414z" />
                      </svg>
                    </button>
                    <button
                      onClick={problem.playbackPrev}
                      disabled={playback.moveIndex <= -1 && !playback.exploring}
                      className="nb-icon w-10 h-10"
                      title="Previous (←)"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <span className="w-16 text-xs text-gray-400 text-center">
                      {playback.exploring ? '?' : playback.moveIndex + 1}/{playback.positions.length - 1}
                    </span>
                    <button
                      onClick={problem.playbackNext}
                      disabled={playback.moveIndex >= playback.positions.length - 2 && !playback.exploring}
                      className="nb-icon w-10 h-10"
                      title="Next (→)"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button
                      onClick={problem.playbackLast}
                      disabled={playback.moveIndex >= playback.positions.length - 2 && !playback.exploring}
                      className="nb-icon w-10 h-10"
                      title="Last (End)"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M4.293 15.707a1 1 0 010-1.414L8.586 10 4.293 5.707a1 1 0 011.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0zm6 0a1 1 0 010-1.414L14.586 10l-4.293-4.293a1 1 0 011.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              <div className="px-3">
                <FeedbackPanel
                  status={problem.status}
                  feedback={problem.feedback}
                  moveHistory={problem.moveHistory}
                  waitingForAutoPlay={problem.waitingForAutoPlay}
                  hintActive={problem.hintSquares !== null}
                  onReset={problem.resetProblem}
                  onShowSolution={problem.showSolution}
                  onShowHint={problem.showHint}
                  onHideHint={problem.hideHint}
                  onAnalyze={handleAnalyze}
                  analyzing={analyzing}
                  analysisResult={analysisResult}
                  analysisActive={analysisActive}
                  stockfishLoading={stockfish.readyState === 'loading'}
                  solutionLoading={!p.solutionText && p.solutionTree.length === 0}
                  solutionsTotal={problem.totalSolutions}
                  solutionsFound={problem.foundSolutionCount}
                  duplex={problem.duplex}
                  blackToMoveFirst={p.genre !== 'help' && (problem.initialFen.split(' ')[1] === 'b')}
                />
              </div>

              {decided && (
                <div className="px-3">
                  <SolutionTree
                    fullNodes={p.fullSolutionTree}
                    initialFen={problem.initialFen}
                    solutionText={p.solutionText}
                    stipulation={p.stipulation}
                    firstColor={(problem.initialFen.split(' ')[1] || 'w') as 'w' | 'b'}
                    duplex={problem.duplex != null}
                    playback={problem.playback}
                    onGoTo={problem.playbackGoTo}
                    onFirst={problem.playbackFirst}
                    onPrev={problem.playbackPrev}
                    onNext={problem.playbackNext}
                    onLast={problem.playbackLast}
                    onExplore={problem.playbackExplore}
                    onShowLine={problem.playbackShowLine}
                    isCooked={isCookedProblem(p.keywords, p.solutionText)}
                    /* A problem out of the database carries YACPDB's text; one
                       handed over in the address carries whatever Popeye
                       printed for the person who pasted it. */
                    notationLabel={p.id > 0 ? undefined : 'Popeye output'}
                  />
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
