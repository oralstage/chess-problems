export type Genre = 'direct' | 'help' | 'self' | 'study';

export interface SolutionNode {
  move: string;
  moveUci: string;
  moveSan: string;
  isKey: boolean;
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
  solutionTree: SolutionNode[];
  solutionText: string;
  keywords: string[];
  award: string;
}

export type ProblemStatus = 'solved' | 'skipped' | 'in-progress';

export interface ProblemProgress {
  [problemId: string]: ProblemStatus;
}

export interface GenreStats {
  solved: number;
  streak: number;
  bestStreak: number;
}

export type AppView = 'mode-select' | 'solving' | 'history' | 'themes';

export interface ThemeInfo {
  key: string;
  name: string;
  nameJa: string;
  description: string;
}
