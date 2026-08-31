import { useState, useEffect, useCallback, useMemo } from 'react';
import { Chess } from 'chess.js';
import type { SolutionNode } from '../types';

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
  /** Swap the playback line to the clicked variation — the move strip and the
      arrows then walk that line. Falls back to onExplore when absent. */
  onShowLine?: (path: SolutionNode[]) => void;
  isCooked?: boolean;
  /** Prose comments from the source notation, shown above the moves. */
  notes?: string[];
}

/**
 * Try to execute a solution node's move on a chess.js instance.
 */
function tryExecuteNode(chess: Chess, node: SolutionNode): { from: string; to: string } | null {
  const uci = node.moveUci;

  // A move no board can hold (promotion to a king, or to the other colour).
  // Never hand it to chess.js: it reads such a move loosely and offers an
  // ordinary promotion in its place.
  if (uci.startsWith('joke:')) return null;

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

// ── Variation tree shaping ──

interface RootVariation {
  rootNode: SolutionNode;
  isKey: boolean;
  isTry: boolean;
  /** The defense that breaks a try — shown apart from the try's own lines. */
  refutation: { node: SolutionNode; path: SolutionNode[] } | null;
}

/** Threats are "if the defender does nothing" lines, not variations of their own. */
function branchChildren(node: SolutionNode): SolutionNode[] {
  return node.children.filter(c => !c.isThreat);
}

/**
 * Fold sibling nodes that carry the same move into one.
 *
 * YACPDB writes alternative continuations with slashes — "1...Qh1
 * 2.Nd7#/Ne2#/Ne6#" — and the parser expands that one source line into one line
 * per alternative, which leaves a copy of the defense in front of every mate.
 * Siblings share a position, so two siblings with the same move ARE the same
 * move: folding them back gives one defense with its mates hanging beneath,
 * which is what the fork layout below already knows how to draw.
 *
 * Roots are deliberately left as they are: their order and adjacency carry the
 * set-play / try / key grouping that buildRootVariations reads, and the
 * solution count shown elsewhere counts them.
 */
function mergeSameMoveChildren(node: SolutionNode): SolutionNode {
  if (node.children.length === 0) return node;

  const order: SolutionNode[] = [];
  const byMove = new Map<string, SolutionNode>();

  for (const child of node.children) {
    // Every field that distinguishes how a move is drawn or filtered is part of
    // the key, so folding can never merge two nodes the display treats apart.
    const key = [
      child.move, child.moveSan, child.color, child.annotation,
      child.isKey, child.isTry, child.isThreat, child.isMate, child.isCheck,
      child.moveNum ?? '',
    ].join('\u0000');

    const seen = byMove.get(key);
    if (seen) {
      seen.children = [...seen.children, ...child.children];
    } else {
      const copy: SolutionNode = { ...child, children: [...child.children] };
      byMove.set(key, copy);
      order.push(copy);
    }
  }

  return { ...node, children: order.map(mergeSameMoveChildren) };
}

interface MoveRef {
  node: SolutionNode;
  path: SolutionNode[];
}

/**
 * Walk forward from `start` while the line does not branch.
 * A straight continuation stays on one row; only a real fork opens new rows,
 * so a defense is written once and its follow-ups hang beneath it.
 * `omit` drops one child of the starting node (a try's refutation, which is
 * displayed on its own line below).
 */
function collectRun(start: SolutionNode, startPath: SolutionNode[], omit?: SolutionNode): {
  run: MoveRef[];
  forks: SolutionNode[];
  lastPath: SolutionNode[];
} {
  const run: MoveRef[] = [];
  let node = start;
  let path = startPath;

  for (;;) {
    const isFirst = run.length === 0;
    run.push({ node, path });

    let kids = branchChildren(node);
    if (isFirst && omit) kids = kids.filter(c => c !== omit);

    if (kids.length !== 1) return { run, forks: kids, lastPath: path };

    node = kids[0];
    path = [...path, node];
  }
}

/** Number of leaves below these nodes — how many distinct lines they hold. */
function countLeaves(nodes: SolutionNode[]): number {
  let total = 0;
  for (const node of nodes) {
    const kids = branchChildren(node);
    total += kids.length === 0 ? 1 : countLeaves(kids);
  }
  return total;
}

/**
 * Move number for the last node of `path`: white moves carry the count, and
 * the black move that follows shares it. When black opens the solution
 * (helpmates, retros) its move is 1 and the white reply starts at 2.
 */
function moveNumber(path: SolutionNode[]): number {
  const whites = path.filter(n => n.color === 'w').length;
  return path[0]?.color === 'b' ? whites + 1 : whites;
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
        // This is a refutation — attach to the previous try.
        // Include the try's root node in the path so the board replays correctly.
        prev.refutation = { node: rootNode, path: [prev.rootNode, rootNode] };
        continue;
      }
    }

    if (rootNode.isTry) {
      // For tries: the refuting defense sits among the children, marked as key.
      const refutingChild = branchChildren(rootNode).find(c => c.isKey);
      variations.push({
        rootNode,
        isKey: false,
        isTry: true,
        refutation: refutingChild ? { node: refutingChild, path: [rootNode, refutingChild] } : null,
      });
    } else {
      variations.push({ rootNode, isKey: rootNode.isKey, isTry: false, refutation: null });
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
        className="nb-key rounded-full px-2 py-0.5 text-xs cursor-pointer border-2 border-[var(--ink)]"
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

// ── Variation display: straight runs on one row, forks on indented rows ──

function BranchView({ node, path, marker, omit, onNodeClick, activeNode, indent = false }: {
  node: SolutionNode;
  path: SolutionNode[];
  /** "!" on a key, "?" on a try — drawn right after the opening move. */
  marker?: string;
  omit?: SolutionNode;
  onNodeClick: (path: SolutionNode[]) => void;
  activeNode?: SolutionNode | null;
  indent?: boolean;
}) {
  const { run, forks, lastPath } = collectRun(node, path, omit);

  // A fork whose branches are all mates is not a branch in the line — it is one
  // move written several ways, the way the source writes it: "2.Nf3#/Nf7#/Ng6#".
  // Giving each of those a row of its own turns a #2 into a column seven rows
  // tall, so they ride along on the same row, separated by slashes and still
  // clickable one by one. Anything with a continuation keeps its own row.
  const inlineMates =
    forks.length >= 2 &&
    forks.every(f => f.isMate && branchChildren(f).length === 0) &&
    forks.every(f => f.color === forks[0].color)
      ? forks
      : null;

  return (
    <div className={indent ? 'ml-6' : ''}>
      <div className="flex items-baseline gap-1 flex-wrap leading-relaxed">
        {run.map((m, i) => {
          const isWhite = m.node.color === 'w';
          // White moves always carry their number. A black move needs one when
          // it opens the row, and when it answers the key or try that opens the
          // variation — so a defense reads the same whether or not it branches.
          const showNum = isWhite || i === 0 || (i === 1 && !indent);
          const num = moveNumber(m.path);
          return (
            <span key={i} className="inline">
              {showNum && (
                <span className="text-gray-400 text-xs mr-0.5">{isWhite ? `${num}.` : `${num}...`}</span>
              )}
              <MoveButton node={m.node} path={m.path} onNodeClick={onNodeClick} isActive={activeNode === m.node} />
              {i === 0 && marker && <span className="text-[var(--bad)] font-bold text-xs ml-0.5">{marker}</span>}
            </span>
          );
        })}
        {inlineMates?.map((mate, i) => {
          const matePath = [...lastPath, mate];
          return (
            <span key={`m${i}`} className="inline">
              {i === 0 ? (
                <span className="text-gray-400 text-xs mr-0.5">
                  {mate.color === 'w' ? `${moveNumber(matePath)}.` : `${moveNumber(matePath)}...`}
                </span>
              ) : (
                <span className="text-gray-400 mr-0.5">/</span>
              )}
              <MoveButton node={mate} path={matePath} onNodeClick={onNodeClick} isActive={activeNode === mate} />
            </span>
          );
        })}
      </div>
      {!inlineMates && forks.map((child, i) => (
        <BranchView
          key={i}
          node={child}
          path={[...lastPath, child]}
          onNodeClick={onNodeClick}
          activeNode={activeNode}
          indent
        />
      ))}
    </div>
  );
}

export function SolutionTree({ fullNodes, initialFen, solutionText, firstColor = 'w', playback, onGoTo, onFirst, onPrev, onNext, onLast, onExplore, onShowLine, isCooked, notes }: SolutionTreeProps) {
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
    setActiveNode(path[path.length - 1] || null);
    if (onShowLine) {
      // The playback line itself switches to this variation, so the strip and
      // the arrows keep walking the line the solver is actually reading.
      onShowLine(path);
      return;
    }
    const chess = new Chess(initialFen);
    let lastMove: { from: string; to: string } | null = null;
    for (const node of path) {
      const result = tryExecuteNode(chess, node);
      if (!result) break;
      lastMove = result;
    }
    onExplore(chess.fen(), lastMove);
  }, [initialFen, onExplore, onShowLine]);

  // Fold the slash-expansion copies before grouping, so a try's refutation is
  // still found by identity among the children it is compared against.
  const variations = useMemo(
    () => buildRootVariations(fullNodes.map(mergeSameMoveChildren)),
    [fullNodes],
  );
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
          <h3 className="nb-panel-label text-[0.7rem]">Solution</h3>
          {isCooked && (
            <span
              className="nb-chip px-2.5 py-0.5 text-xs bg-[var(--bad-bg)] text-[var(--bad)]"
              title="This problem has more than one move that mates (unintended cook). See the Key variations below."
            >
              ⚠ Cooked — another key also mates
            </span>
          )}
        </div>
        {exploring && (
          <span className="nb-chip nb-chip-on px-2.5 py-0.5 text-xs">
            Free play — click a move to return
          </span>
        )}
      </div>

      {/* What the source says in words -- often the only place a problem's
          premise is written down: an illegal position, a missing last move,
          a stipulation that is not the one in the header. */}
      {notes && notes.length > 0 && (
        <blockquote className="nb-panel border-l-[7px] px-3 py-2.5 space-y-1.5">
          {notes.map((note, i) => (
            <p key={i} className="text-sm font-semibold text-[var(--ink)] leading-snug">{note}</p>
          ))}
        </blockquote>
      )}

      {/* Main line playback */}
      {positions.length > 1 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1 flex-wrap text-sm">
            {mainLine.map((node, i) => (
              <button
                key={i}
                onClick={() => onGoTo(i)}
                className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                  !exploring && i === moveIndex
                    ? 'nb-key border-2 border-[var(--ink)]'
                    : node.color === 'w'
                      ? 'font-extrabold text-[var(--ink)] hover:bg-[var(--surface-2)]'
                      : 'italic font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)]'
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
          <summary className="cursor-pointer text-sm font-bold text-[var(--ink)] underline decoration-2 underline-offset-2">
            Solutions ({plainSolutions.length})
          </summary>
          <div className="nb-plate nb-shadow-room mt-2 text-sm p-3 space-y-1">
            {plainSolutions.map((v, vi) => (
              <BranchView
                key={vi}
                node={v.rootNode}
                path={[v.rootNode]}
                onNodeClick={handleNodeClick}
                activeNode={activeNode}
              />
            ))}
          </div>
        </details>
      )}

      {/* Key variations (all defenses after the key move) */}
      {keyVariations.length > 0 && keyVariations.some(v => countLeaves([v.rootNode]) > 1) && (
        <details className="text-xs" open>
          <summary className="cursor-pointer text-sm font-bold text-[var(--ink)] underline decoration-2 underline-offset-2">
            Key variations
          </summary>
          <div className="nb-plate nb-shadow-room mt-2 text-sm p-3 space-y-1">
            {keyVariations.map((v, vi) => (
              <BranchView
                key={vi}
                node={v.rootNode}
                path={[v.rootNode]}
                marker="!"
                onNodeClick={handleNodeClick}
                activeNode={activeNode}
              />
            ))}
          </div>
        </details>
      )}

      {/* Tries */}
      {tryVariations.length > 0 && (
        <details className="text-xs" open>
          <summary className="cursor-pointer text-sm font-bold text-[var(--ink)] underline decoration-2 underline-offset-2">
            Tries ({tryVariations.length})
          </summary>
          <div className="nb-plate nb-shadow-room mt-2 text-sm p-3 space-y-2">
            {tryVariations.map((v, vi) => (
              <div key={vi}>
                {/* The try's own lines, with the refuting defense held back */}
                <BranchView
                  node={v.rootNode}
                  path={[v.rootNode]}
                  marker="?"
                  omit={v.refutation?.node}
                  onNodeClick={handleNodeClick}
                  activeNode={activeNode}
                />
                {/* Refutation on separate line — applies to the whole try, not just the last variation */}
                {v.refutation && (
                  <div className="flex items-baseline gap-1 ml-4 text-[var(--bad)] dark:text-[var(--bad)]">
                    <span className="text-xs font-medium shrink-0">↳ but</span>
                    <BranchView
                      node={v.refutation.node}
                      path={v.refutation.path}
                      marker={v.refutation.node.isKey ? '!' : undefined}
                      onNodeClick={handleNodeClick}
                      activeNode={activeNode}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Raw solution text */}
      <details className="text-xs">
        <summary className="cursor-pointer font-bold text-[var(--muted)] underline decoration-2 underline-offset-2">
          YACPDB original notation
        </summary>
        <pre className="nb-plate nb-shadow-room mt-2 p-3 text-[var(--muted)] whitespace-pre-wrap overflow-x-auto">
          {solutionText}
        </pre>
      </details>
    </div>
  );
}
