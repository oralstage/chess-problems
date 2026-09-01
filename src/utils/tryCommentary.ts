import { Chess } from 'chess.js';
import type { SolutionNode } from '../types';

/* Post-solve commentary on how the key is found.
 *
 * The tries carry the composer's argument: this move threatens that mate,
 * Black has this one answer, and the key is the move that survives it. All of
 * it is in the solution tree — the tries, what each threatens, the defence
 * that refutes it, what the key plays against that same defence. What is NOT
 * in the data is WHY a refutation works, so nothing here claims a reason.
 *
 * Four invariants hold for every sentence this file emits, and they are the
 * reason it is written as an assembler rather than a template:
 *
 *   1. A sentence starts with a word. The card opens by saying what White is
 *      after — the plan behind the threats, the set play, the block — and never
 *      by labelling a move as a try, so the reader learns the idea before
 *      learning that it fails.
 *   2. Every try's threat is stated, once. Threats of 2.Re2#, 2.Re3#, 2.Re4#
 *      and 2.Re1# are one idea — a rook to the e-file — and saying so is what
 *      turns a list into commentary.
 *   3. Nothing is claimed that has not been computed. "No threat", "zugzwang"
 *      and "complete block" come from the board (threatOnBoard,
 *      zugzwangOnBoard, the legal-move sweep in classify), never from the
 *      source text; "any knight move" only when no other move of that knight
 *      is answered differently; "changed mates" only when the mate sets are
 *      disjoint. No reason for a refutation is ever given, because the data
 *      has none.
 *   4. Nothing is said twice, and no set of moves is referred to by count
 *      alone: either the moves are named or the sentence is dropped. What the
 *      "Tries" list below the card already prints is not reprinted here.
 *
 * Typography follows the problem magazines (OzProblems): bold is the real
 * solution — the key, its threat and its own variations — and all virtual play
 * is plain, so bold reads as "this happened". A defence comes before the mate
 * that answers it, defences sharing one mate are joined with "/" and only the
 * first carries the move number, "!" marks a refutation and the key, tries
 * carry no "?", and counts are spelled out as words because a numeral next to
 * notation reads as part of it.
 */

/** A run of text; `strong` is the magazines' bold, i.e. the real solution. */
export interface CommentarySpan {
  text: string;
  strong?: boolean;
}

export interface TryCommentary {
  /** One paragraph per beat. Paragraph breaks are what keep the sentence
   *  boundaries visible once this much notation is in the text. */
  paragraphs: CommentarySpan[][];
}

const branchChildren = (node: SolutionNode) => node.children.filter(c => !c.isThreat);
const threatChildren = (node: SolutionNode) => node.children.filter(c => c.isThreat);

/**
 * Fold sibling nodes that carry the same move into one.
 *
 * YACPDB writes alternative continuations with slashes — "1...Qh1
 * 2.Nd7#/Ne2#/Ne6#" — and the parser expands that one source line into one line
 * per alternative, which leaves a copy of the defense in front of every mate.
 * Siblings share a position, so two siblings with the same move ARE the same
 * move: folding them back gives one defense with its mates hanging beneath,
 * which is what SolutionTree's fork layout and this file's prose both expect.
 *
 * Roots are deliberately left as they are: their order and adjacency carry the
 * set-play / try / key grouping that buildRootVariations reads, and the
 * solution count shown elsewhere counts them.
 *
 * Lives here rather than in SolutionTree.tsx so the sweep script can import it
 * without pulling a component file (and breaking fast refresh with a
 * non-component export).
 */
export function mergeSameMoveChildren(node: SolutionNode): SolutionNode {
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

/** Same numbering the variation display uses: white moves carry the count. */
function moveNumber(path: SolutionNode[]): number {
  const whites = path.filter(n => n.color === 'w').length;
  return path[0]?.color === 'b' ? whites + 1 : whites;
}

/** The source writes the mate mark as a separate token often enough that half
 *  the mates would print without it; the tree knows, so ask the tree. */
const withMark = (node: SolutionNode) =>
  node.isMate && !node.moveSan.includes('#') ? `${node.moveSan}#` : node.moveSan;

function write(path: SolutionNode[], marker = ''): string {
  const node = path[path.length - 1];
  const n = moveNumber(path);
  return (node.color === 'w' ? `${n}.` : `${n}...`) + withMark(node) + marker;
}

/** A threat is the attacker's own follow-up, so it is numbered as one whatever
 *  colour the parser hung on the node: the source occasionally writes the
 *  threat where a defence would go, and "threatening 1...Nf3#" is nonsense. */
function writeThreat(root: SolutionNode, threat: SolutionNode): string {
  const n = moveNumber([root, { ...threat, color: root.color }]);
  return (root.color === 'w' ? `${n}.` : `${n}...`) + withMark(threat);
}

const stripNumber = (label: string) => label.replace(/^\d+\.(\.\.)?/, '');
/** "2.Ne5#/Nb6#": one move number for the group, as the magazines set it. */
const mateList = (labels: string[]) =>
  labels.map((l, i) => (i === 0 ? l : stripNumber(l))).join('/');
/** Check and mate marks are decoration when two SANs are being compared. */
const bare = (san: string) => san.replace(/[+#!?]/g, '');

/** Numerals read as notation next to notation, so counts are spelled out. */
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen', 'twenty'];
const count = (n: number) => WORDS[n] ?? null;
const Count = (n: number) => { const w = count(n); return w ? w[0].toUpperCase() + w.slice(1) : null; };

const PIECE_NAME: Record<string, string> = {
  K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn',
};
/** Piece letter of a SAN; 'P' for a pawn move, 'K' for castling. */
function pieceOf(san: string): string {
  if (san.startsWith('O-O')) return 'K';
  return /^[KQRNB]/.test(san) ? san[0] : 'P';
}
/** Destination square of a SAN, or null when it cannot be read off. */
function destSquare(san: string): string | null {
  const squares = san.replace(/[+#!?]/g, '').match(/[a-h][1-8]/g);
  return squares ? squares[squares.length - 1] : null;
}

/** How many defence-and-mate pairs one sentence may quote. Past that it is a
 *  table with the rows run together, and the sections below the card hold the
 *  same material in full. Three is where a sentence stops scanning as a
 *  sentence — the reader loses the verb between the fourth pair's slashes. */
const QUOTE_CAP = 3;
/** And how many moves one pair may name on either side of it. */
const SLASH_CAP = 3;
const MATE_CAP = 3;

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function joinOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

interface TryInfo {
  root: SolutionNode;
  san: string;
  /** "1.Ra2" — no "?": the prose says what these moves are. */
  self: string;
  threats: string[];
  threatSans: string[];
  refutation: string | null;
  threatKey: string;
  refKey: string;
}

function collect(fullNodes: SolutionNode[]): { tries: TryInfo[]; key: SolutionNode | null } {
  const firstTry = fullNodes.find(r => r.isTry);
  const key = fullNodes.find(n => n.isKey && !n.isTry && n.color === firstTry?.color) ?? null;
  const tries: TryInfo[] = [];

  for (let i = 0; i < fullNodes.length; i++) {
    const root = fullNodes[i];
    if (!root.isTry) continue;

    // The refuting defence is either marked among the children, or — when the
    // source wrote it as "but 1...e6!" on its own line — parsed as the root
    // that follows. buildRootVariations pairs them the same way.
    const child = branchChildren(root).find(c => c.isKey);
    const next = fullNodes[i + 1];
    let refNode: SolutionNode | null = null;
    if (child) refNode = child;
    else if (next && next.isKey && !next.isTry && next.color !== root.color) refNode = next;

    const threatNodes = threatChildren(root);
    tries.push({
      root,
      san: root.moveSan,
      self: write([root]),
      threats: threatNodes.map(t => writeThreat(root, t)),
      threatSans: threatNodes.map(t => t.moveSan),
      refutation: refNode ? write([root, refNode], '!') : null,
      threatKey: threatNodes.map(t => t.moveSan).join('/'),
      refKey: refNode ? refNode.moveSan : '',
    });
  }

  // The source sometimes writes one try twice, once per refutation. Roots are
  // deliberately not folded for display, but the prose must not say "Black has
  // an answer to each: 1.Ne3 to 1...Rxe3!; 1.Ne3 to 1...Bxe3!" — one answer
  // per try is enough to sink it, so duplicates fold onto the first mention.
  const bySan = new Map<string, TryInfo>();
  const deduped: TryInfo[] = [];
  for (const t of tries) {
    const seen = bySan.get(t.san);
    if (!seen) { bySan.set(t.san, t); deduped.push(t); continue; }
    if (!seen.refutation && t.refutation) { seen.refutation = t.refutation; seen.refKey = t.refKey; }
    t.threatSans.forEach((san, i) => {
      if (!seen.threatSans.includes(san)) { seen.threats.push(t.threats[i]); seen.threatSans.push(san); }
    });
    seen.threatKey = seen.threatSans.join('/');
  }

  return { tries: deduped, key };
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): { key: string; items: T[] }[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = keyOf(item);
    if (!map.has(k)) { map.set(k, []); order.push(k); }
    map.get(k)!.push(item);
  }
  return order.map(k => ({ key: k, items: map.get(k)! }));
}

/** Where the black king stands, so a shared aim can be told in relation to it. */
function blackKingSquare(fen: string): string | null {
  try {
    const board = new Chess(fen.replace(/ [wb] /, ' w '));
    for (const row of board.board()) {
      for (const sq of row) if (sq && sq.type === 'k' && sq.color === 'b') return sq.square;
    }
  } catch { /* fall through */ }
  return null;
}

/** "the king's own file", "the square beside the king" — what the aim is aimed
 *  at. Not a tautology: a rook can mate along a rank just as well, or by
 *  opening a line for something behind it, so which line the tries head for is
 *  a fact about this problem rather than about rooks.
 *
 *  One wording per relation, whatever kind of target it is read off: an earlier
 *  draft had ", the king's own file" and ", down the king's own file" printed
 *  for the same fact, which reads as two different facts. */
function relativeToKing(square: string, king: string | null, kind: 'square' | 'file' | 'rank'): string {
  if (!king) return '';
  const [f, r] = [square[0], square[1]];
  const [kf, kr] = [king[0], king[1]];
  const sameFile = ", the king's own file";
  const sameRank = ", the king's own rank";
  if (kind === 'file') return f === kf ? sameFile : '';
  if (kind === 'rank') return r === kr ? sameRank : '';
  const adjacent = Math.abs(f.charCodeAt(0) - kf.charCodeAt(0)) <= 1 && Math.abs(+r - +kr) <= 1;
  if (adjacent) return ', the square beside the king';
  if (f === kf) return sameFile;
  if (r === kr) return sameRank;
  return '';
}

/** "a rook mate on the e-file" — the plan most of the threats share, or null.
 *  Most, not all: a set of tries almost always carries one stray idea, and
 *  demanding unanimity throws away the sentence that matters. */
function sharedPlan(threatSans: string[], king: string | null): { text: string; matches: (sans: string[]) => boolean } | null {
  if (threatSans.length < 3) return null;
  const dests = threatSans
    .map(san => ({ piece: pieceOf(san), sq: destSquare(san) }))
    .filter((d): d is { piece: string; sq: string } => d.sq !== null);
  if (dests.length < 3) return null;

  const majority = Math.ceil(dests.length * 0.7);
  const tally = <K extends string>(keyOf: (d: { piece: string; sq: string }) => K) => {
    const m = new Map<K, number>();
    for (const d of dests) m.set(keyOf(d), (m.get(keyOf(d)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  };

  // Along with the sentence, a test for "is this threat part of that plan" —
  // the tries are grouped by whether they pursue it, not by which piece moves.
  const on = (keyOf: (d: { piece: string; sq: string }) => string, want: string) =>
    (sans: string[]) => sans.some(san => {
      const sq = destSquare(san);
      return sq !== null && keyOf({ piece: pieceOf(san), sq }) === want;
    });

  const [square, sqN] = tally(d => `${d.piece}${d.sq}`);
  if (sqN >= majority) {
    return {
      text: `a ${PIECE_NAME[square[0]]} mate on ${square.slice(1)}${relativeToKing(square.slice(1), king, 'square')}`,
      matches: on(d => `${d.piece}${d.sq}`, square),
    };
  }
  const [file, fileN] = tally(d => `${d.piece}${d.sq[0]}`);
  if (fileN >= majority) {
    return {
      text: `a ${PIECE_NAME[file[0]]} mate on the ${file[1]}-file${relativeToKing(file[1] + '1', king, 'file')}`,
      matches: on(d => `${d.piece}${d.sq[0]}`, file),
    };
  }
  const [rank, rankN] = tally(d => `${d.piece}${d.sq[1]}`);
  if (rankN >= majority) {
    const n = rank[1];
    const suffix = n === '1' ? 'st' : n === '2' ? 'nd' : n === '3' ? 'rd' : 'th';
    return {
      text: `a ${PIECE_NAME[rank[0]]} mate on the ${n}${suffix} rank${relativeToKing('a' + n, king, 'rank')}`,
      matches: on(d => `${d.piece}${d.sq[1]}`, rank),
    };
  }
  return null;
}

/** How the defences that share one mate are named: "any knight move" when they
 *  are all moves of the same piece and nothing else that piece does is
 *  answered differently, the move itself when there is only one.
 *  This is the mechanism the whole card turns on — one try in D170595 answers
 *  five knight defences with 2.Qa1#, and writing "any knight move 2.Qa1#"
 *  instead of listing all five is the difference between a sentence and a
 *  data dump. */
function nameDefences(defs: SolutionNode[], allDefs: SolutionNode[], label: (n: SolutionNode) => string): string {
  if (defs.length === 1) return label(defs[0]);
  const pieces = new Set(defs.map(d => pieceOf(d.moveSan)));
  if (pieces.size === 1) {
    const piece = [...pieces][0];
    // "any knight move" only when no OTHER knight defence in this phase is
    // answered some other way — otherwise the word "any" is a lie.
    const others = allDefs.filter(d => pieceOf(d.moveSan) === piece && !defs.includes(d));
    // "any" also holds when the remaining moves of that piece allow this mate
    // as well and merely allow more besides — the claim is still true of them.
    const mine = new Set(branchChildren(defs[0]).map(m => m.moveSan));
    const covered = others.every(o => {
      const theirs = new Set(branchChildren(o).map(m => m.moveSan));
      return [...mine].every(m => theirs.has(m));
    });
    if (covered) return `any ${PIECE_NAME[piece]} move`;
  }
  // Slashes, not "and": with "and" doing duty both inside a group of defences
  // and between one pair and the next, there is no telling where a pair ends.
  // The magazines write it "1...Bf7/Bh7 2.Kf7", numbering only the first.
  return defs.map((d, i) => (i === 0 ? label(d) : stripNumber(label(d)))).join('/');
}

/** Mate → the defences it answers, for one phase (the refutation excluded). */
function matesOf(root: SolutionNode, skip: string | string[] | null): { mate: string; defs: SolutionNode[] }[] {
  const skipped = (skip === null ? [] : Array.isArray(skip) ? skip : [skip]).map(bare);
  // A defence written more than once in the source carries one mate each time;
  // collect them onto the defence first, or the same move appears twice with a
  // mate apiece instead of once with both.
  const byDefence = new Map<string, { node: SolutionNode; mates: string[] }>();
  for (const d of branchChildren(root)) {
    if (skipped.includes(bare(d.moveSan))) continue;
    // Only moves that end the game are quoted as mates: a white second move
    // with children is a continuation the source kept writing, not a mate,
    // and printing it in a defence-and-mate pair would call it one.
    const ms = branchChildren(d).filter(m => m.isMate || m.children.length === 0);
    if (!ms.length) continue;
    const entry = byDefence.get(d.moveSan) ?? { node: d, mates: [] };
    for (const m of ms) {
      const label = write([root, d, m]);
      if (!entry.mates.includes(label)) entry.mates.push(label);
    }
    byDefence.set(d.moveSan, entry);
  }
  const byMate = new Map<string, SolutionNode[]>();
  for (const { node, mates } of byDefence.values()) {
    const label = mateList(mates);
    if (!byMate.has(label)) byMate.set(label, []);
    byMate.get(label)!.push(node);
  }
  return [...byMate.entries()].map(([mate, defs]) => ({ mate, defs }));
}

/** ["1...Kxd5 2.Rxd3#", "any knight move 2.Qa1#", "1...e3 2.dxe3#"]
 *  Defence first, then the mate: that is the order the moves are played in,
 *  and putting the second move before the first reads as a misprint.
 *
 *  A pair naming twelve defences, or five mates for one defence, is a table
 *  row rather than a clause, and past QUOTE_CAP pairs the sentence is a table.
 *  `dropped` says whether anything was left out, so the sentence around the
 *  quote can decline to claim completeness. Each pair carries the bare SANs of
 *  the defences it names, for the changed-mates comparison. */
interface QuotedPair { text: string; defsLabel: string; defs: string[]; mate: string }

/** "1...Bg2 is met by 2.Qe2#, 1...Bh3/Be2 by 2.Qe2# and 1...Bd3 by 2.Qg2#" —
 *  the defence-and-answer relation said with a verb. A bare "with 1...Bg2
 *  2.Qe2#" hung the pairs off the threat clause as if they belonged to it,
 *  when the relation is a different one: if Black plays this, White has that. */
function metByChain(pairs: QuotedPair[], dropped: boolean): string {
  const items = pairs.map((p, i) => `${p.defsLabel} ${i === 0 ? 'is met by' : 'by'} ${p.mate}`);
  return joinAnd(items) + (dropped ? ', and more besides' : '');
}
function matePairs(root: SolutionNode, skip: string | string[] | null, threatSans: string[] = []): { pairs: QuotedPair[]; dropped: boolean } {
  const groups = matesOf(root, skip);
  const allDefs = groups.flatMap(g => g.defs);
  // A defence answered by the threat itself is no information: "1.Qd4
  // threatens 2.Bxe4#" already says that whatever fails to stop 2.Bxe4# gets
  // it. Only the defences that DO stop the threat and run into something
  // else are worth a pair — and a defence whose listed mates include the
  // threat did not stop it, so the label is the whole test. Skipping these
  // is not "dropping" either: nothing unsaid remains, so no "and more
  // besides".
  // "The threat" includes the threat landing as a capture: after 1...d5 the
  // threatened 2.Rd5 prints as 2.Rxd5, but the defence still failed to stop
  // it — same piece to the same square is the same threat.
  const avoid = threatSans.map(bare);
  const sameAsThreat = (m: string) => avoid.some(a =>
    a === m || (pieceOf(a) === pieceOf(m) && destSquare(a) !== null && destSquare(a) === destSquare(m)));
  const parries = (mate: string) =>
    avoid.length === 0 || !mate.split('/').some(m => sameAsThreat(bare(m.replace(/^\d+\./, ''))));
  const pairs: QuotedPair[] = [];
  let dropped = false;
  for (const g of groups) {
    if (!parries(g.mate)) continue;
    const defs = nameDefences(g.defs, allDefs, d => write([root, d]));
    const names = defs.startsWith('any ') ? 1 : defs.split('/').length;
    if (names > SLASH_CAP || g.mate.split('/').length > MATE_CAP) { dropped = true; continue; }
    pairs.push({ text: `${defs} ${g.mate}`, defsLabel: defs, defs: g.defs.map(d => bare(d.moveSan)), mate: g.mate });
  }
  if (pairs.length > QUOTE_CAP) { pairs.length = QUOTE_CAP; dropped = true; }
  return { pairs, dropped };
}

/**
 * The solver's classification, in the terms the beginner's guide uses: look at
 * the set play first, then at whether the key carries a threat.
 *
 *   - complete block — every black move already has its mate, so the key has
 *     only to keep them (a waiting move), or to rebuild them (a mutate).
 *   - threat problem — the key threatens a mate and Black must stop it.
 *   - waiting key — no threat, and the set play as published does not cover
 *     every black move.
 *
 * Only the safe direction is claimed. YACPDB writes down the set lines worth
 * showing, not all of them, so a set play that covers every legal black move
 * proves a complete block, while one that does not prove nothing either way.
 */
/** Is there a mate next move if Black could pass? The guide's two-move test. */
function threatOnBoard(fen: string, keySan: string): boolean | null {
  try {
    const after = new Chess(fen);
    after.move(keySan);
    const passed = new Chess(after.fen().replace(/ b /, ' w '));
    return passed.moves().some(m => {
      const next = new Chess(passed.fen());
      next.move(m);
      return next.isCheckmate();
    });
  } catch {
    return null;
  }
}

/** Zugzwang proper: no threat, and every black move walks into a mate. */
function zugzwangOnBoard(fen: string, keySan: string): boolean | null {
  try {
    const after = new Chess(fen);
    after.move(keySan);
    const replies = after.moves();
    if (!replies.length) return null;
    return replies.every(r => {
      const board = new Chess(after.fen());
      board.move(r);
      return board.moves().some(m => {
        const next = new Chess(board.fen());
        next.move(m);
        return next.isCheckmate();
      });
    });
  } catch {
    return null;
  }
}

function classify(fullNodes: SolutionNode[], initialFen: string, key: SolutionNode): {
  completeBlock: boolean;
  setRoots: SolutionNode[];
  setDefences: Map<string, string[]>;
  hasThreat: boolean;
  zugzwang: boolean;
} {
  const setRoots = fullNodes.filter(r =>
    r.color === 'b' && !r.isTry && !r.isKey && branchChildren(r).length > 0);
  const setDefences = new Map<string, string[]>();
  for (const r of setRoots) setDefences.set(r.moveSan, branchChildren(r).map(c => c.moveSan));

  let completeBlock = false;
  if (setDefences.size > 0) {
    try {
      const board = new Chess(initialFen.replace(/ [wb] /, ' b '));
      const legal = board.moves();
      completeBlock = legal.length > 0 && legal.every(m => setDefences.has(m));
    } catch { completeBlock = false; }
  }

  // The threat is checked on the board, not read off the text. Measured over
  // 1,500 #2s, the source leaves the threat unwritten in 1.6% of them, and
  // taking that silence for "no threat" would announce a zugzwang that is not
  // there. When the board cannot be read, fall back to what the text says.
  const onBoard = threatOnBoard(initialFen, key.moveSan);
  const hasThreat = onBoard ?? key.children.some(c => c.isThreat);
  // And zugzwang is only claimed when every black move really does lose: of
  // 390 threatless keys, 389 were zugzwang and one was not.
  const zugzwang = !hasThreat && zugzwangOnBoard(initialFen, key.moveSan) === true;

  return { completeBlock, setRoots, setDefences, hasThreat, zugzwang };
}

/**
 * What the key plays against a defence, worked out on the board when the
 * source does not spell it out. The moves that refuted the tries are exactly
 * the ones a reader wants answered, and YACPDB rarely lists them under the key
 * — they are not "variations", they are the point.
 */
function mateAfter(initialFen: string, keySan: string, defenceSan: string): string[] {
  try {
    const board = new Chess(initialFen);
    board.move(keySan);
    board.move(defenceSan);
    return board.moves().filter(m => {
      const next = new Chess(board.fen());
      next.move(m);
      return next.isCheckmate();
    });
  } catch {
    return [];
  }
}

/** Does this problem's own notation carry the mate mark on every mate? The
 *  parser reads "#" off the text, and the sources that write "2.Qc5*d5 #" with
 *  the mark loose lose it. Where the source is short of them, the marks come
 *  off the whole card instead: one list mixing "2.Qe1#" (chess.js, which always
 *  marks) with the source's "2.Qxd3" reads as a distinction being drawn. */
function marksMates(nodes: SolutionNode[]): boolean {
  const leaves: string[] = [];
  const walk = (n: SolutionNode, depth: number) => {
    if (n.children.length === 0) {
      if (depth >= 2 && n.color === 'w') leaves.push(n.moveSan);
      return;
    }
    for (const c of n.children) walk(c, depth + 1);
  };
  for (const r of nodes) walk(r, 1);
  return leaves.length > 0 && leaves.every(s => s.includes('#'));
}

/** Black's legal moves in a position, or null when it cannot be read. */
function blackMoves(fen: string, whiteMove?: string): string[] | null {
  try {
    if (!whiteMove) return new Chess(fen.replace(/ [wb] /, ' b ')).moves();
    const board = new Chess(fen);
    board.move(whiteMove);
    return board.moves();
  } catch {
    return null;
  }
}

/** The source sometimes writes a threat without its mate mark while marking
 *  every other mate on the card, and one bare "2.Rxd5" in a page of "#"s
 *  reads as a distinction being drawn. Where the board confirms the threat
 *  is mate, the mark is restored; where it cannot be read, the label stays
 *  as written. */
function markThreatMates(fen: string, moverSan: string, labels: string[], sans: string[]): string[] {
  return labels.map((label, i) => {
    if (label.includes('#')) return label;
    try {
      const board = new Chess(fen);
      board.move(bare(moverSan));
      const passed = new Chess(board.fen().replace(/ b /, ' w '));
      passed.move(bare(sans[i]));
      if (passed.isCheckmate()) return `${label.replace(/\+$/, '')}#`;
    } catch { /* leave as written */ }
    return label;
  });
}

export function buildTryCommentary(fullNodes: SolutionNode[], initialFen: string, stipulation?: string): TryCommentary | null {
  // Twomovers only. Everything this file trusts is #2 logic: the two-move
  // test reads "threat" as mate-next-move, the vocabulary calls White's second
  // moves mates, and the claims were measured over #2s. On a #3 the same code
  // announces a waiting move over a key it then prints as "threatening", and
  // on a selfmate the rhetoric is the wrong genre entirely.
  if ((stipulation ?? '').trim() !== '#2') return null;
  const { tries, key } = collect(fullNodes);
  if (tries.length < 2 || !key) return null;

  const withThreat = tries.filter(t => t.threats.length > 0);
  const withRef = tries.filter(t => t.refutation);
  if (withThreat.length < 2 && withRef.length !== tries.length) return null;

  const refGroups = groupBy(withRef, t => t.refKey).sort((a, b) => b.items.length - a.items.length);
  const dominant = refGroups[0] && refGroups[0].items.length >= 2 ? refGroups[0] : null;
  const domRef = dominant?.items[0].refutation ?? null;
  const domTries = dominant ? dominant.items : [];

  for (const t of tries) t.threats = markThreatMates(initialFen, t.san, t.threats, t.threatSans);
  const keyThreatSans = threatChildren(key).map(t => t.moveSan);
  const keyThreats = markThreatMates(initialFen, key.moveSan,
    threatChildren(key).map(t => writeThreat(key, t)), keyThreatSans);
  const marked = marksMates(fullNodes);

  const sentences: string[] = [];
  // Whether anything RELATIONAL got said. A card that can only enumerate the
  // tries has nothing the Tries list below does not already have, and is
  // withheld: for those problems the honest output is no card at all.
  let related = false;
  /** The tries all fell to king flights: the key paragraph says so in words. */
  let flightDefence = false;
  /** The tries named in the "nearest the mark" sentence just before the key,
   *  re-named in the key clause itself: the reader who skips straight to
   *  "The answer is" never met "those tries". */
  let echoNames: string[] = [];
  /** Their shared refutation — its fate belongs in the key's own sentence. */
  let echoRefSan: string | null = null;
  /** Whether the echo try was actually narrated above. "Exactly what 1.Qxb3
   *  was after" pointing at a try that only ever appeared inside a
   *  classification clause is a callback with nothing to call back to. */
  let echoNarrated = false;

  const kind = classify(fullNodes, initialFen, key);

  // The plan is the TRIES' plan: read off the key's threat it would announce
  // an aim no try ever had, and read off two threats it is a coincidence
  // rather than a pattern.
  const tryThreatSans = withThreat.flatMap(t => t.threatSans);
  const plan = tryThreatSans.length >= 3
    ? sharedPlan(tryThreatSans, blackKingSquare(initialFen))
    : null;

  // The one mate every try with a threat was after, when there is one. Two
  // tries cannot make a "plan" but they can share a mate, and that mate is
  // the idea of the problem just as much.
  let sharedThreat: string | null = null;
  let sharedThreatSan: string | null = null;
  if (withThreat.length >= 2 && withThreat.length === tries.length) {
    const common = threatChildren(withThreat[0].root)
      .find(n => withThreat.every(t => t.threatSans.includes(n.moveSan)));
    if (common) {
      sharedThreat = write([withThreat[0].root, common]);
      sharedThreatSan = common.moveSan;
      // The mate mark check walks the tries until one is playable on the
      // board: the first try may itself be shorthand ("1.Se~") chess.js
      // cannot move.
      for (const t of withThreat) {
        if (sharedThreat.includes('#')) break;
        sharedThreat = markThreatMates(initialFen, t.san, [sharedThreat], [common.moveSan])[0];
      }
    }
  }

  // ── 1. The opening: what the position is, or what White is after ──
  // Never a move number, never the word "try": the reader has to know the idea
  // before being told it fails.
  // A set defence the source wrote twice — "1...c5 2.g3#/g4#" arrives as two
  // roots — carries one mate each time; collect them onto the defence first or
  // the same move is printed twice with a mate apiece.
  const setChanged = [...kind.setDefences.entries()].some(([defence, mates]) => {
    const after = branchChildren(key).filter(d => d.moveSan === defence)
      .flatMap(d => branchChildren(d).map(m => m.moveSan));
    return after.length > 0 && after.join('/') !== mates.join('/');
  });

  const kingRefs = refGroups.filter(g => pieceOf(g.key) === 'K');
  const otherRefs = refGroups.filter(g => pieceOf(g.key) !== 'K');
  const flights = [...new Set(kingRefs.map(g => destSquare(g.key)).filter(Boolean) as string[])].sort();
  // "the whole of the defence" holds only when every refuting move is a king
  // move; with one refutation by another unit the run is still mostly flights,
  // and that weaker claim gets its own sentence further down.
  const allFlights = withRef.length === tries.length && flights.length >= 3 && otherRefs.length === 0;

  // Jargon comes AFTER the plain fact it names, never instead of it: the card
  // is aimed at casual solvers, and "the position is a complete block" opens
  // with a term they have no reason to know. Say what is true of the board
  // first; the problemists' word rides along in brackets — "(set play)" — as
  // the bridge to the guide for whoever wants it.
  let framed = false;
  if (kind.completeBlock) {
    // "All the key has to do is wait" is a promise about the key, so the key
    // is checked before making it: a complete block CAN be solved by a move
    // that abandons the waiting game and threatens instead — the block-threat
    // — and six of these cards used to promise a waiting key right above a
    // key printed with its threat (D29386).
    // The term reads over the whole clause, so it sits between dashes (or
    // after a colon), never in brackets against the nearest noun: "a mate
    // (a complete block)" named the mate, the same misattachment "(the set
    // play)" was cured of.
    sentences.push(kind.hasThreat
      ? 'If Black were to move first, every black move would run into a mate — a complete block — but no waiting move keeps all of those answers, so White goes looking for a threat instead: the block-threat.'
      : setChanged
        ? 'If Black were to move first, every black move would run into a mate — a complete block — but no waiting move keeps all of those answers, and the key rebuilds some of them: a mutate.'
        : 'If Black were to move first, every black move would run into a mate — a complete block — so all the key has to do is leave those answers standing.');
    related = true;
    framed = true;
  } else if (!kind.hasThreat && kind.setDefences.size > 0) {
    if (allFlights) {
      sentences.push(`There is no threat: the key is a waiting move, and the black king's flights — ${joinAnd(flights)} — are the whole of the defence.`);
      flightDefence = true;
      related = true;
    } else {
      // The zugzwang was verified AFTER the key (zugzwangOnBoard), so the
      // sentence must say so: at the diagram many of these positions still
      // have unanswered black moves, and "every black move already walks
      // into a mate" read as a claim about the diagram — false there.
      // "No threat" said the concrete way: the two-move test a solver would
      // run. Both claims here are the board's own (threatOnBoard false and
      // zugzwangOnBoard true — the unverified case takes the other branch).
      sentences.push(kind.zugzwang
        ? 'Even two White moves in a row would produce no mate here. The key simply leaves Black to move, and every black move then walks into one — zugzwang.'
        : 'The key carries no threat: what White needs is a move that leaves every answer in place.');
    }
    framed = true;
  }

  if (plan) {
    // The abstraction and nothing else: the threats themselves are printed
    // against the moves that carry them a sentence or two below, and a
    // separate "the threats run 2.Re2#, 2.Re3#" listed them a second time —
    // next to a verified "there is no threat" frame it also read as a
    // contradiction, the key's silence being confused with the tries' aims.
    sentences.push(`White wants ${plan.text}.`);
    related = true;
    framed = true;
  } else if (!framed) {
    const byPiece = groupBy(tries, t => pieceOf(t.san)).sort((a, b) => b.items.length - a.items.length);
    // "the whole of the problem" has to be the whole of it: every try and the
    // key moving the same piece, not merely most of them.
    const piece = byPiece.length === 1 && byPiece[0].key === pieceOf(key.moveSan)
      ? PIECE_NAME[byPiece[0].key] : null;
    if (sharedThreat) {
      sentences.push(`White would like ${sharedThreat}.`);
      related = true;
    // No set-play lecture for a threat problem: the reader the card is for
    // starts from the hunt, and the try narration below IS the hunt. Set play
    // is explained only where it is the story — the complete block branch.
    } else if (piece) {
      sentences.push(`Where to put the ${piece} is the whole of the problem.`);
    } else if (!kind.hasThreat) {
      sentences.push('There is no threat to be had here: White is hunting for a waiting move that leaves every answer in place.');
    } else if (withThreat.length === tries.length && byPiece.length === 1) {
      sentences.push(`The ${PIECE_NAME[byPiece[0].key]} has a threat from more than one square.`);
    }
    // No filler otherwise: "What White needs is a threat Black cannot answer"
    // is true of every twomover and says nothing about this one. A card with
    // no opening worth making starts with the play.
  }

  /**
   * The refutations as a classification: the try first, then the move that
   * answers it, then the other tries that same move disposes of. The aim rides
   * along in brackets so no try is named without saying what it was for —
   * collapsed onto the group when they all threatened the same thing.
   *
   * Truncated by dropping whole groups rather than by counting the remainder:
   * a set of moves is either named or not mentioned.
   */
  // Every refutation the card names, in order of first mention. The key
  // paragraph plays each of them against the key: they are the moves the
  // reader last saw winning, and what becomes of them is how the key is
  // derived from the tries rather than merely announced after them.
  const namedRefs: string[] = [];
  const nameRef = (san?: string | null) => {
    if (!san) return;
    if (!namedRefs.some(r => bare(r) === bare(san))) namedRefs.push(san);
  };

  const classifyRefutations = (pool: TryInfo[], showAims: boolean): string | null => {
    const groups = groupBy(pool.filter(t => t.refutation), t => t.refKey)
      .sort((a, b) => b.items.length - a.items.length);
    if (!groups.length) return null;
    // Moves that shared a threat are listed together with the aim written once,
    // and the aim goes immediately after its own run: "or" joins the moves
    // inside a run, "and" separates one run from the next, so the bracket
    // reads over exactly the moves before it. The runs that have no threat go
    // last, so no bracket can be read as covering a move that never carried it.
    const named = (items: TryInfo[]) => {
      const subs = showAims ? groupBy(items, t => t.threatKey) : [{ key: '', items }];
      const aimed = subs.filter(g => showAims && g.items[0].threats.length > 0);
      const plain = subs.filter(g => !(showAims && g.items[0].threats.length > 0)).flatMap(g => g.items);
      if (aimed.length === 0) return joinOr(plain.map(t => t.self));
      return joinAnd([
        ...aimed.map(g => `${joinOr(g.items.map(t => t.self))} (${mateList(g.items[0].threats)})`),
        ...plain.map(t => t.self),
      ]);
    };
    const shown: typeof groups = [];
    let total = 0;
    for (const g of groups) {
      if (shown.length >= 4 || (shown.length > 0 && total + g.items.length > 10)) break;
      shown.push(g);
      total += g.items.length;
    }
    // One clause per refutation, the tries as its subject. An earlier shape
    // hung each group on a bare "to" ("1.Qa3, 1.Qb3 (2.Rf2#) to 1...Bxe2!"),
    // a private grammar; the next opened every clause with "against ...,
    // against ..." and drummed. Now one lead carries the sentence and the
    // clauses share the verb — "1.Kb4 is met by 1...h5!; 1.Kb6 by 1...Rh5!"
    // — elided after the first, semicolons keeping each refutation with its
    // own moves. A single group keeps the old "Against ..." form: no
    // repetition to avoid, and the lead would outweigh it.
    if (shown.length === 1) {
      nameRef(shown[0].key);
      return `Against ${named(shown[0].items)} Black has ${shown[0].items[0].refutation}.`;
    }
    const clauses = shown.map((g, i) => {
      nameRef(g.key);
      const n = named(g.items);
      const verb = i > 0 ? 'by' : g.items.length > 1 ? 'are met by' : 'is met by';
      return `${n} ${verb} ${g.items[0].refutation}`;
    });
    return `Black has an answer for each: ${clauses.join('; ')}.`;
  };

  // The try that was after the key's own mate: the key paragraph points back
  // to it, so the tries paragraph does not spend a second sentence on it.
  const echoTry = keyThreatSans.length > 0
    ? domTries.find(t => t.threatSans.some(x => keyThreatSans.includes(x)))
    : undefined;
  const sharedEcho = sharedThreatSan !== null && keyThreatSans.includes(sharedThreatSan);

  // ── 2. The tries ──
  // Two shapes, because the problems come in two shapes. When the threats add
  // up to one plan, the tries are sorted by the role each plays against it.
  // When there is no plan, the interest is in what each try had ready, so the
  // richest two are narrated with their prepared mates and the rest are
  // classified by the move that answers them.
  if (plan) {
    // Every try after the same mate: one sentence covers the lot, and the
    // refutations are what differ.
    const oneThreat = withThreat.length === tries.length
      && new Set(tries.map(t => t.threatKey)).size === 1;
    if (oneThreat) {
      if (dominant && domRef && dominant.items.length === tries.length) {
        nameRef(dominant.key);
        sentences.push(`Every move that goes for it falls to ${domRef}.`);
      } else {
        const s = classifyRefutations(tries, false);
        if (s) sentences.push(s);
      }
      related = true;
    } else {
      // Grouped by whether the try pursues the plan, not by which piece moves:
      // the one try that does something else is the interesting one, and
      // sorting on the piece put it at the head of the run instead.
      const runTries = domTries.filter(t => t.threats.length > 0 && t.threatKey !== echoTry?.threatKey);
      const runGroups = groupBy(runTries, t => t.threatKey);
      const runA = runGroups.filter(g => plan.matches(g.items[0].threatSans)).slice(0, 6);
      const runB = runGroups.filter(g => !plan.matches(g.items[0].threatSans));

      if (runA.length > 0) {
        // Split by the piece that moves, one sentence each. A single sentence
        // over rook moves and king moves together cannot be led by a piece
        // name without lying, and led by nothing it loses the fact that the
        // king moves reach the same aim a different way — by clearing the line
        // rather than occupying it.
        const byPiece = groupBy(runA.flatMap(g => g.items), t => pieceOf(t.san));
        byPiece.forEach((pg, pi) => {
          const piece = PIECE_NAME[pg.key];
          const groups = groupBy(pg.items, t => t.threatKey);
          // Commas inside a run, "and" only between runs: with joinAnd doing
          // both jobs there is no telling which moves the "for 2.Re2#" covers.
          const clauses = groups.map(g => `${g.items.map(t => t.self).join(', ')} for ${mateList(g.items[0].threats)}`);
          const lead = pg.items.length === 1
            ? `The ${piece} goes for it`
            : pi === 0
              ? `The ${piece} comes at it in turn`
              : `The ${piece} gets out of the way to the same end`;
          // "every one of them" needs more than one of them.
          const fate = pi > 0 ? 'again'
            : pg.items.length === 1 ? 'it dies to'
            : 'every one of them dies to';
          if (domRef && dominant) nameRef(dominant.key);
          sentences.push(domRef
            ? `${lead} — ${joinAnd(clauses)} — and ${fate} ${domRef}.`
            : `${lead} — ${joinAnd(clauses)}.`);
        });
      }

      if (runB.length > 0) {
        const names = joinAnd(runB.flatMap(g => g.items.map(t => t.self)));
        const aims = joinAnd([...new Set(runB.map(g => mateList(g.items[0].threats)))]);
        const many = runB.reduce((n, g) => n + g.items.length, 0) > 1;
        if (domRef && dominant) nameRef(dominant.key);
        sentences.push(domRef
          ? `Aiming elsewhere, ${names} ${many ? 'threaten' : 'threatens'} ${aims} — and again ${domRef}.`
          : `Aiming elsewhere, ${names} ${many ? 'threaten' : 'threatens'} ${aims}.`);
      }

      if (echoTry) {
        const group = domTries.filter(t => t.threatKey === echoTry.threatKey);
        const names = joinAnd(group.map(t => t.self));
        const verb = group.length > 1 ? 'threaten' : 'threatens';
        if (echoTry.refutation) nameRef(echoTry.refKey);
        sentences.push(echoTry.refutation
          ? `Then ${names} ${verb} ${mateList(echoTry.threats)}, the mate the key itself makes — yet ${echoTry.refutation} answers them too.`
          : `Then ${names} ${verb} ${mateList(echoTry.threats)}, the mate the key itself makes.`);
        echoNarrated = true;
        related = true;
      }

      // "carries no threat" is a claim about the board: a try the source left
      // bare may still be threatening something. The ones that cannot be
      // checked are classified with the rest instead of being called waiting
      // moves on the strength of a silence.
      const bare0 = domTries.filter(t => t.threats.length === 0);
      const domWaiters = bare0.filter(t => threatOnBoard(initialFen, t.san) === false);
      if (domWaiters.length > 0) {
        const many = domWaiters.length > 1;
        if (domRef && dominant) nameRef(dominant.key);
        sentences.push(`The waiting move${many ? 's' : ''} ${joinAnd(domWaiters.map(t => t.self))} `
          + `${many ? 'carry' : 'carries'} no threat at all`
          + (domRef ? `, and ${domRef} answers ${many ? 'them' : 'it'} too.` : '.'));
      }

      const rest = tries.filter(t => !domTries.includes(t)
        || (bare0.includes(t) && !domWaiters.includes(t)));
      const s = classifyRefutations(rest, true);
      if (s) sentences.push(s);
    }
  } else {
    // A phase with fourteen defence-and-mate pairs in it is a data dump, and
    // the "Key variations" and "Tries" sections below print them in full
    // anyway. The two richest tries are narrated, quoting at most QUOTE_CAP
    // pairs each — "and more besides" when the quote is partial, so nothing
    // claims completeness it does not have — and the other tries are
    // classified by the move that answers them.
    // Richness is counted in informative pairs — defences that stop the
    // threat and are answered elsewhere. One such pair already reads as a
    // sentence ("threatening 2.Z#, with 1...q 2.Z'#"), so one is enough to
    // narrate; a try whose every listed defence merely fails to stop the
    // threat has nothing to quote and is classified below instead.
    const full = [...tries]
      .map(t => ({ t, groups: matesOf(t.root, t.refKey || null), quoted: matePairs(t.root, t.refKey || null, t.threatSans) }))
      .filter(x => x.quoted.pairs.length >= (x.t.threats.length ? 1 : 2))
      .sort((a, b) => b.quoted.pairs.length - a.quoted.pairs.length)
      .slice(0, 2);
    const narrated = new Set(full.map(x => x.t));
    if (echoTry && narrated.has(echoTry)) echoNarrated = true;

    const mateSetOf = (x: { groups: { mate: string; defs: SolutionNode[] }[] }) =>
      x.groups.map(g => g.mate).sort().join('|');
    full.forEach((x, i) => {
      const t = x.t;
      const pairs = metByChain(x.quoted.pairs, x.quoted.dropped);
      // "the same defences get changed mates" makes two claims and both are
      // checked against the first phase AS THE READER SAW IT: every defence
      // this quote names appeared in the first phase's own quote (same
      // defences), and each one's mate differs (changed mates). The full map
      // is not enough — a defence the first phase answered with its threat
      // was filtered from that quote as no information, and calling it "the
      // same defence" points at a pair the reader never read.
      const prevMates = i > 0
        ? new Map(full[0].quoted.pairs.flatMap(p => p.defs.map(d => [d, p.mate] as const)))
        : null;
      const exchanged = prevMates !== null && !x.quoted.dropped && !full[0].quoted.dropped
        && x.quoted.pairs.every(p => p.defs.every(d => {
          const before = prevMates.get(d);
          return before !== undefined && before !== p.mate;
        }));
      if (exchanged) related = true;
      const aim = t.threats.length ? ` (${mateList(t.threats)})` : '';
      // "waits" is a claim about the board, not about what the source wrote
      // under the move: 1.Qc7+ with no threat printed still forces a reply, and
      // a move with an unwritten threat is not a waiting move either.
      const waits = t.threats.length === 0 && !t.san.includes('+')
        && threatOnBoard(initialFen, t.san) === false;
      // "the same mates are still there" is likewise checked, not assumed.
      const sameMates = i > 0 && !t.threats.length
        && !x.quoted.dropped && !full[0].quoted.dropped
        && mateSetOf(x) === mateSetOf(full[0]);
      const opening = exchanged
        ? `After ${t.self}${aim} the same defences get changed mates: ${pairs}`
        : t.threats.length
          // The quoted pairs are exactly the defences that DO stop the threat
          // (the redundancy filter dropped every one that does not), so the
          // sentence can say what they are: parrying, and parrying in vain.
          ? `White ${i === 0 ? 'can start with' : 'might instead play'} ${t.self}, threatening ${mateList(t.threats)}. Stopping ${i === 0 ? 'it is not enough' : 'this one is no better'}: ${pairs}`
          : sameMates
            ? `After ${t.self} the same mates are still there: ${pairs}`
            : waits
              ? `White can ${i === 0 ? 'wait' : 'also wait'} with ${t.self}: ${pairs}`
              : t.san.includes('+')
                ? `White can check with ${t.self}: ${pairs}`
                : `The answers are in place after ${t.self}: ${pairs}`;
      // The refutation clause restates its subject. Hung off "the same
      // defences get changed mates" a bare "but has no reply" reads as the
      // defences having no reply, and off "White has an answer to everything"
      // it contradicted the sentence it closed.
      if (t.refutation) nameRef(t.refKey);
      sentences.push(t.refutation
        ? `${opening} — but White has no reply to ${t.refutation}.`
        : `${opening}.`);
    });

    // Tries that go for the very mate the key makes are the key's family,
    // and the magazines keep the family together ("All of these moves ... In
    // every case – four tries and the key ..." — OzProblems) instead of
    // recalling one out of a list later: "exactly what 1.Qa3 was after"
    // pointed at a try the reader had only skimmed past in a classification
    // clause. When they share one refutation they get their own sentence,
    // LAST before the key, and the key continues from it in the same breath.
    const echoes = keyThreatSans.length > 0
      ? tries.filter(t => !narrated.has(t) && t.refutation
          && t.threatSans.some(s => keyThreatSans.some(k => bare(k) === bare(s))))
      : [];
    const tellEcho = echoes.length > 0
      && new Set(echoes.map(t => bare(t.refKey))).size === 1;

    const s = classifyRefutations(
      tries.filter(t => !narrated.has(t) && !(tellEcho && echoes.includes(t))), true);
    if (s) sentences.push(s);

    if (tellEcho) {
      const names = joinAnd(echoes.map(t => t.self));
      const matched = echoes[0].threatSans.findIndex(x => keyThreatSans.some(k => bare(k) === bare(x)));
      const aimLabel = echoes[0].threats[matched] ?? echoes[0].threats[0];
      nameRef(echoes[0].refKey);
      sentences.push(echoes.length > 1
        ? `Nearest the mark are ${names}, threatening ${aimLabel} — but each falls to ${echoes[0].refutation}.`
        : `Nearest the mark is ${names}, threatening ${aimLabel} — but it falls to ${echoes[0].refutation}.`);
      echoNames = echoes.map(t => t.self);
      echoRefSan = echoes[0].refKey;
      related = true;
    }
  }

  // Most of the refutations being king moves IS the defence, and worth naming.
  // Not all of them: one stray refutation by another unit is normal, and
  // demanding unanimity threw the sentence away on problems built on flights.
  if (!flightDefence && withRef.length === tries.length && flights.length >= 3
      && kingRefs.length > otherRefs.length) {
    flightDefence = true;
    sentences.push(otherRefs.length === 0
      ? `Set the refutations side by side — ${joinAnd(flights)} — and the black king's flights turn out to be the whole defence.`
      : `Set the refutations side by side and most of them are flights of the black king — ${joinAnd(flights)}.`);
    related = true;
  }

  // Two ways a set of tries can hang together, and both are on the board
  // rather than in the source text.
  //
  //   - The refutation was there all along, and after the key it runs into the
  //     threat regardless. (D3684: 1...Bg2 and 1...Bh3 both allow 2.Re7#.)
  //   - The refutation did not exist in the diagram at all — the try opened
  //     the door itself. (D1945: 1.Ra1 vacates a2, and 1...a2! appears.)
  //
  // The second is the sharper story and the one the source can never state.
  // The pairs themselves are not reprinted: they are two sentences up.
  const diagramMoves = blackMoves(initialFen);
  const selfInflicted = diagramMoves
    ? withRef.filter(t => !diagramMoves.some(m => bare(m) === bare(t.refKey))
        && (blackMoves(initialFen, t.san) ?? []).some(m => bare(m) === bare(t.refKey)))
    : [];
  const willTellSelfInflicted =
    selfInflicted.length >= 2 && selfInflicted.length >= withRef.length - 1;

  // No defence anywhere near common to them all: that spread is itself the
  // point — every candidate gives Black a different way through, and the key
  // is the one move that gives none. Unless the self-inflicted sentence is
  // about to say something sharper about the same spread: two meta-sentences
  // in a row on the same fact is one too many.
  if (!related && !willTellSelfInflicted
      && withRef.length === tries.length && refGroups.length >= 3
      && (!dominant || dominant.items.length < tries.length / 2)) {
    const answers = count(refGroups.length);
    sentences.push(answers
      ? `No one defence covers them all: Black has ${answers} separate answers.`
      : 'No one defence covers them all.');
    related = true;
  }

  if (willTellSelfInflicted) {
    sentences.push(selfInflicted.length === withRef.length
      ? 'Not one of these defences exists in the diagram: every try opens the door that refutes it.'
      : 'Nearly every one of these defences is a move the try itself lets in.');
    related = true;
  }

  const paragraphs: CommentarySpan[][] = [];
  if (sentences.length) paragraphs.push([{ text: sentences.join(' ') }]);

  // ── 3. The key ──
  // One colon, one list. The moves that broke the tries come first in it,
  // because they are the ones the reader last saw winning; the rest of the
  // key's play follows, with nothing repeated between them.
  const keyPiece = pieceOf(key.moveSan);
  // "The one square that holds" claims the piece was never in question and
  // the square was: every try moves the key's own piece, and every candidate
  // square is distinct. Half-the-tries was loose enough to call f5 "the one
  // square" on a problem whose three candidates all went to f5 (D96913).
  const keyDests = [...tries.map(t => destSquare(t.san)), destSquare(key.moveSan)];
  const keyIsTheSquare = !plan && domRef === null
    && tries.every(t => pieceOf(t.san) === keyPiece)
    && keyDests.every(Boolean) && new Set(keyDests).size === keyDests.length;

  const keyPara: CommentarySpan[] = [];
  keyPara.push({ text: keyIsTheSquare ? 'The one square that holds is ' : 'The answer is ' });
  keyPara.push({ text: write([key], '!'), strong: true });
  if (keyThreats.length > 0) {
    keyPara.push({ text: ', threatening ' });
    keyPara.push({ text: mateList(keyThreats), strong: true });
    if (sharedEcho) keyPara.push({ text: ', the mate the tries were all after' });
    else if (echoNames.length > 1) keyPara.push({ text: `, the very mate those tries (${joinAnd(echoNames)}) went for` });
    else if (echoNames.length === 1) keyPara.push({ text: `, the very mate ${echoNames[0]} went for` });
    else if (echoTry && echoNarrated) keyPara.push({ text: `, exactly what ${echoTry.self} was after` });
  }

  const keyMoves = blackMoves(initialFen, key.moveSan);
  const givesNothing = selfInflicted.length >= 2 && diagramMoves && keyMoves
    && keyMoves.every(m => diagramMoves.some(d => bare(d) === bare(m)));
  if (givesNothing) {
    keyPara.push({
      text: keyIsTheSquare
        ? ', handing Black nothing new'
        : ', the one move that hands Black nothing new',
    });
    related = true;
  }

  // ── The derivation: put the key to the test every try failed ──
  // The tries were each sunk by a named move, so the key is not merely
  // announced with its own variations — each refutation the card named is
  // played against it on the board and its fate reported: it runs into a
  // quoted mate, it fails to stop the threat, or it can no longer be played
  // at all. The key's own play stays in "Key variations" below; the mate
  // quoted against a surviving refutation prefers the one printed there, so
  // the prose and the list agree. If the board cannot confirm every fate,
  // the whole test is withheld rather than half-claimed.
  const keyGroups = matesOf(key, null);
  const publishedMate = (san: string): string | null =>
    keyGroups.find(g => g.defs.some(d => bare(d.moveSan) === bare(san)))?.mate ?? null;
  const threatBare = keyThreatSans.map(bare);
  const refLabel = (san: string) => `1...${san.replace(/[!?]/g, '')}`;
  interface Fate { san: string; kind: 'met' | 'threat' | 'gone'; mate?: string }
  let fates: Fate[] | null = keyMoves ? [] : null;
  if (fates) {
    for (const san of namedRefs) {
      if (!keyMoves!.some(m => bare(m) === bare(san))) {
        fates.push({ san, kind: 'gone' });
        continue;
      }
      const mates = mateAfter(initialFen, key.moveSan, bare(san));
      if (mates.length === 0) { fates = null; break; } // the board denies the claim
      if (keyThreats.length > 0 && mates.some(m => threatBare.includes(bare(m)))) {
        fates.push({ san, kind: 'threat' });
      } else {
        const published = publishedMate(san);
        const mate = published && published.split('/').length <= MATE_CAP
          ? published : `2.${mates[0]}`;
        fates.push({ san, kind: 'met', mate });
      }
    }
  }

  if (fates && fates.length > 0) {
    // One sentence, one meaning. The echo family's refutation completes the
    // key's own sentence — "the very mate those tries went for — and this
    // time 1...Bxe2 runs into 2.Qxe2#" is one story, the way the magazines
    // tell it ("Correct is 1.Sce5!, which brings 1...g4 2.Sc6" — OzProblems).
    // What became of the OTHER refutations is a different statement and gets
    // its own sentence; joining the two by length made one sentence carry
    // two meanings.
    let rest = fates;
    let echoAttached = false;
    if (echoRefSan) {
      const f = fates.find(x => bare(x.san) === bare(echoRefSan!));
      if (f) {
        rest = fates.filter(x => x !== f);
        keyPara.push({ text: ' — and this time ' });
        if (f.kind === 'met') {
          keyPara.push({ text: `${refLabel(f.san)} runs into ` }, { text: f.mate!, strong: true });
        } else if (f.kind === 'threat') {
          keyPara.push({ text: `${refLabel(f.san)} does not stop it` });
        } else {
          keyPara.push({ text: `${refLabel(f.san)} cannot even be played` });
        }
        echoAttached = true;
      }
    }
    keyPara.push({ text: '.' });

    if (rest.length > 0) {
      const met = rest.filter(f => f.kind === 'met');
      const intoThreat = rest.filter(f => f.kind === 'threat');
      const gone = rest.filter(f => f.kind === 'gone');
      keyPara.push({ text: echoAttached
        ? ' The rest of what beat the tries does no better: '
        : ' This time ' });
      if (met.length === 0 && intoThreat.length === 0 && gone.length >= 2) {
        keyPara.push({ text: echoAttached
          ? 'not one of those moves can even be played.'
          : 'not one of the moves that beat the tries can even be played.' });
      } else {
        const clauses: CommentarySpan[][] = [];
        // Refutations sharing one answer are told together ("1...Kd4 and
        // 1...Kd3 run into 2.Ne5#"), the verb elided after the first clause.
        groupBy(met, f => f.mate!).forEach((g, i) => {
          const names = joinAnd(g.items.map(f => refLabel(f.san)));
          const verb = i > 0 ? 'into' : g.items.length > 1 ? 'run into' : 'runs into';
          clauses.push([
            { text: `${names} ${verb} ` },
            { text: g.key, strong: true },
          ]);
        });
        if (intoThreat.length > 0) {
          const names = intoThreat.map(f => refLabel(f.san));
          clauses.push([{
            text: names.length === 1
              ? `${names[0]} does not stop the threat`
              : names.length === 2
                ? `neither ${names[0]} nor ${names[1]} stops the threat`
                : `none of ${joinAnd(names)} stops the threat`,
          }]);
        }
        if (gone.length > 0) {
          const names = gone.map(f => refLabel(f.san));
          clauses.push([{
            text: names.length === 1
              ? `${names[0]} can no longer be played at all`
              : names.length === 2
                ? `neither ${names[0]} nor ${names[1]} can be played at all`
                : `${joinAnd(names)} can no longer be played at all`,
          }]);
        }
        clauses.forEach((clause, i) => {
          if (i > 0) keyPara.push({ text: i === clauses.length - 1 ? ' and ' : ', ' });
          keyPara.push(...clause);
        });
        keyPara.push({ text: '.' });
      }
    }
    related = true;
  } else {
    keyPara.push({ text: '.' });
  }

  paragraphs.push(keyPara);

  // ── 4. Changed mates across the phases ──
  const phases: { label: string; mates: Map<string, string[]> }[] = [];
  const phaseOf = (root: SolutionNode, label: string, skip: string | null) => {
    const mates = new Map<string, string[]>();
    for (const d of branchChildren(root)) {
      if (skip && bare(d.moveSan) === bare(skip)) continue;
      const ms = branchChildren(d).map(withMark);
      if (ms.length) mates.set(d.moveSan, ms);
    }
    if (mates.size) phases.push({ label, mates });
  };
  for (const t of tries) phaseOf(t.root, t.self, t.refKey || null);
  phaseOf(key, write([key], '!'), null);

  if (phases.length >= 3) {
    const defences = new Set<string>();
    for (const p of phases) for (const d of p.mates.keys()) defences.add(d);
    for (const defence of defences) {
      const seen = phases.filter(p => p.mates.has(defence));
      if (seen.length < 3 || seen.length > 4) continue;
      const sets = seen.map(p => p.mates.get(defence)!);
      // A mate shared between two phases is not a changed mate. The sets have
      // to be disjoint, or the sentence claims an exchange the data denies.
      const disjoint = sets.every((s, i) => sets.every((o, j) =>
        i === j || s.every(m => !o.includes(m))));
      if (!disjoint) continue;
      const word = Count(seen.length);
      if (!word) continue;
      paragraphs.push([{
        text: `Across the phases 1...${defence} is answered ${count(seen.length)} different ways — `
          + `${joinAnd(sets.map(s => mateList(s.map(m => `2.${m}`))))} — changed mates.`,
      }]);
      related = true;
      break;
    }
  }

  const written = paragraphs.flat().map(s => s.text).join('');
  if (written.length < 80) return null;
  // Nothing relational to say: the Tries list below already enumerates them,
  // and an enumeration dressed as prose is worse than no card.
  if (!related) return null;
  // See marksMates: where the source is short of mate marks they come off the
  // whole card, rather than half of them being supplied by chess.js.
  return {
    paragraphs: marked ? paragraphs
      : paragraphs.map(p => p.map(span => ({ ...span, text: span.text.replace(/#/g, '') }))),
  };
}
