import { useState, useCallback, useRef, useEffect } from 'react';
import { Chess } from 'chess.js';
import { moveSanLenient } from '../utils/sanResolve';
import { isCookedLine } from '../utils/cookMarker';
import type { ChessProblem, SolutionNode, Genre } from '../types';
import { trackEvent } from '../services/api';

export type SolveStatus = 'idle' | 'solving' | 'correct' | 'incorrect' | 'viewing';

interface PlaybackPosition {
  fen: string;
  lastMove: { from: string; to: string } | null;
  san: string;
}

interface StockfishApi {
  analyze: (fen: string, depth?: number) => Promise<{ bestMove: string; bestMoveSan: string; eval: number; mateIn: number | null } | null>;
  findRefutation: (fen: string, wrongMove: string, depth?: number) => Promise<{ refutationSan: string; eval: number } | null>;
  readyState: string;
}

interface ProblemState {
  problem: ChessProblem | null;
  fen: string;
  initialFen: string;
  moveHistory: string[];
  currentNodes: SolutionNode[];
  status: SolveStatus;
  feedback: string;
  lastMove: { from: string; to: string } | null;
  feedbackSquare: string | null;
  feedbackType: 'correct' | 'incorrect' | null;
  waitingForAutoPlay: boolean;
  userColor: 'w' | 'b';
  hintSquares: string[] | null;
  wrongMoveCount: number;
  wrongMoveFen: string | null;
  wrongMoveLastMove: { from: string; to: string } | null;
  lastWrongMove: { preFen: string; uci: string } | null;
  refutationText: string | null;
  refutationArrow: [string, string] | null;
  // How many white moves remain for mate (for direct mate tracking)
  movesRemaining: number;
  /** Multi-solution helpmates: how many solutions the diagram has (1 for
   *  everything else), which root lines are already completed, and which
   *  root the line currently on the board belongs to. */
  totalSolutions: number;
  foundSolutions: number[];
  currentRootIndex: number | null;
  /** When the solver last replayed a solution they had already found
   *  (a timestamp so the UI can toast each occurrence). */
  replayNoticeAt: number | null;
  playback: {
    positions: PlaybackPosition[];
    mainLine: SolutionNode[];
    mainLineLength: number;
    moveIndex: number;
    exploring: boolean;
    exploreFen: string;
    exploreLastMove: { from: string; to: string } | null;
  } | null;
  /**
   * The tree being solved right now. Normally the problem's own solution, but
   * a twin puts its own tree here -- Give Up and playback have to follow the
   * position on the board, not the diagram the problem arrived with.
   */
  activeTree: SolutionNode[];
}

/** How many separate solutions a tree carries. Only helpmates run the
 *  find-them-all flow: their multiple roots are genuine alternative solutions
 *  (published as "2 solutions"), where extra roots elsewhere are cooks or
 *  parser noise. Capped so a mangled tree can't demand twenty. */
function countSolutions(genre: string, roots: SolutionNode[]): number {
  if (genre !== 'help') return 1;
  // A line YACPDB records as a cook is not one of the solutions the problem
  // asks for, so it is not counted — asking a solver to find the database's
  // own flaw is what the September 2026 reports were about. It stays in the
  // tree and stays playable: it mates in the stipulated number of moves, and
  // whoever plays it has solved the position. If every line is a cook, the
  // count falls back to all of them rather than to nothing to find.
  const asked = roots.filter(r => !isCookedLine(r));
  const n = asked.length > 0 ? asked.length : roots.length;
  return n >= 2 && n <= 8 ? n : 1;
}

// Timing constants
/** How long a completed solution stays on the board before the diagram
 *  returns for the next one. Long enough to see the mate that was played. */
const SOLUTION_RESET_HOLD = 1300;
const AUTO_PLAY_DELAY = 250;
/** A Black-to-move study opens with Black's recorded move played by the
 *  board. Long enough to take in the diagram first; a reply to the solver's
 *  own move can come sooner. */
const BLACK_OPENING_DELAY = 1000;
// How long the finished position is held on its own when the LAST move of a
// problem is auto-played rather than made by the solver — a selfmate always
// ends that way, a study sometimes. Everything the solved state brings in
// (the bottom bar swapping, the playback strip, the solution, the theme tags)
// changes the page's height, so with no pause the board shifts under the eye
// on the same frame the mate lands, and the one move nobody played goes
// unseen. Moves the solver makes themselves are their own doing: those keep
// arriving with no pause at all.
const SOLVED_HOLD = 600;
const CORRECT_FLASH = 300;
const WRONG_MOVE_PAUSE = 500;
// Thematic-try demo: how long the user's try stays before the refutation is
// played, and how long the refutation position is held before reverting
const TRY_REFUTATION_DELAY = 400;
const TRY_REFUTATION_HOLD = 1800;

function getFirstMoveColor(genre: Genre, stipulation?: string): 'w' | 'b' {
  /* A half move in the stipulation means the side that does not own the
     numbering opens: an h#2.5 is White to play, where an h#2 is Black. Nothing
     in the database carries one -- the fetch script has never taken a
     fractional stipulation -- so this can only be reached by a position handed
     over in an address, and the site's own problems go on as before. */
  if (genre === 'help') return /\.5$/.test((stipulation || '').replace(/\s+/g, '')) ? 'w' : 'b';
  if (genre === 'retro' && stipulation?.startsWith('h#')) return 'b';
  return 'w';
}

function getUserColor(genre: Genre, stipulation?: string): 'w' | 'b' {
  if (genre === 'help') return 'b';
  if (genre === 'retro' && stipulation?.startsWith('h#')) return 'b';
  return 'w';
}

// ── Solution tree helpers ─────────────────────────────────

// Placeholder node for auto-played opponent moves inserted between key and threat
const AUTO_MOVE_PLACEHOLDER: SolutionNode = {
  move: '...', moveUci: '', moveSan: '...', isKey: false, isTry: false,
  isThreat: false, isMate: false, isCheck: false, annotation: '', children: [], color: 'b',
};

function getMainLine(nodes: SolutionNode[], fillMissingReplies = true): SolutionNode[] {
  const line: SolutionNode[] = [];
  let current = nodes.find(n => n.isKey) || nodes.find(n => n.color === 'w') || nodes[0];
  if (!current) return line;

  line.push(current);
  while (current.children.length > 0) {
    const nonThreat = current.children.filter(n => !n.isThreat);
    // If all children are threats, stop here — user can explore via Key variations
    if (nonThreat.length === 0) break;
    const next = nonThreat[0];
    // Two moves by the same side in a row: the reply between them is missing
    // from the source, so the replay has to supply one or the board jumps.
    if (fillMissingReplies && next.color === current.color) line.push(AUTO_MOVE_PLACEHOLDER);
    current = next;
    line.push(current);
  }
  return line;
}

/**
 * A joke problem whose solution cannot be played on a legal board -- promotion
 * to a king or a pawn, a board that has to be rotated, a piece that has to be
 * removed first. The joke keyword is required: a key move that will not execute
 * is far more often our own parsing gap (castling written as Ke1-c1, an en
 * passant capture) on an ordinary problem, and those must be fixed, not
 * excused with a banner.
 */
export function isUnplayableJokeProblem(problem: ChessProblem): boolean {
  if (!problem.keywords?.includes('Joke problem')) return false;
  // Promotion to a king or a pawn. Read from the raw text because the parser
  // drops the piece from "c7-c8=K", leaving a move that looks playable.
  if (/=\s*[KP](?![a-z])/.test(problem.solutionText || '')) return true;
  // Twins carry a position per diagram; the tree parsed here belongs to a) and
  // is not the tree the board will be holding. Leave them alone.
  if (/^\s*a\)/i.test(problem.solutionText || '')) return false;
  const keys = problem.solutionTree;
  if (!keys || keys.length === 0) return false;
  const fens = [problem.fen];
  // Retro lets the user move either colour, and the solver flips the turn to
  // try the other one, so both have to be searched before calling it unplayable
  fens.push(problem.fen.includes(' w ') ? problem.fen.replace(' w ', ' b ') : problem.fen.replace(' b ', ' w '));
  for (const fen of fens) {
    let chess: Chess;
    try {
      chess = new Chess(fen);
    } catch {
      continue;
    }
    for (const m of chess.moves({ verbose: true })) {
      if (matchMoveToTree(fen, m.from, m.to, m.san, m.promotion, keys)) return false;
    }
  }
  return true; // no legal move anywhere on the board is the key
}

function tryExecuteNode(chess: Chess, node: SolutionNode): ReturnType<Chess['move']> | null {
  const uci = node.moveUci;

  // A move no board can hold (promotion to a king, or to the other colour).
  // Never hand it to chess.js: it reads such a move loosely and offers an
  // ordinary promotion in its place.
  if (uci.startsWith('joke:')) return null;

  // Wildcard "any move" — pick a legal move by the specified piece type
  if (uci === 'any') {
    const pieceMatch = node.moveSan.match(/^([KQRBN])/);
    const pieceType = pieceMatch ? pieceMatch[1].toLowerCase() : null;
    const legalMoves = chess.moves({ verbose: true });
    const candidates = pieceType
      ? legalMoves.filter(m => m.piece === pieceType)
      : legalMoves;
    if (candidates.length > 0) {
      try {
        return chess.move(candidates[0]);
      } catch { /* fall through */ }
    }
    return null;
  }

  if (!uci.startsWith('san:') && uci.length >= 4) {
    try {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promo = uci.length > 4 ? uci[4] : undefined;
      const move = chess.move({ from, to, promotion: promo });
      if (move) return move;
    } catch { /* fallback */ }
  }

  const san = uci.startsWith('san:') ? uci.slice(4) : node.moveSan;
  try {
    const move = chess.move(san);
    if (move) return move;
  } catch { /* fallback */ }

  const cleanSan = san.replace(/[+#]/g, '');
  if (cleanSan !== san) {
    try {
      const move = chess.move(cleanSan);
      if (move) return move;
    } catch { /* fallback */ }
  }

  // "Sc6#" where two knights reach c6: the mark on the move says which.
  const resolved = moveSanLenient(chess, node.moveSan || san);
  if (resolved) return resolved;

  const destMatch = node.move.match(/([a-h][1-8])(?:=[QRBN])?[+#!?]*$/i);
  if (destMatch) {
    const destSquare = destMatch[1];
    const promoMatch = node.move.match(/=([QRBNS])/i);
    const promo = promoMatch ? (promoMatch[1] === 'S' ? 'n' : promoMatch[1].toLowerCase()) : undefined;

    const pieceChar = node.move[0];
    let pieceType: string | null = null;
    if (pieceChar >= 'A' && pieceChar <= 'Z') {
      pieceType = pieceChar === 'S' ? 'n' : pieceChar.toLowerCase();
    } else if (pieceChar >= 'a' && pieceChar <= 'h') {
      pieceType = 'p';
    }

    const legalMoves = chess.moves({ verbose: true });
    const candidates = legalMoves.filter(m => {
      if (m.to !== destSquare) return false;
      if (pieceType && m.piece !== pieceType) return false;
      if (promo && m.promotion !== promo) return false;
      return true;
    });

    if (candidates.length === 1) {
      try {
        const move = chess.move(candidates[0]);
        if (move) return move;
      } catch { /* give up */ }
    }

    if (candidates.length > 1) {
      const fromFileMatch = node.move.match(/^[KQRBSN]([a-h])/);
      const fromRankMatch = node.move.match(/^[KQRBSN][a-h]?([1-8])/);
      let filtered = candidates;
      if (fromFileMatch) {
        filtered = filtered.filter(m => m.from[0] === fromFileMatch[1]);
      }
      if (fromRankMatch && filtered.length > 1) {
        filtered = filtered.filter(m => m.from[1] === fromRankMatch[1]);
      }
      if (filtered.length === 1) {
        try {
          const move = chess.move(filtered[0]);
          if (move) return move;
        } catch { /* give up */ }
      }
    }
  }

  return null;
}

/**
 * Apply a move by rewriting the FEN, with no legality check at all.
 *
 * Joke problems end in positions no engine will hold -- two white kings after
 * c8=K, a pawn on the eighth rank, a black queen conjured by White. chess.js
 * refuses to load or play any of it, and it is right to. But replaying a
 * solution that is already written down needs no rules: only "put this piece on
 * that square". react-chessboard draws whatever FEN it is handed, so the
 * position can still be shown. Used only where chess.js has already refused.
 */
function applyMoveByFen(fen: string, node: SolutionNode): { fen: string; from: string; to: string; san: string } | null {
  // Needs the departure square, which SAN-shaped moves do not carry.
  const m = node.move.match(/^([KQRBSNPDTL]?)([a-h][1-8])[-*x:]?([a-h][1-8])(?:=([bw]?)([KQRBSNPDTL]))?/i);
  if (!m) return null;
  const [, , from, to, promoColor, promoPiece] = m;

  const parts = fen.split(' ');
  const board: string[][] = parts[0].split('/').map(row => {
    const cells: string[] = [];
    for (const ch of row) {
      if (ch >= '1' && ch <= '9') for (let i = 0; i < parseInt(ch); i++) cells.push('');
      else cells.push(ch);
    }
    while (cells.length < 8) cells.push('');
    return cells.slice(0, 8);
  });
  while (board.length < 8) board.push(Array(8).fill(''));

  const sq = (v: string) => ({ row: 8 - parseInt(v[1]), col: v.charCodeAt(0) - 97 });
  const f = sq(from.toLowerCase());
  const t = sq(to.toLowerCase());
  const piece = board[f.row]?.[f.col];
  if (!piece) return null;

  const moverIsWhite = piece === piece.toUpperCase();
  let placed = piece;
  if (promoPiece) {
    const letter = promoPiece.toUpperCase() === 'S' ? 'N' : promoPiece.toUpperCase();
    // "=bS" promotes to the other side's piece; a bare "=K" keeps the mover's.
    const white = promoColor ? promoColor.toLowerCase() === 'w' : moverIsWhite;
    placed = white ? letter : letter.toLowerCase();
  }
  board[f.row][f.col] = '';
  board[t.row][t.col] = placed;

  const rows = board.map(row => {
    let out = '', empty = 0;
    for (const cell of row) {
      if (!cell) empty++;
      else { if (empty) { out += empty; empty = 0; } out += cell; }
    }
    return empty ? out + empty : out;
  });
  // Castling rights and en passant cannot be tracked through a position that
  // has stopped being chess; the counters are equally meaningless here.
  const nextFen = `${rows.join('/')} ${moverIsWhite ? 'b' : 'w'} - - 0 1`;
  return { fen: nextFen, from: from.toLowerCase(), to: to.toLowerCase(), san: node.moveSan || node.move };
}

/** How many made-up replies one search may try before it gives up looking. */
const FILLER_BUDGET = 240;
const FILLER_MAX_PLIES = 12;

/**
 * Walk the recorded line, supplying a move wherever the source left the reply
 * out -- a line can be missing more than one ("1.Rg4-g5! 2.Rg7-f7 3.Rf7-f6#" is
 * three White moves in a row) -- and report whether it can be played to the end
 * and whether that end is the mate it claims to be.
 */
export function playLine(
  chess: Chess,
  node: SolutionNode | null,
  plies: number,
  budget: { left: number },
): { plays: boolean; sound: boolean } {
  if (!node || plies >= FILLER_MAX_PLIES) return { plays: true, sound: true };
  if (node.color !== chess.turn()) {
    // The reply before this move is missing. Try them until one lets the rest
    // of the line stand.
    let best: { plays: boolean; sound: boolean } = { plays: false, sound: false };
    for (const reply of chess.moves({ verbose: true })) {
      if (budget.left <= 0) break;
      budget.left--;
      let branch: Chess;
      try {
        branch = new Chess(chess.fen());
        branch.move({ from: reply.from, to: reply.to, promotion: reply.promotion });
      } catch { continue; }
      const played = playLine(branch, node, plies + 1, budget);
      if (played.plays && played.sound) return played;
      if (played.plays) best = played;
    }
    return best;
  }
  if (!tryExecuteNode(chess, node)) return { plays: false, sound: false };
  const onward: SolutionNode[] = node.children.filter(n => !n.isThreat);
  if (onward.length === 0) {
    const claimsMate = node.isMate || node.moveSan.includes('#');
    return { plays: true, sound: !claimsMate || chess.isCheckmate() };
  }
  return playLine(chess, onward[0], plies + 1, budget);
}

/**
 * Choose a move for the side whose reply the source never wrote. YACPDB puts it
 * in a comment -- "1.Sb3-d2! {(~)} 2.Sd2-c4#" -- or leaves it out altogether,
 * and the tree then runs White, White with nothing in between.
 *
 * It cannot be just any reply. D642315 is mated by the recorded 2.Sc4# after
 * seven of Black's ten moves; the other three want 2.Se4#, which that problem
 * only names inside a comment. So take a reply that leaves the rest of the
 * recorded line playable to its end, mate included -- otherwise the solver is
 * handed a position where the only move on record does not work. Ties are
 * broken at random, so the same problem does not always answer the same way.
 */
export function pickReplyFor(
  fen: string,
  continuations: SolutionNode[],
): { from: string; to: string; promotion?: string } | null {
  let chess: Chess;
  try { chess = new Chess(fen); } catch { return null; }
  const legal = chess.moves({ verbose: true });
  if (legal.length === 0) return null;
  const order = [...legal];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  // Second best: the line plays out but does not end in the mate it claims.
  // Last resort: only its first move can be played at all.
  let reaching: { from: string; to: string; promotion?: string } | null = null;
  let movable: { from: string; to: string; promotion?: string } | null = null;
  for (const reply of order) {
    const budget = { left: FILLER_BUDGET };
    let afterFen: string;
    try {
      const after = new Chess(fen);
      after.move({ from: reply.from, to: reply.to, promotion: reply.promotion });
      afterFen = after.fen();
    } catch { continue; }
    for (const node of continuations) {
      let board: Chess;
      try { board = new Chess(afterFen); } catch { continue; }
      const line = playLine(board, node, 1, budget);
      if (line.plays && line.sound) return reply;
      if (line.plays && !reaching) reaching = reply;
      if (!movable) {
        let probe: Chess;
        try { probe = new Chess(afterFen); } catch { continue; }
        if (tryExecuteNode(probe, node)) movable = reply;
      }
    }
  }
  return reaching || movable || order[0];
}

function computePositions(initialFen: string, mainLine: SolutionNode[]): PlaybackPosition[] {
  const positions: PlaybackPosition[] = [{ fen: initialFen, lastMove: null, san: '' }];
  let curFen = initialFen;
  for (let mi = 0; mi < mainLine.length; mi++) {
    const node = mainLine[mi];
    // The position itself may be one chess.js will not load -- after a joke
    // promotion it holds two kings of one colour -- so the engine is optional
    // from here on and the FEN is what carries the line forward.
    let chess: Chess | null = null;
    try {
      chess = new Chess(curFen);
    } catch { /* not a legal position; fall through to plain FEN editing */ }

    let applied: { fen: string; from: string; to: string; san: string } | null = null;

    if (chess) {
      let move = tryExecuteNode(chess, node);
      // If move fails, try with flipped turn (retro problems may start with opposite color)
      if (!move && node.color !== chess.turn()) {
        const curTurn = curFen.split(' ')[1];
        const flipped = chess.fen().replace(/ [wb] /, curTurn === 'w' ? ' b ' : ' w ');
        try {
          const chess2 = new Chess(flipped);
          move = tryExecuteNode(chess2, node);
          if (move) chess.load(chess2.fen());
        } catch { /* keep move null */ }
      }
      if (move) {
        applied = { fen: chess.fen(), from: move.from, to: move.to, san: move.san };
      } else if (node === AUTO_MOVE_PLACEHOLDER || (node.moveSan === '...' && node.moveUci === '')) {
        // Stand-in for a reply the source never wrote. It has to be one the
        // move after it still answers, or the replay ends on a move that does
        // not mate.
        const after = mainLine[mi + 1];
        const chosen = pickReplyFor(chess.fen(), after ? [after] : []);
        if (!chosen) break;
        const played = chess.move({ from: chosen.from, to: chosen.to, promotion: chosen.promotion });
        if (!played) break;
        applied = { fen: chess.fen(), from: played.from, to: played.to, san: played.san };
      }
    }

    if (!applied) applied = applyMoveByFen(curFen, node);
    if (!applied) break;

    curFen = applied.fen;
    positions.push({
      fen: curFen,
      lastMove: { from: applied.from, to: applied.to },
      san: applied.san,
    });
  }
  return positions;
}

// ── Match a user move against solution tree nodes ──
function matchMoveToTree(
  preFen: string,
  from: string,
  to: string,
  moveSan: string,
  movePromotion: string | undefined,
  nodes: SolutionNode[],
): SolutionNode | null {
  const uci = from + to + (movePromotion || '');
  const matchNode = (node: SolutionNode): boolean => {
    if (node.moveUci === uci) return true;
    if (node.moveSan === moveSan) return true;
    const nodeSanClean = node.moveSan.replace(/[+#!?]/g, '');
    const moveSanClean = moveSan.replace(/[+#!?]/g, '');
    if (nodeSanClean === moveSanClean) return true;
    const verifyChess = new Chess(preFen);
    const verifiedMove = tryExecuteNode(verifyChess, node);
    if (verifiedMove && verifiedMove.from === from && verifiedMove.to === to) {
      if (movePromotion && verifiedMove.promotion && verifiedMove.promotion !== movePromotion) return false;
      return true;
    }
    return false;
  };
  // Prioritize non-threat nodes: when the same move exists in both a threat
  // continuation and a defense branch, the defense branch is the correct path.
  const nonThreat = nodes.filter(n => !n.isThreat);
  const threat = nodes.filter(n => n.isThreat);
  for (const node of nonThreat) {
    if (matchNode(node)) return node;
  }
  for (const node of threat) {
    if (matchNode(node)) return node;
  }
  return null;
}

/**
 * Find the attempted move in a solution line other than the one being walked.
 *
 * Two solutions that open with the same moves are separate roots carrying the
 * same prefix, so the first move pins one of them and the other is shut out:
 * D390457's second line only parts from the first at White's third move, and
 * playing it used to flash red. That is worst for the lines YACPDB records as
 * cooks — they mate, and the solver who finds one has solved the position —
 * but it is the same for two lines the composer intended.
 *
 * Walks each root down to the depth already played, keeps the ones that reach
 * the position on the board, and looks for the move among that node's
 * children. Only ever called on a move that is otherwise wrong, so it can turn
 * a refusal into a solution and never the other way round.
 */
function findMoveInOtherLines(
  initialFen: string,
  currentFen: string,
  plies: number,
  roots: SolutionNode[],
  skipRoot: (rootIndex: number) => boolean,
  from: string,
  to: string,
  moveSan: string,
  movePromotion: string | undefined,
  movedColor: 'w' | 'b',
): { node: SolutionNode; rootIndex: number } | null {
  // Clocks differ when the same position is reached by another order; the
  // placement, the side to move, castling and en passant are what matter.
  const place = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
  const target = place(currentFen);

  for (let i = 0; i < roots.length; i++) {
    if (skipRoot(i)) continue;
    let found: SolutionNode | null = null;
    const walk = (node: SolutionNode, fen: string, depth: number) => {
      if (found) return;
      const chess = new Chess(fen);
      if (!tryExecuteNode(chess, node)) return;
      if (depth + 1 >= plies) {
        if (place(chess.fen()) !== target) return;
        found = matchMoveToTree(chess.fen(), from, to, moveSan, movePromotion,
          node.children.filter(c => c.color === movedColor));
        return;
      }
      for (const child of node.children) walk(child, chess.fen(), depth + 1);
    };
    walk(roots[i], initialFen, 0);
    if (found) return { node: found, rootIndex: i };
  }
  return null;
}

// ──────────────────────────────────────────────────────────

export function useProblem(stockfish?: StockfishApi) {
  const [state, setState] = useState<ProblemState>({
    problem: null,
    fen: '',
    initialFen: '',
    moveHistory: [],
    currentNodes: [],
    status: 'idle',
    feedback: '',
    lastMove: null,
    feedbackSquare: null,
    feedbackType: null,
    waitingForAutoPlay: false,
    userColor: 'w',
    hintSquares: null,
    wrongMoveCount: 0,
    wrongMoveFen: null,
    wrongMoveLastMove: null,
    lastWrongMove: null,
    refutationText: null,
    refutationArrow: null,
    movesRemaining: 0,
    totalSolutions: 1,
    foundSolutions: [],
    currentRootIndex: null,
    replayNoticeAt: null,
    playback: null,
    activeTree: [],
  });

  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Which twin is on the board, so Try Again restarts that one and not the
  // diagram the problem was loaded with.
  const activeTwinRef = useRef<{ fen: string; tree: SolutionNode[]; record: boolean; firstColor?: 'w' | 'b' } | null>(null);
  // Every event here is filed under the problem's single ID, which has no room
  // for a twin. Solving b) would therefore land its moves in a)'s statistics --
  // as a wrong first move, since a)'s key is a different move on a different
  // position. So only the diagram the problem arrives with is recorded.
  const recordEventsRef = useRef(true);
  // True while a finished position is being held before the solved state
  // lands. The solving bar is still on screen during that gap, so Give Up and
  // Show Hint have to be refused: the problem is already solved, and either
  // one would file it as a failure.
  const solveHoldRef = useRef(false);
  /* Retro is deduced, not answered: the solver plays both colours there and
     working out whose turn it is IS the problem, so nothing may be supplied on
     the other side's behalf. Held in a ref because startPlayback takes no
     dependencies. */
  const genreRef = useRef<Genre | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
  }, []);

  const startPlayback = useCallback((initialFen: string, solutionTree: SolutionNode[], startAtEnd: boolean = false, playedMoves?: string[]) => {
    let mainLine: SolutionNode[];
    let positions: PlaybackPosition[];

    if (playedMoves && playedMoves.length > 0) {
      // Build playback from the actual moves the user played
      positions = [{ fen: initialFen, lastMove: null, san: '' }];
      mainLine = [];
      const chess = new Chess(initialFen);
      for (const san of playedMoves) {
        // Try the move; if it fails (e.g., retro with wrong turn), try with flipped turn
        let move: ReturnType<Chess['move']> | null = null;
        try { move = chess.move(san); } catch { /* try flip */ }
        if (!move) {
          // Flip turn and retry (retro problems may have opposite-turn moves)
          const curFen = chess.fen();
          const curTurn = curFen.split(' ')[1];
          const flipped = curFen.replace(/ [wb] /, curTurn === 'w' ? ' b ' : ' w ');
          try {
            const chess2 = new Chess(flipped);
            move = chess2.move(san);
            if (move) {
              // Use the flipped chess state going forward
              chess.load(chess2.fen());
            }
          } catch { /* give up */ }
        }
        if (move) {
          positions.push({
            fen: chess.fen(),
            lastMove: { from: move.from, to: move.to },
            san: move.san,
          });
          mainLine.push({
            move: move.san, moveUci: move.from + move.to + (move.promotion || ''),
            moveSan: move.san, isKey: false, isTry: false, isThreat: false,
            isMate: new Chess(chess.fen()).isCheckmate(), isCheck: move.san.includes('+') || move.san.includes('#'),
            annotation: '', children: [], color: move.color,
          });
        } else break;
      }
    } else {
      mainLine = getMainLine(solutionTree, genreRef.current !== 'retro');
      positions = computePositions(initialFen, mainLine);
    }

    return {
      positions,
      mainLine,
      mainLineLength: mainLine.length,
      moveIndex: startAtEnd ? positions.length - 2 : -1,
      exploring: false,
      exploreFen: '',
      exploreLastMove: null,
    };
  }, []);

  const loadProblem = useCallback((problem: ChessProblem) => {
    if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    solveHoldRef.current = false;
    genreRef.current = problem.genre;

    let firstColor = getFirstMoveColor(problem.genre, problem.stipulation);
    let userColor = getUserColor(problem.genre, problem.stipulation);

    // Retro: user controls both colors (must deduce whose turn it is)
    if (problem.genre === 'retro') {
      userColor = 'b'; // 'b' = user controls both sides (same convention as helpmate)
    }

    let fen = problem.fen;
    // Detect turn from FEN (already adjusted by ensureSolution for retro black-to-move)
    const fenTurn = fen.split(' ')[1] as 'w' | 'b';
    if (problem.genre === 'retro' && fenTurn === 'b') {
      firstColor = 'b';
    }
    if (firstColor === 'b' && fen.includes(' w ')) {
      fen = fen.replace(' w ', ' b ');
    }

    // Black-to-move study: Black's recorded first move is part of the
    // problem, not the solver's task. Play one of the recorded openings
    // (several, like direct-mate defences, means one branch per attempt),
    // then give the board to White.
    let blackOpening: { root: SolutionNode; move: NonNullable<ReturnType<Chess['move']>>; fen: string } | null = null;
    if (problem.genre === 'study' && fen.split(' ')[1] === 'b'
        && problem.solutionTree.length > 0 && problem.solutionTree.every(n => n.color === 'b')) {
      const roots = problem.solutionTree;
      const root = roots[Math.floor(Math.random() * roots.length)];
      try {
        const chess = new Chess(fen);
        const move = tryExecuteNode(chess, root);
        if (move) blackOpening = { root, move, fen: chess.fen() };
      } catch { /* leave the board as it is */ }
    }

    setState({
      problem,
      fen,
      initialFen: fen,
      moveHistory: [],
      currentNodes: problem.solutionTree,
      status: 'solving',
      feedback: '',
      lastMove: null,
      feedbackSquare: null,
      feedbackType: null,
      waitingForAutoPlay: blackOpening !== null,
      userColor,
      hintSquares: null,
      wrongMoveCount: 0,
      wrongMoveFen: null,
      wrongMoveLastMove: null,
      lastWrongMove: null,
      refutationText: null,
      refutationArrow: null,
      movesRemaining: problem.moveCount,
      totalSolutions: countSolutions(problem.genre, problem.solutionTree),
      foundSolutions: [],
      currentRootIndex: null,
      replayNoticeAt: null,
      playback: null,
      activeTree: problem.solutionTree,
    });
    activeTwinRef.current = null;
    recordEventsRef.current = true;

    if (blackOpening) {
      const { root, move, fen: afterFen } = blackOpening;
      autoPlayTimerRef.current = setTimeout(() => {
        setState(prev => {
          if (prev.problem?.id !== problem.id || prev.status !== 'solving') return prev;
          return {
            ...prev,
            fen: afterFen,
            moveHistory: [move.san],
            currentNodes: root.children.filter(c => !c.isThreat),
            lastMove: { from: move.from, to: move.to },
            waitingForAutoPlay: false,
          };
        });
      }, BLACK_OPENING_DELAY);
    }
  }, []);

  /**
   * Put a twin's position on the board and hand its solution to the solver.
   * The problem itself does not change -- only which of its diagrams is being
   * played -- so the metadata, the user's colour and the move count all stay.
   */
  const startTwin = useCallback((twinFen: string, twinTree: SolutionNode[], record: boolean, twinFirstColor?: 'w' | 'b') => {
    if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    solveHoldRef.current = false;
    activeTwinRef.current = { fen: twinFen, tree: twinTree, record, firstColor: twinFirstColor };
    recordEventsRef.current = record;
    setState(prev => {
      if (!prev.problem) return prev;
      // The turn is already set in the twin's own FEN: a twin can carry its own
      // stipulation ("b) rotate 90 {h#2}"), so the problem's is not the answer.
      const fen = twinFen;
      return {
        ...prev,
        fen,
        initialFen: fen,
        // A helpmate twin is played from both sides, whatever the problem is.
        userColor: twinFirstColor === 'b' ? 'b' : prev.userColor,
        moveHistory: [],
        currentNodes: twinTree,
        status: 'solving',
        feedback: '',
        lastMove: null,
        feedbackSquare: null,
        feedbackType: null,
        waitingForAutoPlay: false,
        hintSquares: null,
        wrongMoveCount: 0,
        wrongMoveFen: null,
        wrongMoveLastMove: null,
        lastWrongMove: null,
        refutationText: null,
        refutationArrow: null,
        movesRemaining: prev.problem.moveCount,
        // Twins stay single-solution: each twin's own tree is the unit played.
        totalSolutions: 1,
        foundSolutions: [],
        currentRootIndex: null,
        replayNoticeAt: null,
        playback: null,
        activeTree: twinTree,
      };
    });
  }, []);

  // ── Flash wrong move and undo ──
  /**
   * Wrong move that matches a thematic try from the source data: show the
   * user's move, then auto-play the composer's refutation with an explanation,
   * hold it, and revert to the initial position. Counts as a wrong move
   * exactly like flashWrongMove (rating lock, hint unlock unchanged).
   */
  const flashTryRefutation = useCallback((
    userMove: { from: string; to: string }, fenAfterUser: string,
    refMove: { from: string; to: string }, fenAfterRef: string,
    text: string, preFen: string, uci: string,
  ) => {
    setState(prev => ({
      ...prev,
      feedbackSquare: userMove.to,
      feedbackType: 'incorrect',
      hintSquares: null,
      wrongMoveCount: prev.wrongMoveCount + 1,
      wrongMoveFen: fenAfterUser,
      wrongMoveLastMove: userMove,
      lastWrongMove: { preFen, uci },
      refutationText: null,
      refutationArrow: null,
    }));
    // After a beat, play the refutation on the board with the explanation
    setTimeout(() => {
      setState(prev => prev.wrongMoveFen === fenAfterUser
        ? { ...prev, wrongMoveFen: fenAfterRef, wrongMoveLastMove: refMove, feedbackSquare: refMove.to, refutationText: text }
        : prev);
      // Hold the refutation position, then revert to the initial position.
      // The text stays visible until the next move attempt.
      setTimeout(() => {
        setState(prev => prev.wrongMoveFen === fenAfterRef
          ? { ...prev, wrongMoveFen: null, wrongMoveLastMove: null, feedbackSquare: null, feedbackType: null }
          : prev);
      }, TRY_REFUTATION_HOLD);
    }, TRY_REFUTATION_DELAY);
  }, []);

  const flashWrongMove = useCallback((to: string, wrongFen: string, from: string, preFen: string, uci: string) => {
    setState(prev => ({
      ...prev,
      feedbackSquare: to,
      feedbackType: 'incorrect',
      hintSquares: null,
      wrongMoveCount: prev.wrongMoveCount + 1,
      wrongMoveFen: wrongFen,
      wrongMoveLastMove: { from, to },
      lastWrongMove: { preFen, uci },
      refutationText: null,
      refutationArrow: null,
    }));
    setTimeout(() => {
      setState(prev => ({ ...prev, wrongMoveFen: null, wrongMoveLastMove: null }));
      setTimeout(() => {
        setState(prev => prev.feedbackType === 'incorrect'
          ? { ...prev, feedbackSquare: null, feedbackType: null } : prev);
      }, 300);
    }, WRONG_MOVE_PAUSE);
  }, []);

  // ── Main tryMove ──
  const tryMove = useCallback((from: string, to: string, promotion?: string): boolean => {
    const { problem, currentNodes, status, playback, movesRemaining, activeTree } = state;

    // Block moves while solution is still loading (tree empty)
    if (problem && activeTree.length === 0 && status === 'solving' && !playback) {
      return false;
    }

    // Playback exploration
    if (playback && (status === 'correct' || status === 'viewing')) {
      const currentFen = playback.exploring
        ? playback.exploreFen
        : (playback.positions[playback.moveIndex + 1]?.fen || playback.positions[0].fen);

      const chess = new Chess(currentFen);
      let move;
      try {
        move = chess.move({ from, to, promotion: promotion || 'q' });
      } catch {
        return false;
      }
      if (!move) return false;

      setState(prev => ({
        ...prev,
        playback: prev.playback ? {
          ...prev.playback,
          exploring: true,
          exploreFen: chess.fen(),
          exploreLastMove: { from: move.from, to: move.to },
        } : null,
      }));
      return true;
    }

    if (!problem || status !== 'solving' || state.waitingForAutoPlay) return false;

    const currentTurn = state.fen.split(' ')[1] as 'w' | 'b';

    // Help/Retro: user controls both sides
    const isHelpStyle = problem.genre === 'help' || problem.genre === 'retro';
    if (!isHelpStyle && currentTurn !== state.userColor) return false;

    // Try the move with current FEN; for retro, also try with flipped turn
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let move: any = null;
    let afterFen = '';

    const tryWithFen = (fen: string) => {
      try {
        const c = new Chess(fen);
        const m = c.move({ from, to, promotion: promotion || 'q' });
        if (m) { move = m; afterFen = c.fen(); return true; }
      } catch { /* invalid */ }
      return false;
    };

    // Retro: the user deduces whose move it is. Duplex helpmate: while a
    // solution that starts with the other side's move is still to be found
    // (the White-to-play half), that side may move too.
    const otherSideHasLine = problem.genre === 'help' && currentNodes.some(n => n.color !== currentTurn);
    if (!tryWithFen(state.fen) && (problem.genre === 'retro' || otherSideHasLine)) {
      // Flip turn and retry
      const flippedFen = state.fen.replace(/ [wb] /, currentTurn === 'w' ? ' b ' : ' w ');
      tryWithFen(flippedFen);
    }
    if (!move) return false;

    // A new move attempt supersedes any lingering try-refutation explanation
    if (state.refutationText) {
      setState(prev => ({ ...prev, refutationText: null }));
    }

    const newFen = afterFen;
    const newHistory = [...state.moveHistory, move.san];
    // Emitted only on the accepted-move branches below. Emitting here (right
    // after the legality check) fired 'move_correct' for wrong moves too,
    // double-counting them in the solve statistics.
    const emitMoveCorrect = () => recordEventsRef.current && trackEvent('move_correct', problem.id, {
      san: move!.san,
      fen: state.fen,
      moveNumber: newHistory.length,
      genre: problem.genre,
    });

    // ══════════════════════════════════════════════
    // Check immediate solve (checkmate / stalemate)
    // ══════════════════════════════════════════════
    const movedColor = move.color; // actual color that moved (may differ from currentTurn for retro)
    const afterChess = new Chess(newFen);
    const isCheckmate = afterChess.isCheckmate();

    // Immediate-checkmate shortcut. For retro problems it must only fire when
    // the mate is played by the side whose turn it actually is: deducing the
    // turn IS the puzzle, and the "apparent" mate by the wrong side (e.g.
    // R138281's 1.Qb1#? — it's really Black to move) must stay incorrect.
    const retroWrongSide = problem.genre === 'retro' && movedColor !== currentTurn;

    // Multi-solution helpmate: a mate finishes ONE solution, not the problem.
    // Handled here because most helpmate lines end through this shortcut.
    if (isCheckmate && state.totalSolutions > 1 && !retroWrongSide) {
      // Attribute the line to its root. The root is remembered from the first
      // move; a first-move mate is matched directly; an unmatched mate (data
      // truncated) gets a synthetic negative id so it still counts once.
      let rootIdx = state.currentRootIndex;
      if (rootIdx === null) {
        const rootMatch = matchMoveToTree(state.fen, from, to, move.san, move.promotion,
          currentNodes.filter(n => n.color === movedColor));
        rootIdx = rootMatch ? activeTree.indexOf(rootMatch) : -1;
        if (rootIdx === -1) rootIdx = -(state.foundSolutions.length + 1);
      }
      const newFound = state.foundSolutions.includes(rootIdx)
        ? state.foundSolutions
        : [...state.foundSolutions, rootIdx];

      if (newFound.length < state.totalSolutions) {
        emitMoveCorrect();
        const remaining = state.totalSolutions - newFound.length;
        setState(prev => ({
          ...prev,
          fen: newFen,
          moveHistory: newHistory,
          feedback: '',
          lastMove: { from, to },
          feedbackSquare: to,
          feedbackType: 'correct',
          waitingForAutoPlay: true,
          hintSquares: null,
          foundSolutions: newFound,
        }));
        if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = setTimeout(() => {
          setState(prev => {
            if (!prev.problem || prev.status !== 'solving') return prev;
            return {
              ...prev,
              fen: prev.initialFen,
              moveHistory: [],
              currentNodes: prev.activeTree.filter((_, i) => !newFound.includes(i)),
              currentRootIndex: null,
              feedback: remaining === 1 ? 'One more to find!' : `${remaining} more to find!`,
              lastMove: null,
              feedbackSquare: null,
              feedbackType: null,
              waitingForAutoPlay: false,
              movesRemaining: prev.problem.moveCount,
            };
          });
        }, SOLUTION_RESET_HOLD);
        return true;
      }
      // Last solution — fall through to the normal solved handling below,
      // with the completed set recorded for the panel.
      setState(prev => ({ ...prev, foundSolutions: newFound }));
    }

    if (isCheckmate && problem.genre !== 'self' && !retroWrongSide) {
      // User delivered checkmate — solved! (direct/study/help)
      emitMoveCorrect();
      const pb = startPlayback(state.initialFen, activeTree, true, newHistory);
      setState(prev => ({
        ...prev,
        fen: newFen,
        moveHistory: newHistory,
        status: 'correct',
        feedback: '',
        lastMove: { from, to },
        feedbackSquare: to,
        feedbackType: 'correct',
        waitingForAutoPlay: false,
        hintSquares: null,
        movesRemaining: 0,
        playback: pb,
      }));
      return true;
    }

    if (problem.stipulation === '=' && afterChess.isStalemate()) {
      // Study draw: stalemate — solved!
      emitMoveCorrect();
      const pb = startPlayback(state.initialFen, activeTree, true, newHistory);
      setState(prev => ({
        ...prev,
        fen: newFen,
        moveHistory: newHistory,
        status: 'correct',
        feedback: '',
        lastMove: { from, to },
        feedbackSquare: to,
        feedbackType: 'correct',
        waitingForAutoPlay: false,
        hintSquares: null,
        movesRemaining: 0,
        playback: pb,
      }));
      return true;
    }

    // ══════════════════════════════════════════════
    // SOLUTION TREE path (all genres)
    // ══════════════════════════════════════════════
    const validNodes = currentNodes.filter(n => n.color === movedColor);
    let matchingNode = matchMoveToTree(state.fen, from, to, move.san, move.promotion, validNodes);
    // Nothing in the line being walked — but the solver may have stepped into
    // a different recorded line that opens the same way (see
    // findMoveInOtherLines). Solutions already found are left out: replaying
    // one of those has its own answer further down.
    let switchedRoot: number | null = null;
    if (!matchingNode && state.moveHistory.length > 0 && activeTree.length > 1) {
      const elsewhere = findMoveInOtherLines(
        state.initialFen, state.fen, state.moveHistory.length, activeTree,
        i => state.foundSolutions.includes(i),
        from, to, move.san, move.promotion, movedColor,
      );
      if (elsewhere) {
        matchingNode = elsewhere.node;
        switchedRoot = elsewhere.rootIndex;
      }
    }

    if (matchingNode) {
      emitMoveCorrect();
      const isActualCheckmate = afterChess.isCheckmate();
      const opponentColor = movedColor === 'w' ? 'b' : 'w';
      const realDefenses = matchingNode.children.filter(n => !n.isThreat && n.color === opponentColor);

      const isMateProblem = problem.genre === 'self';
      const isTerminal = isActualCheckmate || afterChess.isStalemate() || afterChess.isDraw();
      let isSolved: boolean;
      if (isMateProblem) {
        isSolved = isActualCheckmate;
      } else if (isTerminal) {
        isSolved = true;
      } else {
        // Solved if no children (tree ends here — either complete solution or truncated)
        isSolved = matchingNode.children.length === 0;
      }

      if (isSolved && state.totalSolutions > 1) {
        // A solution line ended without a mate on the board (truncated data).
        // Same accounting as the checkmate path above.
        const rootIdxHere = activeTree.indexOf(matchingNode);
        const rootIdx = switchedRoot ?? state.currentRootIndex ?? (rootIdxHere >= 0 ? rootIdxHere : -(state.foundSolutions.length + 1));
        const newFound = state.foundSolutions.includes(rootIdx)
          ? state.foundSolutions
          : [...state.foundSolutions, rootIdx];
        if (newFound.length < state.totalSolutions) {
          const remaining = state.totalSolutions - newFound.length;
          setState(prev => ({
            ...prev,
            fen: newFen,
            moveHistory: newHistory,
            feedback: '',
            lastMove: { from, to },
            feedbackSquare: to,
            feedbackType: 'correct',
            waitingForAutoPlay: true,
            hintSquares: null,
            foundSolutions: newFound,
          }));
          if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
          autoPlayTimerRef.current = setTimeout(() => {
            setState(prev => {
              if (!prev.problem || prev.status !== 'solving') return prev;
              return {
                ...prev,
                fen: prev.initialFen,
                moveHistory: [],
                currentNodes: prev.activeTree.filter((_, i) => !newFound.includes(i)),
                currentRootIndex: null,
                feedback: remaining === 1 ? 'One more to find!' : `${remaining} more to find!`,
                lastMove: null,
                feedbackSquare: null,
                feedbackType: null,
                waitingForAutoPlay: false,
                movesRemaining: prev.problem.moveCount,
              };
            });
          }, SOLUTION_RESET_HOLD);
          return true;
        }
        setState(prev => ({ ...prev, foundSolutions: newFound }));
      }

      if (isSolved) {
        const pb = startPlayback(state.initialFen, activeTree, true, newHistory);
        setState(prev => ({
          ...prev,
          fen: newFen,
          moveHistory: newHistory,
          status: 'correct',
          feedback: '',
          lastMove: { from, to },
          feedbackSquare: to,
          feedbackType: 'correct',
          waitingForAutoPlay: false,
          hintSquares: null,
          playback: pb,
        }));
        return true;
      }

      const isHelpStyleInner = problem.genre === 'help' || (problem.genre === 'retro' && state.userColor === 'b');
      if (isHelpStyleInner) {
        // Help / retro-helpmate: user plays both sides, no auto-play.
        // A root-level match pins which solution this line belongs to.
        const rootIdxHere = activeTree.indexOf(matchingNode);
        setState(prev => ({
          ...prev,
          // A switch replaces the line being walked, so it wins over the root
          // remembered from the moves before it.
          currentRootIndex: switchedRoot ?? prev.currentRootIndex ?? (rootIdxHere >= 0 ? rootIdxHere : null),
          fen: newFen,
          moveHistory: newHistory,
          currentNodes: matchingNode.children,
          feedback: '',
          lastMove: { from, to },
          feedbackSquare: to,
          feedbackType: 'correct',
          waitingForAutoPlay: false,
          hintSquares: null,
        }));
        setTimeout(() => {
          setState(prev => prev.feedbackType === 'correct' && prev.status === 'solving'
            ? { ...prev, feedbackSquare: null, feedbackType: null } : prev);
        }, CORRECT_FLASH);
        return true;
      }

      // Direct/Self/Study: auto-play opponent from solution tree
      if (realDefenses.length > 0) {
        setState(prev => ({
          ...prev,
          fen: newFen,
          moveHistory: newHistory,
          currentNodes: matchingNode.children,
          feedback: '',
          lastMove: { from, to },
          feedbackSquare: to,
          feedbackType: 'correct',
          waitingForAutoPlay: true,
          hintSquares: null,
        }));

        autoPlayTimerRef.current = setTimeout(() => {
          const defenseNode = realDefenses[0];
          const defenseChess = new Chess(newFen);
          const defMove = tryExecuteNode(defenseChess, defenseNode);
          if (defMove) {
            const afterDefenseFen = defenseChess.fen();
            const defLastMove = { from: defMove.from, to: defMove.to };
            const isDefCheckmate = defenseChess.isCheckmate();
            const isDefStalemate = defenseChess.isStalemate();

            if (isDefCheckmate || isDefStalemate || defenseNode.children.length === 0) {
              const defHistory = [...newHistory, defMove.san];
              const pb = startPlayback(state.initialFen, activeTree, true, defHistory);
              // Land the finishing move by itself, then hold — see SOLVED_HOLD.
              // The board stays locked for the length of the hold, and the
              // move list deliberately does NOT get the finishing move yet:
              // the panel still reads as solving, so writing it there would
              // print the answer in text on the frame it is meant to be read
              // off the board. Position moves; nothing else does.
              // feedbackSquare/feedbackType are left alone on purpose: they are
              // still marking the solver's own move, and clearing them here
              // would wipe the one tick confirming it at the very moment the
              // problem is won. A selfmate ends on a move the solver did not
              // make, so this is the only mark the finish can carry.
              setState(prev => ({
                ...prev, fen: afterDefenseFen,
                currentNodes: [], feedback: '', lastMove: defLastMove,
                waitingForAutoPlay: true,
              }));
              solveHoldRef.current = true;
              autoPlayTimerRef.current = setTimeout(() => {
                solveHoldRef.current = false;
                setState(prev => ({
                  ...prev, status: 'correct', moveHistory: defHistory,
                  waitingForAutoPlay: false, playback: pb,
                }));
              }, SOLVED_HOLD);
            } else {
              setState(prev => ({
                ...prev, fen: afterDefenseFen, moveHistory: [...newHistory, defMove.san],
                currentNodes: defenseNode.children, feedback: '', lastMove: defLastMove,
                feedbackSquare: null, feedbackType: null, waitingForAutoPlay: false,
                movesRemaining: movesRemaining - 1,
              }));
            }
          } else {
            // Defense move couldn't be parsed — just advance to let user continue
            setState(prev => ({
              ...prev, currentNodes: defenseNode.children,
              waitingForAutoPlay: false, feedbackSquare: null, feedbackType: null,
            }));
          }
        }, AUTO_PLAY_DELAY);
        return true;
      }

      /* Nothing on record for the opponent, yet the line goes on. Either the
         continuation is a threat in brackets ("1.Kb3! (2.Rd1#)"), or it is
         another move by the side that just moved, because the source wrote the
         reply inside a comment ("1.Sb3-d2! {(~)} 2.Sd2-c4#") or never wrote it
         at all. In both cases somebody has to move before the solver can play
         on, and the move is chosen to keep the continuation working. */
      const continuations = matchingNode.children.filter(
        n => n.isThreat || (problem.genre !== 'retro' && n.color === movedColor),
      );
      if (continuations.length > 0) {
        setState(prev => ({
          ...prev,
          fen: newFen,
          moveHistory: newHistory,
          currentNodes: matchingNode.children,
          feedback: '',
          lastMove: { from, to },
          feedbackSquare: to,
          feedbackType: 'correct',
          waitingForAutoPlay: true,
          hintSquares: null,
        }));

        autoPlayTimerRef.current = setTimeout(() => {
          const randomChess = new Chess(newFen);
          const chosen = pickReplyFor(newFen, continuations);
          if (chosen) {
            const randomMove = randomChess.move({ from: chosen.from, to: chosen.to, promotion: chosen.promotion });
            const afterRandomFen = randomChess.fen();
            const randomLastMove = { from: randomMove.from, to: randomMove.to };

            if (randomChess.isCheckmate() || randomChess.isStalemate()) {
              // Opponent has no useful moves — problem effectively solved.
              // Auto-played finish, so it is held the same way.
              const randomHistory = [...newHistory, randomMove.san];
              const pb = startPlayback(state.initialFen, activeTree, true, randomHistory);
              setState(prev => ({
                ...prev, fen: afterRandomFen,
                currentNodes: [], feedback: '', lastMove: randomLastMove,
                waitingForAutoPlay: true,
              }));
              solveHoldRef.current = true;
              autoPlayTimerRef.current = setTimeout(() => {
                solveHoldRef.current = false;
                setState(prev => ({
                  ...prev, status: 'correct', moveHistory: randomHistory,
                  waitingForAutoPlay: false, playback: pb,
                }));
              }, SOLVED_HOLD);
            } else {
              // Advance: user should now play the continuation
              setState(prev => ({
                ...prev, fen: afterRandomFen, moveHistory: [...newHistory, randomMove.san],
                currentNodes: continuations, feedback: '', lastMove: randomLastMove,
                feedbackSquare: null, feedbackType: null, waitingForAutoPlay: false,
                movesRemaining: movesRemaining - 1,
              }));
            }
          } else {
            setState(prev => ({
              ...prev, waitingForAutoPlay: false, feedbackSquare: null, feedbackType: null,
            }));
          }
        }, AUTO_PLAY_DELAY);
        return true;
      }

      // Truly no children — tree is truncated. Advance state.
      setState(prev => ({
        ...prev,
        fen: newFen,
        moveHistory: newHistory,
        currentNodes: [],
        feedback: '',
        lastMove: { from, to },
        feedbackSquare: to,
        feedbackType: 'correct',
        waitingForAutoPlay: false,
        hintSquares: null,
      }));
      setTimeout(() => {
        setState(prev => prev.feedbackType === 'correct' && prev.status === 'solving'
          ? { ...prev, feedbackSquare: null, feedbackType: null } : prev);
      }, CORRECT_FLASH);
      return true;
    }

    // Replaying a solution that is already found: not a mistake — the move IS
    // correct — but it doesn't count twice. Snap back with a note.
    if (state.totalSolutions > 1 && state.currentRootIndex === null) {
      const foundRoots = state.foundSolutions.filter(i => i >= 0).map(i => activeTree[i]).filter(Boolean);
      const replayed = matchMoveToTree(state.fen, from, to, move.san, move.promotion,
        foundRoots.filter(n => n.color === movedColor));
      if (replayed) {
        // Let the move land so it reads as "you played it", say so, and put
        // the diagram back after the same hold a completed solution gets.
        setState(prev => ({
          ...prev,
          fen: newFen,
          lastMove: { from, to },
          feedback: 'Already found — look for a different solution.',
          feedbackSquare: null,
          feedbackType: null,
          hintSquares: null,
          waitingForAutoPlay: true,
          replayNoticeAt: Date.now(),
        }));
        if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = setTimeout(() => {
          setState(prev => {
            if (!prev.problem || prev.status !== 'solving') return prev;
            return { ...prev, fen: prev.initialFen, lastMove: null, waitingForAutoPlay: false };
          });
        }, SOLUTION_RESET_HOLD);
        return true;
      }
    }

    // Wrong move
    const wrongUci = from + to + (move.promotion || '');

    // Thematic try? Only at the initial position (tries are first-move
    // alternatives in the source data). If the move matches a try root and
    // the composer's refutation is playable, demonstrate it instead of just
    // flashing red.
    if (state.moveHistory.length === 0 && (problem.fullSolutionTree?.length ?? 0) > 0) {
      const tryRoots = problem.fullSolutionTree.filter(n => n.isTry && n.color === movedColor);
      const tryNode = tryRoots.length > 0
        ? matchMoveToTree(state.fen, from, to, move.san, move.promotion, tryRoots)
        : null;
      let refNode = tryNode
        ? (tryNode.children.find(c => c.color !== movedColor && !c.isThreat && c.isKey)
          || tryNode.children.find(c => c.color !== movedColor && !c.isThreat))
        : null;
      if (tryNode && !refNode) {
        // Refutations written on their own line become root nodes (opposite
        // color, marked with "!") right after their try — same pattern
        // SolutionTree uses to attach root-level refutations for display
        const next = problem.fullSolutionTree[problem.fullSolutionTree.indexOf(tryNode) + 1];
        if (next && next.color !== movedColor && next.isKey && !next.isThreat) {
          refNode = next;
        }
      }
      if (refNode) {
        const refChess = new Chess(newFen);
        const refMove = tryExecuteNode(refChess, refNode);
        if (refMove) {
          const trySanText = movedColor === 'w' ? `1.${move.san}?` : `1...${move.san}?`;
          const refSanText = movedColor === 'w' ? `1...${refMove.san}!` : `2.${refMove.san}!`;
          flashTryRefutation(
            { from, to }, newFen,
            { from: refMove.from, to: refMove.to }, refChess.fen(),
            `Thematic try! ${trySanText} is refuted by ${refSanText}`,
            state.fen, wrongUci,
          );
          if (recordEventsRef.current) trackEvent('move_wrong', problem.id, {
            san: move.san,
            fen: state.fen,
            moveNumber: state.moveHistory.length + 1,
            wrongMoveCount: state.wrongMoveCount + 1,
            genre: problem.genre,
            thematicTry: true,
          });
          return false;
        }
      }
    }

    flashWrongMove(to, newFen, from, state.fen, wrongUci);
    if (recordEventsRef.current) trackEvent('move_wrong', problem.id, {
      san: move.san,
      fen: state.fen,
      moveNumber: state.moveHistory.length + 1,
      wrongMoveCount: state.wrongMoveCount + 1,
      genre: problem.genre,
    });
    return false;
  }, [state, startPlayback, flashWrongMove, flashTryRefutation]);

  // ── Show hint ──
  const showHint = useCallback(() => {
    const { fen, problem, currentNodes } = state;
    if (!problem || solveHoldRef.current) return;
    if (recordEventsRef.current) trackEvent('hint_used', problem.id, {
      moveNumber: state.moveHistory.length + 1,
      genre: problem.genre,
      wrongMoveCount: state.wrongMoveCount,
    });

    // Helper: get all legal destination squares for a piece at `from`
    const getAllLegalMoves = (chessFen: string, fromSq: string): string[] => {
      try {
        const chess = new Chess(chessFen);
        const moves = chess.moves({ square: fromSq as never, verbose: true });
        return moves.map(m => m.to);
      } catch { return []; }
    };

    // Solution tree hint (all genres)
    const currentTurn = fen.split(' ')[1] as 'w' | 'b';
    let hintFen = fen;
    let validNodes = currentNodes.filter(n => n.color === currentTurn);
    // Duplex helpmate: only the White-to-play solution is left, so the hint is
    // a white move on a board whose turn still says Black.
    if (validNodes.length === 0 && problem.genre === 'help' && currentNodes.length > 0) {
      hintFen = fen.replace(/ [wb] /, currentTurn === 'w' ? ' b ' : ' w ');
      validNodes = currentNodes.filter(n => n.color !== currentTurn);
    }

    if (validNodes.length > 0) {
      const verifiedMoves: { from: string; to: string; isKey: boolean }[] = [];
      for (const node of validNodes) {
        const chess = new Chess(hintFen);
        const move = tryExecuteNode(chess, node);
        if (move) {
          verifiedMoves.push({ from: move.from, to: move.to, isKey: node.isKey });
        }
      }
      if (verifiedMoves.length > 0) {
        const keyMove = verifiedMoves.find(m => m.isKey) || verifiedMoves[0];
        const allTargets = getAllLegalMoves(hintFen, keyMove.from);
        setState(prev => ({ ...prev, hintSquares: [keyMove.from, ...allTargets] }));
        return;
      }

      // Fallback: extract destination square from node text and find legal moves to it
      const hintNode = validNodes.find(n => n.isKey) || validNodes[0];
      const destMatch = hintNode.move.match(/([a-h][1-8])(?:=[QRBN])?$/i);
      if (destMatch) {
        const destSq = destMatch[1];
        try {
          const chess = new Chess(hintFen);
          const legal = chess.moves({ verbose: true });
          const candidates = legal.filter(m => m.to === destSq);
          if (candidates.length > 0) {
            const fromSq = candidates[0].from;
            const allTargets = getAllLegalMoves(hintFen, fromSq);
            setState(prev => ({ ...prev, hintSquares: [fromSq, ...allTargets] }));
            return;
          }
        } catch { /* fallback to stockfish */ }
      }
    }

    // Stockfish hint as fallback (if tree has no parseable moves)
    // Call analyze() directly — it handles lazy loading via ensureReady()
    if (stockfish) {
      (async () => {
        const result = await stockfish.analyze(fen, 18);
        if (!result) return;

        const hFrom = result.bestMove.slice(0, 2);
        const allTargets = getAllLegalMoves(fen, hFrom);
        if (allTargets.length > 0) {
          setState(prev => ({ ...prev, hintSquares: [hFrom, ...allTargets] }));
        }
      })();
    }
  }, [state, stockfish]);

  const hideHint = useCallback(() => {
    setState(prev => ({ ...prev, hintSquares: null }));
  }, []);

  const resetProblem = useCallback(() => {
    if (!state.problem) return;
    const twin = activeTwinRef.current;
    if (twin) startTwin(twin.fen, twin.tree, twin.record, twin.firstColor);
    else loadProblem(state.problem);
  }, [state.problem, loadProblem, startTwin]);

  const clearProblem = useCallback(() => {
    if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    solveHoldRef.current = false;
    setState(prev => ({ ...prev, problem: null, fen: '', initialFen: '', status: 'idle', playback: null, moveHistory: [], currentNodes: [], hintSquares: null, feedback: '', feedbackSquare: null, feedbackType: null }));
  }, []);

  // ── Give Up / Show Solution ──
  const showSolution = useCallback(() => {
    const { problem, initialFen, activeTree } = state;
    if (!problem || solveHoldRef.current) return;

    // Cancel any pending auto-play: if the user gives up during the 500ms
    // window after a correct move, the timer would otherwise fire afterwards
    // and overwrite the 'viewing' state with 'correct'
    if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);

    // Always use solution tree (works for all genres, no Stockfish dependency).
    // Multi-solution helpmate: show a solution the solver has NOT found yet —
    // replaying the one they already played would answer nothing.
    // …and a line the problem asks for rather than a cook, which is playable
    // but is not what the composer left to find. With no cook in the tree the
    // pool is the tree, so nothing changes for the problems that have none.
    const asked = activeTree.filter(r => !isCookedLine(r));
    const pool = asked.length > 0 ? asked : activeTree;
    const remaining = state.totalSolutions > 1
      ? pool.filter(r => !state.foundSolutions.includes(activeTree.indexOf(r)))
      : [];
    const showFrom = remaining.length > 0 ? [remaining[0]]
      : pool.length < activeTree.length ? [pool[0]]
      : activeTree;
    let pb = startPlayback(initialFen, showFrom);
    if (pb && pb.positions.length > 1) {
      pb.moveIndex = 0;
    }
    if (pb && pb.positions.length <= 1) {
      pb = { ...pb, moveIndex: -1 };
    }
    setState(prev => ({
      ...prev, status: 'viewing', feedback: '', feedbackSquare: null, feedbackType: null, hintSquares: null,
      refutationText: null, refutationArrow: null, playback: pb,
    }));
  }, [state.problem, state.initialFen, state.activeTree, state.totalSolutions, state.foundSolutions, startPlayback]);

  /**
   * The decided view for a problem whose solution the source never wrote:
   * the give-up screen without the give-up. No line is replayed, because
   * there is none to replay -- the roots belong to the other colour, and
   * walking them would put a black move on the board of a white-to-play
   * diagram and call it the answer. The caller records nothing either:
   * nobody failed a problem that had nothing to find.
   */
  const showNoSolution = useCallback(() => {
    if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    setState(prev => prev.problem ? {
      ...prev, status: 'viewing',
      // A playback holding the diagram and nothing else. The strip and the
      // « ‹ › » bar both ask for more than one position, so neither appears
      // -- but the moves in the solution view are clicked through this, and
      // with no playback at all they would be dead text.
      playback: {
        positions: [{ fen: prev.initialFen, lastMove: null, san: '' }],
        mainLine: [], mainLineLength: 0, moveIndex: -1,
        exploring: false, exploreFen: '', exploreLastMove: null,
      },
      feedback: '', feedbackSquare: null, feedbackType: null, hintSquares: null,
      refutationText: null, refutationArrow: null,
    } : prev);
  }, []);

  // ── Playback navigation ──
  const playbackGoTo = useCallback((index: number) => {
    setState(prev => {
      if (!prev.playback) return prev;
      const clamped = Math.max(-1, Math.min(prev.playback.positions.length - 2, index));
      return {
        ...prev, feedbackSquare: null, feedbackType: null,
        playback: { ...prev.playback, moveIndex: clamped, exploring: false, exploreFen: '', exploreLastMove: null },
      };
    });
  }, []);

  const playbackFirst = useCallback(() => playbackGoTo(-1), [playbackGoTo]);
  const playbackPrev = useCallback(() => {
    setState(prev => {
      if (!prev.playback) return prev;
      if (prev.playback.exploring) {
        return { ...prev, feedbackSquare: null, feedbackType: null, playback: { ...prev.playback, exploring: false, exploreFen: '', exploreLastMove: null } };
      }
      const idx = Math.max(-1, prev.playback.moveIndex - 1);
      return { ...prev, feedbackSquare: null, feedbackType: null, playback: { ...prev.playback, moveIndex: idx } };
    });
  }, []);
  const playbackNext = useCallback(() => {
    setState(prev => {
      if (!prev.playback) return prev;
      if (prev.playback.exploring) {
        return { ...prev, feedbackSquare: null, feedbackType: null, playback: { ...prev.playback, exploring: false, exploreFen: '', exploreLastMove: null } };
      }
      const idx = Math.min(prev.playback.positions.length - 2, prev.playback.moveIndex + 1);
      return { ...prev, feedbackSquare: null, feedbackType: null, playback: { ...prev.playback, moveIndex: idx } };
    });
  }, []);
  const playbackLast = useCallback(() => {
    setState(prev => {
      if (!prev.playback) return prev;
      return {
        ...prev, feedbackSquare: null, feedbackType: null,
        playback: { ...prev.playback, moveIndex: prev.playback.positions.length - 2, exploring: false, exploreFen: '', exploreLastMove: null },
      };
    });
  }, []);

  /**
   * Swap the playback line for a variation the solver clicked in the solution
   * tree: the move strip and the ◀▶ arrows then walk that line instead of the
   * played one. No way "back" is needed — every line in the tree is a correct
   * line, and clicking any other one (the main line included) switches again.
   * A node that cannot be replayed truncates the line there.
   */
  const playbackShowLine = useCallback((path: SolutionNode[]) => {
    setState(prev => {
      if (!prev.playback) return prev;
      const chess = new Chess(prev.initialFen);
      const positions: PlaybackPosition[] = [{ fen: prev.initialFen, lastMove: null, san: '' }];
      const line: SolutionNode[] = [];
      const play = (node: SolutionNode): boolean => {
        // Same turn-flip retry the solving path uses: retro trees carry moves
        // by whichever side the solver deduced, not whichever chess.js expects.
        let mv = tryExecuteNode(chess, node);
        if (!mv && node.color !== chess.turn()) {
          const flipped = new Chess(chess.fen().replace(/ [wb] /, ` ${node.color} `));
          mv = tryExecuteNode(flipped, node);
          if (mv) chess.load(flipped.fen());
        }
        if (!mv) return false;
        positions.push({ fen: chess.fen(), lastMove: { from: mv.from, to: mv.to }, san: mv.san });
        line.push(node);
        return true;
      };
      let broke = false;
      for (const node of path) {
        if (!play(node)) { broke = true; break; }
      }
      // The board stops on the clicked move; the ▶ arrow has the rest.
      const clickedIndex = line.length - 1;
      // A clicked defence already decides the rest of the line — run it out to
      // the mate so the whole line is there to step through.
      let cur: SolutionNode | undefined = broke ? undefined : line[line.length - 1];
      let guard = 0;
      while (cur && guard++ < 20) {
        const next: SolutionNode | undefined = cur.children.find(n => !n.isThreat && n.color === chess.turn())
          || cur.children.find(n => !n.isThreat);
        if (!next || !play(next)) break;
        cur = next;
      }
      if (positions.length <= 1) return prev;
      return {
        ...prev, feedbackSquare: null, feedbackType: null,
        playback: {
          ...prev.playback,
          positions,
          mainLine: line,
          mainLineLength: line.length,
          moveIndex: clickedIndex,
          exploring: false, exploreFen: '', exploreLastMove: null,
        },
      };
    });
  }, []);

  // Compute effective fen and lastMove
  const playback = state.playback;
  let effectiveFen = state.fen;
  let effectiveLastMove = state.lastMove;

  if (state.wrongMoveFen) {
    effectiveFen = state.wrongMoveFen;
    effectiveLastMove = state.wrongMoveLastMove;
  } else if (playback && (state.status === 'correct' || state.status === 'viewing')) {
    if (playback.exploring) {
      effectiveFen = playback.exploreFen;
      effectiveLastMove = playback.exploreLastMove;
    } else {
      const pos = playback.positions[playback.moveIndex + 1] || playback.positions[0];
      effectiveFen = pos.fen;
      effectiveLastMove = pos.lastMove;
    }
  }

  /* A White root in a helpmate means the diagram is solved from both sides --
     unless the stipulation says White opens it. An h#2.5 has nothing but
     White roots and is not a duplex: it is one solution, played from the side
     the half move names. (Nothing in the database carries a half move, so this
     reads false for every problem on the site.) */
  const halfMove = /\.5$/.test((state.problem?.stipulation || '').replace(/\s+/g, ''));
  const duplexCounts = state.problem?.genre === 'help' && !halfMove
    && state.activeTree.some(n => n.color === 'w')
    ? { black: state.activeTree.filter(n => n.color === 'b').length, white: state.activeTree.filter(n => n.color === 'w').length }
    : null;

  return {
    problem: state.problem,
    totalSolutions: state.totalSolutions,
    foundSolutionCount: state.foundSolutions.length,
    replayNoticeAt: state.replayNoticeAt,
    /** Duplex helpmate: how many solutions start with each side. Non-null
     *  only when the tree really holds a White-to-play line, so the label
     *  never promises what the board cannot do. */
    duplex: duplexCounts,
    /** A remaining solution starts with the side NOT on move (the
     *  White-to-play half of a duplex), so either colour may be picked up. */
    anyColorAllowed: state.status === 'solving' && state.problem?.genre === 'help'
      && state.currentNodes.some(n => n.color !== (state.fen.split(' ')[1] as 'w' | 'b')),
    fen: effectiveFen,
    initialFen: state.initialFen,
    moveHistory: state.moveHistory,
    status: state.status,
    feedback: state.feedback,
    lastMove: effectiveLastMove,
    feedbackSquare: state.feedbackSquare,
    feedbackType: state.feedbackType,
    waitingForAutoPlay: state.waitingForAutoPlay,
    hintSquares: state.hintSquares,
    wrongMoveCount: state.wrongMoveCount,
    lastWrongMove: state.lastWrongMove,
    refutationText: state.refutationText,
    refutationArrow: state.refutationArrow,
    playback: state.playback,
    setRefutation: (text: string | null, arrow: [string, string] | null) => {
      setState(prev => ({ ...prev, refutationText: text, refutationArrow: arrow }));
    },
    loadProblem,
    clearProblem,
    tryMove,
    showHint,
    hideHint,
    resetProblem,
    showSolution,
    showNoSolution,
    playbackGoTo,
    playbackFirst,
    playbackPrev,
    playbackNext,
    playbackLast,
    playbackShowLine,
    startTwin,
    playbackExplore: useCallback((fen: string, lastMove: { from: string; to: string } | null) => {
      setState(prev => {
        if (!prev.playback) return prev;
        return {
          ...prev, feedbackSquare: null, feedbackType: null,
          playback: { ...prev.playback, exploring: true, exploreFen: fen, exploreLastMove: lastMove },
        };
      });
    }, []),
  };
}
