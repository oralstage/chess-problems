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
      'You play White first. The key \u2014 the answer \u2014 is the one move that forces mate within the given number of moves whatever Black defends \u2014 it does not have to be a check.',
      'Black answers by itself, defending as well as it possibly can.',
      'The mate lands on the last move exactly. #2 = mate in 2, #3 = mate in 3.',
    ],
    general: [],
  },
  help: {
    title: 'Helpmate',
    mark: 'Helpmates',
    aim: 'Both sides are trying to mate the black king.',
    steps: [
      'You play Black first. Black wants its own king mated, so its move is the one that makes White\u2019s mate possible \u2014 it never defends.',
      'Then you play White. White wants to mate the black king too, so its move takes what Black just gave it.',
      'Alternate until White\u2019s last move mates the black king. h#2 = two moves each.',
    ],
    general: [
      'Usually only one line works \u2014 but some helpmates are composed with several on purpose, unlike a direct mate where a second solution would be a flaw.',
    ],
  },
  self: {
    title: 'Selfmate',
    mark: 'Selfmates',
    aim: 'White wants the white king mated. Black does not want to deliver it \u2014 but is left with no other legal move.',
    steps: [
      'You play White first. The key \u2014 the answer \u2014 is the one move that leaves Black no legal way out but to deliver the mate.',
      'Black answers by itself, avoiding the mate as long as it can \u2014 it only delivers when nothing else is legal.',
      'Black is forced to mate the white king on the last move. s#1 = one move each \u2014 White moves, Black mates.',
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
      'There is no move count \u2014 it ends when the outcome is decided.',
    ],
    general: [
      'Win studies end when a decisive advantage is reached (e.g. queening a pawn).',
      'Draw studies end when a theoretical draw is achieved.',
      'To keep playing past that, use the Lichess links. "Analysis \u2197" opens the analysis board. "Play \u2197" opens the board editor \u2014 click "CONTINUE FROM HERE", then choose "Play against the computer".',
    ],
  },
  retro: {
    title: 'Retro',
    mark: 'Retros',
    aim: 'Play whatever the stipulation badge asks for \u2014 #1, #2, h#2, whichever it says next to the problem number.',
    steps: [
      'Work out whose turn it even is. Deduce what moves could have led here \u2014 that settles the turn, castling rights, and en passant.',
      'You can move either colour, but only a move by the side whose turn it really is can be the answer. Usually that is White \u2014 but if White\u2019s move would have been impossible, it is Black.',
    ],
    general: [],
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
