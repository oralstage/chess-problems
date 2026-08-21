import type { Genre } from '../types';
import { CategoryMark } from './CategoryMark';

interface GenreTutorialProps {
  genre: Genre;
  onClose: () => void;
}

/* Two tiers.

   `steps` is how you operate this genre, in the order you meet it: which
   side you hold, what the opponent does, and what you are trying to reach.
   That is the whole thing, and it is what someone arriving cold needs.

   It replaced a prose description that had been sitting at the top being
   skipped. The description was abstract — helpmate's said "a completely
   reversed concept from normal chess, former enemies work toward the same
   goal", which is true and tells you nothing you can act on. Knowing the
   concept is inverted does not tell you that Black moves first, that you
   enter both moves, or which king ends up mated. Those three things do.

   `general` is what is true of chess problems at large. It cannot be
   dropped — you cannot solve without knowing what #2 means — but it is not
   what the genre IS, so it sits quietest, under a rule. */
const TUTORIALS: Record<Genre, {
  title: string;
  mark: string;
  steps: string[];
  general: string[];
}> = {
  direct: {
    title: 'Direct Mate',
    mark: 'Direct Mates',
    steps: [
      // "not necessarily a check" belongs in step one, where the move is
      // actually being chosen. It used to sit at the bottom as a general
      // note, which is where a beginner has already guessed wrong.
      'You play White. The key — the answer — is the one move that forces mate in the given number of moves (#2 = mate in 2, #3 = mate in 3), whatever Black defends. It does not have to be a check',
      'Black answers by itself, defending as well as it possibly can',
      'The mate lands on that last move — not sooner, not later',
    ],
    general: [],
  },
  help: {
    title: 'Helpmate',
    mark: 'Helpmates',
    steps: [
      'You play both sides — Black moves first',
      // The axis that separates this from selfmate, and the answer to "what
      // do I play for Black?". Black is not defending here; it is helping.
      'Both sides want Black mated — Black walks into it on purpose',
      'The mate lands on the last move — h#2 means each side moves twice',
    ],
    general: [
      'Some problems have multiple solutions',
    ],
  },
  self: {
    title: 'Selfmate',
    mark: 'Selfmates',
    steps: [
      'You play White. The key is the one move that leaves Black no way out but to mate you in the given number of moves (s#2 = two moves)',
      'Black answers by itself, and does everything it can NOT to mate you',
      'Black is forced to mate you on that last move — not sooner, not later',
    ],
    general: [],
  },
  study: {
    title: 'Study',
    mark: 'Studies',
    steps: [
      'You play White',
      'Black answers by itself, defending as well as it possibly can',
      'Win, or save the draw — there is no move count',
    ],
    general: [
      'Win studies end when a decisive advantage is reached (e.g. queening a pawn)',
      'Draw studies end when a theoretical draw is achieved',
      'Solutions end when the outcome is decided — to continue playing, use the Lichess links. "Analysis ↗" opens the analysis board. "Play ↗" opens the board editor — click "CONTINUE FROM HERE", then choose "Play against the computer"',
    ],
  },
  retro: {
    title: 'Retro',
    mark: 'Retros',
    steps: [
      'You play both sides — and working out whose turn it is IS the puzzle',
      'Deduce the history first: whose move, castling rights, en passant',
      'Then solve whatever the stipulation badge asks for',
    ],
    general: [
      'Usually White to move, but if White\'s move would be impossible, it\'s Black\'s turn',
      'Castling and en passant rights depend on what moves could have led to this position',
      'The badge varies: #1, #2, h#2, etc.',
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

        <ul className="space-y-2.5 mb-4">
          {tutorial.steps.map((step, i) => (
            <li key={i} className="flex gap-2.5 text-base font-bold text-[var(--ink)] leading-snug">
              <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--ink)] text-[var(--surface)] text-[11px] font-extrabold flex items-center justify-center mt-0.5">{i + 1}</span>
              {step}
            </li>
          ))}
        </ul>

        {tutorial.general.length > 0 && (
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
        )}

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
