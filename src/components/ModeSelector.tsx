import { Chessboard } from 'react-chessboard';
import type { Category, ChessProblem, ProblemProgress } from '../types';
import { CategoryMark } from './CategoryMark';
import { loadRatedDifficulty, loadRatedProblem as loadRatedProblemSlot } from '../utils/ratedDifficulty';
import { difficultyToRating } from '../utils/glicko2';
// import { fetchSiteStats, type SiteStats } from '../services/api';


interface ModeSelectorProps {
  onSelectMode: (category: Category) => void;
  progress: Record<string, ProblemProgress>;
  problemCounts: Record<Category, number>;
  dailyProblem: ChessProblem | null;
  dailyProblemRating?: number | null;
  onSolveDaily: () => void;
  dailySolved: boolean;
  onShowChangelog?: () => void;
  onStartRated?: (problemId?: number, fromCache?: boolean) => void;
  onStartReview?: () => void;
  reviewDueCount?: number;
  reviewTotalCount?: number;
  playerRating?: number;
  playerRd?: number;
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
   uses on the problem page. */
const FREE_PLAY: { category: Category; title: string; mark: string; stip?: string; stipVar?: string; tint: string }[] = [
  { category: 'twomover', title: 'Direct mate twomovers', mark: 'Direct Mates', stip: '#2', stipVar: '--mc-2', tint: '--card-direct' },
  { category: 'threemover', title: 'Direct mate threemovers', mark: 'Direct Mates', stip: '#3', stipVar: '--mc-3', tint: '--card-direct' },
  { category: 'moremover', title: 'Direct mate moremovers', mark: 'Direct Mates', stip: '#4+', stipVar: '--mc-4', tint: '--card-direct' },
  { category: 'help2', title: 'Helpmate in 2', mark: 'Helpmates', stip: 'h#2', stipVar: '--mc-2', tint: '--card-help' },
  { category: 'help3', title: 'Helpmate in 3', mark: 'Helpmates', stip: 'h#3', stipVar: '--mc-3', tint: '--card-help' },
  { category: 'helpmore', title: 'Helpmate in 4+', mark: 'Helpmates', stip: 'h#4+', stipVar: '--mc-4', tint: '--card-help' },
  { category: 'self', title: 'Selfmates', mark: 'Selfmates', tint: '--card-self' },
  { category: 'study', title: 'Studies', mark: 'Studies', tint: '--card-study' },
  { category: 'retro', title: 'Retros', mark: 'Retros', tint: '--card-retro' },
];

export function ModeSelector({ onSelectMode, dailyProblem, dailyProblemRating, onSolveDaily, dailySolved, onShowChangelog, onStartRated, onStartReview, reviewDueCount = 0, reviewTotalCount = 0, playerRating, playerRd }: ModeSelectorProps) {
  // const [siteStats, setSiteStats] = useState<SiteStats | null>(null);
  // useEffect(() => {
  //   fetchSiteStats().then(setSiteStats).catch(() => {});
  // }, []);

  const displayedDailyRating = dailyProblem
    ? Math.round((dailyProblemRating ?? difficultyToRating(
        dailyProblem.difficultyScore,
        dailyProblem.moveCount,
        dailyProblem.pieceCount,
      )) / 50) * 50
    : null;


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
            Chess Problems
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

      {/* ── Daily Problem ── */}
      {dailyProblem && (
        <div className="px-5 mb-8">
          <div className="flex flex-col items-center">
          <button
            onClick={onSolveDaily}
            className="group w-auto max-w-full text-left transition-colors"
          >
            <div className="flex flex-col items-center">
              <div className="nb-shadow-type text-sm font-extrabold uppercase tracking-[0.16em] text-[var(--ink)] mb-3">
                Daily Problem — {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <div className="nb-daily">
              <div className="relative shrink-0 overflow-hidden" style={{ width: 320, height: 320 }}>
                <Chessboard
                  position={dailyProblem.fen}
                  boardWidth={320}
                  arePiecesDraggable={false}
                  animationDuration={0}
                  customBoardStyle={{ borderRadius: '0' }}
                  customDarkSquareStyle={{ backgroundColor: 'var(--board-d)' }}
                  customLightSquareStyle={{ backgroundColor: 'var(--board-l)' }}
                />
              </div>
              <div className="flex items-center justify-between w-[320px] bg-[var(--ink)] px-3 py-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-1.5 text-sm text-white min-w-0">
                    <span className="font-bold shrink-0">Mate in {dailyProblem.moveCount}</span>
                    {displayedDailyRating != null && (
                      <>
                        <span className="text-gray-500 shrink-0">·</span>
                        <span className="text-gray-200 font-semibold shrink-0">Rating ~{displayedDailyRating}</span>
                      </>
                    )}
                  </div>
                  <span className="text-gray-400 text-xs truncate">
                    {dailyProblem.authors[0] || 'Unknown'}
                    {dailyProblem.sourceYear ? `, ${dailyProblem.sourceYear}` : ''}
                  </span>
                </div>
                {dailySolved ? (
                  <span className="text-xs font-extrabold shrink-0 text-[var(--acid)]">Solved ✓</span>
                ) : (
                  <span className="text-xs font-extrabold shrink-0 text-[var(--acid)]">Solve ›</span>
                )}
              </div>
              </div>
            </div>
          </button>
          </div>
        </div>
      )}


      {/* ── Rated Play ── */}
      {onStartRated && (
        <div className="px-4 mb-6">
          <div className="nb-section-head">
            <h2>For you</h2>
            <span className="nb-heading-object" style={{ width: '3.2rem', height: '3rem', transform: 'translateY(-50%) rotate(-5deg)' }} aria-hidden="true">
              <svg viewBox="0 0 44 44" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
                <rect x="4" y="17" width="36" height="22" rx="3" fill="var(--surface)" />
                <rect x="2" y="12" width="40" height="8" rx="2.5" fill="var(--board-d)" />
                <path d="M22 12v27" strokeWidth="3.4" />
                <path d="M22 12c-5 0-9-2-9-5s5-4 9 5c4-7 9-8 9-5s-4 5-9 5z" fill="var(--board-d)" />
              </svg>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <button
              onClick={() => {
                try {
                  const data = loadRatedProblemSlot<{ id: number }>(loadRatedDifficulty());
                  if (data) {
                    const pid = String(data.id);
                    const prog = JSON.parse(localStorage.getItem('cp-progress') || '{}');
                    if (prog.direct?.[pid] !== 'solved' && prog.direct?.[pid] !== 'failed') {
                      onStartRated(data.id, true);
                      return;
                    }
                  }
                } catch {}
                onStartRated();
              }}
              className={`${reviewTotalCount > 0 ? `${CARD} col-span-2` : `${CARD_WIDE} col-span-3`}`}
              /* The board's own light square, and a 4px edge where every other
                 card on the page has 2px.

                 White read as unfinished here — nine cards carry a tint and the
                 one the site most wants pressed carried none. But the answer is
                 not a louder colour: a seventh tint reads as a seventh genre,
                 ink was harsh, and the amber family is ruled out outright
                 because the rising line inside the mark IS --acid and would
                 vanish into the card. So the emphasis is carried by the BUILD
                 instead — 4px is the weight this design gives big containers,
                 and it says "different kind of object" without spending a
                 colour at all. */
              style={{ backgroundColor: 'var(--board-l)', borderWidth: '4px' }}
            >
              {/* Two layouts, because this card has two widths. Along the row
                  when it owns the row; back to the column when Review Mode
                  takes a third of it — at 375px that leaves 199px, and the row
                  layout overflows its own card by 9px there once the rating
                  reaches four digits and carries a ~. */}
              <span
                className={`block shrink-0 ${reviewTotalCount > 0 ? 'w-14 h-14 mx-auto' : 'w-14 h-14 sm:w-16 sm:h-16'}`}
                aria-hidden="true"
              >
                <CategoryMark name="Rated Mode" />
              </span>
              <span className={CARD_TITLE}>Rated Mode</span>
              {/* The section is called "For you" and had nothing of yours in
                  it. The rating is the one number that is, and it is what the
                  rising line in the mark was drawing without ever naming.

                  ~ while the deviation is still wide, on the same threshold
                  FeedbackPanel uses, so the two never disagree. No label:
                  nothing else on this page explains itself either. */}
              {playerRating != null && (
                <span
                  className={`shrink-0 font-extrabold tabular-nums leading-none text-[var(--ink)] ${
                    reviewTotalCount > 0 ? 'text-xl sm:text-2xl' : 'ml-auto text-2xl sm:text-4xl'
                  }`}
                >
                  {(playerRd ?? 350) > 200 ? '~' : ''}{Math.round(playerRating)}
                </span>
              )}
            </button>

            {/* Hidden until there is a queue: on a first visit it was half the
                section and could not be pressed. */}
            {reviewTotalCount > 0 && (
              <button
                onClick={onStartReview}
                disabled={reviewDueCount === 0}
                className={`${CARD} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <span className="block w-14 h-14 mx-auto" aria-hidden="true"><CategoryMark name="Review Mode" /></span>
                <span className={CARD_TITLE}>Review Mode</span>
              </button>
            )}
          </div>
        </div>
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
          href="https://fairy-chess-problems.pages.dev"
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
          tucked inside the English one. */}
      <div className="grid grid-cols-3 gap-2.5 px-4">
        <a
          href="https://www.amazon.com/dp/B0GV27N3RM"
          target="_blank"
          rel="noopener noreferrer"
          className={CARD}
          style={{ backgroundColor: 'var(--card-self)' }}
        >
          <span className="block w-14 h-14 mx-auto" aria-hidden="true"><CategoryMark name="Book" /></span>
          <span className={CARD_TITLE}>For beginners</span>
        </a>
        <a
          href="https://www.amazon.co.jp/dp/B0GV2B3FQD"
          target="_blank"
          rel="noopener noreferrer"
          className={CARD}
          style={{ backgroundColor: 'var(--card-self)' }}
        >
          <span className="block w-14 h-14 mx-auto" aria-hidden="true"><CategoryMark name="Book JP" /></span>
          <span className={CARD_TITLE}>はじめての方へ</span>
        </a>
      </div>

      {/* ── Footer ── */}
      <footer className="text-center mt-16 px-4 space-y-1">
        <div className="flex items-center justify-center gap-3">
          {onShowChangelog && (
            <button
              onClick={onShowChangelog}
              className="nb-btn px-4 py-1.5 text-sm"
            >
              What's new
            </button>
          )}
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
        {/* Two lines, not one paragraph: where the problems come from and what
            the site records are unrelated facts, and running them together made
            the provenance read as part of the privacy notice. */}
        <p className="text-[11px] font-semibold text-[var(--muted)] mt-5 px-4">
          Problems from the{' '}
          <a
            href="https://www.yacpdb.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-2 underline-offset-2 text-[var(--ink)] font-bold"
          >
            YACPDB
          </a>{' '}
          archive.
        </p>
        <p className="text-[11px] font-semibold text-[var(--muted)] mt-1 px-4">
          Anonymous usage data is collected to improve the site. No personal information is stored.
        </p>
      </footer>
    </div>
  );
}
