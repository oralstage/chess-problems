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
 * Returns all problems at once for client-side filtering.
 * Uses pagination internally to fetch all pages.
 */
export async function fetchAllProblems(genre: string): Promise<ProblemMeta[]> {
  const PAGE_SIZE = 1000;
  const all: ProblemMeta[] = [];

  // First page to get total
  const firstRes = await fetch(`${API_BASE}/problems?genre=${genre}&pageSize=${PAGE_SIZE}&page=0&sortBy=difficulty&sortOrder=asc`);
  if (!firstRes.ok) throw new Error(`Problems API error: ${firstRes.status}`);
  const first = await firstRes.json();
  all.push(...first.problems);
  const total = first.total;

  if (total <= PAGE_SIZE) return all;

  // Fetch remaining pages in parallel
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pagePromises: Promise<Response>[] = [];
  for (let p = 1; p < totalPages; p++) {
    pagePromises.push(fetch(`${API_BASE}/problems?genre=${genre}&pageSize=${PAGE_SIZE}&page=${p}&sortBy=difficulty&sortOrder=asc`));
  }

  const responses = await Promise.all(pagePromises);
  for (const res of responses) {
    if (res.ok) {
      const data = await res.json();
      all.push(...data.problems);
    }
  }

  return all;
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
    solutionText: solutionText || '',
    keywords: meta.keywords,
    award: meta.award,
  };
}
