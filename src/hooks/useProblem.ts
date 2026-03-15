import { useState, useCallback, useRef, useEffect } from 'react';
import { Chess } from 'chess.js';
import type { ChessProblem, SolutionNode, Genre } from '../types';

export type SolveStatus = 'idle' | 'solving' | 'correct' | 'incorrect' | 'viewing';

interface PlaybackPosition {
  fen: string;
  lastMove: { from: string; to: string } | null;
  san: string;
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
  // Hint state: squares to highlight when user requests a hint
  hintSquares: string[] | null; // [fromSquare, ...toSquares]
  wrongMoveCount: number;
  // Temporarily show piece at wrong destination before snapping back
  wrongMoveFen: string | null;
  wrongMoveLastMove: { from: string; to: string } | null;
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
const INCORRECT_FLASH = 600;
const CORRECT_FLASH = 400;
const WRONG_MOVE_PAUSE = 500; // How long to show piece at wrong destination before undoing

function getFirstMoveColor(genre: Genre): 'w' | 'b' {
  return genre === 'help' ? 'b' : 'w';
}

function getUserColor(genre: Genre): 'w' | 'b' {
  return genre === 'help' ? 'b' : 'w';
}

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

function computePositions(initialFen: string, mainLine: SolutionNode[]): PlaybackPosition[] {
  const positions: PlaybackPosition[] = [
    { fen: initialFen, lastMove: null, san: '' },
  ];
  const chess = new Chess(initialFen);
  for (const node of mainLine) {
    try {
      const uci = node.moveUci;
      let move;
      if (uci.startsWith('san:')) {
        move = chess.move(uci.slice(4));
      } else if (uci.length >= 4) {
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promo = uci.length > 4 ? uci[4] : undefined;
        move = chess.move({ from, to, promotion: promo });
      }
      if (move) {
        positions.push({
          fen: chess.fen(),
          lastMove: { from: move.from, to: move.to },
          san: move.san,
        });
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  return positions;
}

/** Extract the from-square from a UCI string like "e2e4" or "san:Nf3" with fen context */
function getHintFromNode(node: SolutionNode, fen: string): string | null {
  const uci = node.moveUci;
  if (uci.length >= 4 && !uci.startsWith('san:')) {
    return uci.slice(0, 2);
  }
  // For san: prefix, parse with chess.js
  try {
    const chess = new Chess(fen);
    const san = uci.startsWith('san:') ? uci.slice(4) : node.moveSan;
    const move = chess.move(san);
    return move ? move.from : null;
  } catch {
    return null;
  }
}

export function useProblem() {
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
    playback: null,
  });

  const chessRef = useRef<Chess>(new Chess());
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

    const chess = new Chess(problem.fen);
    chessRef.current = chess;

    const firstColor = getFirstMoveColor(problem.genre);
    const userColor = getUserColor(problem.genre);

    let fen = problem.fen;
    if (firstColor === 'b' && fen.includes(' w ')) {
      fen = fen.replace(' w ', ' b ');
      chessRef.current = new Chess(fen);
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
      playback: null,
    });
  }, []);

  const tryMove = useCallback((from: string, to: string, promotion?: string): boolean => {
    const { problem, currentNodes, status, playback } = state;

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

    const uci = from + to + (move.promotion || '');

    // Find this move in the solution tree
    const validNodes = currentNodes.filter(n => n.color === currentTurn);
    let matchingNode: SolutionNode | null = null;

    for (const node of validNodes) {
      if (node.moveUci === uci) {
        matchingNode = node;
        break;
      }
      if (node.moveSan === move.san) {
        matchingNode = node;
        break;
      }
      const nodeSanClean = node.moveSan.replace(/[+#]/g, '');
      const moveSanClean = move.san.replace(/[+#]/g, '');
      if (nodeSanClean === moveSanClean) {
        matchingNode = node;
        break;
      }
    }

    if (matchingNode) {
      // === CORRECT MOVE ===
      const newFen = chess.fen();
      const newHistory = [...state.moveHistory, move.san];

      // Verify checkmate with chess.js instead of trusting tree's isMate flag
      const isActualCheckmate = chess.isCheckmate();

      const opponentColor = currentTurn === 'w' ? 'b' : 'w';
      const realDefenses = matchingNode.children.filter(n => !n.isThreat && n.color === opponentColor);

      // For direct/self mate, require actual checkmate for terminal nodes
      const isMateProblem = problem.genre === 'direct' || problem.genre === 'self';
      let isSolved: boolean;
      if (isMateProblem) {
        // Only solved if actually checkmate, or if there are still defenses to auto-play
        isSolved = isActualCheckmate;
      } else {
        isSolved = matchingNode.children.length === 0;
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
        const nextNodes = matchingNode.children;
        setState(prev => ({
          ...prev,
          fen: newFen,
          moveHistory: newHistory,
          currentNodes: nextNodes,
          feedback: '',
          lastMove: { from, to },
          feedbackSquare: to,
          feedbackType: 'correct',
          waitingForAutoPlay: false,
          hintSquares: null,
        }));
        setTimeout(() => {
          setState(prev => {
            if (prev.feedbackType === 'correct' && prev.status === 'solving') {
              return { ...prev, feedbackSquare: null, feedbackType: null };
            }
            return prev;
          });
        }, CORRECT_FLASH);
        return true;
      }

      // Direct/Self: correct move, opponent auto-plays
      if (realDefenses.length > 0) {
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
        }));

        autoPlayTimerRef.current = setTimeout(() => {
          const defenseNode = realDefenses[0];
          const defenseChess = new Chess(newFen);

          try {
            const defenseUci = defenseNode.moveUci;
            let defMove;

            if (defenseUci.startsWith('san:')) {
              defMove = defenseChess.move(defenseUci.slice(4));
            } else {
              const defFrom = defenseUci.slice(0, 2);
              const defTo = defenseUci.slice(2, 4);
              const defPromo = defenseUci.length > 4 ? defenseUci[4] : undefined;
              defMove = defenseChess.move({ from: defFrom, to: defTo, promotion: defPromo });
            }

            if (defMove) {
              const afterDefenseFen = defenseChess.fen();
              const nextWhiteNodes = defenseNode.children;
              const defLastMove = { from: defMove.from, to: defMove.to };

              const isDefenseCheckmate = defenseChess.isCheckmate();

              if (isDefenseCheckmate || (!isMateProblem && nextWhiteNodes.length === 0)) {
                const pb = startPlayback(state.initialFen, problem.solutionTree, true);
                setState(prev => ({
                  ...prev,
                  fen: afterDefenseFen,
                  moveHistory: [...newHistory, defMove.san],
                  currentNodes: [],
                  status: 'correct',
                  feedback: '',
                  lastMove: defLastMove,
                  feedbackSquare: null,
                  feedbackType: null,
                  waitingForAutoPlay: false,
                  playback: pb,
                }));
              } else {
                setState(prev => ({
                  ...prev,
                  fen: afterDefenseFen,
                  moveHistory: [...newHistory, defMove.san],
                  currentNodes: nextWhiteNodes,
                  feedback: '',
                  lastMove: defLastMove,
                  feedbackSquare: null,
                  feedbackType: null,
                  waitingForAutoPlay: false,
                }));
              }
            }
          } catch {
            setState(prev => ({
              ...prev,
              currentNodes: defenseNode.children,
              waitingForAutoPlay: false,
              feedbackSquare: null,
              feedbackType: null,
            }));
          }
        }, AUTO_PLAY_DELAY);
        return true;
      }

      // Matched in tree but dead end (no defenses, not checkmate) — treat as wrong
      const deadEndFen = chess.fen();
      chess.undo();
      setState(prev => ({
        ...prev,
        feedbackSquare: to,
        feedbackType: 'incorrect',
        hintSquares: null,
        wrongMoveCount: prev.wrongMoveCount + 1,
        wrongMoveFen: deadEndFen,
        wrongMoveLastMove: { from, to },
      }));
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          wrongMoveFen: null,
          wrongMoveLastMove: null,
        }));
        setTimeout(() => {
          setState(prev => {
            if (prev.feedbackType === 'incorrect') {
              return { ...prev, feedbackSquare: null, feedbackType: null };
            }
            return prev;
          });
        }, 300);
      }, WRONG_MOVE_PAUSE);
      return false;
    } else {
      // === WRONG MOVE (not in tree) ===
      // Show piece at wrong destination temporarily before undoing
      const wrongFen = chess.fen();
      chess.undo();

      setState(prev => ({
        ...prev,
        feedbackSquare: to,
        feedbackType: 'incorrect',
        hintSquares: null,
        wrongMoveCount: prev.wrongMoveCount + 1,
        wrongMoveFen: wrongFen,
        wrongMoveLastMove: { from, to },
      }));

      // After pause, snap back to the real position
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          wrongMoveFen: null,
          wrongMoveLastMove: null,
        }));
        // Then clear the red highlight after another short delay
        setTimeout(() => {
          setState(prev => {
            if (prev.feedbackType === 'incorrect') {
              return { ...prev, feedbackSquare: null, feedbackType: null };
            }
            return prev;
          });
        }, 300);
      }, WRONG_MOVE_PAUSE);

      return false;
    }
  }, [state, startPlayback]);

  // Show hint: highlight the correct piece and its valid destinations
  // Only shows moves that are actually legal in chess.js (filters out retro/fairy moves)
  const showHint = useCallback(() => {
    const { currentNodes, fen, problem } = state;
    if (!problem) return;

    const currentTurn = fen.split(' ')[1] as 'w' | 'b';
    const validNodes = currentNodes.filter(n => n.color === currentTurn);
    if (validNodes.length === 0) return;

    // Try each node and verify the move is actually legal in chess.js
    const verifiedMoves: { from: string; to: string; isKey: boolean }[] = [];
    for (const node of validNodes) {
      try {
        const chess = new Chess(fen);
        const uci = node.moveUci;
        let move;
        if (uci.startsWith('san:')) {
          move = chess.move(uci.slice(4));
        } else if (uci.length >= 4) {
          const from = uci.slice(0, 2);
          const to = uci.slice(2, 4);
          const promo = uci.length > 4 ? uci[4] : undefined;
          move = chess.move({ from, to, promotion: promo });
        }
        if (!move) {
          // Try SAN as fallback
          const chess2 = new Chess(fen);
          move = chess2.move(node.moveSan);
        }
        if (move) {
          verifiedMoves.push({ from: move.from, to: move.to, isKey: node.isKey });
        }
      } catch { /* skip unplayable moves */ }
    }

    if (verifiedMoves.length === 0) return;

    // Pick the key move's from-square, or first verified move
    const keyMove = verifiedMoves.find(m => m.isKey) || verifiedMoves[0];
    const fromSquare = keyMove.from;

    // Get all destination squares from the same from-square
    const toSquares = verifiedMoves
      .filter(m => m.from === fromSquare)
      .map(m => m.to);

    setState(prev => ({
      ...prev,
      hintSquares: [fromSquare, ...toSquares],
    }));
  }, [state]);

  const resetProblem = useCallback(() => {
    if (state.problem) {
      loadProblem(state.problem);
    }
  }, [state.problem, loadProblem]);

  const showSolution = useCallback(() => {
    const pb = state.problem ? startPlayback(state.initialFen, state.problem.solutionTree) : null;
    // Start at moveIndex 0 so the first correct move auto-plays on the board
    if (pb && pb.positions.length > 1) {
      pb.moveIndex = 0;
    }
    setState(prev => ({
      ...prev,
      status: 'viewing',
      feedback: '',
      feedbackSquare: null,
      feedbackType: null,
      hintSquares: null,
      playback: pb,
    }));
  }, [state.problem, state.initialFen, startPlayback]);

  // Playback navigation
  const playbackGoTo = useCallback((index: number) => {
    setState(prev => {
      if (!prev.playback) return prev;
      const clamped = Math.max(-1, Math.min(prev.playback.positions.length - 2, index));
      return {
        ...prev,
        feedbackSquare: null,
        feedbackType: null,
        playback: {
          ...prev.playback,
          moveIndex: clamped,
          exploring: false,
          exploreFen: '',
          exploreLastMove: null,
        },
      };
    });
  }, []);

  const playbackFirst = useCallback(() => playbackGoTo(-1), [playbackGoTo]);
  const playbackPrev = useCallback(() => {
    setState(prev => {
      if (!prev.playback) return prev;
      if (prev.playback.exploring) {
        return {
          ...prev,
          feedbackSquare: null,
          feedbackType: null,
          playback: { ...prev.playback, exploring: false, exploreFen: '', exploreLastMove: null },
        };
      }
      const idx = Math.max(-1, prev.playback.moveIndex - 1);
      return { ...prev, feedbackSquare: null, feedbackType: null, playback: { ...prev.playback, moveIndex: idx } };
    });
  }, []);
  const playbackNext = useCallback(() => {
    setState(prev => {
      if (!prev.playback) return prev;
      if (prev.playback.exploring) {
        return {
          ...prev,
          feedbackSquare: null,
          feedbackType: null,
          playback: { ...prev.playback, exploring: false, exploreFen: '', exploreLastMove: null },
        };
      }
      const idx = Math.min(prev.playback.positions.length - 2, prev.playback.moveIndex + 1);
      return { ...prev, feedbackSquare: null, feedbackType: null, playback: { ...prev.playback, moveIndex: idx } };
    });
  }, []);
  const playbackLast = useCallback(() => {
    setState(prev => {
      if (!prev.playback) return prev;
      return {
        ...prev,
        feedbackSquare: null,
        feedbackType: null,
        playback: {
          ...prev.playback,
          moveIndex: prev.playback.positions.length - 2,
          exploring: false,
          exploreFen: '',
          exploreLastMove: null,
        },
      };
    });
  }, []);

  // Compute effective fen and lastMove (playback overrides when active)
  const playback = state.playback;
  let effectiveFen = state.fen;
  let effectiveLastMove = state.lastMove;

  // When a wrong move is being shown, override with the wrong position
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
