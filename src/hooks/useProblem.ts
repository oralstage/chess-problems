import { useState, useCallback, useRef, useEffect } from 'react';
import { Chess } from 'chess.js';
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
  playback: {
    positions: PlaybackPosition[];
    mainLine: SolutionNode[];
    mainLineLength: number;
    moveIndex: number;
    exploring: boolean;
    exploreFen: string;
    exploreLastMove: { from: string; to: string } | null;
  } | null;
}

// Timing constants
const AUTO_PLAY_DELAY = 500;
const CORRECT_FLASH = 400;
const WRONG_MOVE_PAUSE = 500;

function getFirstMoveColor(genre: Genre, stipulation?: string): 'w' | 'b' {
  if (genre === 'help') return 'b';
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

function getMainLine(nodes: SolutionNode[]): SolutionNode[] {
  const line: SolutionNode[] = [];
  let current = nodes.find(n => n.isKey) || nodes.find(n => n.color === 'w') || nodes[0];
  if (!current) return line;

  line.push(current);
  while (current.children.length > 0) {
    const nonThreat = current.children.filter(n => !n.isThreat);
    const next = nonThreat[0] || current.children[0];
    // If next node is same color (threat), insert a placeholder for the opponent's move
    if (next.color === current.color && next.isThreat) {
      const placeholder = { ...AUTO_MOVE_PLACEHOLDER, color: current.color === 'w' ? 'b' as const : 'w' as const };
      line.push(placeholder);
    }
    current = next;
    line.push(current);
  }
  return line;
}

function tryExecuteNode(chess: Chess, node: SolutionNode): ReturnType<Chess['move']> | null {
  const uci = node.moveUci;

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

function computePositions(initialFen: string, mainLine: SolutionNode[]): PlaybackPosition[] {
  const positions: PlaybackPosition[] = [{ fen: initialFen, lastMove: null, san: '' }];
  const chess = new Chess(initialFen);
  for (const node of mainLine) {
    let move = tryExecuteNode(chess, node);
    // If move fails, try with flipped turn (retro problems may start with opposite color)
    if (!move && node.color !== chess.turn()) {
      const curFen = chess.fen();
      const curTurn = curFen.split(' ')[1];
      const flipped = curFen.replace(/ [wb] /, curTurn === 'w' ? ' b ' : ' w ');
      const chess2 = new Chess(flipped);
      move = tryExecuteNode(chess2, node);
      if (move) {
        chess.load(chess2.fen());
      }
    }
    if (move) {
      positions.push({
        fen: chess.fen(),
        lastMove: { from: move.from, to: move.to },
        san: move.san,
      });
    } else if (node === AUTO_MOVE_PLACEHOLDER || (node.moveSan === '...' && node.moveUci === '')) {
      // Placeholder for auto-played opponent move — pick first legal move
      const legalMoves = chess.moves({ verbose: true });
      if (legalMoves.length > 0) {
        const autoMove = legalMoves[0];
        chess.move(autoMove);
        positions.push({
          fen: chess.fen(),
          lastMove: { from: autoMove.from, to: autoMove.to },
          san: autoMove.san,
        });
      } else {
        break;
      }
    } else {
      break;
    }
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
  for (const node of nodes) {
    if (node.moveUci === uci) return node;
    if (node.moveSan === moveSan) return node;
    const nodeSanClean = node.moveSan.replace(/[+#!?]/g, '');
    const moveSanClean = moveSan.replace(/[+#!?]/g, '');
    if (nodeSanClean === moveSanClean) return node;
    const verifyChess = new Chess(preFen);
    const verifiedMove = tryExecuteNode(verifyChess, node);
    if (verifiedMove && verifiedMove.from === from && verifiedMove.to === to) {
      // For promotions, also check the promotion piece matches
      if (movePromotion && verifiedMove.promotion && verifiedMove.promotion !== movePromotion) continue;
      return node;
    }
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
    playback: null,
  });

  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      mainLine = getMainLine(solutionTree);
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
      waitingForAutoPlay: false,
      userColor,
      hintSquares: null,
      wrongMoveCount: 0,
      wrongMoveFen: null,
      wrongMoveLastMove: null,
      lastWrongMove: null,
      refutationText: null,
      refutationArrow: null,
      movesRemaining: problem.moveCount,
      playback: null,
    });
  }, []);

  // ── Flash wrong move and undo ──
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
    const { problem, currentNodes, status, playback, movesRemaining } = state;

    // Block moves while solution is still loading (solutionTree empty)
    if (problem && problem.solutionTree.length === 0 && status === 'solving' && !playback) {
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

    if (!tryWithFen(state.fen) && problem.genre === 'retro') {
      // Flip turn and retry (user deduced it's the other side's move)
      const flippedFen = state.fen.replace(/ [wb] /, currentTurn === 'w' ? ' b ' : ' w ');
      tryWithFen(flippedFen);
    }
    if (!move) return false;

    const newFen = afterFen;
    const newHistory = [...state.moveHistory, move.san];
    trackEvent('move_correct', problem.id, {
      san: move.san,
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

    if (isCheckmate && problem.genre !== 'self') {
      // User delivered checkmate — solved! (direct/study/help)
      const pb = startPlayback(state.initialFen, problem.solutionTree, true, newHistory);
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
      const pb = startPlayback(state.initialFen, problem.solutionTree, true, newHistory);
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
    const matchingNode = matchMoveToTree(state.fen, from, to, move.san, move.promotion, validNodes);

    if (matchingNode) {
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
        // Only solved if no children AND no more moves expected
        isSolved = matchingNode.children.length === 0 && movesRemaining <= 1;
      }

      if (isSolved) {
        const pb = startPlayback(state.initialFen, problem.solutionTree, true, newHistory);
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
        // Help / retro-helpmate: user plays both sides, no auto-play
        setState(prev => ({
          ...prev,
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
              const pb = startPlayback(state.initialFen, problem.solutionTree, true, defHistory);
              setState(prev => ({
                ...prev, fen: afterDefenseFen, moveHistory: defHistory,
                currentNodes: [], status: 'correct', feedback: '', lastMove: defLastMove,
                feedbackSquare: null, feedbackType: null, waitingForAutoPlay: false, playback: pb,
              }));
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

      // No explicit defenses — check if there are threat children (e.g., "1.Kb3! (2.Rd1#)")
      // If so, auto-play a random legal opponent move so user can execute the threat
      const threatChildren = matchingNode.children.filter(n => n.isThreat);
      if (threatChildren.length > 0) {
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
          const legalMoves = randomChess.moves({ verbose: true });
          if (legalMoves.length > 0) {
            const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
            randomChess.move(randomMove);
            const afterRandomFen = randomChess.fen();
            const randomLastMove = { from: randomMove.from, to: randomMove.to };

            if (randomChess.isCheckmate() || randomChess.isStalemate()) {
              // Opponent has no useful moves — problem effectively solved
              const randomHistory = [...newHistory, randomMove.san];
              const pb = startPlayback(state.initialFen, problem.solutionTree, true, randomHistory);
              setState(prev => ({
                ...prev, fen: afterRandomFen, moveHistory: randomHistory,
                currentNodes: [], status: 'correct', feedback: '', lastMove: randomLastMove,
                feedbackSquare: null, feedbackType: null, waitingForAutoPlay: false, playback: pb,
              }));
            } else {
              // Advance: user should now play the threat move(s)
              setState(prev => ({
                ...prev, fen: afterRandomFen, moveHistory: [...newHistory, randomMove.san],
                currentNodes: threatChildren, feedback: '', lastMove: randomLastMove,
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

      // Truly no children — advance (tree might be truncated)
      setState(prev => ({
        ...prev,
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

    // Wrong move
    const wrongUci = from + to + (move.promotion || '');
    flashWrongMove(to, newFen, from, state.fen, wrongUci);
    trackEvent('move_wrong', problem.id, {
      san: move.san,
      fen: state.fen,
      moveNumber: state.moveHistory.length + 1,
      wrongMoveCount: state.wrongMoveCount + 1,
      genre: problem.genre,
    });
    return false;
  }, [state, startPlayback, flashWrongMove]);

  // ── Show hint ──
  const showHint = useCallback(() => {
    const { fen, problem, currentNodes } = state;
    if (!problem) return;
    trackEvent('hint_used', problem.id, {
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
    const validNodes = currentNodes.filter(n => n.color === currentTurn);

    if (validNodes.length > 0) {
      const verifiedMoves: { from: string; to: string; isKey: boolean }[] = [];
      for (const node of validNodes) {
        const chess = new Chess(fen);
        const move = tryExecuteNode(chess, node);
        if (move) {
          verifiedMoves.push({ from: move.from, to: move.to, isKey: node.isKey });
        }
      }
      if (verifiedMoves.length > 0) {
        const keyMove = verifiedMoves.find(m => m.isKey) || verifiedMoves[0];
        const allTargets = getAllLegalMoves(fen, keyMove.from);
        setState(prev => ({ ...prev, hintSquares: [keyMove.from, ...allTargets] }));
        return;
      }

      // Fallback: extract destination square from node text and find legal moves to it
      const hintNode = validNodes.find(n => n.isKey) || validNodes[0];
      const destMatch = hintNode.move.match(/([a-h][1-8])(?:=[QRBN])?$/i);
      if (destMatch) {
        const destSq = destMatch[1];
        try {
          const chess = new Chess(fen);
          const legal = chess.moves({ verbose: true });
          const candidates = legal.filter(m => m.to === destSq);
          if (candidates.length > 0) {
            const fromSq = candidates[0].from;
            const allTargets = getAllLegalMoves(fen, fromSq);
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
    if (state.problem) loadProblem(state.problem);
  }, [state.problem, loadProblem]);

  const clearProblem = useCallback(() => {
    if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    setState(prev => ({ ...prev, problem: null, fen: '', initialFen: '', status: 'idle', playback: null, moveHistory: [], currentNodes: [], hintSquares: null, feedback: '', feedbackSquare: null, feedbackType: null }));
  }, []);

  // ── Give Up / Show Solution ──
  const showSolution = useCallback(() => {
    const { problem, initialFen } = state;
    if (!problem) return;

    // Always use solution tree (works for all genres, no Stockfish dependency)
    let pb = startPlayback(initialFen, problem.solutionTree);
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
  }, [state.problem, state.initialFen, startPlayback]);

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

  return {
    problem: state.problem,
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
    playbackGoTo,
    playbackFirst,
    playbackPrev,
    playbackNext,
    playbackLast,
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
