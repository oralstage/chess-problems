import { useEffect, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';

/* Theme walkthroughs. One theme so far (Sacrifice); the plan is to add the
   frequent ones in order of how many problems carry the tag. Every claim on
   this page is anchored to a concrete problem and its published solution —
   no generated analysis. */

interface ThemeGuidePageProps {
  onClose: () => void;
  /** Open the worked example on the real board. */
  onOpenProblem: (id: number) => void;
  /** Enter a category with the theme's keyword filter applied. */
  onSolveTheme: () => void;
}

const LAST_MOVE_FROM = { backgroundColor: 'rgba(255, 255, 0, 0.3)' };
const CORRECT_TO = { backgroundColor: 'rgba(34, 197, 94, 0.5)' };
const TICK = 20;

/* Same measured board as GuidePage's — a fixed width overflows either the
   phone column or the desktop one. */
function Board({ fen, move }: { fen: string; move?: { from: string; to: string } }) {
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
          customSquareStyles={move ? { [move.from]: LAST_MOVE_FROM, [move.to]: CORRECT_TO } : undefined}
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

function Diagram({ fen, move, caption }: { fen: string; move?: { from: string; to: string }; caption: React.ReactNode }) {
  return (
    <figure className="my-5 mx-auto w-full max-w-[280px]">
      <Board fen={fen} move={move} />
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

/* Herman Jonsson, Sporten 1893, 1st Prize (YACPDB 11667).
   Positions below are the diagram, the position after the key, and the two
   mates — each verified against the published solution with chess.js. */
const EX = {
  id: 11667,
  diagram: '2n5/2N1B1b1/6B1/N7/1P1k4/8/5PnQ/K7 w - - 0 1',
  afterKey: '2n5/2N1B1b1/6BQ/N7/1P1k4/8/5Pn1/K7 b - - 1 1',
  accept: '2n5/2N5/5BBb/N7/1P1k4/8/5Pn1/K7 b - - 0 2',
  decline: '2n5/2N1B1b1/2N3BQ/4k3/1P6/8/5Pn1/K7 b - - 1 2',
};

export function ThemeGuidePage({ onClose, onOpenProblem, onSolveTheme }: ThemeGuidePageProps) {
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
            for the idea. One theme so far — more are coming, most frequent
            first.
          </p>

          <h2 className={H2}>Sacrifice</h2>
          <div className={SUB}>The key offers a piece — taking it is the trap</div>

          <p className={P}>
            In over-the-board chess you keep your queen safe. In a chess problem
            the key move often does the opposite: it puts White's strongest
            piece somewhere Black can simply capture it. That is a{' '}
            <em>sacrifice key</em>. It works because the capture itself is a
            mistake — it pulls the capturing piece away from a square it was
            defending, blocks a square the king needed, or opens a line.
          </p>
          <p className={P}>
            When you solve, this is the practical lesson: the moves that look
            safest are rarely the key. A move that hangs the queen is always
            worth a second look.
          </p>

          <Diagram
            fen={EX.diagram}
            caption={<>Herman Jonsson, Sporten 1893, 1st Prize
              <span className="mx-1.5 text-[var(--faint)]">·</span>
              <span className="font-extrabold text-[var(--ink)]">#2</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>White to move</>}
          />

          <p className={P}>
            The key is <span className={MOVE}>1.Qh6!</span> — the queen steps
            straight into the g7-bishop's diagonal, where Black can take it.
            The threat is <span className={MOVE}>2.Qxg7#</span>, and the bishop
            on g7 is the only piece that can deal with it.
          </p>

          <Diagram
            fen={EX.afterKey}
            move={{ from: 'h2', to: 'h6' }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1.Qh6!</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>The queen offers itself to the bishop</>}
          />

          <p className={P}>
            Accept the gift and the trap closes:{' '}
            <span className={MOVE}>1...Bxh6</span> wins the queen — but that
            bishop was also the only guard of f6. Now{' '}
            <span className={MOVE}>2.Bf6#</span>. The capture is not a defense;
            it is exactly what the mate needed.
          </p>

          <Diagram
            fen={EX.accept}
            move={{ from: 'e7', to: 'f6' }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1...Bxh6 2.Bf6#</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>Capturing abandoned f6</>}
          />

          <p className={P}>
            Declining doesn't help either. The key even handed the black king
            two escape squares — a generous key is another hallmark of the
            classical style — but each flight walks into a knight mate:{' '}
            <span className={MOVE}>1...Ke5 2.Nc6#</span> (and{' '}
            <span className={MOVE}>1...Kc3 2.Nb5#</span>).
          </p>

          <Diagram
            fen={EX.decline}
            move={{ from: 'a5', to: 'c6' }}
            caption={<><span className="font-extrabold text-[var(--ink)]">1...Ke5 2.Nc6#</span>
              <span className="mx-1.5 text-[var(--faint)]">·</span>The flight was poisoned too</>}
          />

          <p className={P}>
            Composers prize keys like this because they give everything away at
            once — material and freedom — and still mate. When a problem
            carries a sacrifice tag, start your search with the un-safest moves
            on the board.
          </p>

          <div className="flex flex-col sm:flex-row gap-2 mt-5">
            <button onClick={() => onOpenProblem(EX.id)} className="nb-btn px-4 py-2 text-sm font-bold">
              Open this problem →
            </button>
            <button onClick={onSolveTheme} className="nb-btn nb-btn-key px-4 py-2 text-sm font-bold">
              Solve sacrifice twomovers →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
