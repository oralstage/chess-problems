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

export function ModeSelector({ onSelectMode, dailyProblem, dailyProblemRating, onSolveDaily, dailySolved, onShowChangelog, onStartRated, onStartReview, reviewDueCount = 0, reviewTotalCount = 0 }: ModeSelectorProps) {
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
      <div className="px-5 mb-10">
        <div className="flex items-center gap-4 mb-3">
          {/* Redrawn in the same hand as the row marks. What was here was the
              Cburnett king as pure line art at a 1.5 stroke — a precise piece
              of draughting next to fifteen flat-filled drawings, so it read as
              having come from somewhere else. */}
          <svg className="w-14 h-14 sm:w-16 sm:h-16" viewBox="0 0 44 44" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
            <path d="M22 3v9M17.5 7.5h9" strokeWidth="3.4" />
            <path d="M22 27c0 0 5-7.5 3.4-11C25.4 16 24.2 13.5 22 13.5s-3.4 2.5-3.4 2.5C17 19.5 22 27 22 27z" fill="var(--surface)" />
            <path d="M11 38c6.5 3 15.5 3 22 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4v3.5-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5z" fill="var(--surface)" />
            <path d="M11 31c6-3 15-3 22 0M11 34.5c6-3 15-3 22 0" strokeWidth="2.4" />
          </svg>
          <h1 className="nb-shadow-type text-4xl sm:text-6xl font-extrabold tracking-tight text-[var(--ink)]">
            Chess Problems
          </h1>
        </div>
        <p className="nb-plate nb-shadow-room text-base text-[var(--muted)] leading-relaxed px-4 py-3 font-medium">
          Chess problems are checkmate puzzles with unique solutions — composed works of art, not tactics from games.
          Solve over 500,000 problems interactively from{' '}
          <a href="https://www.yacpdb.org" target="_blank" rel="noopener noreferrer" className="underline decoration-2 underline-offset-2 font-bold text-[var(--ink)]">
            YACPDB
          </a> database.
        </p>
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
              className={`${CARD} ${reviewTotalCount > 0 ? 'col-span-2' : 'col-span-3'}`}
            >
              <span className="block w-14 h-14 mx-auto" aria-hidden="true"><CategoryMark name="Rated Mode" /></span>
              <span className={CARD_TITLE}>Rated Mode</span>
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

      {/* One card like the others. The banner it replaces carried a sentence of
          sell, which nothing else on this page does. */}
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
        <p className="text-[11px] font-semibold text-[var(--muted)] mt-5 px-4">
          Anonymous usage data is collected to improve the site. No personal information is stored.
        </p>
      </footer>
    </div>
  );
}
