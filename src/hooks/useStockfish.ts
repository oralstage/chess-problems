import { useState, useRef, useEffect, useCallback } from 'react';
import { Chess } from 'chess.js';

interface AnalysisResult {
  bestMove: string;
  bestMoveSan: string;
  eval: number;
  mateIn: number | null; // positive = side-to-move mates in N, negative = side-to-move gets mated in N
}

interface RefutationResult {
  refutationSan: string;
  eval: number;
}

type ReadyState = 'idle' | 'loading' | 'ready' | 'error';

const DEFAULT_DEPTH = 16;

/** Resolve the URL for the Stockfish WASM worker script. */
function getStockfishWorkerUrl(): string {
  // Use Stockfish lite (~7MB WASM) to stay within Cloudflare Pages 25MB file limit.
  // Multi-threaded when COOP/COEP headers are present, otherwise single-threaded.
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  const file = hasSharedArrayBuffer ? 'stockfish-18-lite.js' : 'stockfish-18-lite-single.js';
  return new URL(`../../node_modules/stockfish/bin/${file}`, import.meta.url).href;
}

/**
 * Send a UCI command to the worker and collect output lines until a predicate
 * matches. Returns a promise that resolves with all collected lines.
 */
function uciCommand(
  worker: Worker,
  command: string,
  until: (line: string) => boolean,
): Promise<string[]> {
  return new Promise((resolve) => {
    const lines: string[] = [];

    const handler = (e: MessageEvent) => {
      const line = typeof e.data === 'string' ? e.data : String(e.data);
      lines.push(line);
      if (until(line)) {
        worker.removeEventListener('message', handler);
        resolve(lines);
      }
    };

    worker.addEventListener('message', handler);
    worker.postMessage(command);
  });
}

/** Parse a "bestmove" line. Returns the move in UCI format or null. */
function parseBestMove(lines: string[]): string | null {
  for (const line of lines) {
    const match = line.match(/^bestmove\s+(\S+)/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Parse the last "info depth" line that includes "score cp" or "score mate"
 * to extract an eval in centipawns (mate is mapped to +/-10000).
 */
function parseEval(lines: string[]): { score: number; mateIn: number | null } {
  let score = 0;
  let mateIn: number | null = null;
  for (const line of lines) {
    const cpMatch = line.match(/score cp (-?\d+)/);
    if (cpMatch) {
      score = parseInt(cpMatch[1], 10) / 100;
      mateIn = null;
      continue;
    }
    const mateMatch = line.match(/score mate (-?\d+)/);
    if (mateMatch) {
      mateIn = parseInt(mateMatch[1], 10);
      score = mateIn > 0 ? 10000 : -10000;
    }
  }
  return { score, mateIn };
}

/**
 * Convert a UCI move string (e.g. "e2e4", "e7e8q") to SAN notation
 * using the given FEN position.
 */
function uciToSan(fen: string, uci: string): string | null {
  try {
    const chess = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    const move = chess.move({ from, to, promotion });
    return move ? move.san : null;
  } catch {
    return null;
  }
}

export function useStockfish() {
  const [readyState, setReadyState] = useState<ReadyState>('idle');
  const workerRef = useRef<Worker | null>(null);
  const initPromiseRef = useRef<Promise<Worker> | null>(null);

  /** Lazily spin up the Web Worker and wait for UCI readiness (with timeout). */
  const ensureReady = useCallback((): Promise<Worker> => {
    if (initPromiseRef.current) return initPromiseRef.current;

    const promise = (async () => {
      setReadyState('loading');
      try {
        const url = getStockfishWorkerUrl();
        const worker = new Worker(url);
        workerRef.current = worker;

        // Wait for the engine to signal readiness, with 15s timeout.
        const timeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
          Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Stockfish init timeout')), ms))]);

        await timeout(uciCommand(worker, 'uci', (l) => l.startsWith('uciok')), 15000);
        await timeout(uciCommand(worker, 'isready', (l) => l.startsWith('readyok')), 10000);

        setReadyState('ready');
        return worker;
      } catch (err) {
        setReadyState('error');
        initPromiseRef.current = null;
        workerRef.current?.terminate();
        workerRef.current = null;
        throw err;
      }
    })();

    initPromiseRef.current = promise;
    return promise;
  }, []);

  /** Cleanup on unmount. */
  useEffect(() => {
    return () => {
      workerRef.current?.postMessage('quit');
      workerRef.current?.terminate();
      workerRef.current = null;
      initPromiseRef.current = null;
    };
  }, []);

  /**
   * Analyse a position and return the best move with evaluation.
   *
   * @param fen   - Position in FEN notation.
   * @param depth - Search depth (default 16).
   */
  const analyze = useCallback(
    async (fen: string, depth: number = DEFAULT_DEPTH): Promise<AnalysisResult | null> => {
      let worker: Worker;
      try {
        worker = await ensureReady();
      } catch {
        return null; // Stockfish failed to load (e.g. mobile WASM issue)
      }

      // Reset state for a fresh search.
      worker.postMessage('ucinewgame');
      await uciCommand(worker, 'isready', (l) => l.startsWith('readyok'));

      worker.postMessage(`position fen ${fen}`);
      const lines = await uciCommand(
        worker,
        `go depth ${depth}`,
        (l) => l.startsWith('bestmove'),
      );

      const bestMove = parseBestMove(lines);
      if (!bestMove || bestMove === '(none)') return null;

      const bestMoveSan = uciToSan(fen, bestMove);
      if (!bestMoveSan) return null;

      const { score: evalScore, mateIn } = parseEval(lines);

      return { bestMove, bestMoveSan, eval: evalScore, mateIn };
    },
    [ensureReady],
  );

  /**
   * Given a position and the user's wrong move, play that move and then find
   * the opponent's best reply (the "refutation").
   *
   * @param fen       - Position FEN *before* the wrong move.
   * @param wrongMove - The wrong move in UCI format (e.g. "e2e4").
   * @param depth     - Search depth (default 16).
   * @returns The refutation in SAN + eval, or null if the move is illegal or
   *          no refutation is found.
   */
  const findRefutation = useCallback(
    async (
      fen: string,
      wrongMove: string,
      depth: number = DEFAULT_DEPTH,
    ): Promise<RefutationResult | null> => {
      // Apply the wrong move to get the resulting position.
      const chess = new Chess(fen);
      const from = wrongMove.slice(0, 2);
      const to = wrongMove.slice(2, 4);
      const promotion = wrongMove.length > 4 ? wrongMove[4] : undefined;

      let move;
      try {
        move = chess.move({ from, to, promotion });
      } catch {
        return null;
      }
      if (!move) return null;

      const fenAfterWrongMove = chess.fen();

      // Now find the best reply for the opponent.
      const result = await analyze(fenAfterWrongMove, depth);
      if (!result) return null;

      // The eval is from the opponent's perspective; negate so it reflects
      // how bad the wrong move was for the original side.
      return {
        refutationSan: result.bestMoveSan,
        eval: -result.eval,
      };
    },
    [analyze],
  );

  return {
    readyState,
    analyze,
    findRefutation,
  };
}
