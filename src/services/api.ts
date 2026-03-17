/**
 * API client for chess problems D1 backend.
 * Replaces static JSON imports with API calls.
 */

import type { ChessProblem } from '../types';

const API_BASE = '/api';

/** Problem without solutionText (list view) */
export interface ProblemMeta {
  id: number;
  fen: string;
  authors: string[];
  sourceName: string;
  sourceYear: number | null;
  stipulation: string;
  moveCount: number;
  genre: string;
  difficulty: string;
  difficultyScore: number;
  pieceCount: number;
  keywords: string[];
  award: string;
}

export interface StatsResponse {
  counts: Record<string, number>;
  stipulations: string[];
  keywords: string[];
  yearRange: { min: number; max: number };
  pieceRange: { min: number; max: number };
  moveRange: { min: number; max: number };
}

/**
 * Fetch genre stats (counts, available stipulations, keywords, ranges).
 */
export async function fetchStats(genre?: string): Promise<StatsResponse> {
  const url = genre ? `${API_BASE}/stats?genre=${genre}` : `${API_BASE}/stats`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Stats API error: ${res.status}`);
  return res.json();
}

/**
 * Fetch all problems for a genre (without solutionText).
 * Fetches first page immediately, then remaining pages sequentially.
 * Optional onProgress callback for progressive loading.
 */
export async function fetchAllProblems(
  genre: string,
  onProgress?: (problems: ProblemMeta[], total: number, done: boolean) => void,
): Promise<ProblemMeta[]> {
  const PAGE_SIZE = 5000;
  const allProblems: ProblemMeta[] = [];

  // First page
  const res = await fetch(`${API_BASE}/problems?genre=${genre}&pageSize=${PAGE_SIZE}&page=0&sortBy=difficulty&sortOrder=asc`);
  if (!res.ok) throw new Error(`Problems API error: ${res.status}`);
  const data: { problems: ProblemMeta[]; total: number } = await res.json();
  allProblems.push(...data.problems);

  if (allProblems.length >= data.total || data.problems.length < PAGE_SIZE) {
    onProgress?.(allProblems, data.total, true);
    return allProblems;
  }

  // Report first page immediately
  onProgress?.(allProblems, data.total, false);

  // Fetch remaining pages
  let page = 1;
  while (allProblems.length < data.total) {
    const pageRes = await fetch(`${API_BASE}/problems?genre=${genre}&pageSize=${PAGE_SIZE}&page=${page}&sortBy=difficulty&sortOrder=asc`);
    if (!pageRes.ok) break;
    const pageData: { problems: ProblemMeta[]; total: number } = await pageRes.json();
    allProblems.push(...pageData.problems);
    const done = allProblems.length >= data.total || pageData.problems.length < PAGE_SIZE;
    onProgress?.(allProblems, data.total, done);
    if (done) break;
    page++;
  }

  return allProblems;
}

/**
 * Fetch a page of problems with optional filters.
 */
export async function fetchProblemsPage(genre: string, page: number, pageSize = 1000, filters?: Record<string, string>): Promise<{ problems: ProblemMeta[]; total: number }> {
  const params = new URLSearchParams({ genre, pageSize: String(pageSize), page: String(page), sortBy: 'difficulty', sortOrder: 'asc' });
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v);
    }
  }
  const res = await fetch(`${API_BASE}/problems?${params}`);
  if (!res.ok) throw new Error(`Problems API error: ${res.status}`);
  return res.json();
}

/**
 * Fetch a single problem with full solutionText for solving.
 */
export async function fetchProblem(id: number): Promise<ProblemMeta & { solutionText: string }> {
  const res = await fetch(`${API_BASE}/problems/${id}`);
  if (!res.ok) throw new Error(`Problem ${id} not found: ${res.status}`);
  return res.json();
}

/**
 * Fetch today's daily problem (includes solutionText).
 */
export async function fetchDaily(): Promise<ProblemMeta & { solutionText: string }> {
  const res = await fetch(`${API_BASE}/daily`);
  if (!res.ok) throw new Error(`Daily API error: ${res.status}`);
  return res.json();
}

/**
 * Convert ProblemMeta to ChessProblem (without solutionTree — must be built separately).
 */
export function metaToChessProblem(meta: ProblemMeta, solutionText?: string): ChessProblem {
  return {
    id: meta.id,
    fen: meta.fen,
    authors: meta.authors,
    sourceName: meta.sourceName,
    sourceYear: meta.sourceYear,
    stipulation: meta.stipulation,
    moveCount: meta.moveCount,
    genre: meta.genre as ChessProblem['genre'],
    difficulty: meta.difficulty,
    difficultyScore: meta.difficultyScore,
    solutionTree: [],
    fullSolutionTree: [],
    solutionText: solutionText || '',
    keywords: meta.keywords,
    award: meta.award,
  };
}
