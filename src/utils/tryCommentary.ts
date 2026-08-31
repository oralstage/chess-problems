import type { SolutionNode } from '../types';

/* Post-solve commentary on how the key is found.
 *
 * A composer's argument is carried by the tries: this move threatens that
 * mate, Black has this one answer, and the key is the move that survives it.
 * All of it is in the solution tree already — the tries, what each threatens,
 * the defence that refutes it, and what the key plays against that same
 * defence. What is NOT in the data is WHY a refutation works, so nothing here
 * ever claims a reason; every sentence is a restatement of the moves.
 *
 * The shape follows how problem magazines actually set this. From OzProblems,
 * on a mutate whose pawn delivers four mates:
 *
 *   The key **1.Qa1!** (waiting) creates a battery with the b2-pawn, which
 *   then performs four mating moves in distinct variations – the maximum task
 *   for a pawn. **1...Ba3 2.bxa3**, **1...Bc3 2.bxc3**, **1...Bxa5 2.b4**, and
 *   **1...Bxd2 2.b3**. … In the set play, 1...Bb~ allows the queen to guard c4
 *   and enables 2.Sb3.
 *
 * Five rules come straight off that page:
 *
 *   - A prose sentence carries the point; the moves then follow as bare pairs,
 *     comma-separated, with no "is met by" between every one of them. Wrapping
 *     twenty moves in English connectives turns an argument into a wall.
 *   - Bold marks the key and the listed pairs. A move sitting inside a prose
 *     clause ("1...Bb~ allows the queen to guard c4") stays plain, so the bold
 *     reads as "this is a list entry", not as "this is a move".
 *   - Move numbers are always written, but only on the first of a slash group:
 *     "1...Bf7/Bh7 2.Kf7".
 *   - "!" belongs to the key alone. A paragraph sprinkled with "!" and "?"
 *     loses its sentence boundaries, since both read as full stops.
 *   - Counts are spelled out ("four mating moves"): a numeral standing next to
 *     notation reads as part of it.
 */

/** A move the reader can click: how to write it, plus the path that replays it. */
export interface CommentaryMove {
  /** "2." or "1..." — drawn quiet, before the move. Empty on the tail of a
   *  slash group, which shares the number of the move it follows. */
  num: string;
  /** "!" on the key. Empty everywhere else. */
  marker: string;
  /** Bold: the key, and entries of a listed pair. Plain inside a prose clause. */
  strong: boolean;
  node: SolutionNode;
  path: SolutionNode[];
}

export type CommentaryPart = string | CommentaryMove;

export interface TryCommentary {
  /** One paragraph per beat of the argument: what the tries were after, how
   *  they fell, what the key does about it. Once the moves are this dense the
   *  paragraph breaks are what keep the sentence boundaries visible. */
  paragraphs: CommentaryPart[][];
}

const branchChildren = (node: SolutionNode) => node.children.filter(c => !c.isThreat);
const threatChildren = (node: SolutionNode) => node.children.filter(c => c.isThreat);

/** Same numbering the variation display uses: white moves carry the count. */
function moveNumber(path: SolutionNode[]): number {
  const whites = path.filter(n => n.color === 'w').length;
  return path[0]?.color === 'b' ? whites + 1 : whites;
}

function ref(
  path: SolutionNode[],
  opts: { strong?: boolean; marker?: string; num?: boolean } = {},
): CommentaryMove {
  const node = path[path.length - 1];
  const n = moveNumber(path);
  return {
    num: opts.num === false ? '' : node.color === 'w' ? `${n}.` : `${n}...`,
    marker: opts.marker ?? '',
    strong: opts.strong ?? false,
    node,
    path,
  };
}

const bold = (m: CommentaryMove): CommentaryMove => ({ ...m, strong: true });
const plain = (m: CommentaryMove): CommentaryMove => ({ ...m, strong: false });
const unnumbered = (m: CommentaryMove): CommentaryMove => ({ ...m, num: '' });

/** Numerals read as notation next to notation, so counts are spelled out. */
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen'];
const count = (n: number) => WORDS[n] ?? String(n);
const Count = (n: number) => { const w = count(n); return w[0].toUpperCase() + w.slice(1); };

/** "a", "a and b", "a, b and c" — moves inside a prose sentence. */
function joinAnd(moves: CommentaryMove[]): CommentaryPart[] {
  const parts: CommentaryPart[] = [];
  moves.forEach((m, i) => {
    if (i > 0) parts.push(i === moves.length - 1 ? ' and ' : ', ');
    parts.push(m);
  });
  return parts;
}

/** "1...Bf7/Bh7" — alternatives sharing a continuation, numbered once. */
function joinSlash(moves: CommentaryMove[]): CommentaryPart[] {
  const parts: CommentaryPart[] = [];
  moves.forEach((m, i) => {
    if (i > 0) parts.push('/');
    parts.push(i === 0 ? m : unnumbered(m));
  });
  return parts;
}

interface TryInfo {
  root: SolutionNode;
  self: CommentaryMove;
  /** What it threatens; empty for a waiting move. */
  threats: CommentaryMove[];
  /** The defence that breaks it, absent when the source never names one. */
  refutation: CommentaryMove | null;
  threatKey: string;
  refKey: string;
}

function collectTries(fullNodes: SolutionNode[]): { tries: TryInfo[]; key: SolutionNode | null } {
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
    let refutation: CommentaryMove | null = null;
    if (child) refutation = ref([root, child]);
    else if (next && next.isKey && !next.isTry && next.color !== root.color) {
      refutation = ref([root, next]);
    }

    const threats = threatChildren(root).map(t => ref([root, t]));
    tries.push({
      root,
      self: ref([root]),
      threats,
      refutation,
      threatKey: threats.map(t => t.node.moveSan).join('/'),
      refKey: refutation ? refutation.node.moveSan : '',
    });
  }

  return { tries, key };
}

/** Group in first-appearance order, preserving it. */
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

export function buildTryCommentary(fullNodes: SolutionNode[]): TryCommentary | null {
  const { tries, key } = collectTries(fullNodes);
  if (tries.length < 2) return null;

  const withThreat = tries.filter(t => t.threats.length > 0);
  const waiters = tries.filter(t => t.threats.length === 0);
  const withRef = tries.filter(t => t.refutation);

  // The defence that answers the most tries — what the whole card turns on.
  const refGroups = groupBy(withRef, t => t.refKey).sort((a, b) => b.items.length - a.items.length);
  const dominant = refGroups[0] && refGroups[0].items.length >= 2 ? refGroups[0] : null;

  // Enough to say something: either the tries state their aims, or the source
  // names what refutes them. A zugzwang problem qualifies on the second count.
  if (withThreat.length < 2 && !dominant && withRef.length !== tries.length) return null;

  const paragraphs: CommentaryPart[][] = [];

  // ── What the tries were after ──
  const aims: CommentaryPart[] = [];
  if (withThreat.length > 0) {
    const groups = groupBy(withThreat, t => t.threatKey);
    if (dominant) {
      // The odd try out reads better last, once the shared defence is named.
      const shared = (g: { items: TryInfo[] }) => (g.items.some(t => t.refKey === dominant.key) ? 0 : 1);
      groups.sort((a, b) => shared(a) - shared(b));
    }
    aims.push(
      withThreat.length === tries.length
        ? withThreat.length === 2
          ? 'Both tries state an aim of their own. '
          : `${Count(withThreat.length)} tries each state an aim of their own. `
        : withThreat.length === 1
          ? 'Only one of the tries states an aim. '
          : `${Count(withThreat.length)} of the tries state an aim. `,
    );
    groups.forEach((g, gi) => {
      if (gi > 0) aims.push(gi === groups.length - 1 ? ', and ' : ', ');
      aims.push(...joinSlash(g.items.map(t => bold(t.self))));
      aims.push(' ');
      aims.push(...joinSlash(g.items[0].threats.map(bold)));
    });
    aims.push('. ');
  }
  if (waiters.length === tries.length) {
    aims.push('None of the tries carries a threat — each one simply hands Black the move. ');
  } else if (waiters.length > 0) {
    aims.push(`${Count(waiters.length)} more carry no threat and simply hand Black the move. `);
  }
  if (aims.length) paragraphs.push(aims);

  // ── How they fell ──
  const fell: CommentaryPart[] = [];
  const exceptions = refGroups.slice(1);
  if (dominant && dominant.items.length === tries.length) {
    fell.push('Every one of them falls to ');
    fell.push(plain(dominant.items[0].refutation!));
    fell.push('. ');
  } else if (dominant && dominant.items.length >= tries.length - 2 && exceptions.length > 0) {
    fell.push('Every one of them falls to ');
    fell.push(plain(dominant.items[0].refutation!));
    fell.push(' — all but ');
    exceptions.forEach((g, gi) => {
      if (gi > 0) fell.push(' and ');
      fell.push(...joinSlash(g.items.map(t => plain(t.self))));
      fell.push(g.items.length > 1 ? ', which are answered by ' : ', which is answered by ');
      fell.push(plain(g.items[0].refutation!));
    });
    fell.push('. ');
  } else if (refGroups.length > 0 && refGroups.length <= 3) {
    fell.push('Black has an answer to each. ');
    refGroups.forEach((g, gi) => {
      if (gi > 0) fell.push(gi === refGroups.length - 1 ? ', and ' : ', ');
      fell.push(...joinSlash(g.items.map(t => bold(t.self))));
      fell.push(' ');
      fell.push(bold(g.items[0].refutation!));
    });
    fell.push('. ');
  } else if (refGroups.length > 3) {
    // Pairing every try with its refutation past three groups is a wall of
    // moves; naming the defences is the readable half of that sentence.
    fell.push('Black answers each of them, and never the same way twice: ');
    // The number goes on the first only: they are all Black's first move, and
    // five copies of "1..." in one clause is noise, not information.
    fell.push(...joinAnd(refGroups.map((g, gi) => {
      const m = plain(g.items[0].refutation!);
      return gi === 0 ? m : unnumbered(m);
    })));
    fell.push('. ');
  }
  if (fell.length) paragraphs.push(fell);

  // ── The key ──
  if (key) {
    const para: CommentaryPart[] = ['The key is '];
    para.push(ref([key], { strong: true, marker: '!' }));
    const keyThreats = threatChildren(key).map(t => ref([key, t]));
    if (keyThreats.length > 0) {
      para.push(', threatening ');
      para.push(...joinSlash(keyThreats.map(plain)));

      // The same mate a try was after, now carried by the key: the point of
      // the whole set, and a plain string comparison finds it.
      const echo = withThreat.find(t => t.threats.some(x => keyThreats.some(k => k.node.moveSan === x.node.moveSan)));
      if (echo) {
        para.push(' — the very move ');
        para.push(plain(echo.self));
        para.push(' was after');
      }
    }
    para.push('. ');

    if (dominant) {
      const defended = dominant.items[0].refutation!.node.moveSan;
      const defence = branchChildren(key).find(d => d.moveSan === defended);
      const mates = defence ? branchChildren(defence).map(m => ref([key, defence, m])) : [];
      if (defence && mates.length > 0) {
        para.push('This time it holds. ');
        para.push(bold(ref([key, defence])));
        para.push(' ');
        para.push(...joinSlash(mates.map(bold)));
        para.push('. ');
      }
    }
    paragraphs.push(para);
  }

  // ── The same defence answered differently in each phase ──
  const phases: { phase: CommentaryMove; mates: Map<string, CommentaryMove[]> }[] = [];
  const phaseOf = (root: SolutionNode, self: CommentaryMove, skip: string | null) => {
    const mates = new Map<string, CommentaryMove[]>();
    for (const d of branchChildren(root)) {
      if (skip && d.moveSan === skip) continue;
      const ms = branchChildren(d).map(m => ref([root, d, m]));
      if (ms.length) mates.set(d.moveSan, ms);
    }
    if (mates.size) phases.push({ phase: self, mates });
  };
  for (const t of tries) phaseOf(t.root, t.self, t.refutation ? t.refutation.node.moveSan : null);
  if (key) phaseOf(key, ref([key]), null);

  if (phases.length >= 3) {
    const defences = new Set<string>();
    for (const p of phases) for (const d of p.mates.keys()) defences.add(d);
    for (const defence of defences) {
      const seen = phases
        .filter(p => p.mates.has(defence))
        .map(p => ({ phase: p.phase, mates: p.mates.get(defence)! }));
      // Every listed mate has to be distinct: with one repeated across phases
      // the sentence would claim a change that is not there.
      const keys = seen.map(s => s.mates.map(m => m.node.moveSan).join('/'));
      if (new Set(keys).size !== keys.length || seen.length < 3 || seen.length > 6) continue;

      const para: CommentaryPart[] = [
        `The same defence is mated a different way in ${count(seen.length)} phases. After `,
      ];
      para.push(`${defence}: `);
      seen.forEach((s, i) => {
        if (i > 0) para.push(i === seen.length - 1 ? ', and ' : ', ');
        para.push(bold(s.phase));
        para.push(' ');
        para.push(...joinSlash(s.mates.map(bold)));
      });
      para.push('. ');
      paragraphs.push(para);
      break;
    }
  }

  const moves = paragraphs.flat().filter(p => typeof p !== 'string').length;
  if (moves < 3) return null;
  return { paragraphs };
}
