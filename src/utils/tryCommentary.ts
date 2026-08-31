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
 *  same material in full. */
const QUOTE_CAP = 6;
/** And how many moves one pair may name on either side of it. */
const SLASH_CAP = 4;
const MATE_CAP = 3;

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
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

  return { tries, key };
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
    const ms = branchChildren(d);
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
 *  row rather than a clause; `dropped` says whether any were left out, so a
 *  phase that cannot be quoted whole is not quoted at all. */
function matePairs(root: SolutionNode, skip: string | string[] | null): { pairs: string[]; dropped: boolean } {
  const groups = matesOf(root, skip);
  const allDefs = groups.flatMap(g => g.defs);
  const pairs: string[] = [];
  let dropped = false;
  for (const g of groups) {
    const defs = nameDefences(g.defs, allDefs, d => write([root, d]));
    const names = defs.startsWith('any ') ? 1 : defs.split('/').length;
    if (names > SLASH_CAP || g.mate.split('/').length > MATE_CAP) { dropped = true; continue; }
    pairs.push(`${defs} ${g.mate}`);
  }
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

export function buildTryCommentary(fullNodes: SolutionNode[], initialFen: string): TryCommentary | null {
  const { tries, key } = collect(fullNodes);
  if (tries.length < 2 || !key) return null;

  const withThreat = tries.filter(t => t.threats.length > 0);
  const withRef = tries.filter(t => t.refutation);
  if (withThreat.length < 2 && withRef.length !== tries.length) return null;

  const refGroups = groupBy(withRef, t => t.refKey).sort((a, b) => b.items.length - a.items.length);
  const dominant = refGroups[0] && refGroups[0].items.length >= 2 ? refGroups[0] : null;
  const domRef = dominant?.items[0].refutation ?? null;
  const domTries = dominant ? dominant.items : [];

  const keyThreats = threatChildren(key).map(t => writeThreat(key, t));
  const keyThreatSans = threatChildren(key).map(t => t.moveSan);
  const marked = marksMates(fullNodes);

  const sentences: string[] = [];
  // Whether anything RELATIONAL got said. A card that can only enumerate the
  // tries has nothing the Tries list below does not already have, and is
  // withheld: for those problems the honest output is no card at all.
  let related = false;
  /** The tries all fell to king flights: the key paragraph says so in words. */
  let flightDefence = false;

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
    }
  }

  // ── 1. The opening: what the position is, or what White is after ──
  // Never a move number, never the word "try": the reader has to know the idea
  // before being told it fails.
  // A set defence the source wrote twice — "1...c5 2.g3#/g4#" arrives as two
  // roots — carries one mate each time; collect them onto the defence first or
  // the same move is printed twice with a mate apiece.
  const setByDefence = new Map<string, { node: SolutionNode; mates: string[] }>();
  for (const r of kind.setRoots) {
    const entry = setByDefence.get(r.moveSan) ?? { node: r, mates: [] };
    for (const c of branchChildren(r)) {
      const label = write([r, c]);
      if (!entry.mates.includes(label)) entry.mates.push(label);
    }
    setByDefence.set(r.moveSan, entry);
  }
  const setRootsOnce = [...setByDefence.values()].map(e => e.node);
  const setPairs = groupBy([...setByDefence.values()], e => mateList(e.mates))
    .filter(g => g.items.length <= 6)
    .slice(0, 2)
    .map(g => `${nameDefences(g.items.map(e => e.node), setRootsOnce, r => write([r]))} ${g.key}`)
    .filter(pair => {
      const [defs] = pair.split(' 2.');
      return (defs.startsWith('any ') || defs.split('/').length <= SLASH_CAP)
        && pair.split('/').length - defs.split('/').length + 1 <= MATE_CAP;
    });

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

  let framed = false;
  if (kind.completeBlock) {
    sentences.push(setChanged
      ? 'Every black move is already provided with a set mate, so the position is a complete block — but no waiting move keeps them all, and the key rebuilds some of them: a mutate.'
      : 'Every black move is already provided with a set mate, so the position is a complete block: all the key has to do is leave them standing.');
    related = true;
    framed = true;
  } else if (!kind.hasThreat && kind.setDefences.size > 0) {
    if (allFlights) {
      sentences.push(`There is no threat: the key is a waiting move, and the black king's flights — ${joinAnd(flights)} — are the whole of the defence.`);
      flightDefence = true;
      related = true;
    } else {
      sentences.push(kind.zugzwang
        ? 'There is no threat: Black is in zugzwang, and White needs a move that leaves every answer in place.'
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
    const piece = byPiece[0].items.length > tries.length / 2
      && byPiece[0].key === pieceOf(key.moveSan) ? PIECE_NAME[byPiece[0].key] : null;
    if (sharedThreat) {
      sentences.push(`White would like ${sharedThreat}.`);
      related = true;
    } else if (setPairs.length) {
      sentences.push(`Set play is in place — ${joinAnd(setPairs)}.`);
    } else if (piece) {
      sentences.push(`Where to put the ${piece} is the whole of the problem.`);
    } else if (!kind.hasThreat) {
      sentences.push('There is no threat to be had here: White is hunting for a waiting move that leaves every answer in place.');
    } else if (withThreat.length === tries.length && byPiece.length === 1) {
      sentences.push(`The ${PIECE_NAME[byPiece[0].key]} has a threat from more than one square.`);
    } else {
      sentences.push('What White needs is a threat Black cannot answer.');
    }
    framed = true;
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
  const classifyRefutations = (pool: TryInfo[], lead: string, showAims: boolean): string | null => {
    const groups = groupBy(pool.filter(t => t.refutation), t => t.refKey)
      .sort((a, b) => b.items.length - a.items.length);
    if (!groups.length) return null;
    // Moves that shared a threat are listed together with the aim written once,
    // and the aim goes immediately after its own run. The runs that have no
    // threat go last, so no bracket can be read as covering a move that never
    // carried it.
    const named = (items: TryInfo[]) => {
      const subs = showAims ? groupBy(items, t => t.threatKey) : [{ key: '', items }];
      const aimed = subs.filter(g => showAims && g.items[0].threats.length > 0);
      const plain = subs.filter(g => !(showAims && g.items[0].threats.length > 0)).flatMap(g => g.items);
      if (aimed.length === 0) return joinAnd(plain.map(t => t.self));
      if (aimed.length === 1 && plain.length === 0) {
        return `${joinAnd(aimed[0].items.map(t => t.self))} (${mateList(aimed[0].items[0].threats)})`;
      }
      return joinAnd([
        ...aimed.map(g => `${g.items.map(t => t.self).join(', ')} (${mateList(g.items[0].threats)})`),
        ...plain.map(t => t.self),
      ]);
    };
    if (groups.length === 1 && groups[0].items.length === 1) {
      const t = groups[0].items[0];
      const aim = showAims && t.threats.length ? ` (${mateList(t.threats)})` : '';
      return `Against ${t.self}${aim} Black has ${t.refutation}.`;
    }
    const shown: typeof groups = [];
    let total = 0;
    for (const g of groups) {
      if (shown.length >= 4 || (shown.length > 0 && total + g.items.length > 10)) break;
      shown.push(g);
      total += g.items.length;
    }
    // Semicolons between the groups, so the "to 1...Ke7!" that closes each one
    // cannot be read as belonging to the next group's moves.
    return `${lead} ${shown.map(g => `${named(g.items)} to ${g.items[0].refutation}`).join('; ')}.`;
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
        sentences.push(`Every move that goes for it falls to ${domRef}.`);
      } else {
        const s = classifyRefutations(tries, 'Black has an answer to each:', false);
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
          sentences.push(domRef
            ? `${lead} — ${joinAnd(clauses)} — and ${pi === 0 ? 'every one of them dies to' : 'again'} ${domRef}.`
            : `${lead} — ${joinAnd(clauses)}.`);
        });
      }

      if (runB.length > 0) {
        const names = joinAnd(runB.flatMap(g => g.items.map(t => t.self)));
        const aims = joinAnd([...new Set(runB.map(g => mateList(g.items[0].threats)))]);
        const many = runB.reduce((n, g) => n + g.items.length, 0) > 1;
        sentences.push(domRef
          ? `Aiming elsewhere, ${names} ${many ? 'threaten' : 'threatens'} ${aims} — and again ${domRef}.`
          : `Aiming elsewhere, ${names} ${many ? 'threaten' : 'threatens'} ${aims}.`);
      }

      if (echoTry) {
        const group = domTries.filter(t => t.threatKey === echoTry.threatKey);
        const names = joinAnd(group.map(t => t.self));
        const verb = group.length > 1 ? 'threaten' : 'threatens';
        sentences.push(echoTry.refutation
          ? `Then ${names} ${verb} ${mateList(echoTry.threats)}, the mate the key itself makes — yet ${echoTry.refutation} answers them too.`
          : `Then ${names} ${verb} ${mateList(echoTry.threats)}, the mate the key itself makes.`);
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
        sentences.push(`The waiting move${many ? 's' : ''} ${joinAnd(domWaiters.map(t => t.self))} `
          + `${many ? 'carry' : 'carries'} no threat at all`
          + (domRef ? `, and ${domRef} answers ${many ? 'them' : 'it'} too.` : '.'));
      }

      const rest = tries.filter(t => !domTries.includes(t)
        || (bare0.includes(t) && !domWaiters.includes(t)));
      const s = classifyRefutations(rest, 'The rest are answered elsewhere:', true);
      if (s) sentences.push(s);
    }
  } else {
    // A phase with fourteen defence-and-mate pairs in it is a data dump, and
    // the "Key variations" and "Tries" sections below print them in full
    // anyway; those tries are classified by their refutation instead.
    const full = [...tries]
      .map(t => ({ t, groups: matesOf(t.root, t.refKey || null), quoted: matePairs(t.root, t.refKey || null) }))
      .filter(x => x.groups.length >= 2 && x.groups.length <= QUOTE_CAP && !x.quoted.dropped)
      .sort((a, b) => b.groups.length - a.groups.length)
      .slice(0, 2);
    const narrated = new Set(full.map(x => x.t));

    const mateSetOf = (x: { groups: { mate: string; defs: SolutionNode[] }[] }) =>
      x.groups.map(g => g.mate).sort().join('|');
    full.forEach((x, i) => {
      const t = x.t;
      const pairs = joinAnd(x.quoted.pairs);
      // "the same defences are met differently" has to be true: when the
      // second try answers the same defences the same way there is no
      // exchange, and claiming one is the sort of thing the data can flatly
      // contradict.
      const exchanged = i > 0 && mateSetOf(x) !== mateSetOf(full[0]);
      if (exchanged) related = true;
      const aim = t.threats.length ? ` (${mateList(t.threats)})` : '';
      // "waits" is a claim about the board, not about what the source wrote
      // under the move: 1.Qc7+ with no threat printed still forces a reply, and
      // a move with an unwritten threat is not a waiting move either.
      const waits = t.threats.length === 0 && !t.san.includes('+')
        && threatOnBoard(initialFen, t.san) === false;
      const opening = exchanged
        ? `After ${t.self}${aim} the same defences get changed mates: ${pairs}`
        : t.threats.length
          ? `White ${i === 0 ? 'can start with' : 'might instead play'} ${t.self}, threatening ${mateList(t.threats)}, with ${pairs}`
          : i > 0
            ? `After ${t.self} the same mates are still there: ${pairs}`
            : waits
              ? `White can wait with ${t.self} — ${pairs}`
              : `White has an answer to everything after ${t.self} — ${pairs}`;
      sentences.push(t.refutation
        ? `${opening} — but has no reply to ${t.refutation}.`
        : `${opening}.`);
    });

    const s = classifyRefutations(
      tries.filter(t => !narrated.has(t)),
      narrated.size ? 'Black has an answer to the others too:' : 'Black has an answer to each:',
      true);
    if (s) sentences.push(s);
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

  // No defence anywhere near common to them all: that spread is itself the
  // point — every candidate gives Black a different way through, and the key
  // is the one move that gives none.
  if (!related && withRef.length === tries.length && refGroups.length >= 3
      && (!dominant || dominant.items.length < tries.length / 2)) {
    const answers = count(refGroups.length);
    sentences.push(answers
      ? `No one defence covers them all: Black has ${answers} separate answers.`
      : 'No one defence covers them all.');
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
  if (selfInflicted.length >= 2 && selfInflicted.length >= withRef.length - 1) {
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
  const triesSamePiece = tries.filter(t => pieceOf(t.san) === keyPiece).length;
  const keyIsTheSquare = !plan && triesSamePiece >= tries.length / 2 && domRef === null;

  const keyPara: CommentarySpan[] = [];
  keyPara.push({ text: keyIsTheSquare ? 'The one square that holds is ' : 'The answer is ' });
  keyPara.push({ text: write([key], '!'), strong: true });
  if (keyThreats.length > 0) {
    keyPara.push({ text: ', threatening ' });
    keyPara.push({ text: mateList(keyThreats), strong: true });
    if (sharedEcho) keyPara.push({ text: ', the mate the tries were all after' });
    else if (echoTry) keyPara.push({ text: `, exactly what ${echoTry.self} was after` });
  }

  // The key's own play, collapsed exactly as the tries' was. Knowing which
  // defences this list already covers — "any knight move" covers the knight's
  // lot — is what keeps the refutations from being answered twice over.
  const keyGroups = matesOf(key, null);
  const keyAllDefs = keyGroups.flatMap(g => g.defs);
  const keyNamed = keyGroups.map(g => ({
    label: nameDefences(g.defs, keyAllDefs, d => write([key, d])),
    mate: g.mate,
    piece: pieceOf(g.defs[0].moveSan),
  }));
  const keyDefSans = new Set(keyAllDefs.map(d => bare(d.moveSan)));
  const keyAnyPieces = new Set(keyNamed.filter(g => g.label.startsWith('any ')).map(g => g.piece));
  const keyCovers = (san: string) => keyDefSans.has(bare(san)) || keyAnyPieces.has(pieceOf(san));
  const keyPairs = keyNamed
    .filter(g => (g.label.startsWith('any ') || g.label.split('/').length <= SLASH_CAP)
      && g.mate.split('/').length <= MATE_CAP)
    .map(g => `${g.label} ${g.mate}`);

  const refAnswers = refGroups
    .map(g => ({ san: g.key, mates: mateAfter(initialFen, key.moveSan, g.key) }))
    .filter(x => x.mates.length > 0)
    .slice(0, 4);
  const unanswered = refAnswers.filter(x => !keyCovers(x.san));
  const pairOf = (x: { san: string; mates: string[] }) =>
    `1...${x.san} ${mateList(x.mates.map(m => `2.${m}`))}`;

  const keyMoves = blackMoves(initialFen, key.moveSan);
  const givesNothing = selfInflicted.length >= 2 && diagramMoves && keyMoves
    && keyMoves.every(m => diagramMoves.some(d => bare(d) === bare(m)));
  // Only the refutations Black can still play need answering — a move the try
  // itself let in is not owed an answer by the key. So the claim "what beat
  // the tries is answered now" is made against this list, not against all of
  // them, and when the list is empty the fact is the other way round.
  const refSans = [...new Set(withRef.map(t => t.refKey))];
  const survives = (s: string) => !!keyMoves && keyMoves.some(m => bare(m) === bare(s));
  const needAnswer = refSans.filter(survives);
  const allGone = !!keyMoves && refSans.length >= 2 && needAnswer.length === 0;
  const allAnswered = needAnswer.length > 0
    && needAnswer.every(s => keyCovers(s) || refAnswers.some(x => bare(x.san) === bare(s)));
  const threatBare = keyThreatSans.map(bare);
  const allByThreat = threatBare.length > 0 && refAnswers.length > 1
    && unanswered.length === refAnswers.length
    && refAnswers.every(x => x.mates.some(m => threatBare.includes(bare(m))));
  // "the tries" has already been named once in this sentence when the key's
  // threat was theirs; saying it again in the next clause reads as a stutter.
  const them = sharedEcho || echoTry ? 'them' : 'the tries';

  let connective = '';
  let pairs: string[] = [];
  if (refAnswers.length > 0) related = true;
  if (givesNothing) {
    connective = keyIsTheSquare
      ? ', handing Black nothing he did not already have'
      : ', the one move that hands Black nothing he did not already have';
    pairs = unanswered.map(pairOf);
    related = true;
  } else if (allByThreat) {
    // Naming the refutations and then listing them against the same mate says
    // one thing twice, so the list here is the key's other play only.
    connective = `, and ${joinAnd(refAnswers.map(x => `1...${x.san}`))} no longer stop it`;
  } else if (unanswered.length > 0 && allAnswered) {
    // The key answering the very moves that broke the tries IS the connection
    // between them; a two-try problem often has nothing else to offer, and
    // withholding the card there loses the one thing worth saying.
    connective = `, and what beat ${them} it answers now`;
    pairs = unanswered.map(pairOf);
  } else if (unanswered.length > 0) {
    // Some of them answered, not all: the pairs say which, and the prose does
    // not claim more than the pairs.
    connective = ', and it has an answer ready';
    pairs = unanswered.map(pairOf);
  } else if (allAnswered && refAnswers.length > 0) {
    // Answered, but in the key's own published play — so the pairs are already
    // in the list below and only the relation needs saying.
    connective = `, and this time there is an answer to everything that beat ${them}`;
  } else if (allGone) {
    connective = `, and not one of the moves that beat ${them} is available any more`;
    related = true;
  } else if (flightDefence) {
    connective = ', and now there is an answer wherever the king runs';
  } else if (domRef) {
    connective = ', and this time nothing is missing';
  }
  // Same cap as the tries: what is not quoted here is in "Key variations"
  // below, in full and clickable.
  pairs = [...pairs, ...keyPairs].slice(0, QUOTE_CAP);

  if (pairs.length) {
    keyPara.push({ text: `${connective}: ` });
    keyPara.push({ text: joinAnd(pairs), strong: true });
  } else if (connective) {
    keyPara.push({ text: connective });
  }
  keyPara.push({ text: '.' });
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
