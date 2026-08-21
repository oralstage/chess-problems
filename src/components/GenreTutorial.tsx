import type { Genre } from '../types';
import { CategoryMark } from './CategoryMark';

interface GenreTutorialProps {
  genre: Genre;
  onClose: () => void;
}

/* Three parts: the aim, the procedure, and the small print.

   `aim` says what each side is trying to do. It sits above the numbered list
   and outside it, because a motive is not a step — putting it in as item one
   is what stopped the numbers meaning anything. It is also the part that
   makes the rest legible: "the key is the move that forces mate whatever
   Black defends" only explains itself once you know Black is trying not to
   be mated. And the aim is the only line that separates the genres from each
   other, since it names the relationship between the two sides:

     Direct     the aims conflict — mate the black king / survive
     Helpmate   the aims agree — both sides want the black king mated
     Selfmate   the aims conflict AND one side is compelled — Black does not
                want to give mate and is left with no other legal move

   `steps` is then a pure procedure, in the order the moves are made.

   `general` is the small print, under a rule at the quietest weight. */
const TUTORIALS: Record<Genre, {
  title: string;
  mark: string;
  aim: string;
  steps: string[];
  general: string[];
}> = {
  direct: {
    title: 'Direct Mate',
    mark: 'Direct Mates',
    aim: 'White is trying to mate the black king. Black is trying to survive.',
    steps: [
      'You play White first. The key is the one move that still forces the mate whatever Black defends — it does not have to be a check.',
      'Black answers by itself, defending as well as it possibly can.',
      'The mate lands on the last move exactly. #2 = mate in 2, #3 = mate in 3.',
    ],
    general: [],
  },
  help: {
    title: 'Helpmate',
    mark: 'Helpmates',
    aim: 'Both sides are trying to mate the black king. Black wants its own king mated.',
    steps: [
      'You play Black first — the move that opens the way to its own king being mated, never one that defends.',
      'Then you play White — the move that builds toward mating the black king.',
      'Alternate until White’s last move mates the black king. h#2 = two moves each, and usually only one line works.',
    ],
    general: [
      'Some problems have multiple solutions.',
    ],
  },
  self: {
    title: 'Selfmate',
    mark: 'Selfmates',
    aim: 'White wants the white king mated. Black does not want to deliver it — and is left with no other legal move.',
    steps: [
      'You play White first. The key is the one move that leaves Black no legal way out but to deliver the mate.',
      'Black answers by itself, putting off mating the white king for as long as it can.',
      'Black is forced to mate the white king on the last move. s#2 = two moves.',
    ],
    general: [],
  },
  study: {
    title: 'Study',
    mark: 'Studies',
    aim: 'White is trying to win, or to save a position that looks lost. Black is trying to stop it.',
    steps: [
      'You play White first. The answer is the one line that gets there.',
      'Black answers by itself, defending as well as it possibly can.',
      'There is no move count — it ends when the outcome is decided.',
    ],
    general: [
      'Win studies end when a decisive advantage is reached (e.g. queening a pawn).',
      'Draw studies end when a theoretical draw is achieved.',
      'To keep playing past that, use the Lichess links. "Analysis ↗" opens the analysis board. "Play ↗" opens the board editor — click "CONTINUE FROM HERE", then choose "Play against the computer".',
    ],
  },
  retro: {
    title: 'Retro',
    mark: 'Retros',
    // Two steps, not three. "Work out which side is to move" and "deduce what
    // moves could have led here" were the same act written twice — the second
    // one IS how you do the first.
    aim: 'The aim is whatever the badge says — but first you have to work out the position’s past.',
    steps: [
      'Deduce what moves could have led here. That settles whose turn it is, castling rights, and en passant.',
      'Then play the answer the badge asks for — #1, #2, h#2, whichever it says. You hold both sides, and only the solution’s moves are accepted.',
    ],
    general: [
      'Usually White is to move — but if White’s move would have been impossible, it is Black’s turn.',
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

        <p className="nb-panel px-4 py-3 mb-4 text-base font-extrabold text-[var(--ink)] leading-snug">
          {tutorial.aim}
        </p>

        <ol className="space-y-2.5 mb-4">
          {tutorial.steps.map((step, i) => (
            <li key={i} className="flex gap-2.5 text-sm font-semibold text-[var(--ink)] leading-snug">
              <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--ink)] text-[var(--surface)] text-[11px] font-extrabold flex items-center justify-center mt-px">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>

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
