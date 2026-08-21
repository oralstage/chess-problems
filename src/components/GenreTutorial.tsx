import type { Genre } from '../types';
import { CategoryMark } from './CategoryMark';

interface GenreTutorialProps {
  genre: Genre;
  onClose: () => void;
}

/* Three tiers, and the split is deliberate.

   `description` is the only prominent block: it is the answer to "what is
   this". It used to sit above the rules as small grey type and got skipped,
   and the reason was not its size — it was that the first rules repeated it
   word for word. Helpmate said "Black and White cooperate to checkmate
   Black's own king" in the description and "Both sides cooperate to
   checkmate the Black king" in rule two. Reading the top twice buys nothing,
   so the eye learned to skip it. Those duplicates are gone from the lists.

   `specific` is what this genre needs that the description does not already
   say — mostly which side you hold and what the app plays for you.

   `general` is true of chess problems at large. It cannot be dropped (you
   cannot solve without knowing what #2 means) but it is not what this genre
   IS, so it sits quietest, under a rule. Repeated per genre on purpose:
   collecting it in one place would mean the reader has to go and find it. */
const TUTORIALS: Record<Genre, {
  title: string;
  description: string;
  mark: string;
  specific: string[];
  general: string[];
}> = {
  direct: {
    title: 'Direct Mate',
    mark: 'Direct Mates',
    description: 'The most classical form of chess problem. White plays first and forces checkmate in a specified number of moves, regardless of Black\'s defense.',
    specific: [
      'You play White',
      'Black\'s best defenses are played automatically',
    ],
    general: [
      '#2 = mate in 2, #3 = mate in 3, etc.',
      'The solution doesn\'t have to be a series of checks',
    ],
  },
  help: {
    title: 'Helpmate',
    mark: 'Helpmates',
    description: 'Black and White cooperate to checkmate Black\'s own king. A completely reversed concept from normal chess — former enemies work toward the same goal.',
    specific: [
      // "Black moves first" and "play Black's move first" were two lines
      // saying one thing; what is actually unique is that you hold both
      // sides and that the black move is the one you enter first.
      'Black moves first, and you play both sides',
    ],
    general: [
      'h#2 = helpmate in 2',
      'Some problems have multiple solutions',
    ],
  },
  self: {
    title: 'Selfmate',
    mark: 'Selfmates',
    description: 'White\'s goal is to force Black to deliver checkmate. Black resists — they don\'t want to give mate — but White forces their hand.',
    specific: [
      'You play White',
      'Goal: force Black to checkmate your king',
      'Black resists and is played automatically',
    ],
    general: [
      's#2 = selfmate in 2',
    ],
  },
  study: {
    title: 'Study',
    mark: 'Studies',
    description: 'Endgame compositions. Win studies: convert an advantage into a decisive win. Draw studies: save a losing position with stalemate, perpetual check, or fortress.',
    specific: [
      'You play White — Black responds automatically',
      'Win studies end when a decisive advantage is reached (e.g. queening a pawn)',
      'Draw studies end when a theoretical draw is achieved',
    ],
    general: [
      'Solutions end when the outcome is decided — to continue playing, use the Lichess links. "Analysis ↗" opens the analysis board. "Play ↗" opens the board editor — click "CONTINUE FROM HERE", then choose "Play against the computer"',
    ],
  },
  retro: {
    title: 'Retro',
    mark: 'Retros',
    description: 'Retrograde analysis problems. Figure out the history of the position to determine whose turn it is, whether castling is legal, or if en passant is possible — then solve.',
    specific: [
      'Usually White to move, but if White\'s move would be impossible, it\'s Black\'s turn',
      'Castling and en passant rights depend on what moves could have led to this position',
      'You can move both White and Black pieces to explore',
    ],
    general: [
      'Check the stipulation badge — it varies: #1, #2, h#2, etc.',
    ],
  },
};

export function GenreTutorial({ genre, onClose }: GenreTutorialProps) {
  const tutorial = TUTORIALS[genre];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/45 p-4" onClick={onClose}>
      <div
        className="nb-card nb-shadow-nudge max-w-md w-full p-6 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-center mb-4">
          <span className="mx-auto mb-2 block w-16 h-16"><CategoryMark name={tutorial.mark} /></span>
          <h2 className="text-2xl font-extrabold tracking-tight text-[var(--ink)]">
            {tutorial.title}
          </h2>
        </div>

        <p className="text-base font-semibold text-[var(--ink)] leading-snug mb-4">
          {tutorial.description}
        </p>

        <ul className="space-y-2 mb-4">
          {tutorial.specific.map((rule, i) => (
            <li key={i} className="flex gap-2.5 text-sm font-bold text-[var(--ink)] leading-snug">
              <span className="shrink-0 w-2 h-2 rounded-full bg-[var(--ink)] mt-[0.4rem]" />
              {rule}
            </li>
          ))}
        </ul>

        <div className="border-t-2 border-[var(--hairline)] pt-3 mb-6">
          <ul className="space-y-1.5">
            {tutorial.general.map((rule, i) => (
              <li key={i} className="flex gap-2 text-xs font-medium text-[var(--faint)] leading-snug">
                <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--faint)] mt-[0.35rem]" />
                {rule}
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={onClose}
          className="nb-btn nb-btn-key nb-shadow-room w-full py-2.5"
        >
          Start Solving
        </button>
      </div>
    </div>
  );
}
