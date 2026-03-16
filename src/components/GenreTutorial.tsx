import type { Genre } from '../types';

interface GenreTutorialProps {
  genre: Genre;
  onClose: () => void;
}

const TUTORIALS: Record<Genre, { title: string; description: string; rules: string[]; icon: string }> = {
  direct: {
    title: 'Direct Mate',
    icon: '♚',
    description: 'The most classical form of chess problem. White plays first and forces checkmate in a specified number of moves, regardless of Black\'s defense.',
    rules: [
      'You play White',
      'Checkmate Black within the specified number of moves',
      'Black\'s best defenses are played automatically',
      'There is exactly one correct first move — the "key"',
      '#2 = mate in 2, #3 = mate in 3, etc.',
    ],
  },
  help: {
    title: 'Helpmate',
    icon: '♔',
    description: 'Black and White cooperate to checkmate Black\'s own king. A completely reversed concept from normal chess — former enemies work toward the same goal.',
    rules: [
      'Black moves first. You control both sides',
      'Both sides cooperate to checkmate the Black king',
      'Play Black\'s move first, then White\'s move',
      'Notation: h#2 = helpmate in 2',
      'Some problems have multiple solutions',
    ],
  },
  self: {
    title: 'Selfmate',
    icon: '♛',
    description: 'White\'s goal is to force Black to deliver checkmate. Black resists — they don\'t want to give mate — but White forces their hand.',
    rules: [
      'You play White',
      'Goal: force Black to checkmate your king',
      'Black resists and is played automatically',
      'Notation: s#2 = selfmate in 2',
      'The objective of chess is completely inverted',
    ],
  },
  study: {
    title: 'Study',
    icon: '♜',
    description: 'The form closest to actual gameplay. No move limit — White must achieve a win or a draw. Often features endgame positions composed by world champions.',
    rules: [
      'You play White',
      '"+" = White wins, "=" = draw is the goal',
      'No move limit',
      'Black\'s responses are played automatically',
      'Endgame positions are most common',
    ],
  },
  retro: {
    title: 'Retro',
    icon: '♚',
    description: 'Retrograde analysis problems. You must deduce the history of the position — what moves led here? — to find the solution. Castling rights, en passant legality, and proof games are common themes.',
    rules: [
      'Analyze the position\'s history before making moves',
      'Castling and en passant rights depend on deduced history',
      'The stipulation varies: #1, #2, h#2, etc.',
      'Some positions have no forward moves — purely analytical',
      'Check the stipulation badge on each problem',
    ],
  },
};

export function GenreTutorial({ genre, onClose }: GenreTutorialProps) {
  const tutorial = TUTORIALS[genre];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">{tutorial.icon}</div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {tutorial.title}
          </h2>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {tutorial.description}
        </p>

        <ul className="space-y-2 mb-6">
          {tutorial.rules.map((rule, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="text-cp-primary font-bold shrink-0">{i + 1}.</span>
              {rule}
            </li>
          ))}
        </ul>

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-cp-primary text-white rounded-lg hover:bg-cp-dark transition-colors font-medium"
        >
          Start Solving
        </button>
      </div>
    </div>
  );
}
