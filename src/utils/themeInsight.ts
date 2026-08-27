import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import type { SolutionNode } from '../types';

/* Post-solve theme appreciation. A YACPDB keyword is only the trigger: a card
   appears when the claim is verified — on the line the solver actually played
   (switchback, battery, cross-check, model/ideal mate), or on the solution
   tree replayed with chess.js (Grimshaw, Novotny, AUW). A tag we cannot
   locate on the board simply shows no card rather than a vague one. */

/** Subset of CSS a mark may carry — assignable to React.CSSProperties. */
export interface MarkStyle {
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundRepeat?: string;
  backgroundPosition?: string;
  backgroundSize?: string;
}

export interface ThemeInsight {
  theme: string;
  title: string;
  text: string;
  /** Mini-board position; absent for text-only cards. */
  fen?: string;
  marks?: Record<string, MarkStyle>;
  /** Move arrows drawn over the mini board (from-square → to-square). */
  arrows?: { from: string; to: string }[];
}

/** One step of the line the solver saw — App passes playback positions. */
export interface LinePosition {
  fen: string;
  lastMove: { from: string; to: string } | null;
  san: string;
}

const AMBER = { backgroundColor: 'rgba(255, 176, 32, 0.55)' };
const BLUE = { backgroundColor: 'rgba(59, 130, 246, 0.4)' };

const FILES = 'abcdefgh';

const PIECE_NAME: Record<string, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

function adjacentSquares(sq: string): string[] {
  const f = FILES.indexOf(sq[0]);
  const r = Number(sq[1]);
  const out: string[] = [];
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const nf = f + df, nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 1 && nr <= 8) out.push(FILES[nf] + nr);
    }
  }
  return out;
}

/** Squares strictly between two squares on a shared rank, file or diagonal. */
function betweenSquares(a: string, b: string): string[] {
  const df = FILES.indexOf(b[0]) - FILES.indexOf(a[0]);
  const dr = Number(b[1]) - Number(a[1]);
  if (df !== 0 && dr !== 0 && Math.abs(df) !== Math.abs(dr)) return [];
  const steps = Math.max(Math.abs(df), Math.abs(dr));
  const sf = Math.sign(df), sr = Math.sign(dr);
  const out: string[] = [];
  for (let i = 1; i < steps; i++) {
    out.push(FILES[FILES.indexOf(a[0]) + sf * i] + (Number(a[1]) + sr * i));
  }
  return out;
}

function findKing(chess: Chess, color: 'w' | 'b'): string | null {
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.type === 'k' && cell.color === color) return cell.square;
    }
  }
  return null;
}

function safeChess(fen: string): Chess | null {
  try { return new Chess(fen); } catch { return null; }
}

/** Play one solution node on a clone; null when the node has no playable UCI. */
function execNode(chess: Chess, node: SolutionNode): boolean {
  const uci = node.moveUci || '';
  try {
    if (uci.startsWith('san:')) return !!chess.move(uci.slice(4));
    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
      return !!chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    }
  } catch { return false; }
  return false;
}

/* ── Model / Ideal mate ──────────────────────────────────────────────── */

interface MateEconomy {
  matedColor: 'w' | 'b';
  kingSquare: string;
  fieldSquares: string[];
  participantSquares: string[];
  /** Which unit covers each square of the field (and the king square itself —
      covered by the checker). `by: null` = blocked by the defender's own man. */
  coverage: { square: string; by: string | null }[];
  model: boolean;
  ideal: boolean;
}

/**
 * Verify a pure/model/ideal mate on a final position. Returns null unless the
 * position is checkmate AND the mate is pure: every field square unavailable
 * for exactly one reason (guarded once, blocked by a defender that is not also
 * guarded, or an attacker unit defended exactly once), single check only.
 */
export function analyzeMateEconomy(fen: string): MateEconomy | null {
  const chess = safeChess(fen);
  if (!chess || !chess.isCheckmate()) return null;

  const mated = chess.turn();
  const attacker = mated === 'w' ? 'b' : 'w';

  const pieces: { square: string; type: string; color: string }[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell) pieces.push({ square: cell.square, type: cell.type, color: cell.color });
    }
  }
  const king = pieces.find(p => p.type === 'k' && p.color === mated);
  if (!king) return null;

  // Purity excludes double checks (two reasons the king cannot stand still).
  const checkers = chess.attackers(king.square as Square, attacker);
  if (checkers.length !== 1) return null;

  // Guards are counted with the mated king lifted off the board, so a flight
  // square behind the king on the checking line still reads as covered by the
  // checker — the standard king-attack semantics.
  const noKing = new Chess(fen);
  noKing.remove(king.square as Square);

  const field = adjacentSquares(king.square);
  const participants = new Set<string>(checkers);
  const coverage: { square: string; by: string | null }[] = [
    { square: king.square, by: checkers[0] },
  ];

  for (const s of field) {
    const occupant = chess.get(s as Square);
    const guards = noKing.attackers(s as Square, attacker);
    if (occupant && occupant.color === mated) {
      // Self-block. A guard on top of it would be a second reason — impure.
      if (guards.length !== 0) return null;
      coverage.push({ square: s, by: null });
    } else if (occupant && occupant.color === attacker) {
      // The king could capture it, so it must be defended — exactly once.
      if (guards.length !== 1) return null;
      participants.add(s);
      participants.add(guards[0]);
      coverage.push({ square: s, by: guards[0] });
    } else {
      if (guards.length !== 1) return null;
      participants.add(guards[0]);
      coverage.push({ square: s, by: guards[0] });
    }
  }

  const attackerPieces = pieces.filter(p => p.color === attacker);
  const matedOthers = pieces.filter(p => p.color === mated && p.type !== 'k');

  // Model: every attacker unit takes part, king and pawns excused by convention.
  const model = attackerPieces
    .filter(p => p.type !== 'k' && p.type !== 'p')
    .every(p => participants.has(p.square));
  // Ideal: no unit of either side stands idle — attacker king and pawns
  // included, and every defender unit is one of the self-blocks.
  const ideal = model
    && attackerPieces.every(p => participants.has(p.square))
    && matedOthers.every(p => field.includes(p.square));

  return {
    matedColor: mated,
    kingSquare: king.square,
    fieldSquares: field,
    participantSquares: attackerPieces.filter(p => participants.has(p.square)).map(p => p.square),
    coverage,
    model,
    ideal,
  };
}

/* "Who covers what" is drawn with symbols rather than a hue per square — a
   rainbow of square tints drowned the board (and recoloured even the mating
   side's king). The field stays amber; each field square carries the symbol
   of the unit that covers it, and that unit wears the same symbol as a corner
   badge. Shape and colour both vary per unit (white-rimmed solid fills, not
   outlines — outlines washed out on the amber). Grey = blocked by the
   defender's own man. */
const GLYPH_SHAPES = [
  '<circle cx="12" cy="12" r="7.5"/>',
  '<path d="M12 4.5 L20 19 L4 19 Z"/>',
  '<rect x="5.5" y="5.5" width="13" height="13"/>',
  '<path d="M12 3.5 L20.5 12 L12 20.5 L3.5 12 Z"/>',
  '<path d="M12 2.5 L14.6 9.4 L21.5 12 L14.6 14.6 L12 21.5 L9.4 14.6 L2.5 12 L9.4 9.4 Z"/>',
  '<path d="M9.2 4.5 h5.6 v4.7 h4.7 v5.6 h-4.7 v4.7 H9.2 v-4.7 H4.5 V9.2 h4.7 Z"/>',
];
const GLYPH_COLORS = ['#2563eb', '#dc2626', '#9333ea', '#0d9488', '#ea580c', '#db2777'];

function glyphImage(idx: number): string {
  const shape = GLYPH_SHAPES[idx % GLYPH_SHAPES.length];
  const color = GLYPH_COLORS[idx % GLYPH_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">`
    + `<g fill="none" stroke="${color}" stroke-width="2.4">${shape}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const FIELD_AMBER = 'rgba(255, 176, 32, 0.55)';
const SELF_BLOCK: MarkStyle = { backgroundColor: 'rgba(110, 110, 110, 0.45)' };

function mateMarks(a: MateEconomy): Record<string, MarkStyle> {
  const marks: Record<string, MarkStyle> = {};
  const glyphOf = new Map<string, number>();
  for (const { square, by } of a.coverage) {
    if (square === a.kingSquare) continue; // the check itself needs no label
    if (by === null) { marks[square] = { ...SELF_BLOCK }; continue; }
    if (!glyphOf.has(by)) glyphOf.set(by, glyphOf.size);
    marks[square] = {
      backgroundColor: FIELD_AMBER,
      backgroundImage: glyphImage(glyphOf.get(by)!),
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
      backgroundSize: '58%',
    };
  }
  // Badge each guard with its own symbol, top-right so the piece stays
  // visible; a guard standing inside the field keeps its amber background.
  for (const [piece, shape] of glyphOf) {
    marks[piece] = {
      ...(marks[piece] || {}),
      backgroundImage: glyphImage(shape),
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 5% top 5%',
      backgroundSize: '30%',
    };
  }
  return marks;
}

function hasSelfBlock(a: MateEconomy): boolean {
  return a.coverage.some(c => c.by === null);
}

/* ── Line-replay detections (the moves the solver actually saw) ─────────── */

/** A piece that comes back to a square it stood on earlier in the line. */
function detectSwitchback(positions: LinePosition[]): ThemeInsight | null {
  if (positions.length < 4) return null;
  const start = safeChess(positions[0].fen);
  if (!start) return null;

  // Identity = starting square; each move re-homes one id. Castling moves the
  // rook without a lastMove of its own — that id just goes stale, which only
  // ever loses a detection, never invents one.
  const idAt = new Map<string, string>();      // current square -> id
  const history = new Map<string, string[]>(); // id -> squares occupied
  for (const row of start.board()) {
    for (const cell of row) {
      if (cell) { idAt.set(cell.square, cell.square); history.set(cell.square, [cell.square]); }
    }
  }
  for (let i = 1; i < positions.length; i++) {
    const mv = positions[i].lastMove;
    if (!mv) continue;
    const id = idAt.get(mv.from);
    idAt.delete(mv.from);
    if (!id) continue;
    idAt.set(mv.to, id);
    const past = history.get(id)!;
    if (past.length > 1 && past.includes(mv.to)) {
      const chess = safeChess(positions[i].fen);
      const piece = chess?.get(mv.to as Square);
      if (!piece || piece.type === 'p') return null; // a pawn cannot go back
      const via = past.slice(past.indexOf(mv.to) + 1);
      const marks: Record<string, { backgroundColor: string }> = {};
      for (const s of via) marks[s] = BLUE;
      marks[mv.to] = AMBER;
      // Out along the journey, then back home — one arrow per leg.
      const stops = [mv.to, ...via];
      const arrows = stops.map((s, k) => ({ from: s, to: stops[k + 1] ?? mv.to }));
      return {
        theme: 'Switchback',
        title: 'Switchback',
        text: `The ${PIECE_NAME[piece.type]} leaves ${mv.to}, does its work on ${via.join(' and ')}, `
          + `and returns to exactly where it started (amber). The round trip is the point — `
          + `the square had to be left before it could matter again.`,
        fen: positions[i].fen,
        marks,
        arrows,
      };
    }
    past.push(mv.to);
  }
  return null;
}

/** A mate (or check) delivered by a piece that did not move — a battery firing. */
function detectBattery(positions: LinePosition[]): ThemeInsight | null {
  for (let i = positions.length - 1; i >= 1; i--) {
    const mv = positions[i].lastMove;
    if (!mv) continue;
    const chess = safeChess(positions[i].fen);
    if (!chess || !chess.isCheck()) continue;
    const checked = chess.turn();
    const kingSq = findKing(chess, checked);
    if (!kingSq) continue;
    const checkers = chess.attackers(kingSq as Square, checked === 'w' ? 'b' : 'w');
    const rear = checkers.find(c => c !== mv.to);
    if (!rear) continue;
    const rearPiece = chess.get(rear as Square);
    const frontPiece = chess.get(mv.to as Square);
    if (!rearPiece || !frontPiece) continue;
    // Show the moment BEFORE it fires: rear piece, front piece and king all
    // on one line (the king has not moved between the two positions — the
    // firing move belongs to the other side). The arrow is the firing move.
    const beforeFen = positions[i - 1].fen;
    const before = safeChess(beforeFen);
    if (!before || !before.get(mv.from as Square)) continue;
    const marks: Record<string, { backgroundColor: string }> = {};
    for (const s of betweenSquares(rear, kingSq)) marks[s] = AMBER;
    marks[rear] = BLUE;
    marks[mv.from] = BLUE;
    const mate = chess.isCheckmate();
    return {
      theme: 'Battery',
      title: 'Battery',
      text: `A battery stands aimed at the king: the ${PIECE_NAME[rearPiece.type]} behind the `
        + `${PIECE_NAME[frontPiece.type]} (blue), lined up along the amber squares. `
        + `${sanWithSuffix(positions[i].san, chess)} steps off the line and the `
        + `${PIECE_NAME[rearPiece.type]}'s ${mate ? 'mate' : 'check'} fires the instant it opens — `
        + `the moving piece never gives the check itself.`,
      fen: beforeFen,
      marks,
    };
  }
  return null;
}

/* ── Tree-replay detections ─────────────────────────────────────────────── */

interface CrossingHit {
  square: string;
  rookFrom: string;
  bishopFrom: string;
  fen: string;
  parentSan: string;
}

interface CrossCheckHit {
  fen: string;
  firstSan: string;
  replySan: string;
  replyFrom: string;
  replyTo: string;
  /** Units checking the first checker's own king after the reply, with the
      squares of their checking lines. */
  counterCheckers: { square: string; type: string; line: string[] }[];
  checkedKing: string;
}

interface TreeScan {
  novotny: CrossingHit | null;
  grimshaw: CrossingHit | null;
  crossCheck: CrossCheckHit | null;
}

/** SAN with a check/mate suffix computed from the replayed position — the
    parser's own flags are unreliable here. */
function sanWithSuffix(san: string, chessAfter: Chess): string {
  const bare = san.replace(/[+#]+$/, '');
  return bare + (chessAfter.isCheckmate() ? '#' : chessAfter.isCheck() ? '+' : '');
}

/**
 * Walk the solution tree with chess.js. Rook/bishop crossings: Novotny — a
 * unit lands on the crossing square and both captures exist as replies;
 * Grimshaw — two defences by rook and bishop to the same empty square.
 * Cross-check — a checking move answered by a check (the reply is only ever
 * played on the board when it happens to sit in the first-listed defence, so
 * this has to read the tree, not the played line). Threat branches are
 * skipped (their positions miss the opponent's move).
 */
function findCrossings(initialFen: string, roots: SolutionNode[]): TreeScan {
  const result: TreeScan = { novotny: null, grimshaw: null, crossCheck: null };
  const base = safeChess(initialFen);
  if (!base) return result;

  const visit = (fen: string, node: SolutionNode, depth: number) => {
    if (depth > 12 || node.isThreat) return;
    const chess = safeChess(fen);
    if (!chess || !execNode(chess, node)) return;
    const afterFen = chess.fen();

    const to = (node.moveUci || '').slice(2, 4);
    const replies = node.children.filter(ch => ch.color !== node.color && !ch.isThreat
      && /^[a-h][1-8][a-h][1-8]/.test(ch.moveUci || ''));

    // Novotny: both line pieces capture the unit just planted on their crossing.
    if (!result.novotny && /^[a-h][1-8]$/.test(to)) {
      const caps = replies.filter(ch => ch.moveUci.slice(2, 4) === to);
      const rook = caps.find(ch => chess.get(ch.moveUci.slice(0, 2) as Square)?.type === 'r');
      const bishop = caps.find(ch => chess.get(ch.moveUci.slice(0, 2) as Square)?.type === 'b');
      if (rook && bishop) {
        result.novotny = {
          square: to, rookFrom: rook.moveUci.slice(0, 2), bishopFrom: bishop.moveUci.slice(0, 2),
          fen: afterFen, parentSan: node.moveSan,
        };
      }
    }

    // Grimshaw: rook and bishop both interpose on the same empty square.
    if (!result.grimshaw) {
      const byTarget = new Map<string, SolutionNode[]>();
      for (const ch of replies) {
        const t = ch.moveUci.slice(2, 4);
        if (chess.get(t as Square)) continue; // occupied → capture, not interference
        byTarget.set(t, [...(byTarget.get(t) || []), ch]);
      }
      for (const [t, group] of byTarget) {
        const rook = group.find(ch => chess.get(ch.moveUci.slice(0, 2) as Square)?.type === 'r');
        const bishop = group.find(ch => chess.get(ch.moveUci.slice(0, 2) as Square)?.type === 'b');
        if (rook && bishop) {
          result.grimshaw = {
            square: t, rookFrom: rook.moveUci.slice(0, 2), bishopFrom: bishop.moveUci.slice(0, 2),
            fen: afterFen, parentSan: node.moveSan,
          };
          break;
        }
      }
    }

    // Cross-check: this move gives check, and some reply gives check back.
    if (!result.crossCheck && chess.isCheck()) {
      for (const ch of node.children) {
        if (ch.color === node.color || ch.isThreat) continue;
        const replyChess = safeChess(afterFen);
        if (!replyChess || !execNode(replyChess, ch)) continue;
        if (replyChess.isCheck()) {
          const checkedSide = replyChess.turn();
          const kingSq = findKing(replyChess, checkedSide);
          if (!kingSq) continue;
          const counterCheckers = replyChess
            .attackers(kingSq as Square, checkedSide === 'w' ? 'b' : 'w')
            .map(sq => ({
              square: sq,
              type: replyChess.get(sq as Square)?.type || '',
              line: betweenSquares(sq, kingSq),
            }));
          result.crossCheck = {
            fen: replyChess.fen(),
            firstSan: sanWithSuffix(node.moveSan, chess),
            replySan: sanWithSuffix(ch.moveSan, replyChess),
            replyFrom: (ch.moveUci || '').slice(0, 2),
            replyTo: (ch.moveUci || '').slice(2, 4),
            counterCheckers,
            checkedKing: kingSq,
          };
          break;
        }
      }
    }

    for (const ch of node.children) visit(afterFen, ch, depth + 1);
  };

  for (const root of roots) visit(initialFen, root, 0);
  return result;
}

/** A "=Q"-style label drawn onto a promotion square. */
function promoLabelImage(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">`
    + `<text x="12" y="16" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" `
    + `font-size="${label.length > 2 ? 8 : 10.5}" font-weight="bold" fill="#1d1d16" `
    + `stroke="white" stroke-width="0.5" paint-order="stroke">${label}</text></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** All four promotions somewhere in the solution. */
function detectAuw(roots: SolutionNode[], initialFen: string | null): ThemeInsight | null {
  const seen = new Set<string>();
  const bySquare = new Map<string, string[]>();
  const walk = (node: SolutionNode, depth: number) => {
    if (depth > 14) return;
    const m = (node.moveUci || '').match(/^[a-h][1-8]([a-h][1-8])([qrbn])$/);
    if (m) {
      const letter = m[2].toUpperCase();
      seen.add(letter);
      const prev = bySquare.get(m[1]) || [];
      if (!prev.includes(letter)) bySquare.set(m[1], [...prev, letter]);
      for (const ch of node.children) walk(ch, depth + 1);
      return;
    }
    for (const ch of node.children) walk(ch, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  if (seen.size !== 4) return null;
  // The diagram with each promotion square labelled: the pawns that will do
  // it are still standing in the position, which is the point of the picture.
  const marks: Record<string, MarkStyle> = {};
  for (const [sq, letters] of bySquare) {
    marks[sq] = {
      backgroundColor: FIELD_AMBER,
      backgroundImage: promoLabelImage('=' + letters.join('/')),
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
      backgroundSize: '86%',
    };
  }
  return {
    theme: 'Allumwandlung',
    title: 'Allumwandlung',
    text: `All four promotions appear in this solution — queen, rook, bishop and knight each turn up `
      + `in some line (amber: where each one lands). The complete set is the Allumwandlung `
      + `(“total promotion”), one of the rarest feats a pawn can be asked to perform.`,
    fen: initialFen || undefined,
    marks: initialFen ? marks : undefined,
  };
}

/* ── Assembly ───────────────────────────────────────────────────────────── */

export function getThemeInsights(
  p: { keywords?: string[]; solutionText?: string; genre: string; solutionTree?: SolutionNode[] },
  initialFen: string | null,
  positions: LinePosition[] | null,
): ThemeInsight[] {
  const out: ThemeInsight[] = [];
  const kw = p.keywords || [];
  const has = (...names: string[]) => names.some(n => kw.includes(n));
  const roots = p.solutionTree || [];
  const line = positions && positions.length > 1 ? positions : null;
  const finalFen = line ? line[line.length - 1].fen : null;

  // Crossing squares first — the sharper Novotny suppresses Grimshaw.
  const wantsTreeScan = has('Novotny', 'Grimshaw', 'Cross-check', 'Cross-checks');
  const scan = wantsTreeScan && initialFen && roots.length > 0
    ? findCrossings(initialFen, roots)
    : { novotny: null, grimshaw: null, crossCheck: null };
  if (has('Novotny', 'Grimshaw')) {
    const { novotny, grimshaw } = scan;
    if (has('Novotny') && novotny) {
      out.push({
        theme: 'Novotny',
        title: 'Novotny',
        text: `${novotny.parentSan} plants a piece on ${novotny.square} (amber) — the crossing point of the `
          + `rook's and the bishop's lines (blue). Either piece can take it, but each capture blocks the `
          + `other's line, and each gets its own mate. A sacrifice offered to two pieces at once.`,
        fen: novotny.fen,
        marks: { [novotny.square]: AMBER, [novotny.rookFrom]: BLUE, [novotny.bishopFrom]: BLUE },
      });
    } else if (has('Grimshaw') && grimshaw) {
      out.push({
        theme: 'Grimshaw',
        title: 'Grimshaw',
        text: `The rook and the bishop (blue) both need to pass across ${grimshaw.square} (amber). `
          + `Whichever arrives first stands in the other's way — the two defences interfere with each `
          + `other, and White has a separate mate ready for each.`,
        fen: grimshaw.fen,
        marks: { [grimshaw.square]: AMBER, [grimshaw.rookFrom]: BLUE, [grimshaw.bishopFrom]: BLUE },
      });
    }
  }

  if (has('Battery', 'Battery play') && line) {
    const card = detectBattery(line);
    if (card) out.push(card);
  }

  if (has('Cross-check', 'Cross-checks') && scan.crossCheck) {
    const cc = scan.crossCheck;
    const checkedSide = cc.fen.split(' ')[1] === 'w' ? 'White' : 'Black';
    const marks: Record<string, MarkStyle> = {};
    for (const c of cc.counterCheckers) {
      for (const s of c.line) marks[s] = { ...AMBER };
      marks[c.square] = { ...BLUE };
    }
    const discovered = cc.counterCheckers.some(c => c.square !== cc.replyTo);
    const names = cc.counterCheckers.map(c => PIECE_NAME[c.type] || 'piece').join(' and ');
    out.push({
      theme: 'Cross-check',
      title: 'Cross-check',
      text: `${cc.firstSan} is a check — but ${cc.replySan} answers it with a counter-check: `
        + (discovered
          ? `the move steps aside and the ${names} (blue) now checks the ${checkedSide} king along the amber squares. `
          : `the ${names} (blue) itself now checks the ${checkedSide} king. `)
        + `Meeting check with check, the original attack loses its sting.`,
      fen: cc.fen,
      marks,
    });
  }

  if (has('Switchback', 'Switchbacks') && line) {
    const card = detectSwitchback(line);
    if (card) out.push(card);
  }

  if (has('Allumwandlung') && roots.length > 0) {
    const card = detectAuw(roots, initialFen);
    if (card) out.push(card);
  }

  if (has('Model mate', 'Model mates', 'Ideal mate', 'Ideal mates') && finalFen) {
    const a = analyzeMateEconomy(finalFen);
    if (a) {
      const sideName = a.matedColor === 'w' ? 'White' : 'Black';
      const other = a.matedColor === 'w' ? 'Black' : 'White';
      const blockNote = hasSelfBlock(a)
        ? ` Grey squares are blocked by ${sideName}'s own men — that counts too, exactly once.`
        : '';
      if (has('Ideal mate', 'Ideal mates') && a.ideal) {
        out.push({
          theme: 'Ideal mate',
          title: 'Ideal mate',
          text: `Every square around the ${sideName} king (amber) is covered exactly once, `
            + `and not a single piece of either side stands idle.${blockNote} `
            + `The strictest mate a composer can build.`,
          fen: finalFen,
          marks: mateMarks(a),
        });
      } else if (has('Model mate', 'Model mates') && a.model) {
        out.push({
          theme: 'Model mate',
          title: 'Model mate',
          text: `Every square around the ${sideName} king (amber) is covered exactly once — `
            + `no double duties, and every ${other} piece has work to do.${blockNote} `
            + `Nothing wasted, nothing doubled.`,
          fen: finalFen,
          marks: mateMarks(a),
        });
      }
    }
  }

  // The solution's own "{zugzwang}" annotation is the authority; the keyword
  // alone could refer to a variation we cannot point at.
  const keySan = roots[0]?.moveSan || null;
  if (has('Zugzwang') && p.genre === 'direct'
    && /zugzwang/i.test(p.solutionText || '') && keySan) {
    // The picture, when it can be proven: after the key, every square Black
    // can move to (amber) walks into an immediate mate. Verifiable in full
    // for two-movers; longer problems keep the text-only card.
    let zzFen: string | undefined;
    let zzMarks: Record<string, MarkStyle> | undefined;
    let zzCount = 0;
    if (initialFen && roots[0]) {
      const afterKey = safeChess(initialFen);
      if (afterKey && execNode(afterKey, roots[0]) && !afterKey.isCheck()) {
        const replies = afterKey.moves({ verbose: true });
        const allMated = replies.length > 0 && replies.length <= 24 && replies.every(reply => {
          const pos = new Chess(afterKey.fen());
          pos.move(reply);
          return pos.moves({ verbose: true }).some(m => {
            const done = new Chess(pos.fen());
            done.move(m);
            return done.isCheckmate();
          });
        });
        // The other half of the definition, also proven before we claim it:
        // hand the move back to White (a null move) and no mate exists.
        const fenParts = afterKey.fen().split(' ');
        fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w';
        fenParts[3] = '-';
        const passed = safeChess(fenParts.join(' '));
        const noThreat = !!passed && !passed.isCheck()
          && !passed.moves({ verbose: true }).some(m => {
            const done = new Chess(passed.fen());
            done.move(m);
            return done.isCheckmate();
          });
        if (allMated && noThreat) {
          zzFen = afterKey.fen();
          zzMarks = {};
          for (const reply of replies) zzMarks[reply.to] = { backgroundColor: FIELD_AMBER };
          zzCount = replies.length;
        }
      }
    }
    out.push({
      theme: 'Zugzwang',
      title: 'Zugzwang',
      text: `The key ${keySan}! is a waiting move: it threatens nothing, and if Black could pass, `
        + `White would have no mate at all. But chess has no pass — Black must move, and `
        + (zzFen
          ? `every square a Black man can move to (amber — all ${zzCount} moves) walks straight into mate. `
          : `every move breaks something in the defence. `)
        + `The obligation to move is the whole weapon — that is zugzwang.`,
      fen: zzFen,
      marks: zzMarks,
    });
  }

  return out;
}
