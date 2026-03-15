import { useState, useCallback, useRef, useEffect } from 'react';
import { Chess } from 'chess.js';
import type { ChessProblem, SolutionNode, Genre } from '../types';

export type SolveStatus = 'idle' | 'solving' | 'correct' | 'incorrect' | 'viewing';

interface PlaybackPosition {
  fen: string;
  lastMove: { from: string; to: string } | null;
  san: string;
}

interface StockfishApi {
  analyze: (fen: string, depth?: number) => Promise<{ bestMove: string; bestMoveSan: string; eval: number; mateIn: number | null } | null>;
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
  // How many white moves remain for mate (for direct mate tracking)
  movesRemaining: number;
  playback: {
    positions: PlaybackPosition[];
    mainLine: SolutionNode[];
    moveIndex: number;
    exploring: boolean;
    exploreFen: string;
    exploreLastMove: { from: string; to: string } | null;
  } | null;
}

// Timing constants
const AUTO_PLAY_DELAY = 400;
const CORRECT_FLASH = 400;
const WRONG_MOVE_PAUSE = 500;

function getFirstMoveColor(genre: Genre): 'w' | 'b' {
  return genre === 'help' ? 'b' : 'w';
}

function getUserColor(genre: Genre): 'w' | 'b' {
  return genre === 'help' ? 'b' : 'w';
}

// ── Solution tree helpers ─────────────────────────────────

function getMainLine(nodes: SolutionNode[]): SolutionNode[] {
  const line: SolutionNode[] = [];
  let current = nodes.find(n => n.isKey) || nodes.find(n => n.color === 'w') || nodes[0];
  if (!current) return line;

  line.push(current);
  while (current.children.length > 0) {
    const nonThreat = current.children.filter(n => !n.isThreat);
    current = nonThreat[0] || current.children[0];
    line.push(current);
  }
  return line;
}

function tryExecuteNode(chess: Chess, node: SolutionNode): ReturnType<Chess['move']> | null {
  const uci = node.moveUci;

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
    const move = tryExecuteNode(chess, node);
    if (move) {
      positions.push({
        fen: chess.fen(),
        lastMove: { from: move.from, to: move.to },
        san: move.san,
      });
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
    if (verifiedMove && verifiedMove.from === from && verifiedMove.to === to) return node;
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
    movesRemaining: 0,
    playback: null,
  });

  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
  }, []);

  const startPlayback = useCallback((initialFen: string, solutionTree: SolutionNode[], startAtEnd: boolean = false) => {
    const mainLine = getMainLine(solutionTree);
    const positions = computePositions(initialFen, mainLine);
    return {
      positions,
      mainLine,
      moveIndex: startAtEnd ? positions.length - 2 : -1,
      exploring: false,
      exploreFen: '',
      exploreLastMove: null,
    };
  }, []);

  const loadProblem = useCallback((problem: ChessProblem) => {
    if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);

    const firstColor = getFirstMoveColor(problem.genre);
    const userColor = getUserColor(problem.genre);

    let fen = problem.fen;
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
      movesRemaining: problem.moveCount,
      playback: null,
    });
  }, []);

  // ── Flash wrong move and undo ──
  const flashWrongMove = useCallback((to: string, wrongFen: string, from: string) => {
    setState(prev => ({
      ...prev,
      feedbackSquare: to,
      feedbackType: 'incorrect',
      hintSquares: null,
      wrongMoveCount: prev.wrongMoveCount + 1,
      wrongMoveFen: wrongFen,
      wrongMoveLastMove: { from, to },
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

    const chess = new Chess(state.fen);
    const currentTurn = state.fen.split(' ')[1] as 'w' | 'b';

    if (problem.genre !== 'help' && currentTurn !== 'w') return false;

    let move;
    try {
      move = chess.move({ from, to, promotion: promotion || 'q' });
    } catch {
      return false;
    }
    if (!move) return false;

    const newFen = chess.fen();
    const newHistory = [...state.moveHistory, move.san];

    // ══════════════════════════════════════════════
    // Check immediate solve (checkmate / stalemate)
    // ══════════════════════════════════════════════
    const isCheckmate = chess.isCheckmate();

    if (isCheckmate && problem.genre !== 'self') {
      // User delivered checkmate — solved! (direct/study/help)
      const pb = startPlayback(state.initialFen, problem.solutionTree, true);
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

    if (problem.stipulation === '=' && chess.isStalemate()) {
      // Study draw: stalemate — solved!
      const pb = startPlayback(state.initialFen, problem.solutionTree, true);
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
    const validNodes = currentNodes.filter(n => n.color === currentTurn);
    const matchingNode = matchMoveToTree(state.fen, from, to, move.san, move.promotion, validNodes);

    if (matchingNode) {
      const isActualCheckmate = chess.isCheckmate();
      const opponentColor = currentTurn === 'w' ? 'b' : 'w';
      const realDefenses = matchingNode.children.filter(n => !n.isThreat && n.color === opponentColor);

      const isMateProblem = problem.genre === 'self';
      const isTerminal = isActualCheckmate || chess.isStalemate() || chess.isDraw();
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
        const pb = startPlayback(state.initialFen, problem.solutionTree, true);
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

      if (problem.genre === 'help') {
        // Help: user plays both sides, no auto-play
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
              const pb = startPlayback(state.initialFen, problem.solutionTree, true);
              setState(prev => ({
                ...prev, fen: afterDefenseFen, moveHistory: [...newHistory, defMove.san],
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
              const pb = startPlayback(state.initialFen, problem.solutionTree, true);
              setState(prev => ({
                ...prev, fen: afterRandomFen, moveHistory: [...newHistory, randomMove.san],
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
    const wrongFen = chess.fen();
    chess.undo();
    flashWrongMove(to, wrongFen, from);
    return false;
  }, [state, startPlayback, flashWrongMove]);

  // ── Show hint ──
  const showHint = useCallback(() => {
    const { fen, problem, currentNodes } = state;
    if (!problem) return;

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

  const resetProblem = useCallback(() => {
    if (state.problem) loadProblem(state.problem);
  }, [state.problem, loadProblem]);

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
      ...prev, status: 'viewing', feedback: '', feedbackSquare: null, feedbackType: null, hintSquares: null, playback: pb,
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
    } else if (state.status === 'correct' && playback.moveIndex >= playback.positions.length - 2) {
      // At end of playback after solving: show actual solved position
      // (playback may be incomplete if main line moves couldn't all be executed)
      effectiveFen = state.fen;
      effectiveLastMove = state.lastMove;
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
    playback: state.playback,
    loadProblem,
    tryMove,
    showHint,
    resetProblem,
    showSolution,
    playbackGoTo,
    playbackFirst,
    playbackPrev,
    playbackNext,
    playbackLast,
  };
}
