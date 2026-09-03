import { useState } from 'react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

/**
 * The problem list's pager, lifted out unchanged so every paged list — the
 * problem list, author search — moves the same way.
 */
export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  // "Go to page" box: opened from the mobile current/total chip or the
  // desktop "…" — 11k pages are not walkable by arrows alone.
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpValue, setJumpValue] = useState('');

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center mt-3 pb-2 shrink-0">
      <button
        onClick={() => onChange(0)}
        disabled={page === 0}
        className="nb-page w-10 h-10 text-sm disabled:opacity-30"
      >
        &laquo;
      </button>
      <button
        onClick={() => onChange(Math.max(0, page - 1))}
        disabled={page === 0}
        className="nb-page w-10 h-10 text-sm disabled:opacity-30"
      >
        &lsaquo;
      </button>

      {jumpOpen ? (
        // Jump box, shared by both layouts: type a page, Enter to go.
        <form
          className="flex items-center gap-1.5 mx-1"
          onSubmit={(e) => {
            e.preventDefault();
            const n = parseInt(jumpValue);
            if (Number.isFinite(n)) onChange(Math.min(totalPages - 1, Math.max(0, n - 1)));
            setJumpOpen(false);
            setJumpValue('');
          }}
        >
          <input
            autoFocus
            inputMode="numeric"
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value.replace(/\D/g, ''))}
            onBlur={() => { setJumpOpen(false); setJumpValue(''); }}
            placeholder={`1–${totalPages}`}
            className="nb-input w-24 h-10 px-2 text-center text-sm"
            aria-label="Go to page"
          />
          <button type="submit" className="nb-page h-10 px-3 text-sm" onMouseDown={(e) => e.preventDefault()}>
            Go
          </button>
        </form>
      ) : (
        <>
          {/* Narrow screens: five-digit page numbers never fit as a
              button row — a tappable current/total chip opens the jump
              box instead. */}
          <button
            onClick={() => setJumpOpen(true)}
            className="sm:hidden nb-page h-10 px-3 mx-1 text-sm font-bold"
            title="Go to page"
          >
            {page + 1} / {totalPages}
          </button>
          <div className="hidden sm:flex items-center justify-center gap-0.5 mx-1">
            {Array.from({ length: totalPages }, (_, i) => i)
              .filter(i => {
                if (i === 0 || i === totalPages - 1) return true;
                if (Math.abs(i - page) <= 2) return true;
                return false;
              })
              .reduce<(number | 'ellipsis')[]>((acc, i) => {
                const last = acc[acc.length - 1];
                if (typeof last === 'number' && i - last > 1) {
                  acc.push('ellipsis');
                }
                acc.push(i);
                return acc;
              }, [])
              .map((item, idx) =>
                item === 'ellipsis' ? (
                  <button
                    key={`e${idx}`}
                    onClick={() => setJumpOpen(true)}
                    className="nb-page h-10 px-2 text-sm text-[var(--faint)]"
                    title="Go to page…"
                  >
                    &hellip;
                  </button>
                ) : (
                  <button
                    key={item}
                    onClick={() => onChange(item)}
                    className={`nb-page h-10 min-w-10 px-1.5 text-sm ${page === item ? 'nb-page-on' : ''}`}
                  >
                    {item + 1}
                  </button>
                )
              )}
          </div>
        </>
      )}

      <button
        onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
        disabled={page === totalPages - 1}
        className="nb-page w-10 h-10 text-sm disabled:opacity-30"
      >
        &rsaquo;
      </button>
      <button
        onClick={() => onChange(totalPages - 1)}
        disabled={page === totalPages - 1}
        className="nb-page w-10 h-10 text-sm disabled:opacity-30"
      >
        &raquo;
      </button>
    </div>
  );
}
