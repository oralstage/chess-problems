import { useEffect, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import type { ThemeInsight } from '../utils/themeInsight';

/* Post-solve theme appreciation cards — the verified ones only (the util
   already dropped anything it could not locate on the board). Same measured
   mini board as ThemeGuidePage: a fixed width overflows either the phone
   column or the desktop one. */

const FILES = 'abcdefgh';

/** Square centre in a 0–100 viewBox (white at the bottom, as the board). */
function center(sq: string): [number, number] {
  return [
    (FILES.indexOf(sq[0]) + 0.5) * 12.5,
    (8 - Number(sq[1]) + 0.5) * 12.5,
  ];
}

/** Plain ink arrow with a white casing so it reads on any square colour.
    `nudge` shifts the whole arrow sideways (to the right of its direction of
    travel) — used only when the reverse arrow is also drawn, so an out-and-
    back pair sits side by side instead of stacking on one line. */
function Arrow({ from, to, nudge = 0 }: { from: string; to: string; nudge?: number }) {
  const [x1, y1] = center(from);
  const [x2, y2] = center(to);
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux; // unit perpendicular
  const ox = px * nudge, oy = py * nudge;
  const headLen = 4.6, headW = 2.5;
  const tipX = x2 - ux * 1.2 + ox, tipY = y2 - uy * 1.2 + oy;
  const baseX = tipX - ux * headLen, baseY = tipY - uy * headLen;
  const sx = x1 + ux * 3.2 + ox, sy = y1 + uy * 3.2 + oy;
  const headPts = `${tipX},${tipY} ${baseX + px * headW},${baseY + py * headW} ${baseX - px * headW},${baseY - py * headW}`;
  return (
    <g>
      <line x1={sx} y1={sy} x2={baseX} y2={baseY} stroke="white" strokeWidth={3.6} strokeLinecap="round" />
      <polygon points={headPts} fill="#1d1d16" stroke="white" strokeWidth={0.8} />
      <line x1={sx} y1={sy} x2={baseX + ux * 0.6} y2={baseY + uy * 0.6} stroke="#1d1d16" strokeWidth={2.1} strokeLinecap="round" />
    </g>
  );
}

function MiniBoard({ fen, marks, arrows }: {
  fen: string;
  marks?: Record<string, React.CSSProperties>;
  arrows?: { from: string; to: string }[];
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(240);

  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const measure = () => setSize(el.clientWidth || 240);
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
          customSquareStyles={marks || {}}
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
      </div>
    </div>
  );
}

export function ThemeInsightCards({ insights }: { insights: ThemeInsight[] }) {
  if (insights.length === 0) return null;
  return (
    <>
      {insights.map(ins => (
        <div key={ins.theme} className="nb-plate nb-shadow-room p-3 space-y-2">
          <div className="text-xs font-extrabold tracking-widest uppercase text-[var(--muted)]">
            Theme spotlight · {ins.title}
          </div>
          <p className="text-sm leading-relaxed text-[var(--ink)]">{ins.text}</p>
          {ins.fen && (
            <div className="mx-auto w-full max-w-[260px] pt-1">
              <MiniBoard fen={ins.fen} marks={ins.marks} arrows={ins.arrows} />
            </div>
          )}
        </div>
      ))}
    </>
  );
}
