/* One drawing per row, at the head of it.

   personal-site's rule is that nothing goes behind a card or under body copy —
   a drawing there costs reading and buys decoration. These are the exception:
   on that site the rows say "events" and "books" and explain themselves, while
   "Selfmate" and "Retro" are jargon, so the picture does the teaching the words
   cannot.

   They are deliberately NOT chess pieces. Drawing the real Cburnett pieces was
   tried and pulled: at 44px they read as clip art of a chess set rather than as
   an idea, and the page already has a board on it. What each row needs shown is
   the RELATIONSHIP its name describes — cooperating, turning a thing back on
   yourself, weighing, investigating — so these are little figures and objects,
   with no chess in them at all.

   No acid anywhere: --acid means "the thing to press", and a row's drawing is
   not the button. */

const box = {
  viewBox: '0 0 44 44',
  fill: 'none' as const,
  stroke: 'var(--ink)',
  strokeWidth: 2.6,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
};

const CREAM = 'var(--surface)';
const SAGE = 'var(--surface-2)';
const GREEN = 'var(--board-d)';
const RED = 'var(--bad)';

/* The three rated pools reuse their genre's drawing, so the button for the
   direct pool is recognisably the same object as the Direct Mates row. Pulled
   out as fragments rather than duplicated: a change to the target has to reach
   both places or the two stop being the same thing. */
const DirectGlyph = (
  <>
    <circle cx="29" cy="22" r="13" fill={CREAM} />
    <circle cx="29" cy="22" r="7.6" fill={SAGE} />
    <circle cx="29" cy="22" r="2.6" fill={RED} stroke="none" />
    <g transform="translate(29 22) rotate(45)">
      <path d="M-6 0 L-21 0" strokeWidth={2.6} />
      <path d="M0 0 L-7 -4.2 L-7 4.2 Z" fill="var(--ink)" strokeWidth={2} />
      <path d="M-22 -1 L-14.5 -1 L-16.5 -6.4 L-24 -5 Z" fill="var(--ink)" strokeWidth={1.8} />
      <path d="M-22 1 L-14.5 1 L-16.5 6.4 L-24 5 Z" fill="var(--ink)" strokeWidth={1.8} />
    </g>
  </>
);

const HelpGlyph = (
  <g strokeWidth={2}>
    <path d="M22.23 22.78 L24.08 25.59 L21.38 27.53 L19.31 24.87 L15.82 25.69 L15.15 28.99 L11.86 28.46 L12.27 25.12 L9.22 23.23 L6.41 25.08 L4.47 22.38 L7.13 20.31 L6.31 16.82 L3.01 16.15 L3.54 12.86 L6.88 13.27 L8.77 10.22 L6.92 7.41 L9.62 5.47 L11.69 8.13 L15.18 7.31 L15.85 4.01 L19.14 4.54 L18.73 7.88 L21.78 9.77 L24.59 7.92 L26.53 10.62 L23.87 12.69 L24.69 16.18 L27.99 16.85 L27.46 20.14 L24.12 19.73 Z" fill={CREAM} />
    <circle cx="15.5" cy="16.5" r="3.4" fill={SAGE} />
    <path d="M27.96 23.98 L27.62 21.45 L30.64 21.00 L31.04 23.52 L34.02 24.45 L35.78 22.60 L38.01 24.69 L36.30 26.57 L37.42 29.48 L39.97 29.70 L39.73 32.75 L37.18 32.58 L35.62 35.28 L37.02 37.41 L34.49 39.12 L33.04 37.02 L29.96 37.48 L29.17 39.91 L26.25 39.00 L26.98 36.55 L24.70 34.43 L22.32 35.32 L21.21 32.48 L23.58 31.52 L23.82 28.42 L21.63 27.11 L23.16 24.47 L25.38 25.72 Z" fill={GREEN} />
    <circle cx="30.5" cy="30.5" r="2.8" fill={CREAM} />
  </g>
);

const SelfGlyph = (
  <>
    <path d="M22 5v-2" strokeWidth={2.6} />
    <circle cx="22" cy="4" r="3.4" fill="none" strokeWidth={2.6} />
    <path d="M7 34V22a15 15 0 0 1 30 0v12z" fill={CREAM} />
    <path d="M14.5 34V12.5M22 34V8M29.5 34V12.5" strokeWidth={2.6} />
    <path d="M8 24h28" strokeWidth={2.4} />
    <rect x="4" y="34" width="36" height="6" rx="3" fill={GREEN} />
  </>
);

/* The genre's own object at full size, with the rating's rising line on a plate
   in the bottom-left corner. The button for the direct pool has to read as the
   target first and as "rated" second, so the drawing keeps its size and the line
   takes the corner the stipulation takes on a free-play tile. */
function RatedComposite({ glyph }: { glyph: React.ReactNode }) {
  return (
    <svg {...box}>
      {glyph}
      <RatedPlate />
    </svg>
  );
}

/* The rating plate sits where the stipulation plate sits — bottom-left, same
   size, same build — so a pool tile and a free-play tile of the same genre
   differ in one corner and nowhere else. It was a chip in the top-right corner
   with the drawing shrunk to 0.8 to clear it, which cost the genre's own object
   its size to make room for the smaller of the two marks. */
function RatedPlate() {
  return (
    <g>
      <rect x={1.5} y={29.5} width={21} height={13} rx={4} fill={CREAM} strokeWidth={2} />
      <path d="M5 39l4.5-3 3 1.5 6.5-5" strokeWidth={3} stroke="var(--acid)" />
    </g>
  );
}

/* The stipulation is drawn into the mark itself, bottom-left, on a plate in
   its move-count colour so it matches the badge the problem page shows.

   Inset from the box rather than flush with it: a 2-wide stroke on a rect at
   x=0 puts half its width at x=-1, outside the viewBox, so the left and bottom
   edges of the plate were being clipped and it read as a plate running off the
   drawing rather than one sitting on it.

   Bottom-left, not bottom-right: every mark that takes one puts its weight on
   the right — the target's disc on Direct Mates, the small gear on Helpmates —
   so a plate in that corner lands on top of the drawing. The lower-left of
   this box is empty in both. */
function Stip({ text }: { text: string }) {
  const w = 6.2 * text.length + 8;
  return (
    <g>
      <rect x={1.5} y={29.5} width={w} height={13} rx={4} fill="var(--stip-bg, var(--surface))" strokeWidth={2} />
      <text
        x={1.5 + w / 2}
        y={39.1}
        textAnchor="middle"
        fill="var(--ink)"
        stroke="none"
        fontSize="10"
        fontWeight="800"
        fontFamily="'IBM Plex Mono', ui-monospace, monospace"
      >
        {text}
      </text>
    </g>
  );
}

export function CategoryMark({ name, stip }: { name: string; stip?: string }) {
  const body = markBody(name);
  if (!body) return null;
  if (!stip) return body;
  return (
    <svg {...box}>
      {body.props.children}
      <Stip text={stip} />
    </svg>
  );
}

function markBody(name: string) {
  switch (name) {
    /* Straight at it, first time. The arrow is a real arrow — head, shaft and
       a solid fletch — not a UI chevron. It is still DRAWN horizontal, so head,
       shaft and fletch line up exactly, and then rotated as a whole: at 44px an
       arrow whose parts are each angled separately stops reading as an arrow
       and starts reading as an arrow-shaped symbol. A rigid rotation cannot do
       that to it.

       It comes from the upper left rather than from due left because the
       stipulation plate moved to the bottom-left corner, and a horizontal
       shaft ran straight into it. The tail is 5 units shorter than it was, or
       the fletch leaves the top of the box once it is turned. */
    case 'Direct Mates':
      return <svg {...box}>{DirectGlyph}</svg>;

    case 'Rated Direct':
      return <RatedComposite glyph={DirectGlyph} />;

    case 'Rated Helpmates':
      return <RatedComposite glyph={HelpGlyph} />;

    case 'Rated Selfmates':
      return <RatedComposite glyph={SelfGlyph} />;

    /* Both sides pulling the same way. */
    case 'Helpmates':
      return <svg {...box}>{HelpGlyph}</svg>;

    /* No way out. Built as one object, the way the balance below is — that is
       the only mark in this set that read first time, every time. */
    case 'Selfmates':
      return <svg {...box}>{SelfGlyph}</svg>;

    /* Win or draw — the position is weighed, not counted in moves. */
    case 'Studies':
      return (
        <svg {...box}>
          <path d="M22 9v25M15 34h14" />
          <path d="M6 15h32" />
          <path d="M6 15l-4.5 9.5h9zM38 15l-4.5 9.5h9z" fill={GREEN} />
          <circle cx="22" cy="9" r="2.6" fill={CREAM} />
        </svg>
      );

    /* Work out what already happened. An hourglass rather than the
       magnifying glass that was here first — a bare magnifier is the search
       glyph and reads as "find a problem", not as "the position has a past".
       A clock face was the other candidate and was dropped: in a chess
       context that is a chess clock, and this site has no timing at all. */
    case 'Retros':
      return (
        <svg {...box}>
          <path d="M9 4h26M9 40h26" strokeWidth={4} />
          <path d="M12 4c0 10 10 14 10 18s-10 8-10 18" />
          <path d="M32 4c0 10-10 14-10 18s10 8 10 18" />
          <path d="M14.5 8h15c-0.6 6-7.5 9-7.5 12s-6.9-6-7.5-12z" fill={GREEN} stroke="none" />
          <path d="M15 36h14c-0.8-5-7-7-7-8s-6.2 3-7 8z" fill={GREEN} stroke="none" />
        </svg>
      );

    /* An ordinary fairy — the point is that she is not a chess piece. */
    case 'Fairy Chess':
      return (
        <svg {...box}>
          <ellipse cx="11" cy="19" rx="5.2" ry="7.6" transform="rotate(-30 11 19)" fill={GREEN} />
          <ellipse cx="33" cy="19" rx="5.2" ry="7.6" transform="rotate(30 33 19)" fill={GREEN} />
          <path d="M22 15L15 32h14z" fill={CREAM} />
          <circle cx="22" cy="9" r="5.6" fill={CREAM} />
          <path d="M19 32.5v4M25 32.5v4" strokeWidth={2.2} />
          <path d="M29 25L35.5 19.5" strokeWidth={2.4} />
          <path d="M37.5 14l1.3 3.3 3.3 1.3-3.3 1.3-1.3 3.3-1.3-3.3-3.3-1.3 3.3-1.3z" fill="var(--ink)" stroke="none" />
          <path d="M5.5 30l0.9 2.2 2.2 0.9-2.2 0.9-0.9 2.2-0.9-2.2L2.4 33.1l2.2-0.9z" fill="var(--ink)" stroke="none" />
        </svg>
      );

    /* The rating itself: a line, because a rating is a path over time. This
       replaced a sword — the section is "For you" now, not "Rated Play", and
       a duel is the wrong idea for problems chosen to fit you. */
    case 'Rated Mode':
      return (
        <svg {...box}>
          {/* currentColor, not --ink: this mark is the only one that sits on
              an ink card as well as on cream ones, and a hardcoded ink axis
              disappears there. Everywhere else the ambient colour IS --ink. */}
          <path d="M4 38h36" strokeWidth={2.6} stroke="currentColor" />
          <path d="M6 32l9-9 7 5.5 7-13 9-7" strokeWidth={4.5} stroke="var(--acid)" />
        </svg>
      );

    /* Come back to it on the day it is due. */
    case 'Review Mode':
      return (
        <svg {...box}>
          <rect x="5" y="10" width="34" height="29" rx="4" fill={CREAM} />
          <path d="M5 19h34" />
          <path d="M14 5v8M30 5v8" />
          <path d="M15.5 29.5l4.6 4.6 9-9.6" stroke={GREEN} strokeWidth={4} />
        </svg>
      );

    /* "For you" — a wrapped parcel. A tag was tried first and read as a price
       tag, which is about the thing rather than about who it is for. */
    case 'Tag':
      return (
        <svg {...box}>
          <rect x="4" y="17" width="36" height="22" rx="3" fill={CREAM} />
          <rect x="2" y="12" width="40" height="8" rx="2.5" fill={GREEN} />
          <path d="M22 12v27" strokeWidth={3.4} />
          <path d="M22 12c-5 0-9-2-9-5s5-4 9 5c4-7 9-8 9-5s-4 5-9 5z" fill={GREEN} />
        </svg>
      );

    /* The beginner's guide on the home page. */
    case 'Book':
      return (
        <svg {...box}>
          <path d="M6 8c5-2.5 10-2.5 15 1v27c-5-3.5-10-3.5-15-1z" fill={CREAM} />
          <path d="M38 8c-5-2.5-10-2.5-15 1v27c5-3.5 10-3.5 15-1z" fill={GREEN} />
          <path d="M22 9v27" strokeWidth={2.2} />
          <path d="M27.5 4v12l3.5-2.6L34.5 16V4z" fill={RED} />
        </svg>
      );

    /* The same book with a flag planted in it, for the Japanese edition. The
       ribbon comes off rather than sitting alongside — two things stuck in the
       top of one small book fight each other, and the flag is the one carrying
       the information. */
    case 'Book JP':
      return (
        <svg {...box}>
          <path d="M6 8c5-2.5 10-2.5 15 1v27c-5-3.5-10-3.5-15-1z" fill={CREAM} />
          <path d="M38 8c-5-2.5-10-2.5-15 1v27c5-3.5 10-3.5 15-1z" fill={GREEN} />
          <path d="M22 9v27" strokeWidth={2.2} />
          <path d="M22 2.6v17" strokeWidth={2.4} />
          {/* 3:2, with the disc three fifths of the height and centred — the
              flag's own proportions, since at this size a wrong ratio is the
              only thing that would stop it reading as that flag. */}
          <rect x="22" y="2" width="20.5" height="13.7" rx="1.4" fill={CREAM} strokeWidth={2.2} />
          <circle cx="32.25" cy="8.85" r="4.1" fill={RED} stroke="none" />
        </svg>
      );

    default:
      return null;
  }
}

export function MarkSlot({ name }: { name: string }) {
  return (
    <span className="shrink-0 w-11 h-11 mr-3.5 block" aria-hidden="true">
      <CategoryMark name={name} />
    </span>
  );
}
