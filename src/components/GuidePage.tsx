import { useEffect, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Category, Genre } from '../types';
import { CategoryMark } from './CategoryMark';

interface GuidePageProps {
  onClose: () => void;
  /** In-app navigation, not <a href="#/...">: the app routes off popstate, and a
   *  fragment link pushes a history entry without firing one — the URL would change
   *  and the board behind the guide would not. */
  onOpenCategory: (category: Category) => void;
  /** Genre to scroll to on open. The "?" dialog links here from inside a genre,
   *  and the reader arrives wanting that genre's section, not the top of the page. */
  focus?: Genre;
  /** Opened from the "?" dialog rather than from the home page. Either way the exit
   *  goes back to whatever is behind the guide — but that is a board rather than the
   *  home page, so it gets said in words. */
  fromTutorial?: boolean;
}

/* The three genres a newcomer has to be told about, each with one worked example.
   Studies and retros are left out on purpose: a study explains itself to anyone who
   plays chess, and a retro needs more than a page. */
const EXAMPLES = {
  direct: {
    fen: '7k/2R5/8/7p/4N3/8/7K/8 w - - 0 1',
    credit: 'Pedro Damiano, 1763',
    stipulation: '#2',
    toMove: 'White to move',
    mateFen: '7k/7R/5N2/8/7p/8/7K/8 b - - 1 2',
    mateMove: { from: 'c7', to: 'h7' },
    mateLine: 'After 1.Nf6 h4 2.Rh7#',
  },
  help: {
    fen: '8/2k5/5K1R/8/8/8/8/8 b - - 0 1',
    credit: 'Rudolf Wastl, Neues Wiener Abendblatt 1927',
    stipulation: 'h#2',
    toMove: 'Black to move',
    mateFen: '4k2R/8/4K3/8/8/8/8/8 b - - 4 3',
    mateMove: { from: 'h6', to: 'h8' },
    mateLine: '1.Kd8 Ke6 2.Ke8 \u2014 and then Rh8#',
  },
  self: {
    fen: '6kq/6Pp/8/6KB/8/8/8/8 w - - 0 1',
    credit: 'Michael Schreckenbach, harmonie 2012',
    stipulation: 's#1',
    toMove: 'White to move',
    mateFen: '6k1/6qp/7K/7B/8/8/8/8 w - - 0 2',
    mateMove: { from: 'h8', to: 'g7' },
    mateLine: 'After 1.Kh6 Qxg7#',
  },
} as const;

/* Measured rather than fixed: the sheet is one column on a phone and a narrower
   column on a desktop, and a hardcoded board width overflows one of the two. */
/* Marked the way the problem board marks a move that was just played and accepted:
   yellow on the square it came from, the green wash on the square it landed on, and
   the green tick in that square's corner. Same colours, same tick, same corner — the
   diagram says "this is the right move" in the vocabulary the board already uses. */
const LAST_MOVE_FROM = { backgroundColor: 'rgba(255, 255, 0, 0.3)' };
/** w-5 h-5 on the tick, in px, so it can be clamped against the board's edge. */
const TICK = 20;
const CORRECT_TO = { backgroundColor: 'rgba(34, 197, 94, 0.5)' };

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
          /* The tick straddles the top-right corner of its square, the way the
             problem board draws it — but on the h-file that puts half of it past
             the board's edge, where this card's rounded overflow-hidden clips it.
             Clamped to the board, so on the last file it sits flush inside the
             corner instead of being cut in half. */
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

function Diagram({ example }: { example: typeof EXAMPLES[keyof typeof EXAMPLES] }) {
  return (
    <figure className="my-5 mx-auto w-full max-w-[280px]">
      <Board fen={example.fen} />
      <figcaption className="mt-2 text-center text-xs font-semibold leading-snug text-[var(--muted)]">
        {example.credit}
        <span className="mx-1.5 text-[var(--faint)]">·</span>
        <span className="font-extrabold text-[var(--ink)]">{example.stipulation}</span>
        <span className="mx-1.5 text-[var(--faint)]">·</span>
        {example.toMove}
      </figcaption>
    </figure>
  );
}

/* The position the solution ends on. Without it the reader has to open the
   problem, play it out and come back just to see what "Rh7#" looks like — which
   is the one thing a guide page can save them. */
function MateDiagram({ example }: { example: typeof EXAMPLES[keyof typeof EXAMPLES] }) {
  return (
    <figure className="my-5 mx-auto w-full max-w-[280px]">
      <Board fen={example.mateFen} move={example.mateMove} />
      <figcaption className="mt-2 text-center text-xs font-semibold leading-snug text-[var(--muted)]">
        <span className="font-extrabold text-[var(--ink)]">{example.mateLine}</span>
        <span className="mx-1.5 text-[var(--faint)]">·</span>
        Checkmate
      </figcaption>
    </figure>
  );
}

const H2 = 'text-xl font-extrabold tracking-tight text-[var(--ink)] mb-1';
const SUB = 'text-sm font-extrabold text-[var(--muted)] mb-3';
const P = 'text-sm leading-relaxed text-[var(--ink)] mb-3';
const MOVE = 'font-extrabold';
/* ModeSelector's card, repeated rather than exported: it is three utility strings,
   and threading a style constant between two pages to save them is not worth the
   import. Keep in step with CARD there if that one moves. */
const TILE =
  'nb-tile nb-shadow-room-sm shadow-[4px_4px_0_var(--ink)] hover:shadow-[4px_4px_0_var(--ink)] ' +
  'flex flex-col items-center gap-1.5 px-2 pt-3 pb-2.5 text-center';

export function GuidePage({ onClose, focus, fromTutorial, onOpenCategory }: GuidePageProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focus) return;
    const target = sheetRef.current?.querySelector(`#guide-${focus}`);
    /* Instant, not smooth: the reader pressed a link that said "read the rules",
       and watching the page fly past two other genres to get there is not an
       animation worth waiting through. */
    if (target) target.scrollIntoView({ block: 'start' });
  }, [focus]);

  return (
    <div className="nb-ground fixed inset-0 z-50 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col p-4 max-w-2xl mx-auto w-full min-h-0">
        {fromTutorial && (
          <button
            onClick={onClose}
            className="nb-btn shrink-0 self-start mb-2 flex items-center gap-1.5 px-3 py-1 text-xs"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to the problem
          </button>
        )}

        <div className="flex items-center justify-between mb-3 shrink-0">
          <h2 className="nb-shadow-type text-2xl font-extrabold tracking-tight text-[var(--ink)]">
            How to solve
          </h2>
          <button onClick={onClose} className="nb-disc" aria-label="Close">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div ref={sheetRef} className="nb-sheet nb-shadow-room flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">
          {/* ── Direct mate ── */}
          <section id="guide-direct" className="scroll-mt-2">
            <h3 className={H2}>Direct mate (#)</h3>
            <p className={SUB}>White mates in two</p>

            <p className={P}>
              White moves first and mates the black king within the stated number of moves.
              A #2 is three moves in all &mdash; White, Black, White &mdash; and White&rsquo;s last
              move is the mate.
            </p>
            <p className={P}>
              Let&rsquo;s start with what makes this different from an ordinary mate puzzle,
              using a real problem.
            </p>

            <Diagram example={EXAMPLES.direct} />

            <p className={P}>
              It&rsquo;s White to move &mdash; but checking gets nowhere. After <span className={MOVE}>1.Rc8+</span> Black
              just steps out with <span className={MOVE}>1&hellip;Kh7</span> or <span className={MOVE}>1&hellip;Kg7</span>.
            </p>
            <p className={P}>
              And here is the rule that matters most in problems: <strong>the first move does
              not have to be a check.</strong>
            </p>
            <p className={P}>
              That opens up a lot of candidate moves, and trying every one of them is hard work.
            </p>
            <p className={P}>
              So think of it the other way round. The first move doesn&rsquo;t have to mate &mdash; it
              only has to set up a mate for the second. If White could play two moves in a row,
              the knight would go to f6 and the rook would follow with Rh7 mate.
            </p>
            <p className={P}>
              <span className={MOVE}>1.Nf6</span> (threatening <span className={MOVE}>2.Rh7#</span>)
            </p>
            <p className={P}>
              The knight on f6 guards both g8, the king&rsquo;s only flight square, and h7, the
              square the rook wants to land on. So Black cannot stop the threat.
            </p>
            <p className={P}>
              One detail worth noting: if Black had nothing but the king, 1.Nf6 would leave
              Black with no legal move at all &mdash; stalemate. The pawn on h5 is what keeps that
              from happening: <span className={MOVE}>1&hellip;h4 2.Rh7#</span>.
            </p>
            <MateDiagram example={EXAMPLES.direct} />

            <p className={P}>
              The key, 1.Nf6, is neither a check nor a capture. The knight simply steps closer.
              Most problem keys look like this.
            </p>
          </section>

          {/* ── Helpmate ── */}
          <section id="guide-help" className="scroll-mt-2 mt-8 pt-8 border-t-2 border-[var(--hairline)]">
            <h3 className={H2}>Helpmate (h#)</h3>
            <p className={SUB}>Both sides mate the black king</p>

            <p className={P}>
              In a helpmate, Black wants the black king mated just as much as White does.
            </p>
            <p className={P}>
              Black doesn&rsquo;t defend &mdash; quite the opposite. Black walks into the mate so that
              White can finish within the stated number of moves. Black moves first, and
              White&rsquo;s last move is the mate.
            </p>
            <p className={P}>Here is one.</p>

            <Diagram example={EXAMPLES.help} />

            <p className={P}>
              A helpmate in two: two moves each, in the order Black, White, Black, White,
              with White&rsquo;s last move mating the black king.
            </p>
            <p className={P}>
              White has nothing but a king and a rook here, so those two have to do the whole
              job. Against real resistance that would take a while, but with Black helping it
              takes two moves.
            </p>
            <p className={P}>
              The best known way for a rook to mate a king is the back-rank mate. So the
              question becomes: is there a way to reach a back-rank mate from here?
            </p>
            <p className={P}>
              There is. <span className={MOVE}>1.Kd8 Ke6&ensp;2.Ke8</span> sets the position up, and
              then <span className={MOVE}>Rh8#</span>. The black king is blocked in front by the white
              king and along the rank by the rook.
            </p>
            <MateDiagram example={EXAMPLES.help} />

            <p className={P}>
              That&rsquo;s a helpmate. On the site you play both sides yourself &mdash; both colours&rsquo;
              moves are part of the solution, so nothing is played for you.
            </p>
          </section>

          {/* ── Selfmate ── */}
          <section id="guide-self" className="scroll-mt-2 mt-8 pt-8 border-t-2 border-[var(--hairline)]">
            <h3 className={H2}>Selfmate (s#)</h3>
            <p className={SUB}>Forcing an unwilling opponent to mate you</p>

            <p className={P}>
              In a selfmate, White is trying to get the white king mated. Black wants no part
              of it and avoids it for as long as possible.
            </p>
            <p className={P}>
              So White takes away every legal move except the mate. Once the only move Black
              has left is the mating one, Black has to play it.
            </p>
            <p className={P}>Here is one.</p>

            <Diagram example={EXAMPLES.self} />

            <p className={P}>
              A selfmate in one: White plays a move, and Black&rsquo;s reply has to checkmate the
              white king. If Black has any other legal move, Black will play that instead, and
              White has failed.
            </p>
            <p className={P}>
              Start by working out what Black can play here. There are three
              moves: <span className={MOVE}>1&hellip;Kxg7</span> (the king takes the pawn on
              g7), <span className={MOVE}>1&hellip;h6</span> (the pawn steps up),
              and <span className={MOVE}>1&hellip;Qxg7</span> (the queen takes the pawn).
            </p>
            <p className={P}>
              If all three of them mated the white king, that would do the job as well &mdash; but a
              moment&rsquo;s thought shows that isn&rsquo;t going to happen.
            </p>
            <p className={P}>
              So turn it around: <strong>cut down what Black can play, and make sure what&rsquo;s left
              is the mate.</strong> Mating with anything but the queen is hard work here, so the
              question is whether White can rule out 1&hellip;Kxg7 and 1&hellip;h6 while leaving
              1&hellip;Qxg7 available.
            </p>
            <p className={P}>
              <span className={MOVE}>1.Kh6!</span> does exactly that. With the white king on h6, the
              pawn is blocked and cannot move, and g7 is guarded by the king, so the black king
              cannot take there either. Only <span className={MOVE}>1&hellip;Qxg7</span> is left &mdash; and it
              mates.
            </p>
            <MateDiagram example={EXAMPLES.self} />

            <p className={P}>
              Black has no wish to mate, but nothing else is legal. That&rsquo;s a selfmate. On the
              site you only play White; Black replies on its own.
            </p>
          </section>

          {/* ── Where to go next ── */}
          <section className="mt-8 pt-8 border-t-2 border-[var(--hairline)]">
            <h3 className={H2}>That&rsquo;s the whole rule &mdash; now go and play</h3>
            <p className={`${P} mt-2`}>
              That is all three of them. A direct mate, a helpmate and a selfmate differ
              only in who is trying to mate whom &mdash; everything else is ordinary chess. If
              you forget which is which, the &ldquo;?&rdquo; button brings the rules back at any
              time.
            </p>
            {/* Where the reader goes from here depends on where they came from.
                From the home page there is nothing to go back to, so the three
                genres are the way out. From the "?" they already have a problem
                open — and it may be a rated or a review one, which pressing a
                genre here would quietly abandon — so the only exit offered is
                the one back to it. */}
            {fromTutorial ? (
              <button
                type="button"
                onClick={onClose}
                className="nb-btn nb-btn-key nb-shadow-room w-full py-2.5"
              >
                Back to the problem
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-2.5">
                {([
                  { category: 'twomover', label: 'Mate in 2', mark: 'Direct Mates', tint: '--card-direct' },
                  { category: 'help2', label: 'Helpmate in 2', mark: 'Helpmates', tint: '--card-help' },
                  { category: 'self', label: 'Selfmates', mark: 'Selfmates', tint: '--card-self' },
                ] as { category: Category; label: string; mark: string; tint: string }[]).map(link => (
                  /* The same tile the home page uses, drawing and all, so a reader
                     arriving back at the list recognises what they pressed here. */
                  <button
                    key={link.category}
                    type="button"
                    onClick={() => onOpenCategory(link.category)}
                    className={TILE}
                    style={{ backgroundColor: `var(${link.tint})` }}
                  >
                    <span className="block w-14 h-14 mx-auto" aria-hidden="true"><CategoryMark name={link.mark} /></span>
                    <span className="block text-sm sm:text-base font-extrabold leading-tight text-[var(--ink)]">{link.label}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
