import type { ThemeInfo } from '../types';

export const THEMES: ThemeInfo[] = [
  { key: 'Zugzwang', name: 'Zugzwang', nameJa: 'ツークツワンク', description: 'Any move by the side to move worsens their position. The key move creates a position where Black is in zugzwang.' },
  { key: 'Model mate', name: 'Model Mate', nameJa: 'モデルメイト', description: 'A checkmate where every square around the king is blocked or attacked exactly once, with no redundant pieces.' },
  { key: 'Quiet move', name: 'Quiet Move', nameJa: '静かな手', description: 'A move that is neither a check, capture, nor direct threat. Often the hardest type of key to find.' },
  { key: 'Active sacrifice', name: 'Active Sacrifice', nameJa: '積極的犠牲', description: 'The key move deliberately gives up material to set up the mating net.' },
  { key: 'Flight giving key', name: 'Flight-Giving Key', nameJa: '逃げ道を与える鍵手', description: 'The key move gives the black king an extra escape square, yet mate is still forced.' },
  { key: 'Battery', name: 'Battery', nameJa: 'バッテリー', description: 'Two pieces aligned on a line so that moving the front piece reveals an attack by the rear piece.' },
  { key: 'Pin', name: 'Pin', nameJa: 'ピン', description: 'A piece is immobilized because moving it would expose its king to check.' },
  { key: 'Interference', name: 'Interference', nameJa: '干渉', description: 'A piece is placed between two enemy pieces to cut off their mutual defense or coordination.' },
  { key: 'Decoy', name: 'Decoy', nameJa: 'デコイ', description: 'A piece is lured to a square where it becomes vulnerable or blocks its own side.' },
  { key: 'Block', name: 'Block', nameJa: 'ブロック', description: 'A piece is forced to occupy a square, blocking the king\'s escape or another piece\'s line.' },
  { key: 'Unpinning', name: 'Unpinning', nameJa: 'アンピニング', description: 'The key move unpins a black piece, which then must move and allow mate.' },
  { key: 'Cross-check', name: 'Cross-Check', nameJa: 'クロスチェック', description: 'Black gives check in reply, but White delivers mate through a counter-check.' },
  { key: 'Switchback', name: 'Switchback', nameJa: 'スイッチバック', description: 'A piece returns to the square it previously occupied.' },
  { key: 'Line opening', name: 'Line Opening', nameJa: 'ライン開放', description: 'A line (file, rank, or diagonal) is opened for another piece to use.' },
  { key: 'Line closing', name: 'Line Closing', nameJa: 'ライン閉鎖', description: 'A piece blocks a line to cut off enemy defense or escape routes.' },
  { key: 'Self-block', name: 'Self-Block', nameJa: 'セルフブロック', description: 'A black piece blocks its own king\'s escape square.' },
  { key: 'Checking key', name: 'Checking Key', nameJa: 'チェックする鍵手', description: 'The key move gives check. Generally considered less elegant in problems.' },
  { key: 'Castling', name: 'Castling', nameJa: 'キャスリング', description: 'The key move or a variation involves castling.' },
  { key: 'En passant', name: 'En Passant', nameJa: 'アンパッサン', description: 'An en passant capture plays a role in the solution.' },
  { key: 'Promotion', name: 'Promotion', nameJa: 'プロモーション', description: 'A pawn promotes as part of the solution.' },
  { key: 'Underpromotion', name: 'Underpromotion', nameJa: 'アンダープロモーション', description: 'A pawn promotes to a knight, bishop, or rook instead of a queen.' },
  { key: 'Ideal mate', name: 'Ideal Mate', nameJa: 'イデアルメイト', description: 'Every piece on the board participates in the mate. The most economical form.' },
  { key: 'Changed mates', name: 'Changed Mates', nameJa: 'チェンジドメイト', description: 'The same black defenses lead to different mates before and after the key.' },
  { key: 'Dual avoidance', name: 'Dual Avoidance', nameJa: 'デュアル回避', description: 'White must choose precisely between multiple potential mates, avoiding duals.' },
  { key: 'Try', name: 'Try', nameJa: 'トライ', description: 'An almost-correct first move that fails to one specific black defense.' },
  { key: 'Waiting move', name: 'Waiting Move', nameJa: '待ち手', description: 'The key move simply passes the move to Black without changing anything. A form of zugzwang.' },
  { key: 'Sacrifice key', name: 'Sacrifice Key', nameJa: '犠牲の鍵手', description: 'The key move sacrifices the most powerful piece available.' },
  { key: 'Miniature', name: 'Miniature', nameJa: 'ミニアチュア', description: 'A problem with 7 or fewer pieces total on the board.' },
  { key: 'Meredith', name: 'Meredith', nameJa: 'メレディス', description: 'A problem with 8 to 12 pieces total on the board.' },
  { key: 'Task', name: 'Task', nameJa: 'タスク', description: 'A problem that demonstrates a maximum of some theme or element.' },
];

export function findTheme(key: string): ThemeInfo | undefined {
  return THEMES.find(t => t.key.toLowerCase() === key.toLowerCase());
}
