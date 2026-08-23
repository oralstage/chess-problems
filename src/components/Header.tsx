import { useEffect, useRef, useState } from 'react';
import type { AppView, Genre, PrintMode } from '../types';

interface HeaderProps {
  view: AppView;
  currentGenre: Genre | null;
  onBack: () => void;
  onShowHelp?: () => void;
  onOpenMenu?: () => void;
  onOpenProblemList?: () => void;
  onOpenFilters?: () => void;
  activeFilterCount?: number;
  onShowSiteStats?: () => void;
  ratedMode?: boolean;
  reviewMode?: boolean;
  printMode?: PrintMode;
  onSetPrintMode?: (mode: PrintMode) => void;
  hasMenuBadge?: boolean;
}

// Grouped by target device — the hatched mode is for the thermal printer, not
// the sign, and mixing the two is how it got used on the wrong one.
// `startsGroup` draws a separator above the entry.
/* Each row is a name and two squares of the board it actually produces. It
   used to carry a line of explanation as well, ending in "Solid #000000" — a
   hex is not something a reader can act on, and once the swatch is there the
   sentence is describing a thing already visible an inch to its left. The
   swatch colours are the same literals as .board-print-* in index.css,
   duplicated on purpose: a shared variable would let the menu and the board
   drift apart without anything failing. */
const PRINT_OPTIONS: {
  value: PrintMode;
  label: string;
  light: string;
  dark: string;
  startsGroup?: boolean;
}[] = [
  { value: 'off', label: 'Normal', light: 'var(--board-l)', dark: 'var(--board-d)' },
  { value: 'wood', label: 'Wood', light: 'rgb(237, 218, 185)', dark: 'rgb(174, 138, 104)', startsGroup: true },
  { value: 'black', label: 'Black', light: '#ffffff', dark: '#000000' },
  { value: 'red', label: 'Red', light: '#ffffff', dark: '#ff0000' },
  { value: 'yellow', label: 'Yellow', light: '#ffffff', dark: '#ffff00' },
  { value: 'bw', label: 'Thermal printer', light: '#ffffff', dark: 'HATCH', startsGroup: true },
];

/* The hatch is the same 10px SVG the board uses, so the swatch is a crop of
   the real thing rather than an impression of it. */
const HATCH =
  "url(\"data:image/svg+xml,%3Csvg width='10' height='10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M-2,2 l4,-4 M0,10 l10,-10 M8,12 l4,-4' stroke='%23000' stroke-width='1'/%3E%3C/svg%3E\")";

function Swatch({ light, dark }: { light: string; dark: string }) {
  const darkCell =
    dark === 'HATCH'
      ? { backgroundColor: '#ffffff', backgroundImage: HATCH, backgroundSize: '10px 10px' }
      : { backgroundColor: dark };
  return (
    <span className="nb-swatch" aria-hidden="true">
      <i style={darkCell} />
      <i style={{ backgroundColor: light }} />
      <i style={{ backgroundColor: light }} />
      <i style={darkCell} />
    </span>
  );
}

function PrintMenu({ printMode, onSetPrintMode }: { printMode: PrintMode; onSetPrintMode: (mode: PrintMode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className={`nb-icon p-1.5 ${printMode !== 'off' ? 'bg-[var(--surface-2)]' : ''}`}
        title="Print / e-paper diagram"
      >
        <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
        </svg>
      </button>
      {open && (
        <div className="nb-plate absolute right-0 top-full mt-2 z-50 py-1.5 min-w-[232px] overflow-hidden">
          {PRINT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onSetPrintMode(opt.value); setOpen(false); }}
              className={`w-full text-left px-3.5 py-2.5 text-base font-bold transition-colors flex items-center gap-2.5 hover:bg-[var(--surface-2)] ${
                opt.startsGroup ? 'mt-1 border-t-2 border-[var(--hairline)] pt-2' : ''
              } ${printMode === opt.value ? 'text-[var(--ink)] font-extrabold' : 'text-[var(--muted)]'}`}
            >
              <span className="w-3.5 shrink-0 text-[var(--ink)] text-sm font-extrabold">{printMode === opt.value ? '✓' : ''}</span>
              <Swatch light={opt.light} dark={opt.dark} />
              <span className="min-w-0">{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* The rated pools go by their short name here, not their full one: the header
   already carries a back button, a "?", a printer and a menu, and "Direct Mate ·
   Rated" pushes them off a 375px screen. These match the labels on the home
   page's three pool buttons, which is where the player just came from. */
const POOL_NAMES: Partial<Record<Genre, string>> = {
  direct: 'Direct',
  help: 'Help',
  self: 'Self',
};

const GENRE_NAMES: Record<Genre, string> = {
  direct: 'Direct Mate',
  help: 'Helpmate',
  self: 'Selfmate',
  study: 'Study',
  retro: 'Retro',
};

export function Header({ view, currentGenre, onBack, onShowHelp, onOpenMenu, onOpenProblemList, onOpenFilters, activeFilterCount, onShowSiteStats: _onShowSiteStats, ratedMode, reviewMode, printMode, onSetPrintMode, hasMenuBadge }: HeaderProps) {
  if (view === 'mode-select') {
    return (
      <header className="flex items-center justify-end gap-2 py-3 px-4">
        {onOpenMenu && (
          <button
            onClick={onOpenMenu}
            className="nb-disc relative"
            title="Menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            {hasMenuBadge && (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[var(--bad)] border-2 border-[var(--ink)]" />
            )}
          </button>
        )}
      </header>
    );
  }

  return (
    <header className="flex items-center justify-between py-3 px-4">
      <div className="flex items-center gap-3">
        {/* Home button */}
        <button
          onClick={onBack}
          className="nb-icon p-1.5"
          title="Home"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
          </svg>
        </button>
        <h1 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">
          {reviewMode
            ? 'Review'
            : ratedMode
              ? `${(currentGenre && POOL_NAMES[currentGenre]) || 'Direct'} · Rated`
              : currentGenre ? GENRE_NAMES[currentGenre] : 'Chess Problems'}
        </h1>
        {onShowHelp && (
          <button
            onClick={onShowHelp}
            className="nb-pill nb-pill-key w-7 h-7 text-sm flex items-center justify-center shrink-0"
            title={`What is ${currentGenre ? GENRE_NAMES[currentGenre] : ''}?`}
          >
            ?
          </button>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        {/* Problem List button (grid icon) */}
        {onOpenProblemList && (
          <button
            onClick={onOpenProblemList}
            className="nb-icon p-1.5"
            title="Problem List"
          >
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
        )}
        {/* Filters button */}
        {onOpenFilters && (
          <button
            onClick={onOpenFilters}
            className="nb-icon p-1.5 relative"
            title="Filters"
          >
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {(activeFilterCount || 0) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center text-[9px] font-extrabold bg-[var(--ink)] text-[var(--surface)] rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}
        {onSetPrintMode && <PrintMenu printMode={printMode ?? 'off'} onSetPrintMode={onSetPrintMode} />}
        {/* Hamburger menu button */}
        {onOpenMenu && (
          <button
            onClick={onOpenMenu}
            className="nb-icon p-1.5 relative"
            title="Menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            {hasMenuBadge && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[var(--bad)] border border-[var(--ink)]" />
            )}
          </button>
        )}
      </div>
    </header>
  );
}
