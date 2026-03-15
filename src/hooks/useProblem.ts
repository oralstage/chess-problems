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

// ── Stockfish-based helpers ──────────────────────────────

/** Use Stockfish to compute the main line from a position */
async function computeStockfishLine(
  fen: string,
  maxMoves: number,
  sf: StockfishApi,
): Promise<PlaybackPosition[]> {
  const positions: PlaybackPosition[] = [{ fen, lastMove: null, san: '' }];
  const chess = new Chess(fen);
  // For a #N problem, we need up to 2*N - 1 half-moves (N white + N-1 black)
  const maxHalfMoves = maxMoves > 0 ? maxMoves * 2 - 1 : 30;

  for (let i = 0; i < maxHalfMoves; i++) {
    if (chess.isGameOver()) break;
    const result = await sf.analyze(chess.fen(), 18);
    if (!result) break;

    const from = result.bestMove.slice(0, 2);
    const to = result.bestMove.slice(2, 4);
    const promo = result.bestMove.length > 4 ? result.bestMove[4] : undefined;
    let move;
    try {
      move = chess.move({ from, to, promotion: promo });
    } catch {
      break;
    }
    if (!move) break;

    positions.push({
      fen: chess.fen(),
      lastMove: { from: move.from, to: move.to },
      san: move.san,
    });
  }
  return positions;
}

// ── Solution tree helpers (for helpmate/selfmate) ────────

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

// ── Build playback from move history (for Stockfish-solved problems) ──
function buildPlaybackFromHistory(initialFen: string, moveHistory: string[]): PlaybackPosition[] {
  const positions: PlaybackPosition[] = [{ fen: initialFen, lastMove: null, san: '' }];
  const chess = new Chess(initialFen);
  for (const san of moveHistory) {
    try {
      const move = chess.move(san);
      if (move) {
        positions.push({
          fen: chess.fen(),
          lastMove: { from: move.from, to: move.to },
          san: move.san,
        });
      }
    } catch { break; }
  }
  return positions;
}

// ── Determines if a genre uses Stockfish for validation ──
function usesStockfish(genre: Genre): boolean {
  return genre === 'direct' || genre === 'study';
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
  const sfBusyRef = useRef(false);

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

  const startPlaybackFromPositions = useCallback((positions: PlaybackPosition[], startAtEnd: boolean = false) => {
    return {
      positions,
      mainLine: [] as SolutionNode[],
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

  // ── Stockfish auto-play opponent response ──
  const sfAutoPlayOpponent = useCallback(async (
    newFen: string,
    newHistory: string[],
    from: string,
    to: string,
    movesRemaining: number,
  ) => {
    if (!stockfish) return;

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

    // Wait a beat, then get Stockfish's defense
    await new Promise(r => setTimeout(r, AUTO_PLAY_DELAY));

    const defResult = await stockfish.analyze(newFen, 18);
    if (!defResult) {
      setState(prev => ({ ...prev, waitingForAutoPlay: false, feedbackSquare: null, feedbackType: null }));
      return;
    }

    const defChess = new Chess(newFen);
    const dfrom = defResult.bestMove.slice(0, 2);
    const dto = defResult.bestMove.slice(2, 4);
    const dpromo = defResult.bestMove.length > 4 ? defResult.bestMove[4] : undefined;
    let defMove;
    try {
      defMove = defChess.move({ from: dfrom, to: dto, promotion: dpromo });
    } catch { /* */ }

    if (!defMove) {
      setState(prev => ({ ...prev, waitingForAutoPlay: false, feedbackSquare: null, feedbackType: null }));
      return;
    }

    const afterDefFen = defChess.fen();
    const defLastMove = { from: defMove.from, to: defMove.to };

    // Check if this defense results in checkmate (selfmate scenario)
    if (defChess.isCheckmate()) {
      const historyWithDef = [...newHistory, defMove.san];
      setState(prev => {
        const positions = buildPlaybackFromHistory(prev.initialFen, historyWithDef);
        const pb = {
          positions,
          mainLine: [] as SolutionNode[],
          moveIndex: positions.length - 2,
          exploring: false,
          exploreFen: '',
          exploreLastMove: null,
        };
        return {
          ...prev,
          fen: afterDefFen,
          moveHistory: historyWithDef,
          status: 'correct',
          feedback: '',
          lastMove: defLastMove,
          feedbackSquare: null,
          feedbackType: null,
          waitingForAutoPlay: false,
          movesRemaining: 0,
          playback: pb,
        };
      });
      return;
    }

    setState(prev => ({
      ...prev,
      fen: afterDefFen,
      moveHistory: [...newHistory, defMove.san],
      feedback: '',
      lastMove: defLastMove,
      feedbackSquare: null,
      feedbackType: null,
      waitingForAutoPlay: false,
      movesRemaining: movesRemaining - 1,
    }));
  }, [stockfish]);

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
    // STOCKFISH path: direct mate and study
    // ══════════════════════════════════════════════
    if (usesStockfish(problem.genre) && stockfish) {
      const isCheckmate = chess.isCheckmate();

      if (isCheckmate) {
        // User delivered checkmate — solved!
        const positions = buildPlaybackFromHistory(state.initialFen, newHistory);
        const pb = {
          positions,
          mainLine: [] as SolutionNode[],
          moveIndex: positions.length - 2,
          exploring: false,
          exploreFen: '',
          exploreLastMove: null,
        };
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

      // For study with draw goal, stalemate is also correct
      if (problem.stipulation === '=' && chess.isStalemate()) {
        const positions = buildPlaybackFromHistory(state.initialFen, newHistory);
        const pb = {
          positions,
          mainLine: [] as SolutionNode[],
          moveIndex: positions.length - 2,
          exploring: false,
          exploreFen: '',
          exploreLastMove: null,
        };
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

      // Save pre-move state for undo
      const preFen = state.fen;
      const preMoveHistory = state.moveHistory;
      const preLastMove = state.lastMove;

      // Show the move on board immediately, then async-verify with Stockfish
      setState(prev => ({
        ...prev,
        fen: newFen,
        moveHistory: newHistory,
        lastMove: { from, to },
        feedbackSquare: to,
        feedbackType: 'correct',
        waitingForAutoPlay: true,
        hintSquares: null,
      }));

      // Async Stockfish validation
      (async () => {
        if (sfBusyRef.current) return;
        sfBusyRef.current = true;
        try {
          const result = await stockfish.analyze(newFen, 20);
          if (!result) {
            // Stockfish failed — undo and mark wrong
            sfBusyRef.current = false;
            flashWrongMove(to, newFen, from);
            setState(prev => ({ ...prev, fen: preFen, moveHistory: preMoveHistory, lastMove: preLastMove, waitingForAutoPlay: false }));
            return;
          }

          // Check if forced mate still exists
          const isMateGenre = problem.genre === 'direct';
          let isCorrect = false;

          if (isMateGenre) {
            // After white's move, it's black's turn.
            // Stockfish reports "score mate -N" meaning black gets mated in N moves.
            // For a #K problem with movesRemaining white moves left,
            // the mate distance must be <= movesRemaining - 1 (remaining white moves after this one).
            if (result.mateIn !== null && result.mateIn < 0) {
              const mateDistance = Math.abs(result.mateIn);
              isCorrect = mateDistance <= movesRemaining - 1;
            }
          } else {
            // Study: win (+) or draw (=)
            if (problem.stipulation === '+') {
              isCorrect = result.eval <= -300; // White has a strong advantage
            } else {
              // Draw study: eval near 0 is correct
              isCorrect = Math.abs(result.eval) < 100;
            }
          }

          if (isCorrect) {
            // Correct move! Auto-play opponent's response
            await sfAutoPlayOpponent(newFen, newHistory, from, to, movesRemaining);
          } else {
            // Wrong move — undo
            flashWrongMove(to, newFen, from);
            setState(prev => ({
              ...prev,
              fen: preFen,
              moveHistory: preMoveHistory,
              lastMove: preLastMove,
              waitingForAutoPlay: false,
            }));
          }
        } finally {
          sfBusyRef.current = false;
        }
      })();

      return true; // Accepted the move visually (async verification pending)
    }

    // ══════════════════════════════════════════════
    // SOLUTION TREE path: helpmate, selfmate
    // ══════════════════════════════════════════════
    const uci = from + to + (move.promotion || '');

    const validNodes = currentNodes.filter(n => n.color === currentTurn);
    let matchingNode: SolutionNode | null = null;

    for (const node of validNodes) {
      if (node.moveUci === uci) { matchingNode = node; break; }
      if (node.moveSan === move.san) { matchingNode = node; break; }
      const nodeSanClean = node.moveSan.replace(/[+#]/g, '');
      const moveSanClean = move.san.replace(/[+#]/g, '');
      if (nodeSanClean === moveSanClean) { matchingNode = node; break; }
      const verifyChess = new Chess(state.fen);
      const verifiedMove = tryExecuteNode(verifyChess, node);
      if (verifiedMove && verifiedMove.from === from && verifiedMove.to === to) { matchingNode = node; break; }
    }

    if (matchingNode) {
      const isActualCheckmate = chess.isCheckmate();
      const opponentColor = currentTurn === 'w' ? 'b' : 'w';
      const realDefenses = matchingNode.children.filter(n => !n.isThreat && n.color === opponentColor);

      const isMateProblem = problem.genre === 'self';
      let isSolved: boolean;
      if (isMateProblem) {
        isSolved = isActualCheckmate;
      } else {
        isSolved = matchingNode.children.length === 0 || isActualCheckmate;
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

      // Self: auto-play opponent
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
            const defMove = tryExecuteNode(defenseChess, defenseNode);
            if (defMove) {
              const afterDefenseFen = defenseChess.fen();
              const defLastMove = { from: defMove.from, to: defMove.to };
              const isDefCheckmate = defenseChess.isCheckmate();

              if (isDefCheckmate || defenseNode.children.length === 0) {
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
                }));
              }
            }
          } catch {
            setState(prev => ({ ...prev, currentNodes: defenseNode.children, waitingForAutoPlay: false, feedbackSquare: null, feedbackType: null }));
          }
        }, AUTO_PLAY_DELAY);
        return true;
      }
    }

    // Wrong move
    const wrongFen = chess.fen();
    chess.undo();
    flashWrongMove(to, wrongFen, from);
    return false;
  }, [state, startPlayback, stockfish, sfAutoPlayOpponent, flashWrongMove]);

  // ── Show hint ──
  const showHint = useCallback(() => {
    const { fen, problem, currentNodes } = state;
    if (!problem) return;

    // Helper: get all legal destination squares for a piece at `from`
    const getAllLegalMoves = (chessFen: string, from: string): string[] => {
      try {
        const chess = new Chess(chessFen);
        const moves = chess.moves({ square: from as never, verbose: true });
        return moves.map(m => m.to);
      } catch { return []; }
    };

    // Stockfish hint for direct/study
    if (usesStockfish(problem.genre) && stockfish) {
      (async () => {
        const result = await stockfish.analyze(fen, 18);
        if (!result) return;

        const hFrom = result.bestMove.slice(0, 2);
        // Show the piece to move + ALL its legal moves (not just the answer)
        const allTargets = getAllLegalMoves(fen, hFrom);
        if (allTargets.length > 0) {
          setState(prev => ({ ...prev, hintSquares: [hFrom, ...allTargets] }));
        }
      })();
      return;
    }

    // Solution tree hint for help/self
    const currentTurn = fen.split(' ')[1] as 'w' | 'b';
    const validNodes = currentNodes.filter(n => n.color === currentTurn);
    if (validNodes.length === 0) return;

    const verifiedMoves: { from: string; to: string; isKey: boolean }[] = [];
    for (const node of validNodes) {
      const chess = new Chess(fen);
      const move = tryExecuteNode(chess, node);
      if (move) {
        verifiedMoves.push({ from: move.from, to: move.to, isKey: node.isKey });
      }
    }
    if (verifiedMoves.length === 0) return;

    const keyMove = verifiedMoves.find(m => m.isKey) || verifiedMoves[0];
    // Show the piece to move + ALL its legal moves (not just the answer)
    const allTargets = getAllLegalMoves(fen, keyMove.from);
    setState(prev => ({ ...prev, hintSquares: [keyMove.from, ...allTargets] }));
  }, [state, stockfish]);

  const resetProblem = useCallback(() => {
    if (state.problem) loadProblem(state.problem);
  }, [state.problem, loadProblem]);

  // ── Give Up / Show Solution ──
  const showSolution = useCallback(() => {
    const { problem, initialFen } = state;
    if (!problem) return;

    // For Stockfish genres, compute the line with Stockfish
    if (usesStockfish(problem.genre) && stockfish) {
      setState(prev => ({ ...prev, status: 'viewing', feedback: '', feedbackSquare: null, feedbackType: null, hintSquares: null, playback: null }));

      (async () => {
        const positions = await computeStockfishLine(initialFen, problem.moveCount, stockfish);
        const pb = {
          positions,
          mainLine: [] as SolutionNode[],
          moveIndex: positions.length > 1 ? 0 : -1,
          exploring: false,
          exploreFen: '',
          exploreLastMove: null,
        };
        setState(prev => prev.status === 'viewing' ? { ...prev, playback: pb } : prev);
      })();
      return;
    }

    // Solution tree path
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
  }, [state.problem, state.initialFen, startPlayback, stockfish]);

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
