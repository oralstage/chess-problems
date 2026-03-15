import type { Genre, ProblemProgress } from '../types';

interface ModeSelectorProps {
  onSelectMode: (genre: Genre) => void;
  progress: Record<Genre, ProblemProgress>;
  problemCounts: Record<Genre, number>;
}

const MODES: { genre: Genre; title: string; subtitle: string; icon: string; color: string; description: string }[] = [
  {
    genre: 'direct',
    title: 'ダイレクトメイト',
    subtitle: 'Direct Mate',
    icon: '♚',
    color: 'from-blue-500 to-blue-700',
    description: '白が指定手数以内にチェックメイトを強制する。最もオーソドックスな形式。',
  },
  {
    genre: 'help',
    title: 'ヘルプメイト',
    subtitle: 'Helpmate',
    icon: '🤝',
    color: 'from-green-500 to-green-700',
    description: '黒白が協力してメイトする。通常のチェスとは逆の発想。',
  },
  {
    genre: 'self',
    title: 'セルフメイト',
    subtitle: 'Selfmate',
    icon: '🔄',
    color: 'from-purple-500 to-purple-700',
    description: '白が黒にメイトさせることを強制する。黒はメイトしたくないが抵抗できない。',
  },
  {
    genre: 'study',
    title: 'スタディ',
    subtitle: 'Study',
    icon: '📖',
    color: 'from-amber-500 to-amber-700',
    description: '手数制限なしで勝ちやドローを目指す。実戦に最も近い。',
  },
];

export function ModeSelector({ onSelectMode, progress, problemCounts }: ModeSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {MODES.map(mode => {
        const genreProgress = progress[mode.genre] || {};
        const solved = Object.values(genreProgress).filter(s => s === 'solved').length;
        const total = problemCounts[mode.genre] || 0;

        return (
          <button
            key={mode.genre}
            onClick={() => onSelectMode(mode.genre)}
            className="text-left p-5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-cp-primary dark:hover:border-cp-primary transition-all hover:shadow-lg group"
            disabled={total === 0}
          >
            <div className="flex items-start gap-3">
              <div className={`text-3xl w-12 h-12 rounded-lg bg-gradient-to-br ${mode.color} flex items-center justify-center text-white shadow-sm`}>
                {mode.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-900 dark:text-gray-100 group-hover:text-cp-primary transition-colors">
                  {mode.title}
                </h3>
                <p className="text-xs text-gray-400">{mode.subtitle}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {mode.description}
            </p>
            {total > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cp-primary rounded-full transition-all"
                    style={{ width: `${total > 0 ? (solved / total) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 shrink-0">{solved}/{total}</span>
              </div>
            )}
            {total === 0 && (
              <div className="mt-3 text-xs text-gray-400">
                No problems loaded
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
