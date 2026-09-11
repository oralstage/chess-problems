import { useEffect, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { pieceCountParts } from '../utils/pieceCount';
import type { Category, ChessProblem, ProblemProgress } from '../types';
import { CategoryMark } from './CategoryMark';
import { loadRatedDifficulty, loadRatedProblem as loadRatedProblemSlot } from '../utils/ratedDifficulty';
import type { RatedGenre } from '../services/api';
import { buildRequestUrl, hasLocalAccountData } from '../utils/domainHandoff';
// import { fetchSiteStats, type SiteStats } from '../services/api';


interface ModeSelectorProps {
  onSelectMode: (category: Category) => void;
  progress: Record<string, ProblemProgress>;
  problemCounts: Record<Category, number>;
  dailyProblem: ChessProblem | null;
  dailyProblemRating?: number | null;
  onSolveDaily: () => void;
  dailySolved: boolean;
  onShowGuide?: () => void;
  onShowWcsc?: () => void;
  onShowThemes?: () => void;
  onStartRated?: (genre: RatedGenre, problemId?: number, fromCache?: boolean) => void;
  onStartReview?: () => void;
  reviewDueCount?: number;
  reviewTotalCount?: number;
  /** One rating per pool. The pools are separate games — a number from one says
   *  nothing about another — so all three are shown rather than one total. */
  ratingsByGenre?: Record<RatedGenre, { rating: number; rd: number }>;
}

/* The rated pools, in the order the free-play list already introduces them. The
   mark is the genre's own object with the rating line clipped to its corner, so
   a pool button is recognisably the same object as its free-play row. */
const RATED_POOLS: { genre: RatedGenre; label: string; mark: string; progressKey: string; tint: string }[] = [
  { genre: 'direct', label: 'Direct\u00a0mates ·\u00a0Rated', mark: 'Rated Direct', progressKey: 'direct', tint: '--card-direct' },
  { genre: 'help', label: 'Helpmates ·\u00a0Rated', mark: 'Rated Helpmates', progressKey: 'help', tint: '--card-help' },
  { genre: 'self', label: 'Selfmates ·\u00a0Rated', mark: 'Rated Selfmates', progressKey: 'self', tint: '--card-self' },
];

/* "Direct · Rated" — the genre leads and the qualifier follows, which is the
   form the "?" dialog already uses for its own title. One label at one size,
   the way the free-play tiles set "Direct mate twomovers": split across two
   sizes it stops being a name and becomes a name with a caption stuck on it. */
function PoolRating({ r, className = '' }: { r?: { rating: number; rd: number }; className?: string }) {
  if (!r) return null;
  return (
    /* ~ while the deviation is still wide, on the same threshold FeedbackPanel
       uses, so the two never disagree. */
    <span className={`shrink-0 font-extrabold tabular-nums leading-none text-[var(--ink)] text-xl sm:text-2xl ${className}`}>
      {r.rd > 200 ? '~' : ''}{Math.round(r.rating)}
    </span>
  );
}

// Group categories by their group label


/* One card, used by every tile on this page. */
const CARD =
  'nb-tile nb-shadow-room-sm shadow-[4px_4px_0_var(--ink)] hover:shadow-[4px_4px_0_var(--ink)] ' +
  'flex flex-col items-center gap-1.5 px-2 pt-3 pb-2.5 text-center';
const CARD_TITLE = 'block text-sm sm:text-base font-extrabold leading-tight text-[var(--ink)]';

/* The same tile laid out along its width. Rated Mode spans the whole row, and
   the column layout left two thirds of it as air — mark and title huddled in
   the middle of a card three times the width they were drawn for. */
const CARD_WIDE =
  'nb-tile nb-shadow-room-sm shadow-[4px_4px_0_var(--ink)] hover:shadow-[4px_4px_0_var(--ink)] ' +
  'flex flex-row items-center gap-3 px-4 py-3 text-left';

/* Flat list, in reading order. The name carries the genre — "Twomovers" on
   its own does not say whether it is a direct mate or a helpmate — and the
   stipulation rides on the drawing, in the same move-count colour the badge
   uses on the problem page.

   Every one of these names a set, so its head noun is plural and any qualifier
   in front stays singular, the way "a two-car garage" does: "twomovers",
   "Helpmates in 2", "Selfmates". "Direct mate" is singular in "Direct mate
   twomovers" because there it modifies twomovers — where it is the head noun
   itself, on the pool buttons, it is "Direct mates".

   "Direct" and "mate" are joined by a hard space so the three read alike. Left
   to itself the twomover broke into three lines while its neighbours took two,
   and for a reason that runs backwards: a text box is at least as wide as its
   longest unbreakable word, so "threemovers" (82px) widens its box until
   "Direct mate" (74px) fits on one line, while the shorter "twomovers" (73px)
   leaves the box at the 72px on offer and forces a break after "Direct". The
   odd one out was odd because its last word was too SHORT. */
const FREE_PLAY: { category: Category; title: string; mark: string; stip?: string; stipVar?: string; tint: string }[] = [
  { category: 'twomover', title: 'Direct\u00a0mate twomovers', mark: 'Direct Mates', stip: '#2', stipVar: '--mc-2', tint: '--card-direct' },
  { category: 'threemover', title: 'Direct\u00a0mate threemovers', mark: 'Direct Mates', stip: '#3', stipVar: '--mc-3', tint: '--card-direct' },
  { category: 'moremover', title: 'Direct\u00a0mate moremovers', mark: 'Direct Mates', stip: '#4+', stipVar: '--mc-4', tint: '--card-direct' },
  { category: 'help2', title: 'Helpmates in 2', mark: 'Helpmates', stip: 'h#2', stipVar: '--mc-2', tint: '--card-help' },
  { category: 'help3', title: 'Helpmates in 3', mark: 'Helpmates', stip: 'h#3', stipVar: '--mc-3', tint: '--card-help' },
  { category: 'helpmore', title: 'Helpmates in 4+', mark: 'Helpmates', stip: 'h#4+', stipVar: '--mc-4', tint: '--card-help' },
  { category: 'self', title: 'Selfmates', mark: 'Selfmates', tint: '--card-self' },
  { category: 'study', title: 'Studies', mark: 'Studies', tint: '--card-study' },
  { category: 'retro', title: 'Retros', mark: 'Retros', tint: '--card-retro' },
];

export function ModeSelector({ onSelectMode, dailyProblem, onSolveDaily, dailySolved, onShowGuide, onShowWcsc, onShowThemes, onStartRated, onStartReview, reviewDueCount = 0, reviewTotalCount = 0, ratingsByGenre }: ModeSelectorProps) {
  // const [siteStats, setSiteStats] = useState<SiteStats | null>(null);
  // useEffect(() => {
  //   fetchSiteStats().then(setSiteStats).catch(() => {});
  // }, []);

  // The diagram used to be drawn at a flat 320px inside a card capped at the
  // same number — but the card spends 4px a side on its border and gives up
  // more to whatever padding is around it, so the board ran past the card's
  // content box and overflow-hidden shaved the h-file off. Measure the slot
  // the board actually gets and draw to that.
  const boardSlotRef = useRef<HTMLButtonElement>(null);
  const [dailyBoardSize, setDailyBoardSize] = useState(320);

  useEffect(() => {
    const el = boardSlotRef.current;
    if (!el) return;
    const measure = () => setDailyBoardSize(el.clientWidth || 320);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dailyProblem]);

  /* The notice about the move to this address. localStorage belongs to one
     origin, so someone who played at chess-problems.pages.dev and then follows
     a link straight here — from the WFCC list, say — arrives with nothing: the
     pool cards below read ~800, and the rating they built is not gone but is
     sitting under the old address. That number is the last thing they see
     before they close the tab, so the way back has to be next to it. Shown only
     on a device with no record of its own, which is the same test the handoff
     uses, and taken down for good once dismissed. */
  const [showMovedNotice, setShowMovedNotice] = useState(() => {
    try {
      if (localStorage.getItem('cp-moved-notice-seen') === '1') return false;
    } catch { return false; }
    return !hasLocalAccountData();
  });
  const dismissMovedNotice = () => {
    setShowMovedNotice(false);
    try { localStorage.setItem('cp-moved-notice-seen', '1'); } catch { /* ignore */ }
  };

  const dailyPieces = pieceCountParts(dailyProblem?.fen ?? '');

  /* Resume this pool's own in-progress problem if it still has one, so leaving
     the page and coming back does not throw away the position the player was
     thinking about. */
  const startPool = (pool: typeof RATED_POOLS[number]) => {
    if (!onStartRated) return;
    try {
      const data = loadRatedProblemSlot<{ id: number }>(pool.genre, loadRatedDifficulty(pool.genre));
      if (data) {
        const pid = String(data.id);
        const prog = JSON.parse(localStorage.getItem('cp-progress') || '{}');
        const seen = prog[pool.progressKey]?.[pid];
        if (seen !== 'solved' && seen !== 'failed') {
          onStartRated(pool.genre, data.id, true);
          return;
        }
      }
    } catch { /* fall through to a fresh problem */ }
    onStartRated(pool.genre);
  };


  return (
    <div className="min-h-[80vh] flex flex-col justify-center py-12">
      {/* ── Hero ── */}
      {/* The top padding is reserved for the balloon: it is absolutely
          positioned, so nothing else makes room for it, and it is the only
          object that ever sits in that band. */}
      <div className="px-5 mb-10 pt-[7.5rem] sm:pt-[8.5rem]">
        <div className="flex items-center gap-4 mb-3">
          {/* Redrawn in the same hand as the row marks. What was here was the
              Cburnett king as pure line art at a 1.5 stroke — a precise piece
              of draughting next to fifteen flat-filled drawings, so it read as
              having come from somewhere else.

              Black, not white: it is the one being mated, and "checkmate me"
              cannot be said by the side doing the mating. The two detail lines
              on the crown flip to the surface colour so they still read once
              the body is filled with ink. */}
          <div className="relative shrink-0">
            {/* What the lede used to say, said by the king instead. The old
                copy spent both sentences defining the category — "puzzles with
                one solution, made by a composer, not from a game, 500,000 of
                them" — which is what someone wants AFTER they have been moved
                by one, not on the way in.

                Line two is the one thing a chess player has to un-learn. The
                mate puzzles they have met — beginner books, puzzle apps — are
                check sequences almost without exception, so "mate in 2" reads
                to them as "find the checks", and a quiet key is not merely
                unfamiliar, it is outside the search. A recreational player
                asking exactly this on the chess.com forum ("Is it a Convention
                for Mate in X Puzzles to Start with Check?") had inferred it as
                a rule.

                It is phrased as permission, not as fact. "The check comes
                last" and "it doesn't start with a check" are both false for
                the ~2% of #2s whose key IS a check (measured: 11 of 600); "no
                need to" only ever fails to be needed. "first" keeps it off the
                mating move, which is a check by definition — without it the
                line reads as denying the mate itself. */}
            <span className="nb-speech" aria-hidden="true">
              <svg viewBox="0 0 320 108">
                <path d="M160 4 C248 4 314 20 314 42 C314 64 248 80 160 80 C126 80 96 78 78 75 L30 106 C46 95 52 86 54 74 C26 68 6 57 6 42 C6 20 72 4 160 4 Z" />
              </svg>
              <span>Checkmate me.<br />No need to start with a check.</span>
            </span>
            <svg className="w-14 h-14 sm:w-16 sm:h-16" viewBox="0 0 45 45" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
              {/* Black, because "checkmate me" is said by the side that gets
                  mated, and built the way a black piece is actually built:
                  ink silhouette, interior in cream.

                  Two earlier goes at this failed the same way. The hero used
                  to carry the white king as LINE ART — ink strokes across a
                  cream fill — and filling that with ink swallows every
                  division at once, so the crown collapses into a lump. Cutting
                  valleys into the outline was not enough either; what makes
                  the two curls read is one cream line traced along their INNER
                  edge, which is the same trick the black king on the diagram
                  below uses. Its geometry is the Cburnett king already sitting
                  in public/favicon.svg, redrawn at this page's weights. */}
              <path d="M22.5 11.6V6M20 8h5" strokeWidth="3.2" />
              <path
                d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"
                fill="var(--ink)"
              />
              <path
                d="M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7"
                fill="var(--ink)"
              />
              {/* The inner edge of the curls, and the mitre's own outline. */}
              <path
                d="M32 29.5s8.5-4 6-9.6C34.2 14 25 18 22.5 24.5l0 2.1 0-2.1C20 18 10.9 14 7 19.9c-2.5 5.6 4 9.6 4 9.6"
                stroke="var(--surface)"
                strokeWidth="2.2"
              />
              <path
                d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"
                stroke="var(--surface)"
                strokeWidth="2.2"
              />
              <path
                d="M12.5 30c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0"
                stroke="var(--surface)"
                strokeWidth="2.2"
              />
            </svg>
          </div>
          <h1 className="nb-shadow-type text-4xl sm:text-6xl font-extrabold tracking-tight text-[var(--ink)]">
            Chess Problem Arcade
          </h1>
        </div>
        {/* {siteStats && siteStats.timesSolved > 0 && (
          <div className="flex justify-center items-end gap-6 sm:gap-8 mt-6 flex-wrap">
            <div className="text-center">
              <div className="text-4xl sm:text-5xl font-extrabold text-green-600 dark:text-green-400 tabular-nums leading-none">
                500K+
              </div>
              <div className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-1.5">
                problems
              </div>
            </div>
            <div className="text-center">
              <div className="text-4xl sm:text-5xl font-extrabold text-green-600 dark:text-green-400 tabular-nums leading-none">
                {siteStats.uniqueProblems.toLocaleString()}
              </div>
              <div className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-1.5">
                problems solved
              </div>
            </div>
            <div className="text-center">
              <div className="text-4xl sm:text-5xl font-extrabold text-green-600 dark:text-green-400 tabular-nums leading-none">
                {siteStats.uniqueSolvers.toLocaleString()}
              </div>
              <div className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-1.5">
                by solvers
              </div>
            </div>
            <div className="text-center">
              <div className="text-4xl sm:text-5xl font-extrabold text-green-600 dark:text-green-400 tabular-nums leading-none">
                {siteStats.timesSolved.toLocaleString()}
              </div>
              <div className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-1.5">
                total solves
              </div>
            </div>
          </div>
        )} */}
      </div>

      {/* Above the daily card, which is the first thing on the page. It used to
          sit over the rated pools, on the reasoning that the ~800 printed there
          is what sends this player away — but the pools are below the fold, and
          someone who never scrolls that far never sees the way back at all.
          Held to the daily card's own width so the two read as one column. */}
      {showMovedNotice && (
        <div className="px-5 mb-4">
          <div className="nb-panel flex items-start gap-3 px-3 py-2.5 mx-auto" style={{ maxWidth: 320 }}>
          {/* The button goes to the old address rather than opening Sync.
              Sync asks for a code, which means finding it on the other site
              and carrying it back; this way the old address hands the
              account over by itself and the player is returned here with it
              already applied. One press, nothing to copy. */}
          <p className="text-xs sm:text-sm font-semibold text-[var(--ink)] leading-snug">
            Played at chess-problems.pages.dev before? Your rating, history and
            bookmarks are still yours —{' '}
            <button
              onClick={() => { window.location.href = buildRequestUrl(); }}
              className="underline underline-offset-2 font-extrabold"
            >
              click to bring them over
            </button>.
          </p>
          <button
            onClick={dismissMovedNotice}
            className="nb-icon shrink-0 w-6 h-6 ml-auto"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          </div>
        </div>
      )}

      {/* ── Daily Problem ── */}
      {/* Brought onto the sister site's shape. It used to be a caption floating
          on the check, a board plate, and an ink bar welded under it — three
          objects that happened to be stacked. It is one card now: the label is
          a pill, the stipulation is a heading rather than a line of small
          print in the footer, and Solve is a button instead of coloured text.

          Split into three regions rather than wrapped in one giant button, so
          the heading is a heading and the two pressable parts say what they
          do. */}
      {dailyProblem && (
        <section className="px-5 mb-12" aria-labelledby="daily-problem-heading">
          <div className="nb-card nb-shadow-nudge mx-auto overflow-hidden" style={{ maxWidth: 320 }}>
            <div className="px-4 py-3">
              {/* The number goes above the diagram and the task line below it —
                  the arrangement of the WCSC sheet and of every problem magazine.
                  It sits on the label's line, opposite it, because it is the same
                  kind of thing as the dateline under it: a label saying which problem
                  this is, not part of what the solver has to do.

                  It is also the only thing on this card that leads back to the
                  composition now that the composer waits for the solve. Someone
                  who photographs the card — which is exactly how this started —
                  carries the id away with it. */}
              <div className="flex items-baseline justify-between gap-3">
                <p className="nb-label-key inline-block text-[11px] uppercase tracking-[0.16em] px-3 py-0.5">
                  Today&rsquo;s Problem
                </p>
                <span className="shrink-0 font-mono text-xs font-bold text-[var(--muted)] tabular-nums">
                  D{dailyProblem.id}
                </span>
              </div>
              {/* The date sits on the heading's line rather than under it. It is
                  not a second fact about the problem, it is which day's problem
                  this is — a dateline — and a line of its own gave it the weight
                  of one.

                  The rating is gone. It was the problem's difficulty, while
                  every other figure on this page is the reader's own rating, and
                  two unlike numbers in one column is a worse cost than the
                  little the figure bought: nobody chooses whether to try the
                  daily, so a difficulty they cannot act on only sets a bar to
                  fail at. */}
              <div className="mt-2.5 flex items-baseline justify-between gap-3">
                {/* The notation stands next to its translation, the way the count
                    below does. "#2" on its own under the board is a whole board
                    away from the words that explain it, and the two never meet in
                    one glance; here they are the same phrase. */}
                <h2 id="daily-problem-heading" className="text-2xl font-extrabold tracking-tight text-[var(--ink)]">
                  Mate in {dailyProblem.moveCount}
                  {/* The heading's own size and the heading's own face: shrunk to a
                      footnote it read as something to skip, and set in mono it read
                      as a different object bolted on — mono glyphs are wide, so the
                      three characters came out heavier than the four words they
                      translate. Same face, same size, one weight lighter, and the
                      two halves are one phrase. */}
                  <span className="ml-2 text-2xl font-bold text-[var(--muted)]">({dailyProblem.stipulation})</span>
                </h2>
                <p className="shrink-0 text-xs font-semibold text-[var(--muted)]">
                  {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
            </div>
            <button
              ref={boardSlotRef}
              type="button"
              onClick={onSolveDaily}
              aria-label={`Solve today's mate in ${dailyProblem.moveCount}`}
              className="block w-full border-y-4"
              style={{ borderColor: 'var(--ink)' }}
            >
              <div className="relative shrink-0 overflow-hidden" style={{ width: dailyBoardSize, height: dailyBoardSize }}>
                <Chessboard
                  position={dailyProblem.fen}
                  boardWidth={dailyBoardSize}
                  arePiecesDraggable={false}
                  animationDuration={0}
                  customBoardStyle={{ borderRadius: '0' }}
                  customDarkSquareStyle={{ backgroundColor: 'var(--board-d)' }}
                  customLightSquareStyle={{ backgroundColor: 'var(--board-l)' }}
                />
              </div>
            </button>
            {/* The line a magazine sets under a diagram: the stipulation at the
                left corner, the material count beside it, the button at the right.
                "#2" is read off the heading two lines above, which still says
                "Mate in 2" in words, so the card stands the notation next to its
                translation.

                The count is spelled out here and nowhere else. Tapping Solve opens
                this same problem with "4+3" above the board, so the words the
                reader just saw and the notation they are about to meet carry the
                same two numbers, in the same order, joined by the same plus —
                strike the words and what is left is the notation — a pairing only the daily can
                offer, since every other route into a problem starts from a list
                that shows no words. Whoever wants the count for its real purpose,
                checking they have set the men out correctly, can already read it
                by then.

                No composer, in either state: printing the name here and hiding it
                above the board would hide nothing, since everyone who taps Solve
                has just read it. */}
            <button
              type="button"
              onClick={onSolveDaily}
              className="flex w-full items-center gap-2.5 px-4 pt-2.5 pb-3 text-left"
            >
              <span className="font-mono text-sm font-bold text-[var(--ink)]">{dailyProblem.stipulation}</span>
              {/* Not faint, and the same size as the "#2" it shares the line with.
                  Faint is the site's word for "you can skip this", and this line is
                  here for the one reader who does not know what 4+3 means. */}
              <span className="text-sm font-medium text-[var(--muted)]">
                White {dailyPieces.white} + Black {dailyPieces.black}
              </span>
              <span className="flex-1" />
              <span className="nb-btn nb-btn-key shrink-0 text-sm px-4 py-1">
                {dailySolved ? 'Solved ✓' : 'Solve ›'}
              </span>
            </button>
          </div>
        </section>
      )}

      {/* ── Rated pools ── */}
      {/* No section head. The heading said "Rated", which named the scoring and
          not the thing the section actually does — hand you one without being
          asked. That is the page's default, and a default does not need naming;
          "All problems" below is the marked case, so it is the only one that
          keeps a heading. The rising-line object went with the heading: this
          page draws headings as pill + object, and an object with nothing on
          its left points at nothing. The line survives clipped into each mark.

          Direct is drawn wide and the other two half-size. The three pools are
          peers mechanically — separate ratings, separate matchmaking — but they
          are not peers to arrive at: the direct mate is the front door of the
          whole form and help and self are rooms you reach later. Three equal
          tiles said the opposite, and said it to exactly the person who cannot
          tell. Size says it without spending a word, and takes nothing away
          from anyone who already knows where they are going. */}
      {onStartRated && (
        /* Held to the daily card's width and centred under it. The two are the
           same offer at different cadences — one chosen for you today, one
           chosen for you whenever you ask — so they read as one column of
           things that arrive rather than two unrelated blocks. */
        <div className="px-4 mb-12">
          {/* The heading is back. Without it each tile had to introduce itself
              and the short names could not do it — "Help" on its own reads as a
              support link, not as a helpmate. The names are the full ones now,
              the same words the free-play tiles use, and the heading says the
              one thing a name cannot: that this is the row you do not have to
              choose from. Full width, so its pill starts on the same margin as
              "All problems" below rather than inset to the daily card's. */}
          <div className="nb-section-head">
            <h2>For you</h2>
            <span className="nb-heading-object" style={{ width: '3.2rem', height: '3rem', transform: 'translateY(-50%) rotate(-5deg)' }} aria-hidden="true">
              {/* The parcel, which is what this heading always had. The rising
                  line replaced it while the section was called "Rated" and was
                  about the number; called "For you" it is about the giving, and
                  the line has gone back to being what it is on the tiles — the
                  mark of a pool that scores you. */}
              <svg viewBox="0 0 44 44" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
                <rect x="4" y="17" width="36" height="22" rx="3" fill="var(--surface)" />
                <rect x="2" y="12" width="40" height="8" rx="2.5" fill="var(--board-d)" />
                <path d="M22 12v27" strokeWidth="3.4" />
                <path d="M22 12c-5 0-9-2-9-5s5-4 9 5c4-7 9-8 9-5s-4 5-9 5z" fill="var(--board-d)" />
              </svg>
            </span>
          </div>
          {/* Three across, all the same size. Drawing direct big and the other
              two small was tried and put back: the pools are peers — separate
              ratings, separate matchmaking — and sizing one of them up made the
              row an opinion about which genre matters rather than a set of
              three doors. */}
          <div className="grid grid-cols-3 gap-2.5">
            {RATED_POOLS.map(pool => (
              <button
                key={pool.genre}
                onClick={() => startPool(pool)}
                className={CARD}
                style={{ backgroundColor: `var(${pool.tint})` }}
              >
                <span className="block w-14 h-14 mx-auto" aria-hidden="true">
                  <CategoryMark name={pool.mark} />
                </span>
                <span className={CARD_TITLE}>{pool.label}</span>
                <PoolRating r={ratingsByGenre?.[pool.genre]} />
              </button>
            ))}
          </div>

          {/* Hidden until there is a queue: on a first visit it was half the
              section and could not be pressed. Full width under the pools — it
              draws from all three, so it does not belong beside any one. */}
          {reviewTotalCount > 0 && (
            <button
              onClick={onStartReview}
              disabled={reviewDueCount === 0}
              className={`${CARD_WIDE} mt-2.5 w-full disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <span className="block w-12 h-12 shrink-0" aria-hidden="true"><CategoryMark name="Review Mode" /></span>
              <span className={CARD_TITLE}>Review Mode</span>
              {reviewDueCount > 0 && (
                <span className="ml-auto shrink-0 font-extrabold tabular-nums leading-none text-[var(--ink)] text-xl sm:text-2xl">
                  {reviewDueCount}
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {/* ── Special: the current featured page (WCSC for now). When there is
          more than one, this section grows into an archive of past features. ── */}
      {onShowWcsc && (
        <>
          <div className="px-4 mb-2">
            <div className="nb-section-head">
              <h2>Special</h2>
              <span className="nb-heading-object" style={{ width: '3.2rem', height: '3rem', transform: 'translateY(-50%) rotate(7deg)' }} aria-hidden="true">
                <svg viewBox="0 0 44 44" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round">
                  <path d="M14 7h16v10a8 8 0 0 1-16 0z" fill="var(--acid)" />
                  <path d="M14 10h-4a5 5 0 0 0 5 7M30 10h4a5 5 0 0 1-5 7" />
                  <path d="M19 31h6v4h-6zM15 35h14v4H15z" fill="var(--surface)" />
                  <path d="M22 25v6" />
                </svg>
              </span>
            </div>
          </div>
          <div className="px-4 mb-6">
            <button
              type="button"
              onClick={onShowWcsc}
              className="nb-tile nb-shadow-room-sm shadow-[4px_4px_0_var(--ink)] hover:shadow-[4px_4px_0_var(--ink)] w-full text-left px-4 py-4 flex items-center gap-4"
              style={{ backgroundColor: 'var(--acid)' }}
            >
              <span className="text-4xl" aria-hidden="true">🏆</span>
              {/* Just the name — no card on this page explains itself. */}
              <span className="flex-1 min-w-0 font-extrabold text-lg text-[var(--ink)]">WCSC 2026</span>
            </button>
          </div>
        </>
      )}

      {/* ── Free Play ── */}
      <div className="px-4 mb-2">
        <div className="nb-section-head">
          <h2>All problems</h2>
          <span className="nb-heading-object" style={{ width: '3.8rem', height: '3.4rem', transform: 'translateY(-50%) rotate(6deg)' }} aria-hidden="true">
            <svg viewBox="0 0 54 48" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round">
              <rect x="3" y="14" width="32" height="32" rx="4" fill="var(--surface-2)" transform="rotate(-9 19 30)" />
              <rect x="12" y="7" width="34" height="34" rx="4" fill="var(--surface)" />
              <path d="M12 24h34M29 7v34" />
              <rect x="12" y="7" width="17" height="17" fill="var(--board-d)" stroke="none" />
              <rect x="29" y="24" width="17" height="17" fill="var(--board-d)" stroke="none" />
              <rect x="12" y="7" width="34" height="34" rx="4" />
            </svg>
          </span>
        </div>
      </div>

      {/* Flat, three across. The accordion is gone: opening "Direct Mates"
          only ever led to picking a move count, so that level was a step for
          nothing. Counts are gone too — the number of problems in a category
          does not help anyone choose one. */}
      <nav className="grid grid-cols-3 gap-2.5 px-4">
        {FREE_PLAY.map(item => (
          <button
            key={item.category}
            onClick={() => onSelectMode(item.category)}
            className={CARD}
            style={{
              backgroundColor: `var(${item.tint})`,
              ...(item.stipVar ? { ['--stip-bg' as string]: `var(${item.stipVar})` } : {}),
            } as React.CSSProperties}
          >
            <span className="block w-14 h-14 mx-auto" aria-hidden="true">
              <CategoryMark name={item.mark} stip={item.stip} />
            </span>
            <span className={CARD_TITLE}>{item.title}</span>
          </button>
        ))}

        {/* Sister site — same card, but it leaves. */}
        <a
          href="https://fairy.chessproblem.org"
          target="_blank"
          rel="noopener noreferrer"
          className={CARD}
          style={{ backgroundColor: 'var(--card-fairy)' }}
        >
          <span className="block w-14 h-14 mx-auto" aria-hidden="true"><CategoryMark name="Fairy Chess" /></span>
          <span className={CARD_TITLE}>Fairy Chess</span>
        </a>
      </nav>

      {/* ── Guide ── */}
      <div className="px-4 mt-6 mb-2">
        <div className="nb-section-head">
          <h2>Guide</h2>
          <span className="nb-heading-object" style={{ width: '3.4rem', height: '3rem', transform: 'translateY(-50%) rotate(-6deg)' }} aria-hidden="true">
            <svg viewBox="0 0 44 44" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round">
              <circle cx="22" cy="22" r="17" fill="var(--surface)" />
              <path d="M29 15l-4.5 11.5L13 31l4.5-11.5z" fill="var(--board-d)" />
              <circle cx="22" cy="22" r="2.6" fill="var(--ink)" stroke="none" />
            </svg>
          </span>
        </div>
      </div>

      {/* Cards like the others. The banner they replace carried a sentence of
          sell, which nothing else on this page does.

          Same colour for both, because they are the same kind of thing; the
          flag and the language of the label are what separate them. The
          Japanese one is a different book, not a translation — it comes at the
          two-mover from shogi — so it gets its own card rather than a link
          tucked inside the English one.

          Neither says "for beginners" any more. The guide card beside them is
          where a beginner starts, and it is free and on the site; these are for
          someone who has read that and wants to go on studying. Labelled as
          beginners' books they were competing with the card next to them for
          the same reader, and losing — a stranger will not buy a book to learn
          something the page offers to explain. */}
      <div className="grid grid-cols-3 gap-2.5 px-4">
        {/* First, and the only one of the three that stays on the site: the rules
            with a worked example per genre. This is the card that carries "For
            beginners" — a beginner's first stop should be the free page that
            explains the rules, not a book. The two beside it took that label
            while nothing else on the page offered an explanation; now they say
            what they actually are, the next step after this one. */}
        {onShowGuide && (
          <button type="button" onClick={onShowGuide} className={CARD} style={{ backgroundColor: 'var(--card-self)' }}>
            <span className="block w-14 h-14 mx-auto" aria-hidden="true"><CategoryMark name="Guide" /></span>
            <span className={CARD_TITLE}>For beginners</span>
          </button>
        )}
        {/* Theme walkthroughs — what a problem's tags mean, shown on a real example. */}
        {onShowThemes && (
          <button type="button" onClick={onShowThemes} className={CARD} style={{ backgroundColor: 'var(--card-self)' }}>
            {/* A lightbulb: the page's own definition is "a theme is the idea a
                problem is built around". (Not CategoryMark "Tag" — that shape
                reads as the gift tag on the "For you" heading — and not a
                crossing-lines board, which was one theme's drawing, not the
                concept's.) */}
            <span className="block w-14 h-14 mx-auto" aria-hidden="true">
              <svg viewBox="0 0 56 56" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
                <path d="M28 7a14 14 0 0 1 8 25.5c-2 1.5-2.5 3-2.5 5h-11c0-2-.5-3.5-2.5-5A14 14 0 0 1 28 7z" fill="var(--acid)" />
                <path d="M23.5 42.5h9M25 47h6" />
                <path d="M24 20l4 5 4-5" fill="none" />
              </svg>
            </span>
            <span className={CARD_TITLE}>Themes</span>
          </button>
        )}
        <a
          href="https://www.amazon.com/dp/B0GV27N3RM"
          target="_blank"
          rel="noopener noreferrer"
          className={CARD}
          style={{ backgroundColor: 'var(--card-self)' }}
        >
          <span className="block w-14 h-14 mx-auto" aria-hidden="true"><CategoryMark name="Book" /></span>
          <span className={CARD_TITLE}>Go deeper</span>
        </a>
        <a
          href="https://www.amazon.co.jp/dp/B0GV2B3FQD"
          target="_blank"
          rel="noopener noreferrer"
          className={CARD}
          style={{ backgroundColor: 'var(--card-self)' }}
        >
          <span className="block w-14 h-14 mx-auto" aria-hidden="true"><CategoryMark name="Book JP" /></span>
          <span className={CARD_TITLE}>さらに詳しく</span>
        </a>
      </div>

      {/* ── For composers ── */}
      {/* Last of the sections, and the only one not addressed to a solver: the
          people who make these things. It sits below the Guide because the
          audience is the narrowest on the page — put anywhere higher, every
          solver has to step over it to reach what they came for.

          The heading object is a stave with one note. The field borrows its
          words from music — composer, composition, key, theme, variation —
          so a written score is what "composer" looks like here, and the
          stave is what keeps a bare note from reading as a sound toggle.
          The lines are ink: --board-d was tried first and vanished, because
          the page's ground IS that green, and every other object gets away
          with green only as a fill inside an ink outline. */}
      <div className="px-4 mt-6 mb-2">
        <div className="nb-section-head">
          <h2>For composers</h2>
          <span className="nb-heading-object" style={{ width: '3.5rem', height: '2.75rem', transform: 'translateY(-50%) rotate(-4deg)' }} aria-hidden="true">
            {/* Drawn, not the ♪ character: Safari renders some of those as
                emoji glyphs, where colour and transform stop applying. */}
            <svg viewBox="0 0 56 44" fill="none" stroke="var(--ink)" strokeLinecap="round" strokeLinejoin="round">
              <g strokeWidth="2"><path d="M2 14h52M2 22h52M2 30h52" /></g>
              <path d="M31.6 22V5" strokeWidth="3.2" />
              <path d="M31.6 5.5c8 1.5 11 6 9.5 12" strokeWidth="3.4" />
              {/* Head on the middle line, so lines run above and below it and
                  the mark reads as a note in a stave rather than one sitting
                  on a rule. No outline on the head — at this size a 3px
                  stroke eats a 10px ellipse and leaves a blob. */}
              <ellipse cx="25" cy="22" rx="7" ry="5.4" transform="rotate(-20 25 22)" fill="var(--ink)" stroke="none" />
            </svg>
          </span>
        </div>
      </div>

      {/* Same card as everywhere else, and it leaves — the sister site's tile
          set the form for that. One card in the three-column grid, so it is
          the width of every other tile instead of a banner. */}
      <div className="grid grid-cols-3 gap-2.5 px-4">
        <a
          href="https://similar.chessproblem.org"
          target="_blank"
          rel="noopener noreferrer"
          className={CARD}
          style={{ backgroundColor: 'var(--card-help)' }}
        >
          <span className="block w-14 h-14 mx-auto" aria-hidden="true"><CategoryMark name="Similar problems" /></span>
          <span className={CARD_TITLE}>Similar problems</span>
        </a>
      </div>

      {/* ── Footer ── */}
      <footer className="text-center mt-16 px-4 space-y-1">
        <div className="flex items-center justify-center gap-3">
          <a href="/about" className="nb-btn px-4 py-1.5 text-sm">
            About
          </a>
          <a
            href="https://ushiyutvj.pages.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="nb-btn inline-flex items-center gap-2 pl-1.5 pr-4 py-1.5 text-sm"
          >
            <img src="/ushiyutvj.jpg" width={22} height={22} alt="" loading="lazy" className="w-[22px] h-[22px] rounded-full border-2 border-[var(--ink)]" />
            <span>Made by Ushiyutvj</span>
          </a>
        </div>
        {/* One line of links, not four sentences. The privacy notice lives on
            /about#privacy and the third-party licences on /licenses, so the
            footer only has to point at them. */}
        <p className="text-[11px] font-semibold text-[var(--muted)] mt-5 px-4">
          © {new Date().getFullYear() > 2026 ? `2026–${new Date().getFullYear()}` : '2026'} Ushiyutvj
          {' · '}Problems from{' '}
          <a
            href="https://www.yacpdb.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-2 underline-offset-2 text-[var(--ink)] font-bold"
          >
            YACPDB
          </a>
          {' · '}
          <a href="/licenses" className="underline decoration-2 underline-offset-2 text-[var(--ink)] font-bold">
            Licences
          </a>
          {' · '}
          <a href="/about#privacy" className="underline decoration-2 underline-offset-2 text-[var(--ink)] font-bold">
            Privacy
          </a>
        </p>
      </footer>
    </div>
  );
}
