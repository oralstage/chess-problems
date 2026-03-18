export type Genre = 'direct' | 'help' | 'self' | 'study' | 'retro';

export type Category = 'twomover' | 'threemover' | 'moremover'
  | 'help2' | 'help3' | 'helpmore' | 'self' | 'study' | 'retro';

export interface CategoryDef {
  category: Category;
  title: string;
  brief: string;
  genre: Genre;
  group?: string;       // group label for accordion (e.g. 'Direct Mates', 'Helpmates')
  minMoves?: number;    // undefined = no filter
  maxMoves?: number;    // undefined = no filter, 0 = no upper limit
}

export const CATEGORY_DEFS: CategoryDef[] = [
  // Direct Mates (accordion group)
  { category: 'twomover', title: 'Twomovers', brief: 'White mates in 2 moves', genre: 'direct', group: 'Direct Mates', minMoves: 2, maxMoves: 2 },
  { category: 'threemover', title: 'Threemovers', brief: 'White mates in 3 moves', genre: 'direct', group: 'Direct Mates', minMoves: 3, maxMoves: 3 },
  { category: 'moremover', title: 'Moremovers', brief: 'White mates in 4+ moves', genre: 'direct', group: 'Direct Mates', minMoves: 4, maxMoves: 0 },
  // Helpmates (accordion group)
  { category: 'help2', title: 'Helpmate in 2', brief: 'Cooperate to mate in 2', genre: 'help', group: 'Helpmates', minMoves: 2, maxMoves: 2 },
  { category: 'help3', title: 'Helpmate in 3', brief: 'Cooperate to mate in 3', genre: 'help', group: 'Helpmates', minMoves: 3, maxMoves: 3 },
  { category: 'helpmore', title: 'Helpmate in 4+', brief: 'Cooperate to mate in 4+ moves', genre: 'help', group: 'Helpmates', minMoves: 4, maxMoves: 0 },
  // Standalone categories
  { category: 'self', title: 'Selfmates', brief: 'White forces Black to deliver mate', genre: 'self' },
  { category: 'study', title: 'Studies', brief: 'Endgame compositions — win or draw', genre: 'study' },
  { category: 'retro', title: 'Retros', brief: 'Deduce the history of the position', genre: 'retro' },
];

export interface SolutionNode {
  move: string;
  moveUci: string;
  moveSan: string;
  isKey: boolean;
  isTry: boolean;
  isThreat: boolean;
  isMate: boolean;
  isCheck: boolean;
  annotation: string;
  children: SolutionNode[];
  color: 'w' | 'b';
}

export interface ChessProblem {
  id: number;
  fen: string;
  authors: string[];
  sourceName: string;
  sourceYear: number | null;
  stipulation: string;
  moveCount: number;
  genre: Genre;
  difficulty: string;
  difficultyScore: number;
  solutionTree: SolutionNode[];       // key moves only (for solving)
  fullSolutionTree: SolutionNode[];   // all moves including tries (for "All variations")
  solutionText: string;
  keywords: string[];
  award: string;
}

export type ProblemStatus = 'solved' | 'skipped' | 'in-progress' | 'failed';

export interface ProblemProgress {
  [problemId: string]: ProblemStatus;
}

export interface GenreStats {
  solved: number;
  streak: number;
  bestStreak: number;
}

export type AppView = 'mode-select' | 'solving' | 'history' | 'themes' | 'terms';

export interface ThemeInfo {
  key: string;
  name: string;
  nameJa: string;
  description: string;
}
