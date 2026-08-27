import { useEffect, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { analyzeMateEconomy, mateMarks } from '../utils/themeInsight';
import { Arrow } from './ThemeInsightCard';

/* Theme walkthroughs, easiest first: Battery and Zugzwang (the everyday
   solving tools), Switchback and Cross-check (one-move wit), the
   crossing-square family (Grimshaw, Novotny, Plachutta), the phase themes
   (Changed mates, Allumwandlung), then Model/Ideal mates. Every claim on
   this page is anchored to a concrete problem and its published solution,
   with every diagrammed position verified by chess.js — no generated
   analysis. */

interface ThemeGuidePageProps {
  onClose: () => void;
  /** Open the worked example on the real board. */
  onOpenProblem: (id: number) => void;
}

const LAST_MOVE_FROM = { backgroundColor: 'rgba(255, 255, 0, 0.3)' };
const CORRECT_TO = { backgroundColor: 'rgba(34, 197, 94, 0.5)' };
const TICK = 20;

/* Same measured board as GuidePage's — a fixed width overflows either the
   phone column or the desktop one. */
interface GuideArrow { from: string; to: string }

function Board({ fen, move, marks, arrows }: { fen: string; move?: { from: string; to: string }; marks?: Record<string, React.CSSProperties>; arrows?: GuideArrow[] }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(260);

  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const measure = () => setSize(el.clientWidth || 260);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={slotRef} className="nb-card overflow-hidden p-0">
      <div className="relative" style={{ width: size, height: size }}>
        <Chessboard
          position={fen}
          boardWidth={size}
          arePiecesDraggable={false}
          animationDuration={0}
          customBoardStyle={{ borderRadius: '0' }}
          customDarkSquareStyle={{ backgroundColor: 'var(--board-d)' }}
          customLightSquareStyle={{ backgroundColor: 'var(--board-l)' }}
          customSquareStyles={{ ...(marks || {}), ...(move ? { [move.from]: LAST_MOVE_FROM, [move.to]: CORRECT_TO } : {}) }}
        />
        {arrows && arrows.length > 0 && (
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 40 }}
            viewBox="0 0 100 100"
          >
            {arrows.map((a, i) => (
              <Arrow
                key={i}
                from={a.from}
                to={a.to}
                nudge={arrows.some(b => b.from === a.to && b.to === a.from) ? 2.1 : 0}
              />
            ))}
          </svg>
        )}
        {move && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: Math.min((move.to.charCodeAt(0) - 97 + 1) * (size / 8) - 10, size - TICK),
              top: Math.max((8 - Number(move.to[1])) * (size / 8) + 2, 0),
              zIndex: 50,
            }}
          >
            <div className="w-5 h-5 rounded-full bg-green-500 border-2 border-white shadow flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Diagram({ fen, move, marks, arrows, caption }: { fen: string; move?: { from: string; to: string }; marks?: Record<string, React.CSSProperties>; arrows?: GuideArrow[]; caption: React.ReactNode }) {
  return (
    <figure className="my-5 mx-auto w-full max-w-[280px]">
      <Board fen={fen} move={move} marks={marks} arrows={arrows} />
      <figcaption className="mt-2 text-center text-xs font-semibold leading-snug text-[var(--muted)]">
        {caption}
      </figcaption>
    </figure>
  );
}

const H2 = 'text-xl font-extrabold tracking-tight text-[var(--ink)] mb-1';
const SUB = 'text-sm font-extrabold text-[var(--muted)] mb-3';
const P = 'text-sm leading-relaxed text-[var(--ink)] mb-3';
const MOVE = 'font-extrabold';

/* Fredrik Storm, Dagbladet (Oslo) 1956, 1st Prize (YACPDB 683282).
   Positions below are the diagram, the position after the key, and the two
   Grimshaw mates - each verified against the published solution with chess.js. */
const EX = {
  id: 683282,
  diagram: '5R2/1N6/8/7r/4k3/3R4/1B2K2b/8 w - - 0 1',
  afterKey: '5R2/1N4B1/8/7r/4k3/3R4/4K2b/8 b - - 1 1',
  rookBlock: '5R2/6B1/3N4/4r3/4k3/3R4/4K2b/8 b - - 2 2',
  bishopBlock: '5R2/6B1/8/2N1b2r/4k3/3R4/4K3/8 b - - 2 2',
};

/* Otto Strerath, Schach-Express 1950, 1st Prize (YACPDB 24502) — a perfect
   Novotny. Same verification: every position checked with chess.js against
   the published solution, including that the "wrong" mate fails in each line. */
const NV = {
  id: 24502,
  diagram: '5B2/3b4/2r5/4k3/2pN4/5Q2/3R4/4K3 w - - 0 1',
  afterKey: '5B2/3b4/2r1N3/4k3/2p5/5Q2/3R4/4K3 b - - 1 1',
  rookTakes: '5B2/3b4/4r3/3Rk3/2p5/5Q2/8/4K3 b - - 2 2',
  bishopTakes: '8/6B1/2r1b3/4k3/2p5/5Q2/3R4/4K3 b - - 2 2',
};

/* André Chéron, Le Temps 1930 (YACPDB 86802) — a reciprocal Plachutta on e5
   with the two black bishops. */
const PL = {
  id: 86802,
  diagram: '4k3/8/4K3/8/1R5R/8/1b5b/4Q3 w - - 0 1',
  afterKey: '4k3/8/4K3/4Q3/1R5R/8/1b5b/8 b - - 1 1',
  lineAFinal: '1R2k2R/8/4K3/8/8/8/7b/8 b - - 1 3',
  lineBFinal: '1R2k2b/8/4K3/8/8/8/1b6/8 b - - 1 3',
};

/* Ernest Kahane, Le Salut Public 1929, 1st Prize (YACPDB 11786) — a double
   royal battery: the white king masks both the rook's file and the bishop's
   diagonal, and two of the three mates are king moves. */
const BT = {
  id: 11786,
  diagram: '3N4/8/N7/4k3/7Q/8/2K5/1B1R4 w - - 0 1',
  afterKey: '3N4/8/N7/4k3/7Q/3K4/8/1B1R4 b - - 1 1',
  rookFire: '3N4/8/N2k4/8/4K2Q/8/8/1B1R4 b - - 3 2',
  bishopFire: '3N4/8/N7/5k2/3K3Q/8/8/1B1R4 b - - 3 2',
};

/* Виталий Коваленко, На смену! 1996, 2nd Prize (YACPDB 156446) — a pure
   waiting-move key; both natural queen tries refuted (chess.js confirms no
   white mate exists after either refutation). */
const ZZ = {
  id: 156446,
  diagram: '8/8/8/1p6/kp6/N2Q4/3B4/4K3 w - - 0 1',
  afterKey: '8/8/8/1p6/kp6/N2Q4/8/2B1K3 b - - 1 1',
  mateFinal: '8/8/8/1p6/k7/Q7/8/2B1K3 b - - 0 2',
};

/* Konrad Erlinger, Шахматный журнал 1894, 1st Prize (YACPDB 87922) — five
   pieces, and the main line ends in an ideal mate: each of the five squares
   in the king's field guarded exactly once, one guard per white piece. */
const MD = {
  id: 87922,
  diagram: '8/1B1R4/1kN5/8/8/1K6/8/8 w - - 0 1',
  afterKey: '8/1B1RN3/1k6/8/8/1K6/8/8 b - - 1 1',
  mateFinal: '2N5/1B6/8/k2R4/8/1K6/8/8 b - - 5 3',
};

/* "Who guards what" in the ideal-mate diagram is computed, not hand-marked:
   the same verifier the post-solve theme cards use — each field square wears
   the symbol of its one guard, and the guard wears the matching badge. */
const MD_MARKS = (() => {
  const a = analyzeMateEconomy(MD.mateFinal);
  return a ? mateMarks(a) : {};
})();

/* Miroslav Havel, Moravskoslezský deník 1922 (YACPDB 51411) — the bishop
   leaves e1 with the key and mates from e1 two moves later. All positions
   replayed with chess.js: 1.Bd2 Nxh7 2.Bg4+ Kh4 3.Be1#. */
const SW = {
  id: 51411,
  diagram: '3b4/6RR/7p/5Bnk/8/8/8/4BK2 w - - 0 1',
  afterKey: '3b4/6RR/7p/5Bnk/8/8/3B4/5K2 b - - 1 1',
  mateFinal: '3b4/6Rn/7p/8/6Bk/8/8/4BK2 b - - 3 3',
};

/* Leo Valve, Szachy 1949 (YACPDB 26486) — 1...Rd3+ answered by 2.Nd2#, an
   interposition that blocks one check and delivers a double check back.
   Verified with chess.js: 1.Qg1 Rd3+ 2.Nd2#. */
const CC = {
  id: 26486,
  diagram: '2R2B2/1p6/2b5/P3Rp2/2k5/1N2rP2/BPn1P3/3K1Q2 w - - 0 1',
  mateFinal: '2R2B2/1p6/2b5/P3Rp2/2k5/3r1P2/BPnNP3/3K2Q1 b - - 3 2',
};

/* Vasyl Diachuk, StrateGems 2001 (YACPDB 209395) — try 1.Qg1? and key 1.Qg4!
   both threaten 2.Qd4#, and 1...Ke5 gets a different mate in each phase.
   Both mates replayed to checkmate with chess.js. */
const CM = {
  id: 209395,
  diagram: '2N5/2pb3r/4p1QR/N2k1P2/8/P1P2K2/8/8 w - - 0 1',
  tryMate: '2N5/2pb3r/4p2R/N1Q1kP2/8/P1P2K2/8/8 b - - 3 2',
  keyMate: '2N5/2pb3r/4p2R/N3kP2/4Q3/P1P2K2/8/8 b - - 3 2',
};

/* Vitaly Kovalenko, Shakhmatnaya kompozitsiya 1998 (YACPDB 344258) — four
   twins of one position, and the b7-pawn must promote to a different piece
   in each. All four key lines replayed to checkmate with chess.js. */
const AW = {
  id: 344258,
  diagram: 'K7/1P6/2k2B2/5Q2/8/8/8/8 w - - 0 1',
  afterKeyA: 'KN6/8/2k2B2/5Q2/8/8/8/8 b - - 0 1',
};

export function ThemeGuidePage({ onClose, onOpenProblem }: ThemeGuidePageProps) {
  /* The walkthrough is one long spoiler. It stays folded until asked for, so
     the diagram can be studied as a problem first. */
  const [revealed, setRevealed] = useState(false);
  const [revealedNv, setRevealedNv] = useState(false);
  const [revealedPl, setRevealedPl] = useState(false);
  const [revealedBt, setRevealedBt] = useState(false);
  const [revealedZz, setRevealedZz] = useState(false);
  const [revealedMd, setRevealedMd] = useState(false);
  const [revealedSw, setRevealedSw] = useState(false);
  const [revealedCc, setRevealedCc] = useState(false);
  const [revealedCm, setRevealedCm] = useState(false);
  const [revealedAw, setRevealedAw] = useState(false);
  return (
    <div className="nb-ground fixed inset-0 z-50 flex flex-col overflow-hidden">
      {/* Same skeleton as GuidePage: title on the ground, the reading matter
          on a cream sheet — long text straight on the green ground was hard
          to read. */}
      <div className="flex-1 flex flex-col p-4 max-w-2xl mx-auto w-full min-h-0">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h2 className="nb-shadow-type text-2xl font-extrabold tracking-tight text-[var(--ink)]">
            Themes
          </h2>
          <button onClick={onClose} className="nb-disc" aria-label="Close">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="nb-sheet nb-shadow-room flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-10 sm:px-5">
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 mb-4">
            A theme is the idea a problem is built around. Knowing the common
            ones changes how you solve: instead of trying every move, you look
            for the idea. Ten themes, from the everyday tools to the pure
            aesthetics.
          </p>

          <h2 className={H2}>Battery</h2>
          <div className={SUB}>A gun loaded on a line — moving the front piece fires it</div>

          <p className={P}>
            A battery is{' '}
            <strong>two pieces of the same colour on one line: a rook, bishop
            or queen behind, any piece in front. When the front piece moves,
            the rear piece's attack is uncovered</strong> — check arrives from
            a piece that didn't move, while the front piece is free to do a
            second job on the way. When you solve, watch the piece{' '}
            <em>behind</em>, not the piece that moves.
          </p>
          <p className={P}>
            If you know the word from over-the-board chess — queen and bishop
            doubled on a diagonal, aiming together — note that the problem
            term is different:{' '}
            <strong>here the front piece blocks its own rear piece, and the
            battery "fires" by discovery</strong>. A problem battery is the
            machinery of the discovered check, kept loaded until it's needed.
          </p>

          <Diagram
            fen={BT.diagram}
            caption={<>Ernest Kahane, Le Salut Public 1929, 1st Prize
              <span className="mx-1.5 text-[var(--faint)]">·</span>
              <span className="font-extrabold text-[var(--ink)]">#2</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>White to move</>}
          />

          <div className="flex justify-center gap-2 flex-wrap -mt-2 mb-5">
            <button onClick={() => onOpenProblem(BT.id)} className="nb-btn nb-btn-key px-4 py-1.5 text-sm font-bold">
              Try it yourself →
            </button>
            {!revealedBt && (
              <button onClick={() => setRevealedBt(true)} className="nb-btn px-4 py-1.5 text-sm font-bold">
                Show the solution
              </button>
            )}
          </div>

          {revealedBt && <>
          <p className={P}>
            Seven pieces, and the key is the quietest move imaginable:{' '}
            <span className={MOVE}>1.Kd3!</span> The king steps onto the
            rook's file while staying on the bishop's diagonal —{' '}
            <strong>one front piece now masks two rear pieces at once</strong>.
            No threat at all; but Black must move, and every king move fires a
            battery.
          </p>

          <Diagram
            fen={BT.afterKey}
            move={{ from: 'c2', to: 'd3' }}
            marks={{
              d1: { backgroundColor: 'rgba(59, 130, 246, 0.4)' },
              b1: { backgroundColor: 'rgba(59, 130, 246, 0.4)' },
            }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1.Kd3!</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>The king masks both the rook and the bishop (blue)</>}
          />

          <p className={P}>
            <span className={MOVE}>1...Kd6 2.Ke4#</span> — the king steps
            aside and <strong>the d1-rook's file opens</strong>: check from a
            piece that never moved, while the king's own step covers d5 and e5.
          </p>

          <Diagram
            fen={BT.rookFire}
            move={{ from: 'd3', to: 'e4' }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1...Kd6 2.Ke4#</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>The rook battery fires</>}
          />

          <p className={P}>
            <span className={MOVE}>1...Kf5 2.Kd4#</span> — the same king step
            in another direction opens{' '}
            <strong>the b1-bishop's diagonal</strong> instead. (The third
            defense, <span className={MOVE}>1...Kd5</span>, is met by the
            plain <span className={MOVE}>2.Qd4#</span>.) Over 20,000 problems
            carry a battery tag — whenever you see a line piece parked behind
            a friend, ask what its quietest step would uncover.
          </p>

          <Diagram
            fen={BT.bishopFire}
            move={{ from: 'd3', to: 'd4' }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1...Kf5 2.Kd4#</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>The bishop battery fires</>}
          />
          </>}

          <h2 className={`${H2} mt-8`}>Zugzwang</h2>
          <div className={SUB}>No threat at all — Black loses because he must move</div>

          <p className={P}>
            Most keys threaten something. A zugzwang problem threatens{' '}
            <em>nothing</em>:{' '}
            <strong>if Black could pass, he would be perfectly safe — but
            chess has no passing, and every legal move breaks his own
            position</strong>. A key like this is called a{' '}
            <em>waiting move</em>: it changes as little as possible and simply
            hands the turn over.
          </p>

          <Diagram
            fen={ZZ.diagram}
            caption={<>Vitaly Kovalenko, Na smenu! 1996, 2nd Prize
              <span className="mx-1.5 text-[var(--faint)]">·</span>
              <span className="font-extrabold text-[var(--ink)]">#2</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>White to move</>}
          />

          <div className="flex justify-center gap-2 flex-wrap -mt-2 mb-5">
            <button onClick={() => onOpenProblem(ZZ.id)} className="nb-btn nb-btn-key px-4 py-1.5 text-sm font-bold">
              Try it yourself →
            </button>
            {!revealedZz && (
              <button onClick={() => setRevealedZz(true)} className="nb-btn px-4 py-1.5 text-sm font-bold">
                Show the solution
              </button>
            )}
          </div>

          {revealedZz && <>
          <p className={P}>
            Black has only three moves: <span className={MOVE}>Ka5</span>,{' '}
            <span className={MOVE}>b3</span> and{' '}
            <span className={MOVE}>bxa3</span> — and each already walks into a
            mate. White's whole task is to{' '}
            <strong>find a move that keeps all three answers intact</strong>.
            The natural queen moves fail: after{' '}
            <span className={MOVE}>1.Qf3?</span> Black escapes with{' '}
            <span className={MOVE}>1...Ka5!</span>, and after{' '}
            <span className={MOVE}>1.Qe3?</span> with{' '}
            <span className={MOVE}>1...bxa3!</span>
          </p>

          <p className={P}>
            The key is the humblest move on the board:{' '}
            <span className={MOVE}>1.Bc1!</span> It attacks nothing and
            threatens nothing — it only steps back, keeps every guard in
            place, and passes the turn.
          </p>

          <Diagram
            fen={ZZ.afterKey}
            move={{ from: 'd2', to: 'c1' }}
            marks={{
              a5: { backgroundColor: 'rgba(255, 176, 32, 0.55)' },
              b3: { backgroundColor: 'rgba(255, 176, 32, 0.55)' },
              a3: { backgroundColor: 'rgba(255, 176, 32, 0.55)' },
            }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1.Bc1!</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>A pure waiting move — every square Black can move to (amber) loses</>}
          />

          <p className={P}>
            <span className={MOVE}>1...Ka5 2.Qxb5#</span>,{' '}
            <span className={MOVE}>1...b3 2.Qxb5#</span>, and{' '}
            <span className={MOVE}>1...bxa3 2.Qxa3#</span> — where the modest
            retreat shows its one hidden point: from c1 the bishop supports
            the queen's capture on a3.
          </p>

          <Diagram
            fen={ZZ.mateFinal}
            move={{ from: 'd3', to: 'a3' }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1...bxa3 2.Qxa3#</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>Backed by the bishop on c1</>}
          />

          <p className={P}>
            <strong>When a twomover seems to have no good threat, stop looking
            for aggression</strong> — count Black's moves. If each one has an
            answer, the key is whichever quiet move keeps it that way.
          </p>
          </>}

          <h2 className={`${H2} mt-8`}>Switchback</h2>
          <div className={SUB}>A piece leaves its square — and comes back to mate from it</div>

          <p className={P}>
            A switchback is{' '}
            <strong>a piece that leaves a square, does its work elsewhere, and
            returns to exactly the square it started from</strong>. The return
            is not a repetition: the position has changed in between, and the
            second visit means something the first never could.
          </p>

          <Diagram
            fen={SW.diagram}
            caption={<>Miroslav Havel, Moravskoslezský deník 1922
              <span className="mx-1.5 text-[var(--faint)]">·</span>
              <span className="font-extrabold text-[var(--ink)]">#3</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>White to move</>}
          />

          <div className="flex justify-center gap-2 flex-wrap -mt-2 mb-5">
            <button onClick={() => onOpenProblem(SW.id)} className="nb-btn nb-btn-key px-4 py-1.5 text-sm font-bold">
              Try it yourself →
            </button>
            {!revealedSw && (
              <button onClick={() => setRevealedSw(true)} className="nb-btn px-4 py-1.5 text-sm font-bold">
                Show the solution
              </button>
            )}
          </div>

          {revealedSw && <>
          <p className={P}>
            The key is <span className={MOVE}>1.Bd2!</span> — the dark-squared
            bishop steps off e1 and threatens{' '}
            <span className={MOVE}>2.Rxh6+ Kxh6 3.Rh7#</span>. Black defends
            with <span className={MOVE}>1...Nxh7</span>, removing a rook. Now{' '}
            <span className={MOVE}>2.Bg4+</span> drives the king down,{' '}
            <span className={MOVE}>2...Kh4</span> — and{' '}
            <span className={MOVE}>3.Be1#</span>:{' '}
            <strong>the bishop mates from e1, the very square it left on move
            one</strong>. From e1 it hits h4 — but on move one there was no
            king on h4 to hit. The journey out made the threat; the journey
            home is the mate.
          </p>

          <Diagram
            fen={SW.mateFinal}
            marks={{
              e1: { backgroundColor: 'rgba(255, 176, 32, 0.55)' },
              d2: { backgroundColor: 'rgba(59, 130, 246, 0.4)' },
            }}
            arrows={[{ from: 'e1', to: 'd2' }, { from: 'd2', to: 'e1' }]}
            caption={<><span className="font-extrabold text-[var(--ink)]">3.Be1#</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>Out to d2 (blue), home to e1 (amber)</>}
          />

          <p className={P}>
            Switchbacks read as wit:{' '}
            <strong>the piece that seemed to abandon its post proves the post
            was the point all along</strong>. When a key retreats or sidesteps
            for no visible reason, ask whether it means to come back.
          </p>
          </>}

          <h2 className={`${H2} mt-8`}>Cross-check</h2>
          <div className={SUB}>Black checks — and the answer is a mating check</div>

          <p className={P}>
            A cross-check is{' '}
            <strong>a check answered by a check</strong>: Black defends by
            checking the white king, and White's reply deals with that check
            and delivers one of its own — often mate on the spot. A key that
            invites checks against its own king looks like a blunder, which is
            exactly why composers prize the theme.
          </p>

          <Diagram
            fen={CC.diagram}
            caption={<>Leo Valve, Szachy 1949
              <span className="mx-1.5 text-[var(--faint)]">·</span>
              <span className="font-extrabold text-[var(--ink)]">#2</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>White to move</>}
          />

          <div className="flex justify-center gap-2 flex-wrap -mt-2 mb-5">
            <button onClick={() => onOpenProblem(CC.id)} className="nb-btn nb-btn-key px-4 py-1.5 text-sm font-bold">
              Try it yourself →
            </button>
            {!revealedCc && (
              <button onClick={() => setRevealedCc(true)} className="nb-btn px-4 py-1.5 text-sm font-bold">
                Show the solution
              </button>
            )}
          </div>

          {revealedCc && <>
          <p className={P}>
            The key <span className={MOVE}>1.Qg1!</span> threatens{' '}
            <span className={MOVE}>2.Qg8#</span> and leaves e3 to the black
            rook. The sharpest defence is{' '}
            <span className={MOVE}>1...Rd3+</span> — a check to the white
            king. The answer is <span className={MOVE}>2.Nd2#</span>:{' '}
            <strong>one knight move blocks the rook's check, gives check
            itself, and opens the a2-bishop's diagonal</strong> — a double
            check, and mate.
          </p>

          <Diagram
            fen={CC.mateFinal}
            move={{ from: 'b3', to: 'd2' }}
            marks={{
              d2: { backgroundColor: 'rgba(59, 130, 246, 0.4)' },
              a2: { backgroundColor: 'rgba(59, 130, 246, 0.4)' },
              d3: { backgroundColor: 'rgba(110, 110, 110, 0.5)' },
            }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1...Rd3+ 2.Nd2#</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>Knight and bishop check (blue); the rook is walled off (grey)</>}
          />

          <p className={P}>
            A reply to a check has its hands full — it must save its own king
            first — which makes a <em>mating</em> reply the hardest kind to
            arrange. <strong>When a defence gives check in a problem tagged
            cross-check, look for the interposition or discovery that turns
            the tables in one move.</strong>
          </p>
          </>}

          <h2 className={`${H2} mt-8`}>Grimshaw</h2>
          <div className={SUB}>Two black pieces trip over each other on one square</div>

          <p className={P}>
            A Grimshaw is this situation:{' '}
            <strong>two black pieces — typically a rook and a bishop — can each
            defend by moving to the same square, but whichever one goes there
            blocks the other one's line</strong>. Every defense creates a new
            weakness, and the composer has arranged a different mate to punish
            each. (Named after Walter Grimshaw, a 19th-century English
            composer.)
          </p>

          <Diagram
            fen={EX.diagram}
            caption={<>Fredrik Storm, Dagbladet (Oslo) 1956, 1st Prize
              <span className="mx-1.5 text-[var(--faint)]">·</span>
              <span className="font-extrabold text-[var(--ink)]">#2</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>White to move</>}
          />

          {/* Everything below this line is spoilers, so it stays hidden until
              asked for — solve on the board, or read the idea. */}
          <div className="flex justify-center gap-2 flex-wrap -mt-2 mb-5">
            <button onClick={() => onOpenProblem(EX.id)} className="nb-btn nb-btn-key px-4 py-1.5 text-sm font-bold">
              Try it yourself →
            </button>
            {!revealed && (
              <button onClick={() => setRevealed(true)} className="nb-btn px-4 py-1.5 text-sm font-bold">
                Show the solution
              </button>
            )}
          </div>

          {revealed && <>
          <p className={P}>
            Before any moves, find the actors:{' '}
            <strong>the black rook on h5 and the black bishop on h2</strong>.
            The rook slides along the fifth rank, the bishop along the
            h2–d6 diagonal — and{' '}
            <strong>those two lines cross on e5</strong>. Keep an eye on that
            square.
          </p>

          <Diagram
            fen={EX.diagram}
            marks={{
              h5: { backgroundColor: 'rgba(59, 130, 246, 0.4)' },
              h2: { backgroundColor: 'rgba(59, 130, 246, 0.4)' },
              e5: { backgroundColor: 'rgba(255, 176, 32, 0.55)' },
            }}
            caption={<>The rook and bishop (blue) — their lines cross on e5 (amber)</>}
          />

          <p className={P}>
            The key is <span className={MOVE}>1.Bg7!</span>, threatening{' '}
            <span className={MOVE}>2.Rd4#</span> — the rook check on d4 works
            because the bishop now backs it up along the long diagonal, g7
            through e5 to d4. That diagonal is Black's only hope:{' '}
            <strong>the threat can only be met by putting something on e5</strong>{' '}
            — the very square where the rook's and bishop's lines cross.
          </p>

          <Diagram
            fen={EX.afterKey}
            move={{ from: 'b2', to: 'g7' }}
            marks={{ e5: { backgroundColor: 'rgba(255, 176, 32, 0.55)' } }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1.Bg7!</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>Threat 2.Rd4# — only e5 (amber) can block the diagonal</>}
          />

          <p className={P}>
            <span className={MOVE}>1...Re5</span> blocks the threat — but{' '}
            <strong>the rook is now standing in its own bishop's diagonal</strong>{' '}
            (h2–e5–d6). The bishop no longer guards d6, so{' '}
            <span className={MOVE}>2.Nd6#</span>. Note the rook still guards
            c5, so this is the only mate.
          </p>

          <Diagram
            fen={EX.rookBlock}
            move={{ from: 'b7', to: 'd6' }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1...Re5 2.Nd6#</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>The rook cut its bishop's guard of d6</>}
          />

          <p className={P}>
            <span className={MOVE}>1...Be5</span> blocks the same diagonal —
            but now <strong>the bishop is standing in its own rook's rank</strong>{' '}
            (h5–e5–c5). The rook no longer guards c5, so{' '}
            <span className={MOVE}>2.Nc5#</span> — and this time d6 is still
            covered by the bishop.{' '}
            <strong>One square, two interferences, two different mates — that
            is a Grimshaw.</strong>
          </p>

          <Diagram
            fen={EX.bishopBlock}
            move={{ from: 'b7', to: 'c5' }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1...Be5 2.Nc5#</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>The bishop cut its rook's guard of c5</>}
          />

          <p className={P}>
            When a problem carries the Grimshaw tag, look for{' '}
            <strong>the square where a black rook's line and a black bishop's
            diagonal cross</strong>. The defenses that land there are the story
            of the problem.
          </p>
          </>}

          <h2 className={`${H2} mt-8`}>Novotny</h2>
          <div className={SUB}>A piece is thrown onto the crossing square</div>

          <p className={P}>
            The Grimshaw's aggressive sibling. Same crossing square — but this
            time{' '}
            <strong>White throws a piece onto it and offers it to both black
            pieces — typically the rook and the bishop — at once. Whichever
            one captures blocks the other's line</strong>, so Black is only
            choosing which mate to allow.
            (Named after Antonín Novotný, who showed the idea in 1854.)
          </p>

          <Diagram
            fen={NV.diagram}
            caption={<>Otto Strerath, Schach-Express 1950, 1st Prize
              <span className="mx-1.5 text-[var(--faint)]">·</span>
              <span className="font-extrabold text-[var(--ink)]">#2</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>White to move</>}
          />

          <div className="flex justify-center gap-2 flex-wrap -mt-2 mb-5">
            <button onClick={() => onOpenProblem(NV.id)} className="nb-btn nb-btn-key px-4 py-1.5 text-sm font-bold">
              Try it yourself →
            </button>
            {!revealedNv && (
              <button onClick={() => setRevealedNv(true)} className="nb-btn px-4 py-1.5 text-sm font-bold">
                Show the solution
              </button>
            )}
          </div>

          {revealedNv && <>
          <p className={P}>
            The actors again:{' '}
            <strong>the black rook on c6 and the black bishop on d7</strong>.
            The rook slides along the sixth rank, the bishop down the d7–h3
            diagonal — <strong>their lines cross on e6</strong>.
          </p>

          <Diagram
            fen={NV.diagram}
            marks={{
              c6: { backgroundColor: 'rgba(59, 130, 246, 0.4)' },
              d7: { backgroundColor: 'rgba(59, 130, 246, 0.4)' },
              e6: { backgroundColor: 'rgba(255, 176, 32, 0.55)' },
            }}
            caption={<>The rook and bishop (blue) — their lines cross on e6 (amber)</>}
          />

          <p className={P}>
            This time White doesn't wait for Black to come to the crossing
            square: <span className={MOVE}>1.Ne6!</span>{' '}
            <strong>throws the knight onto it</strong>, where both pieces can
            capture. The knight guards the squares around the king, so the
            quiet threat <span className={MOVE}>2.Re2#</span> forces Black to
            remove it. Either capture is a trap.
          </p>

          <Diagram
            fen={NV.afterKey}
            move={{ from: 'd4', to: 'e6' }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1.Ne6!</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>Offered to both — threat 2.Re2#</>}
          />

          <p className={P}>
            <span className={MOVE}>1...Rxe6</span> — but{' '}
            <strong>a rook on e6 has no move to d5</strong>, so{' '}
            <span className={MOVE}>2.Rd5#</span>. (This mate wouldn't work
            against the bishop's capture — a bishop on e6 takes on d5.)
          </p>

          <Diagram
            fen={NV.rookTakes}
            move={{ from: 'd2', to: 'd5' }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1...Rxe6 2.Rd5#</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>The rook can't touch d5</>}
          />

          <p className={P}>
            <span className={MOVE}>1...Bxe6</span> guards d5, so Rd5 fails —
            but now <strong>the bishop is standing in its own rook's rank</strong>:
            the rook can no longer slide to f6 to block, so{' '}
            <span className={MOVE}>2.Bg7#</span> along the long diagonal.
          </p>

          <Diagram
            fen={NV.bishopTakes}
            move={{ from: 'f8', to: 'g7' }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1...Bxe6 2.Bg7#</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>The bishop cut its rook's path to f6</>}
          />

          <p className={P}>
            Grimshaw and Novotny are the same discovery seen from two sides:{' '}
            <strong>in a Grimshaw Black walks onto the crossing square himself;
            in a Novotny White sacrifices a piece there to force the
            interference</strong>. Spot the crossing square and you have read
            both.
          </p>
          </>}

          <h2 className={`${H2} mt-8`}>Plachutta</h2>
          <div className={SUB}>Two like movers, one crossing square, one overloaded piece</div>

          <p className={P}>
            What if the two black pieces move the <em>same</em> way — two
            rooks, or two bishops? Landing on the crossing square no longer
            cuts the partner's line, because the arriving piece covers the same
            kind of lines itself. Something worse happens instead:{' '}
            <strong>the capturer inherits both pieces' jobs at once, and one
            piece cannot hold two duties</strong>. A Plachutta is a sacrifice
            on that square, made to force the overload.
          </p>

          <Diagram
            fen={PL.diagram}
            caption={<>André Chéron, Le Temps 1930
              <span className="mx-1.5 text-[var(--faint)]">·</span>
              <span className="font-extrabold text-[var(--ink)]">#3</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>White to move</>}
          />

          <div className="flex justify-center gap-2 flex-wrap -mt-2 mb-5">
            <button onClick={() => onOpenProblem(PL.id)} className="nb-btn nb-btn-key px-4 py-1.5 text-sm font-bold">
              Try it yourself →
            </button>
            {!revealedPl && (
              <button onClick={() => setRevealedPl(true)} className="nb-btn px-4 py-1.5 text-sm font-bold">
                Show the solution
              </button>
            )}
          </div>

          {revealedPl && <>
          <p className={P}>
            The actors: <strong>both black bishops</strong>. The b2-bishop
            guards h8 along the long diagonal; the h2-bishop guards b8. Those
            are exactly the two squares where White's rooks want to mate on the
            back rank — and <strong>the two diagonals cross on e5</strong>.
          </p>

          <Diagram
            fen={PL.diagram}
            marks={{
              b2: { backgroundColor: 'rgba(59, 130, 246, 0.4)' },
              h2: { backgroundColor: 'rgba(59, 130, 246, 0.4)' },
              e5: { backgroundColor: 'rgba(255, 176, 32, 0.55)' },
            }}
            caption={<>Each bishop (blue) guards one back-rank square — their diagonals cross on e5 (amber)</>}
          />

          <p className={P}>
            <span className={MOVE}>1.Qe5!!</span> — the queen is thrown onto
            the crossing square, threatening both{' '}
            <span className={MOVE}>2.Rb8#</span> and{' '}
            <span className={MOVE}>2.Rh8#</span>. Black must capture. But
            whichever bishop takes,{' '}
            <strong>it now guards b8 and h8 by itself — one piece, two
            duties</strong>.
          </p>

          <Diagram
            fen={PL.afterKey}
            move={{ from: 'e1', to: 'e5' }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1.Qe5!!</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>Both mates threatened — either bishop must take</>}
          />

          <p className={P}>
            <span className={MOVE}>1...Bbxe5</span>. Now White cashes in the
            duties one at a time: <span className={MOVE}>2.Rb8+!</span> makes
            the bishop pay the first debt — <span className={MOVE}>2...Bxb8</span>{' '}
            — and h8 is left unguarded: <span className={MOVE}>3.Rh8#</span>.
          </p>

          <Diagram
            fen={PL.lineAFinal}
            move={{ from: 'h4', to: 'h8' }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1...Bbxe5 2.Rb8+ Bxb8 3.Rh8#</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>One duty paid, the other abandoned</>}
          />

          <p className={P}>
            The other capture mirrors it exactly:{' '}
            <span className={MOVE}>1...Bhxe5 2.Rh8+ Bxh8 3.Rb8#</span>. The
            family is now complete:{' '}
            <strong>different-moving pieces on the crossing square get cut off
            (Grimshaw, Novotny); like-moving pieces get overloaded
            (Plachutta)</strong>.
          </p>

          <Diagram
            fen={PL.lineBFinal}
            move={{ from: 'b4', to: 'b8' }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1...Bhxe5 2.Rh8+ Bxh8 3.Rb8#</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>The mirror image</>}
          />
          </>}

          <h2 className={`${H2} mt-8`}>Changed mates</h2>
          <div className={SUB}>Same defence, different mate in every phase</div>

          <p className={P}>
            A changed mate is{' '}
            <strong>the same black defence answered by a different mate
            depending on White's first move</strong>. A modern twomover is a
            set of <em>phases</em> — the position before White moves (the set
            play), the near-miss first moves (the tries), and the key — and
            the composer arranges for the mates to change from phase to phase.
            The solver is meant to compare worlds that never happen with the
            one that does.
          </p>

          <Diagram
            fen={CM.diagram}
            caption={<>Vasyl Diachuk, StrateGems 2001
              <span className="mx-1.5 text-[var(--faint)]">·</span>
              <span className="font-extrabold text-[var(--ink)]">#2</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>White to move</>}
          />

          <div className="flex justify-center gap-2 flex-wrap -mt-2 mb-5">
            <button onClick={() => onOpenProblem(CM.id)} className="nb-btn nb-btn-key px-4 py-1.5 text-sm font-bold">
              Try it yourself →
            </button>
            {!revealedCm && (
              <button onClick={() => setRevealedCm(true)} className="nb-btn px-4 py-1.5 text-sm font-bold">
                Show the solution
              </button>
            )}
          </div>

          {revealedCm && <>
          <p className={P}>
            The natural <span className={MOVE}>1.Qg1?</span> threatens{' '}
            <span className={MOVE}>2.Qd4#</span> and answers{' '}
            <span className={MOVE}>1...Ke5</span> with{' '}
            <span className={MOVE}>2.Qc5#</span> — but{' '}
            <span className={MOVE}>1...c5!</span> refutes it. The key{' '}
            <span className={MOVE}>1.Qg4!</span> carries the very same threat,
            and now <strong>the same <span className={MOVE}>1...Ke5</span> is
            mated by <span className={MOVE}>2.Qe4#</span> instead</strong>.
          </p>

          <Diagram
            fen={CM.tryMate}
            move={{ from: 'g1', to: 'c5' }}
            marks={{ e5: { backgroundColor: 'rgba(255, 176, 32, 0.55)' } }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1.Qg1? Ke5 2.Qc5#</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>The mate in the try phase</>}
          />

          <Diagram
            fen={CM.keyMate}
            move={{ from: 'g4', to: 'e4' }}
            marks={{ e5: { backgroundColor: 'rgba(255, 176, 32, 0.55)' } }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1.Qg4! Ke5 2.Qe4#</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>Same defence (amber), different mate</>}
          />

          <p className={P}>
            <strong>The mate you found in the try is taken away and
            replaced</strong> — that exchange is the problem's content. When a
            twomover's tries look almost as good as the key, line their mates
            up side by side; a defence with a different mate in each of three
            phases is the celebrated <em>Zagoruiko</em> form.
          </p>
          </>}

          <h2 className={`${H2} mt-8`}>Allumwandlung</h2>
          <div className={SUB}>One pawn, all four promotions</div>

          <p className={P}>
            Allumwandlung — German for "total promotion", <em>AUW</em> on the
            tags — means{' '}
            <strong>all four promotions, queen, rook, bishop and knight,
            appear in one problem</strong>. Usually one pawn promotes
            differently in different variations. Here it is even purer: four
            twin positions, and in each the same b7-pawn must choose a
            different piece.
          </p>

          <Diagram
            fen={AW.diagram}
            caption={<>Vitaly Kovalenko, Shakhmatnaya kompozitsiya 1998
              <span className="mx-1.5 text-[var(--faint)]">·</span>
              <span className="font-extrabold text-[var(--ink)]">#2</span>, four twins
              <span className="mx-1.5 text-[var(--faint)]">·</span>White to move</>}
          />

          <div className="flex justify-center gap-2 flex-wrap -mt-2 mb-5">
            <button onClick={() => onOpenProblem(AW.id)} className="nb-btn nb-btn-key px-4 py-1.5 text-sm font-bold">
              Try it yourself →
            </button>
            {!revealedAw && (
              <button onClick={() => setRevealedAw(true)} className="nb-btn px-4 py-1.5 text-sm font-bold">
                Show the solution
              </button>
            )}
          </div>

          {revealedAw && <>
          <p className={P}>
            In the diagram the key is{' '}
            <span className={MOVE}>1.b8=N+!</span> (
            <span className={MOVE}>1...Kb6 2.Bd8#</span>). Twin b) moves the
            bishop to d8 — now only <span className={MOVE}>1.b8=R!</span>{' '}
            works. Twin c) puts it on d3:{' '}
            <span className={MOVE}>1.b8=B!</span> Twin d) shifts the queen to
            e7: <span className={MOVE}>1.b8=Q!</span>{' '}
            <strong>One small change to the position, and the pawn must wear a
            different hat each time.</strong>
          </p>

          <Diagram
            fen={AW.afterKeyA}
            move={{ from: 'b7', to: 'b8' }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1.b8=N+!</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>The first of the four promotions</>}
          />

          <p className={P}>
            Underpromotion exists because{' '}
            <strong>a queen is sometimes the wrong piece</strong> — she
            stalemates, or she covers a square the position needs open. An AUW
            problem manufactures a reason for every choice. When a promotion
            is available and the queen fails, the tag is telling you the
            composer already picked the piece for you — all four of them.
          </p>
          </>}

          <h2 className={`${H2} mt-8`}>Model mate &amp; Ideal mate</h2>
          <div className={SUB}>Economy made visible — every guard used exactly once</div>

          <p className={P}>
            Not a combination but an aesthetic standard — the heart of the
            Bohemian school. A <strong>model mate</strong> is a mating position
            where{' '}
            <strong>every empty square around the king is covered exactly
            once, and every white piece takes part</strong> — nothing doubled,
            nothing idle. An <strong>ideal mate</strong> goes one step further:
            every piece on the board, Black's included, is doing a job.
          </p>

          <Diagram
            fen={MD.diagram}
            caption={<>Konrad Erlinger, Shakhmatny Zhurnal 1894, 1st Prize
              <span className="mx-1.5 text-[var(--faint)]">·</span>
              <span className="font-extrabold text-[var(--ink)]">#3</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>White to move</>}
          />

          <div className="flex justify-center gap-2 flex-wrap -mt-2 mb-5">
            <button onClick={() => onOpenProblem(MD.id)} className="nb-btn nb-btn-key px-4 py-1.5 text-sm font-bold">
              Try it yourself →
            </button>
            {!revealedMd && (
              <button onClick={() => setRevealedMd(true)} className="nb-btn px-4 py-1.5 text-sm font-bold">
                Show the solution
              </button>
            )}
          </div>

          {revealedMd && <>
          <p className={P}>
            The key is the quiet <span className={MOVE}>1.Ne7!</span>, and the
            main line runs{' '}
            <span className={MOVE}>1...Kb5 2.Nc8 Ka5 3.Rd5#</span>. Five
            pieces on the board — now look at what each one is doing in the
            final position.
          </p>

          <Diagram
            fen={MD.mateFinal}
            move={{ from: 'd7', to: 'd5' }}
            marks={MD_MARKS}
            caption={<><span className="font-extrabold text-[var(--ink)]">3.Rd5#</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>Each square wears the symbol of its one guard — and each guard wears the matching badge</>}
          />

          <p className={P}>
            Follow the symbols: the rook checks along the rank and covers b5,
            the king covers a4 and b4, the bishop covers a6, the knight
            covers b6.{' '}
            <strong>Every square exactly once, every white piece pulling its
            weight</strong> — a model mate. And since Black has nothing but his
            king, it is an ideal mate too.
          </p>

          <p className={P}>
            This is what the tags mean by a <em>beautiful</em> mate: not
            spectacle but perfect economy.{' '}
            <strong>After solving any problem, audit the final position — who
            guards what, and is anyone idle?</strong> Once you start seeing
            it, the Bohemian problems become pictures.
          </p>
          </>}

        </div>
      </div>
    </div>
  );
}
