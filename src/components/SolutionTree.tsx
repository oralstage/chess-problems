import { useState, useEffect, useCallback, useMemo } from 'react';
import { Chess } from 'chess.js';
import { moveSanLenient } from '../utils/sanResolve';
import type { SolutionNode } from '../types';
import { buildTryCommentary, mergeSameMoveChildren } from '../utils/tryCommentary';

interface SolutionTreeProps {
  fullNodes: SolutionNode[];
  initialFen: string;
  solutionText: string;
  /** Stipulation of the position these nodes belong to; gates the Commentary
      card (twomovers only). Leave undefined for twins — their tree comes with
      a different FEN than initialFen, and the card's board checks would be
      reading the wrong board. */
  stipulation?: string;
  firstColor?: 'w' | 'b';
  /** Duplex helpmate: the White-to-play lines are solutions (Black and
   *  White mate the white king). Otherwise a helpmate's White-first lines
   *  are set play — shown, not asked for. */
  duplex?: boolean;
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
  /** What to call the text the tree was built from. The site's problems come
   *  out of YACPDB, which is what it says; a problem handed over in an address
   *  arrives as whatever Popeye printed for whoever pasted it, and naming a
   *  database it was never in would be a lie about where it came from. */
  notationLabel?: string;
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
    {
      // Ambiguous as written ("Sc6#" with two knights): the mark decides.
      const move = moveSanLenient(chess, node.moveSan || uci.slice(4));
      if (move) return { from: move.from, to: move.to };
    }
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

/** The visible line while the commentary is closed. Cut mid-flow at a word
 *  break, never at a sentence end: a complete first sentence read as the
 *  whole story and gave no reason to open the card. The ellipsis says the
 *  text carries on. Word-break cutting also keeps move tokens ("2.Rxe3#")
 *  intact — they contain no spaces. */
function teaser(text: string, cap = 110): string {
  if (text.length <= cap) return text;
  const cut = text.lastIndexOf(' ', cap);
  return `${text.slice(0, cut > 40 ? cut : cap)} …`;
}

// mergeSameMoveChildren lives in tryCommentary.ts now: it shapes the tree for
// the fork layout here AND for the commentary prose, and the sweep script
// imports it — a component file cannot export it without breaking fast refresh.

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

// ── Grouping siblings that share the same mate ──

/**
 * A branch that holds nothing but mating replies is summed up by those mates.
 * When several siblings are answered by the very same set of mates, the source
 * writes them as one line — "1...Rg3/Rxg4 2.O-O-O#" — and so do we.
 * The match is deliberately exact: every reply a childless mate, the same set
 * of mates, the same colours throughout. A branch with a continuation, or with
 * only some mates in common, keeps its own row.
 */
function sharedMateSignature(node: SolutionNode): string | null {
  const kids = branchChildren(node);
  if (kids.length === 0) return null;
  if (!kids.every(k => k.isMate && branchChildren(k).length === 0)) return null;
  if (!kids.every(k => k.color === kids[0].color)) return null;
  return `${node.color}|${kids[0].color}|${kids.map(k => k.moveSan).sort().join('/')}`;
}

/** Partition forks into same-mate groups, each group at its first member's place. */
function groupForksByMate(forks: SolutionNode[]): SolutionNode[][] {
  const groups: SolutionNode[][] = [];
  const bySig = new Map<string, SolutionNode[]>();
  for (const fork of forks) {
    const sig = sharedMateSignature(fork);
    if (sig !== null) {
      const existing = bySig.get(sig);
      if (existing) {
        existing.push(fork);
        continue;
      }
      const group = [fork];
      bySig.set(sig, group);
      groups.push(group);
    } else {
      groups.push([fork]);
    }
  }
  return groups;
}

/** One row for a same-mate group: "1...d5/Re8/Rxd4 2.Rxe3#", every move a button. */
function SharedMateRow({ heads, lastPath, onNodeClick, activeNode }: {
  heads: SolutionNode[];
  lastPath: SolutionNode[];
  onNodeClick: (path: SolutionNode[]) => void;
  activeNode?: SolutionNode | null;
}) {
  const headNum = moveNumber([...lastPath, heads[0]]);
  // The mates are drawn once, from the first head's copies of them; the other
  // heads hold their own copies, which clicking a head still replays through.
  const mates = branchChildren(heads[0]);
  return (
    <div className="ml-6">
      <div className="flex items-baseline gap-1 flex-wrap leading-relaxed">
        {heads.map((head, i) => (
          <span key={i} className="inline">
            {i === 0 ? (
              <span className="text-gray-400 text-xs mr-0.5">{head.color === 'w' ? `${headNum}.` : `${headNum}...`}</span>
            ) : (
              <span className="text-gray-400 mr-0.5">/</span>
            )}
            <MoveButton node={head} path={[...lastPath, head]} onNodeClick={onNodeClick} isActive={activeNode === head} />
          </span>
        ))}
        {mates.map((mate, i) => {
          const matePath = [...lastPath, heads[0], mate];
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
    </div>
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
      {!inlineMates && groupForksByMate(forks).map((group, i) => (
        group.length >= 2 ? (
          <SharedMateRow
            key={i}
            heads={group}
            lastPath={lastPath}
            onNodeClick={onNodeClick}
            activeNode={activeNode}
          />
        ) : (
          <BranchView
            key={i}
            node={group[0]}
            path={[...lastPath, group[0]]}
            onNodeClick={onNodeClick}
            activeNode={activeNode}
            indent
          />
        )
      ))}
    </div>
  );
}

export function SolutionTree({ fullNodes, initialFen, solutionText, stipulation, firstColor = 'w', duplex = false, playback, onGoTo, onFirst, onPrev, onNext, onLast, onExplore, onShowLine, isCooked, notes, notationLabel = 'YACPDB original notation' }: SolutionTreeProps) {
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
  const merged = useMemo(() => fullNodes.map(mergeSameMoveChildren), [fullNodes]);
  const variations = useMemo(() => buildRootVariations(merged), [merged]);
  // Prose reading of the tries — it walks the same folded tree, so a defence
  // written several ways in the source is one defence here too.
  // Fail closed: the card is an extra, and no problem — however strange its
  // data — may take the solution view down with it. Worst case is no card.
  const commentary = useMemo(() => {
    try {
      return buildTryCommentary(merged, initialFen, stipulation);
    } catch {
      return null;
    }
  }, [merged, initialFen, stipulation]);
  const hasAnyMarkers = variations.some(v => v.isKey || v.isTry);
  // When no key/try markers exist (e.g., helpmates), treat all variations as "solutions"
  const keyVariations = hasAnyMarkers ? variations.filter(v => v.isKey) : [];
  const tryVariations = hasAnyMarkers ? variations.filter(v => v.isTry) : [];
  // Helpmate lines that start with White are listed under their own heading:
  // in a duplex they are the White-to-play solutions (Black and White mating
  // the white king); otherwise they are set play, the prepared answer to
  // what would happen if White were to move.
  const duplexLines = !hasAnyMarkers && firstColor === 'b' ? variations.filter(v => v.rootNode.color === 'w') : [];
  const plainSolutions = hasAnyMarkers ? [] : variations.filter(v => !duplexLines.includes(v));

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
            {/* Number from who actually moves first in THIS line: the
                White-first half of a duplex helpmate starts with White. */}
            {mainLine.map((node, i, line) => (
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
                {(line[0]?.color ?? firstColor) === 'b'
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
            {duplexLines.length > 0 && duplex ? `Black to play (${plainSolutions.length})` : `Solutions (${plainSolutions.length})`}
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

      {duplexLines.length > 0 && (
        <details className="text-xs" open>
          <summary className="cursor-pointer text-sm font-bold text-[var(--ink)] underline decoration-2 underline-offset-2">
            {duplex
              ? `White to play (${duplexLines.length}) — Black and White mate the white king`
              : `Set play (${duplexLines.length}) — if White were to move first`}
          </summary>
          <div className="nb-plate nb-shadow-room mt-2 text-sm p-3 space-y-1">
            {duplexLines.map((v, vi) => (
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

      {/* Commentary — the composer's argument, above the reference
          material. Prose only: the moves here are read, not played, and a
          paragraph of buttons that jump the board turned out to be unpleasant
          to use. Only the moves are stated — the data says what each try was
          after and what answered it, never why, so no reason is claimed.
          Folded by default like the theme spotlight above: most solvers came
          for the solution, and an alpha essay should not stand between them
          and it. The visible line is the card's own first sentence — a bare
          heading is nothing to open. */}
      {commentary && (
        /* Tinted (the helpmate-card blue) so it cannot be mistaken for the
           theme spotlight above, which sits on the plain surface plate. */
        <details className="group nb-plate nb-shadow-room p-3" style={{ background: 'var(--card-help)' }}>
          <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-xs font-extrabold tracking-widest uppercase text-[var(--muted)]">
                Commentary · alpha
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-[var(--ink)] group-open:hidden">
                {teaser(commentary.paragraphs.map(p => p.map(s => s.text).join('')).join(' '))}
              </span>
            </span>
            <span className="nb-btn shrink-0 py-1 px-3 text-xs font-bold">
              <span className="group-open:hidden">Read on</span>
              <span className="hidden group-open:inline">Close</span>
            </span>
          </summary>
          <div className="space-y-2 mt-2">
            {commentary.paragraphs.map((para, pi) => (
              <p key={pi} className="text-sm leading-relaxed text-[var(--ink)]">
                {para.map((span, i) => (
                  <span key={i} className={span.strong ? 'font-extrabold' : undefined}>{span.text}</span>
                ))}
              </p>
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
          {notationLabel}
        </summary>
        <pre className="nb-plate nb-shadow-room mt-2 p-3 text-[var(--muted)] whitespace-pre-wrap overflow-x-auto">
          {solutionText}
        </pre>
      </details>
    </div>
  );
}
