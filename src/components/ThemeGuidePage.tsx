import { useEffect, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';

/* Theme walkthroughs. One theme so far (Grimshaw); the plan is to add the
   ones whose tags don't explain themselves (Zugzwang, Model mate, Novotny...).
   Every claim on this page is anchored to a concrete problem and its published
   solution — no generated analysis. */

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
function Board({ fen, move, marks }: { fen: string; move?: { from: string; to: string }; marks?: Record<string, React.CSSProperties> }) {
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

function Diagram({ fen, move, marks, caption }: { fen: string; move?: { from: string; to: string }; marks?: Record<string, React.CSSProperties>; caption: React.ReactNode }) {
  return (
    <figure className="my-5 mx-auto w-full max-w-[280px]">
      <Board fen={fen} move={move} marks={marks} />
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

export function ThemeGuidePage({ onClose, onOpenProblem }: ThemeGuidePageProps) {
  /* The walkthrough is one long spoiler. It stays folded until asked for, so
     the diagram can be studied as a problem first. */
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="nb-ground fixed inset-0 z-50 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full min-h-0">
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--ink)] shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Themes</h2>
          <button onClick={onClose} className="nb-disc" aria-label="Close">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-10">
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 mb-4">
            A theme is the idea a problem is built around. Knowing the common
            ones changes how you solve: instead of trying every move, you look
            for the idea. One theme so far — more are coming.
          </p>

          <h2 className={H2}>Grimshaw</h2>
          <div className={SUB}>Two black pieces trip over each other on one square</div>

          <p className={P}>
            A rook moves along ranks and files, a bishop along diagonals. When
            both need to pass through the same square, they get in each other's
            way: whichever one lands there cuts the other's line. A{' '}
            <em>Grimshaw</em> (after Walter Grimshaw, 19th-century English
            composer) is a position built so that Black has to make that choice
            — and each version of it loses to a different mate.
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
            The key is <span className={MOVE}>1.Bg7!</span>, threatening{' '}
            <span className={MOVE}>2.Rd4#</span> — the rook check on d4 works
            because the bishop now backs it up along the long diagonal, g7
            through e5 to d4. That diagonal is Black's only hope: put something
            on e5 and the threat is parried. Both the rook and the bishop can
            reach e5. That square is the trap.
          </p>

          <Diagram
            fen={EX.afterKey}
            move={{ from: 'b2', to: 'g7' }}
            marks={{
              h5: { backgroundColor: 'rgba(59, 130, 246, 0.4)' },
              h2: { backgroundColor: 'rgba(59, 130, 246, 0.4)' },
              e5: { backgroundColor: 'rgba(255, 176, 32, 0.55)' },
            }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1.Bg7!</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>Threat 2.Rd4#
              <span className="mx-1.5 text-[var(--faint)]">·</span>The rook and bishop (blue) meet on e5 (amber)</>}
          />

          <p className={P}>
            <span className={MOVE}>1...Re5</span> blocks the threat — but the
            rook is now standing in its own bishop's diagonal (h2–e5–d6). The
            bishop no longer guards d6, so{' '}
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
            but now the bishop is standing in its own rook's fifth rank
            (h5–e5–c5). The rook no longer guards c5, so{' '}
            <span className={MOVE}>2.Nc5#</span> — and this time d6 is still
            covered by the bishop. One square, two interferences, two different
            mates: that is a Grimshaw.
          </p>

          <Diagram
            fen={EX.bishopBlock}
            move={{ from: 'b7', to: 'c5' }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1...Be5 2.Nc5#</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>The bishop cut its rook's guard of c5</>}
          />

          <p className={P}>
            When a problem carries the Grimshaw tag, look for the crossing
            point: the square where a black rook's line and a black bishop's
            diagonal intersect. The defenses that land there are the story of
            the problem.
          </p>
          </>}

        </div>
      </div>
    </div>
  );
}
