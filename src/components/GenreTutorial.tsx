import type { Genre } from '../types';

interface GenreTutorialProps {
  genre: Genre;
  onClose: () => void;
}

const TUTORIALS: Record<Genre, { title: string; description: string; rules: string[]; icon: string }> = {
  direct: {
    title: 'ダイレクトメイト (Direct Mate)',
    icon: '♚',
    description: '最もオーソドックスなチェスプロブレムの形式です。白が先手で、黒がどう応じても指定手数以内にチェックメイトを達成します。',
    rules: [
      '白番です。あなたが白を操作します',
      '指定手数以内にチェックメイトしてください',
      '黒の応手はすべて最善手が自動で指されます',
      '正解は1つだけ。これを「キームーブ (key)」と呼びます',
      '#2 = 2手詰め、#3 = 3手詰め',
    ],
  },
  help: {
    title: 'ヘルプメイト (Helpmate)',
    icon: '🤝',
    description: '黒と白が協力して、黒のキングをチェックメイトする問題です。通常のチェスとは全く逆の発想で、敵同士が同じ目的のために動きます。',
    rules: [
      '黒が先手です。あなたが黒と白の両方を操作します',
      '白黒が協力して黒キングをメイトします',
      'まず黒の手を指し、次に白の手を指します',
      '手数は「h#2」のように表記されます',
      '複数の解がある場合があります',
    ],
  },
  self: {
    title: 'セルフメイト (Selfmate)',
    icon: '🔄',
    description: '白の目的は、黒に自分（白）をチェックメイト「させる」こと。黒はメイトしたくないので抵抗しますが、白は黒にメイトを強制します。',
    rules: [
      '白番です。あなたが白を操作します',
      '目的: 黒に白キングをメイトさせること',
      '黒はメイトしたくないので抵抗します（自動再生）',
      '手数は「s#2」のように表記されます',
      '通常のチェスの目的が完全に逆転しています',
    ],
  },
  study: {
    title: 'スタディ (Study)',
    icon: '📖',
    description: '実戦に最も近い形式です。手数制限なしで、白が勝ちまたはドローを達成します。エンドゲームの局面が多く、世界チャンピオンも作曲しています。',
    rules: [
      '白番です。あなたが白を操作します',
      '「+」= 白勝ち、「=」= ドロー達成が目標',
      '手数制限はありません',
      '黒の応手は自動で指されます',
      '実戦的なエンドゲームの局面が多い',
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
