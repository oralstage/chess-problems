import { useEffect, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import type { ThemeInsight } from '../utils/themeInsight';

/* Post-solve theme appreciation cards — the verified ones only (the util
   already dropped anything it could not locate on the board). Same measured
   mini board as ThemeGuidePage: a fixed width overflows either the phone
   column or the desktop one. */

function MiniBoard({ fen, marks }: { fen: string; marks?: Record<string, React.CSSProperties> }) {
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
      <div style={{ width: size, height: size }}>
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
              <MiniBoard fen={ins.fen} marks={ins.marks} />
            </div>
          )}
        </div>
      ))}
    </>
  );
}
