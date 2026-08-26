import { useEffect, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';

/* Theme walkthroughs, in reading order: Grimshaw, then Novotny — the same
   crossing square, first walked onto, then sacrificed on. Next candidates are
   the other tags that don't explain themselves (Zugzwang, Model mate...).
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

export function ThemeGuidePage({ onClose, onOpenProblem }: ThemeGuidePageProps) {
  /* The walkthrough is one long spoiler. It stays folded until asked for, so
     the diagram can be studied as a problem first. */
  const [revealed, setRevealed] = useState(false);
  const [revealedNv, setRevealedNv] = useState(false);
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
            for the idea. Two themes so far — more are coming.
          </p>

          <h2 className={H2}>Grimshaw</h2>
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
            <strong>White throws a piece onto it and offers it to the rook and
            the bishop at once. Whichever one captures blocks the other's
            line</strong>, so Black is only choosing which mate to allow.
            (Named after Antonín Novotný, who showed the idea in 1854. Shogi
            players know the shape: it is a focal-point sacrifice.)
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

        </div>
      </div>
    </div>
  );
}
