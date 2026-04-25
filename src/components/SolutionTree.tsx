import { useState, useEffect, useCallback, useMemo } from 'react';
import { Chess } from 'chess.js';
import type { SolutionNode } from '../types';
import type { TwinData } from '../services/solutionParser';

interface SolutionTreeProps {
  fullNodes: SolutionNode[];
  initialFen: string;
  solutionText: string;
  firstColor?: 'w' | 'b';
  playback: {
    positions: { fen: string; lastMove: { from: string; to: string } | null; san: string }[];
    mainLine: SolutionNode[];
    moveIndex: number;
    exploring: boolean;
  } | null;
  onGoTo: (index: number) => void;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  onExplore: (fen: string, lastMove: { from: string; to: string } | null) => void;
  twins?: TwinData[];
  activeTwinId?: string;
  onSelectTwin?: (id: string) => void;
  isCooked?: boolean;
}

/**
 * Try to execute a solution node's move on a chess.js instance.
 */
function tryExecuteNode(chess: Chess, node: SolutionNode): { from: string; to: string } | null {
  const uci = node.moveUci;

  // Wildcard "any move" — pick a legal move by the specified piece type
  if (uci === 'any') {
    return executeWildcardMove(chess, node.moveSan);
  }

  if (uci.startsWith('san:')) {
    try {
      const move = chess.move(uci.slice(4));
      if (move) return { from: move.from, to: move.to };
    } catch { /* fall through */ }
    try {
      const parts = chess.fen().split(' ');
      parts[1] = parts[1] === 'w' ? 'b' : 'w';
      chess.load(parts.join(' '));
      const move = chess.move(uci.slice(4));
      if (move) return { from: move.from, to: move.to };
    } catch { /* fall through */ }
    return null;
  }

  if (uci.length >= 4) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    try {
      const move = chess.move({ from, to, promotion });
      if (move) return { from: move.from, to: move.to };
    } catch { /* fall through */ }
    try {
      const parts = chess.fen().split(' ');
      parts[1] = parts[1] === 'w' ? 'b' : 'w';
      chess.load(parts.join(' '));
      const move = chess.move({ from, to, promotion });
      if (move) return { from: move.from, to: move.to };
    } catch { /* fall through */ }
  }

  return null;
}

/**
 * Execute a wildcard ("any move") by picking a legal move matching the piece type.
 * E.g., "N~" picks any legal knight move, "~" picks any legal move.
 */
function executeWildcardMove(chess: Chess, san: string): { from: string; to: string } | null {
  const pieceMatch = san.match(/^([KQRBN])/);
  const pieceType = pieceMatch ? pieceMatch[1].toLowerCase() : null;

  const tryWithCurrentTurn = () => {
    const legalMoves = chess.moves({ verbose: true });
    const candidates = pieceType
      ? legalMoves.filter(m => m.piece === pieceType)
      : legalMoves;
    if (candidates.length > 0) {
      const move = chess.move(candidates[0]);
      if (move) return { from: move.from, to: move.to };
    }
    return null;
  };

  const result = tryWithCurrentTurn();
  if (result) return result;

  // Try with flipped turn
  const parts = chess.fen().split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  chess.load(parts.join(' '));
  return tryWithCurrentTurn();
}

// ── Flatten tree into compact variation lines ──

interface VariationLine {
  moves: { node: SolutionNode; path: SolutionNode[] }[];
  isRefutation: boolean; // this line is the refutation of a try
}

interface RootVariation {
  rootNode: SolutionNode;
  isKey: boolean;
  isTry: boolean;
  lines: VariationLine[];       // successful continuations
  refutation: VariationLine | null; // the defense that breaks the try
}

/**
 * Collect all paths from a node to its leaves.
 * Each path is a sequence of nodes (excluding the root — it's tracked separately).
 */
function collectLines(node: SolutionNode, parentPath: SolutionNode[]): VariationLine[] {
  const currentPath = [...parentPath, node];
  const nonThreatChildren = node.children.filter(c => !c.isThreat);

  const lines: VariationLine[] = [];

  // If this is a leaf (ignoring threats), return a single line
  if (nonThreatChildren.length === 0) {
    // Don't include threat continuations — they represent "if defender does nothing" scenarios
    lines.push({
      moves: currentPath.map((n, i, arr) => ({ node: n, path: arr.slice(0, i + 1) })),
      isRefutation: node.isKey && node.color !== currentPath[0]?.color, // refutation marker
    });
    return lines;
  }

  // Recurse into children
  for (const child of nonThreatChildren) {
    const childLines = collectLines(child, currentPath);
    lines.push(...childLines);
  }

  return lines;
}

function buildRootVariations(fullNodes: SolutionNode[]): RootVariation[] {
  const variations: RootVariation[] = [];

  for (let idx = 0; idx < fullNodes.length; idx++) {
    const rootNode = fullNodes[idx];

    // Check if this root node is actually a refutation of the previous try.
    // Refutations are root nodes with isKey=true but opposite color from the actual key.
    // They appear right after a try node due to parser section breaks.
    if (rootNode.isKey && !rootNode.isTry && variations.length > 0) {
      const prev = variations[variations.length - 1];
      if (prev.isTry && rootNode.color !== prev.rootNode.color) {
        // This is a refutation — attach to the previous try
        // Include the try's root node in the path so the board replays correctly
        const refLine: VariationLine = {
          moves: [{ node: rootNode, path: [prev.rootNode, rootNode] }],
          isRefutation: true,
        };
        prev.refutation = refLine;
        continue;
      }
    }

    const allLines = collectLines(rootNode, []);

    if (rootNode.isTry) {
      // For tries: find the refutation line among children
      let refutation: VariationLine | null = null;
      const successLines: VariationLine[] = [];

      const nonThreatChildren = rootNode.children.filter(c => !c.isThreat);
      const refutingChild = nonThreatChildren.find(c => c.isKey);

      if (refutingChild) {
        for (const line of allLines) {
          if (line.moves.length > 1 && line.moves[1].node === refutingChild) {
            refutation = { ...line, isRefutation: true };
          } else {
            successLines.push(line);
          }
        }
      } else {
        successLines.push(...allLines);
      }

      variations.push({ rootNode, isKey: false, isTry: true, lines: successLines, refutation });
    } else {
      variations.push({ rootNode, isKey: rootNode.isKey, isTry: false, lines: allLines, refutation: null });
    }
  }

  return variations;
}

// ── Clickable move button ──

function MoveButton({ node, path, onNodeClick, isActive }: {
  node: SolutionNode;
  path: SolutionNode[];
  onNodeClick: (path: SolutionNode[]) => void;
  isActive?: boolean;
}) {
  if (isActive) {
    return (
      <button
        onClick={() => onNodeClick(path)}
        className="bg-cp-primary text-white px-1.5 py-0.5 rounded text-xs cursor-pointer"
      >
        {node.moveSan}
      </button>
    );
  }

  const moveClasses = node.color === 'w'
    ? 'font-bold text-gray-900 dark:text-gray-100'
    : 'italic text-gray-600 dark:text-gray-400';

  return (
    <button
      onClick={() => onNodeClick(path)}
      className={`${moveClasses} hover:bg-green-100 dark:hover:bg-green-900/30 px-0.5 rounded cursor-pointer transition-colors`}
    >
      {node.moveSan}
    </button>
  );
}

// ── Compact variation line display ──

function VariationLineView({ line, startMoveNum, onNodeClick, activeNode }: {
  line: VariationLine;
  startMoveNum: number;
  onNodeClick: (path: SolutionNode[]) => void;
  activeNode?: SolutionNode | null;
}) {
  // Skip the root move (index 0), show from defense onwards
  const movesAfterRoot = line.moves.slice(1);
  if (movesAfterRoot.length === 0) return null;

  return (
    <span className="inline">
      {movesAfterRoot.map((m, i) => {
        // Track move numbers by counting pairs of moves
        const isWhiteMove = m.node.color === 'w';
        const prevColors = movesAfterRoot.slice(0, i).map(x => x.node.color);
        // Move number = startMoveNum + number of white moves seen so far (including current if white)
        const whitesSoFar = prevColors.filter(c => c === 'w').length;
        const moveNum = startMoveNum + whitesSoFar + (isWhiteMove ? 1 : 0);
        const showNum = isWhiteMove;
        const isBlackFirst = i === 0 && m.node.color === 'b';

        return (
          <span key={i}>
            {showNum && <span className="text-gray-400 text-xs mr-0.5">{moveNum}.</span>}
            {isBlackFirst && <span className="text-gray-400 text-xs mr-0.5">{startMoveNum}...</span>}
            <MoveButton node={m.node} path={m.path} onNodeClick={onNodeClick} isActive={activeNode === m.node} />
            {' '}
          </span>
        );
      })}
    </span>
  );
}

export function SolutionTree({ fullNodes, initialFen, solutionText, firstColor = 'w', playback, onGoTo, onFirst, onPrev, onNext, onLast, onExplore, twins, activeTwinId, onSelectTwin, isCooked }: SolutionTreeProps) {
  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't hijack arrow keys when an input is focused or user is exploring variations
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
      if (e.key === 'Home') { e.preventDefault(); onFirst(); }
      if (e.key === 'End') { e.preventDefault(); onLast(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onFirst, onPrev, onNext, onLast]);

  // Track which node is currently active (clicked) in variations
  const [activeNode, setActiveNode] = useState<SolutionNode | null>(null);

  // Clear active node when leaving explore mode
  useEffect(() => {
    if (!playback?.exploring) setActiveNode(null);
  }, [playback?.exploring]);

  const handleNodeClick = useCallback((path: SolutionNode[]) => {
    const chess = new Chess(initialFen);
    let lastMove: { from: string; to: string } | null = null;
    for (const node of path) {
      const result = tryExecuteNode(chess, node);
      if (!result) break;
      lastMove = result;
    }
    setActiveNode(path[path.length - 1] || null);
    onExplore(chess.fen(), lastMove);
  }, [initialFen, onExplore]);

  const variations = useMemo(() => buildRootVariations(fullNodes), [fullNodes]);
  const hasAnyMarkers = variations.some(v => v.isKey || v.isTry);
  // When no key/try markers exist (e.g., helpmates), treat all variations as "solutions"
  const keyVariations = hasAnyMarkers ? variations.filter(v => v.isKey) : [];
  const tryVariations = hasAnyMarkers ? variations.filter(v => v.isTry) : [];
  const plainSolutions = hasAnyMarkers ? [] : variations;

  const moveIndex = playback?.moveIndex ?? -1;
  const positions = playback?.positions ?? [];
  const mainLine = playback?.mainLine ?? [];
  const exploring = playback?.exploring ?? false;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Solution</h3>
          {isCooked && (
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded bg-yellow-300 text-yellow-900 dark:bg-yellow-400 dark:text-yellow-950"
              title="This problem has more than one move that mates (unintended cook). See the Key variations below."
            >
              ⚠ Cooked — another key also mates
            </span>
          )}
        </div>
        {exploring && (
          <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            Free play — click a move to return
          </span>
        )}
      </div>

      {/* Twin navigation */}
      {twins && twins.length >= 2 && onSelectTwin && (
        <div className="flex items-center gap-1 flex-wrap">
          {twins.map(twin => (
            <button
              key={twin.id}
              onClick={() => onSelectTwin(twin.id)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                activeTwinId === twin.id
                  ? 'bg-cp-primary text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              title={twin.label}
            >
              {twin.id})
            </button>
          ))}
        </div>
      )}

      {/* Main line playback */}
      {positions.length > 1 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1 flex-wrap text-sm">
            {mainLine.map((node, i) => (
              <button
                key={i}
                onClick={() => onGoTo(i)}
                className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                  !exploring && i === moveIndex
                    ? 'bg-cp-primary text-white'
                    : node.color === 'w'
                      ? 'font-bold text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700'
                      : 'italic text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {firstColor === 'b'
                  ? (i % 2 === 1 ? `${Math.floor(i / 2) + 2}.` : i === 0 ? '1...' : '')
                  : (i % 2 === 0 ? `${Math.floor(i / 2) + 1}.` : '')
                }{positions[i + 1]?.san || node.moveSan}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Plain solutions (helpmate-style: no key/try markers) */}
      {plainSolutions.length > 0 && (
        <details className="text-xs" open>
          <summary className="text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 text-sm font-medium">
            Solutions ({plainSolutions.length})
          </summary>
          <div className="mt-2 text-sm bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-1">
            {plainSolutions.map((v, vi) => (
              <div key={vi} className="leading-relaxed">
                <div className="flex items-baseline gap-1 flex-wrap">
                  <span className="text-gray-400 text-xs">
                    {v.rootNode.color === 'b' ? '1...' : '1.'}
                  </span>
                  <MoveButton node={v.rootNode} path={[v.rootNode]} onNodeClick={handleNodeClick} isActive={activeNode === v.rootNode} />
                  {v.lines.length === 1 && (
                    <VariationLineView line={v.lines[0]} startMoveNum={1} onNodeClick={handleNodeClick} activeNode={activeNode} />
                  )}
                </div>
                {v.lines.length > 1 && v.lines.map((line, li) => (
                  <div key={li} className="flex items-baseline gap-1 flex-wrap ml-6">
                    <VariationLineView line={line} startMoveNum={1} onNodeClick={handleNodeClick} activeNode={activeNode} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Key variations (all defenses after the key move) */}
      {keyVariations.length > 0 && keyVariations.some(v => v.lines.length > 1) && (
        <details className="text-xs" open>
          <summary className="text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 text-sm font-medium">
            Key variations
          </summary>
          <div className="mt-2 text-sm bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-1">
            {keyVariations.map((v, vi) => (
              <div key={vi} className="leading-relaxed">
                <div className="flex items-baseline gap-1">
                  <span className="text-gray-400 text-xs">1.</span>
                  <MoveButton node={v.rootNode} path={[v.rootNode]} onNodeClick={handleNodeClick} isActive={activeNode === v.rootNode} />
                  <span className="text-red-500 font-bold text-xs">!</span>
                  {v.lines.length === 1 && (
                    <VariationLineView line={v.lines[0]} startMoveNum={1} onNodeClick={handleNodeClick} activeNode={activeNode} />
                  )}
                </div>
                {v.lines.length > 1 && v.lines.map((line, li) => (
                  <div key={li} className="flex items-baseline gap-1 flex-wrap ml-6">
                    <VariationLineView line={line} startMoveNum={1} onNodeClick={handleNodeClick} activeNode={activeNode} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Tries */}
      {tryVariations.length > 0 && (
        <details className="text-xs" open>
          <summary className="text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 text-sm font-medium">
            Tries ({tryVariations.length})
          </summary>
          <div className="mt-2 text-sm bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2">
            {tryVariations.map((v, vi) => (
              <div key={vi}>
                {/* Try with continuations — each defense on its own indented line */}
                <div className="leading-relaxed">
                  <div className="flex items-baseline gap-1">
                    <span className="text-gray-400 text-xs">1.</span>
                    <MoveButton node={v.rootNode} path={[v.rootNode]} onNodeClick={handleNodeClick} isActive={activeNode === v.rootNode} />
                    <span className="text-orange-500 font-bold text-xs">?</span>
                    {v.lines.length === 1 && (
                      <VariationLineView line={v.lines[0]} startMoveNum={1} onNodeClick={handleNodeClick} activeNode={activeNode} />
                    )}
                  </div>
                  {v.lines.length > 1 && v.lines.map((line, li) => (
                    <div key={li} className="flex items-baseline gap-1 flex-wrap ml-6">
                      <VariationLineView line={line} startMoveNum={1} onNodeClick={handleNodeClick} activeNode={activeNode} />
                    </div>
                  ))}
                </div>
                {/* Refutation on separate line — applies to the whole try, not just the last variation */}
                {v.refutation && (() => {
                  const refMoves = v.refutation.moves[0]?.node === v.rootNode ? v.refutation.moves.slice(1) : v.refutation.moves;
                  return (
                    <div className="flex items-baseline gap-1 ml-4 text-red-600 dark:text-red-400 leading-relaxed">
                      <span className="text-xs font-medium">↳ but</span>
                      {refMoves.map((m, i) => {
                        const isBlack = m.node.color === 'b';
                        const showNum = i === 0;
                        return (
                          <span key={i}>
                            {showNum && <span className="text-gray-400 text-xs mr-0.5">{isBlack ? '1...' : '1.'}</span>}
                            <MoveButton node={m.node} path={m.path} onNodeClick={handleNodeClick} isActive={activeNode === m.node} />
                            {m.node.isKey && <span className="text-red-500 font-bold text-xs ml-0.5">!</span>}
                          </span>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Raw solution text */}
      <details className="text-xs">
        <summary className="text-gray-400 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300">
          YACPDB original notation
        </summary>
        <pre className="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-400 whitespace-pre-wrap overflow-x-auto">
          {solutionText}
        </pre>
      </details>
    </div>
  );
}
