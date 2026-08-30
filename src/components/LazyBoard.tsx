import { useEffect, useRef, useState, type ReactNode } from 'react';

/* A list of two hundred diagrams used to mount two hundred chessboards, each of
   them sixty-four squares and a set of pieces, whether or not anyone could see
   it: 22,000 DOM nodes, three seconds before the first frame, and a scroll that
   managed about one frame per second. Only half a dozen tiles are on screen at
   any moment.

   This holds the tile's space and mounts what is inside it once the tile comes
   within a screen's height of the viewport — and lets it go again when it
   leaves, so the count stays bounded however long the history gets. The box
   keeps its size either way, so nothing reflows as boards come and go. */
export function LazyBoard({ size, className, children }: { size: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  /* Somewhere without an IntersectionObserver simply gets every board, as
     before — decided at the first render rather than corrected afterwards. */
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      entries => { for (const e of entries) setNear(e.isIntersecting); },
      { rootMargin: '800px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: size, height: size, background: near ? undefined : 'var(--surface-2)' }}
    >
      {near ? children : null}
    </div>
  );
}
