/**
 * API client for chess problems D1 backend.
 * Replaces static JSON imports with API calls.
 */

import type { ChessProblem } from '../types';

const API_BASE = '/api';
const CACHE_NAME = 'chess-problems-genre-v1';

/** Cached fetch: check Cache API first, fallback to network and store result */
async function cachedFetch(url: string): Promise<Response> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url);
    if (cached) return cached;
    const res = await fetch(url);
    if (res.ok) {
      cache.put(url, res.clone());
    }
    return res;
  } catch {
    // Cache API unavailable (e.g., opaque origin) — fall back to regular fetch
    return fetch(url);
  }
}

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
  moveCounts?: Record<string, Record<string, number>>;
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

  // First page (cached)
  const res = await cachedFetch(`${API_BASE}/problems?genre=${genre}&pageSize=${PAGE_SIZE}&page=0&sortBy=difficulty&sortOrder=asc`);
  if (!res.ok) throw new Error(`Problems API error: ${res.status}`);
  const data: { problems: ProblemMeta[]; total: number } = await res.json();
  allProblems.push(...data.problems);

  if (allProblems.length >= data.total || data.problems.length < PAGE_SIZE) {
    onProgress?.(allProblems, data.total, true);
    return allProblems;
  }

  // Report first page immediately
  onProgress?.(allProblems, data.total, false);

  // Fetch remaining pages (cached)
  let page = 1;
  while (allProblems.length < data.total) {
    const pageRes = await cachedFetch(`${API_BASE}/problems?genre=${genre}&pageSize=${PAGE_SIZE}&page=${page}&sortBy=difficulty&sortOrder=asc`);
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
  const res = await cachedFetch(`${API_BASE}/problems/${id}`);
  if (!res.ok) throw new Error(`Problem ${id} not found: ${res.status}`);
  return res.json();
}

/** Fetch problem metadata only (cached, lightweight — for thumbnails/history) */
export async function fetchProblemMeta(id: number): Promise<ProblemMeta> {
  // Uses the same endpoint but result is cached — subsequent calls are instant
  const res = await cachedFetch(`${API_BASE}/problems/${id}`);
  if (!res.ok) throw new Error(`Problem ${id} not found: ${res.status}`);
  return res.json();
}

/** Lightweight problem entry for lists (no FEN, no authors) */
export interface ProblemStub {
  id: number;
  stipulation: string;
}

/** Fetch lightweight ID+stipulation list for a genre (cached, very fast) */
export async function fetchProblemIndex(genre: string, filters?: Record<string, string>): Promise<ProblemStub[]> {
  const params = new URLSearchParams({ genre, sortBy: 'difficulty', sortOrder: 'asc' });
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v);
    }
  }
  const res = await cachedFetch(`${API_BASE}/problems/ids?${params}`);
  if (!res.ok) throw new Error(`Index API error: ${res.status}`);
  const data: { problems: ProblemStub[] } = await res.json();
  return data.problems;
}

/**
 * Fetch today's daily problem (includes solutionText).
 */
export async function fetchDaily(): Promise<ProblemMeta & { solutionText: string }> {
  // Send client's local date so the daily problem matches the displayed date
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const res = await fetch(`${API_BASE}/daily?date=${dateStr}`);
  if (!res.ok) throw new Error(`Daily API error: ${res.status}`);
  return res.json();
}

/**
 * Search problems by author name.
 */
export interface SearchResult {
  id: number;
  fen: string;
  authors: string;
  sourceName: string;
  sourceYear: number | null;
  stipulation: string;
  moveCount: number;
  genre: string;
  difficulty: string;
  difficultyScore: number;
  pieceCount: number;
  keywords: string;
  award: string;
}

export async function searchByAuthor(author: string, limit = 50): Promise<SearchResult[]> {
  const res = await fetch(`${API_BASE}/search?author=${encodeURIComponent(author)}&limit=${limit}`);
  if (!res.ok) throw new Error(`Search API error: ${res.status}`);
  const data: { results: SearchResult[] } = await res.json();
  return data.results;
}

/**
 * Convert ProblemMeta to ChessProblem (without solutionTree — must be built separately).
 */
/**
 * If the solution contains castling but the FEN has no castling rights,
 * infer and add the necessary castling rights based on king/rook positions.
 */
export function fixCastlingRights(fen: string, solutionText?: string): string {
  if (!solutionText) return fen;
  const parts = fen.split(' ');
  if (parts.length < 3 || parts[2] !== '-') return fen; // already has castling rights

  const hasLongCastling = /\b(O-O-O|0-0-0)\b/.test(solutionText);
  // Match O-O/0-0 but NOT O-O-O/0-0-0 (negative lookbehind + lookahead)
  const hasShortCastling = /(?<!O-)(?<!0-)\b(O-O(?!-O)|0-0(?!-0))\b/.test(solutionText);
  if (!hasShortCastling && !hasLongCastling) return fen;

  // Parse board to find king and rook positions
  const ranks = parts[0].split('/');
  let castling = '';

  const findPieces = (rank: string) => {
    const pieces: { piece: string; file: number }[] = [];
    let file = 0;
    for (const ch of rank) {
      if (ch >= '1' && ch <= '8') { file += parseInt(ch); }
      else { pieces.push({ piece: ch, file }); file++; }
    }
    return pieces;
  };

  // White (rank 1 = index 7)
  const rank1 = findPieces(ranks[7]);
  const whiteKing = rank1.find(p => p.piece === 'K');
  if (whiteKing && whiteKing.file === 4) { // King on e1
    if (hasShortCastling && rank1.find(p => p.piece === 'R' && p.file === 7)) castling += 'K';
    if (hasLongCastling && rank1.find(p => p.piece === 'R' && p.file === 0)) castling += 'Q';
  }

  // Black (rank 8 = index 0)
  const rank8 = findPieces(ranks[0]);
  const blackKing = rank8.find(p => p.piece === 'k');
  if (blackKing && blackKing.file === 4) { // King on e8
    if (hasShortCastling && rank8.find(p => p.piece === 'r' && p.file === 7)) castling += 'k';
    if (hasLongCastling && rank8.find(p => p.piece === 'r' && p.file === 0)) castling += 'q';
  }

  if (castling) {
    parts[2] = castling;
    return parts.join(' ');
  }
  return fen;
}

export function metaToChessProblem(meta: ProblemMeta, solutionText?: string): ChessProblem {
  return {
    id: meta.id,
    fen: fixCastlingRights(meta.fen, solutionText),
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
