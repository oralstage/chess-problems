import type { SolutionNode } from '../types';

// ── Move notation conversion ────────────────────────────

// Normalize German piece notation: D→Q (Dame), T→R (Turm), L→B (Läufer), S→N (Springer)
function normalizeGerman(s: string): string {
  return s.replace(/D/g, 'Q').replace(/T/g, 'R').replace(/L/g, 'B').replace(/S/g, 'N');
}

/* Cyrillic letters inside moves. A solution typed on a Russian or Ukrainian
   keyboard carries look-alike letters in the squares ("1.Qе7!", "Kс2",
   "Rа1": а, с, е), the capture and mate signs х and Х ("Sхе5", "2.Sd5Х"),
   and now and then the Russian piece letters: Кр king, Ф queen, Л rook, С
   bishop ("1.Фb7? Кр:h5!"). None of that reads as a move, so the line went
   dead there -- D163246's "1.Qf4! Kс2 2.Qс1#" had nothing after the key.
   A word is only touched when the swap leaves a move and no Cyrillic behind:
   prose stays as written, and so does a К on its own, which is the knight in
   Russian notation and a look-alike of the king everywhere else. Comments in
   braces are left alone. The twin labels "а)" and "с)" are the same letters. */
const CYRILLIC = /[\u0400-\u04FF]/;
const CYRILLIC_FILES: Record<string, string> = { '\u0430': 'a', '\u0441': 'c', '\u0435': 'e' };

function normalizeCyrillicWord(word: string): string {
  if (!CYRILLIC.test(word)) return word;
  const label = word.match(/^(\+?)([\u0430\u0441\u0435])\)(.*)$/);
  if (label) return label[1] + CYRILLIC_FILES[label[2]] + ')' + normalizeCyrillicWord(label[3]);
  const swapped = word
    .replace(/[\u041AK][\u0440p](?=[-:x\u0445*a-h\u0430\u0441\u0435])/g, 'K')
    .replace(/\u0424/g, 'Q')
    .replace(/\u041B/g, 'R')
    .replace(/\u0421(?=[-:x\u0445*a-h\u0430\u0441\u0435])/g, 'B')
    .replace(/[\u0430\u0441\u0435]/g, ch => CYRILLIC_FILES[ch])
    .replace(/\u0445(?=[a-h])/g, 'x')
    .replace(/\u0425(?=[+!?]*(?:[;,.)]|$))/g, '#');
  if (CYRILLIC.test(swapped) || !/[a-h][1-8]|0-0|O-O/.test(swapped)) return word;
  return swapped;
}

export function normalizeCyrillicMoves(text: string): string {
  if (!CYRILLIC.test(text)) return text;
  return text.replace(/\{[^}]*\}|[^\s{}]+/g, w => w.startsWith('{') ? w : normalizeCyrillicWord(w));
}

// Long algebraic: Piece + from + sep + to + promo (sep includes ':' for captures)
// The promotion group also takes the joke forms: =K and =P (pieces FIDE does
// not allow) and =bS / =wQ (promoting to the opponent's colour). They are only
// accepted with the '=' in front, so ordinary text cannot fall into them.
const LONG_RE = /([KQRBSNPDTL]?)([a-h][1-8])([-*x:])([a-h][1-8])(=[bw][QRBSNPDTLK](?![A-Za-z])|=[KP](?![A-Za-z])|=?[QRBNSDTL])?([+#!?]*)/i;
// The joke promotions, allowed only where a promotion can happen: on a move by a
// pawn. Fairy conditions demote pieces with the same suffix (RelegationChess
// writes Qh7-a7=P), and that is a different thing on a different mover.
const JOKE_PROMO = '(?:=[bw][QRBSNPDTLK](?![A-Za-z])|=[KP](?![A-Za-z]))';
// Any move pattern (for extracting from text)
// Note: [a-h][18][QRBNS] handles promotions without '=' (e.g., f8Q instead of f8=Q)
// Note: ':' is used as capture separator in some notations (e.g., R:c3)
const ANY_MOVE_RE = new RegExp(
  '(?:0-0-0|O-O-O|0-0|O-O'
  // pawn moves first: only these may carry a joke promotion
  + '|P?[a-h][1-8][-*x:][a-h][1-8](?:' + JOKE_PROMO + '|=?[QRBNSDTL])?'
  + '|[KQRBSNDTL][a-h][1-8][-*x:][a-h][1-8](?:=?[QRBNSDTL])?'
  + '|[KQRBSNPDTL][a-h]?[1-8]?[x*:]?[a-h][1-8](?:=?[QRBNSDTL])?'
  + '|[a-h][x*:][a-h][1-8](?:' + JOKE_PROMO + '|=?[QRBNSDTL])?'
  + '|[a-h][18][QRBNSDTL]'
  + '|[a-h][1-8](?:' + JOKE_PROMO + '|=[QRBNSDTL])?'
  + ')([+#!?]*)',
);
const CASTLING_RE = /^(0-0-0|O-O-O|0-0|O-O)([+#!?]*)/;

function yacpdbToUci(move: string): string {
  const clean = move.replace(/[+#!?]/g, '').trim();
  // "Any move" wildcard — can't be converted to UCI
  if (clean.includes('~')) return 'any';
  // Castling: use san: prefix so chess.js handles king position correctly
  if (clean === '0-0' || clean === 'O-O') return 'san:O-O';
  if (clean === '0-0-0' || clean === 'O-O-O') return 'san:O-O-O';

  // Long algebraic: Bf7-g8 → f7g8, also handles promotion without '=' (d7-d8Q)
  // A joke promotion (=K, =P, or the opponent's colour) has no UCI to give, and
  // chess.js has no move to make of it either. Pass it on as SAN so it fails as
  // one unplayable move instead of being read as an ordinary promotion.
  // A joke promotion (=K, =P, or the opponent's colour) has no UCI to give, and
  // no engine can make the move either. Marked with its own prefix rather than
  // "san:", because chess.js reads "c7-c8=K" loosely and answers with c8=N --
  // which would then be accepted from the solver as the key move.
  if (/^P?[a-h][1-8][-*x:]?[a-h][1-8](?:=[bw][QRBSNPKDTL]|=[KP](?![a-z]))/i.test(clean)) {
    return 'joke:' + normalizeGerman(clean).replace(/:/g, 'x');
  }

  const mLong = clean.match(/^([KQRBSNP]?)([a-h][1-8])[-*x]?([a-h][1-8])(?:=?([QRBNS]))?$/i);
  if (mLong) {
    const promo = mLong[4] ? (mLong[4] === 'S' || mLong[4] === 's' ? 'n' : mLong[4].toLowerCase()) : '';
    return mLong[2].toLowerCase() + mLong[3].toLowerCase() + promo;
  }

  // SAN: we can only extract the destination square (no source info)
  // Return a "san:" prefix so matching can use SAN comparison instead
  // Normalize S→N and add '=' for promotions without it (e.g., f8Q → f8=Q)
  let sanClean = normalizeGerman(clean);
  sanClean = sanClean.replace(/:/g, 'x'); // YACPDB ':' → standard 'x' for captures
  sanClean = sanClean.replace(/^([a-h][18])([QRBN])$/, '$1=$2');
  return 'san:' + sanClean;
}

function normalizePiece(p: string): string {
  const map: Record<string, string> = { S: 'N', s: 'N', D: 'Q', T: 'R', L: 'B' };
  return map[p] || p;
}

function yacpdbToSanApprox(move: string): string {
  const clean = move.replace(/[!?]/g, '').trim();
  // "Any move" wildcard — show as "N~", "~", etc.
  if (clean.includes('~')) {
    return normalizePiece(clean.replace(/[+#]/g, '').replace('~', '')) + '~' + (clean.includes('#') ? '#' : clean.includes('+') ? '+' : '');
  }
  if (clean.startsWith('0-0-0') || clean.startsWith('O-O-O')) return 'O-O-O';
  if (clean.startsWith('0-0') || clean.startsWith('O-O')) return 'O-O';

  // Try long algebraic first
  const mLong = clean.match(LONG_RE);
  if (mLong) {
    const piece = normalizePiece(mLong[1]);
    const capture = mLong[3] === '*' || mLong[3] === 'x' || mLong[3] === ':' ? 'x' : '';
    const to = mLong[4];
    const promoRaw = piece && piece !== 'P' && /^=[bw]?[KP]/i.test(mLong[5] || '') ? '' : (mLong[5] || '');
    const promoChar = promoRaw.replace('=', '');
    // "bS" keeps its colour letter and its YACPDB piece letter: the point of the
    // move is which colour it promotes to, and "=bN" would read as a typo.
    const promo = promoChar
      ? '=' + (/^[bw]/.test(promoChar) ? promoChar : normalizePiece(promoChar))
      : '';
    const suffix = mLong[6] || '';

    if (!piece || piece === 'P' || piece === 'p') {
      const fromFile = capture ? mLong[2][0] : '';
      return fromFile + capture + to + promo + suffix;
    }
    return piece + capture + to + suffix;
  }

  // Already in SAN-like format - normalize German pieces, ':' → 'x', and add '=' for bare promotions
  let san = normalizeGerman(clean);
  san = san.replace(/:/g, 'x'); // YACPDB uses ':' for captures, chess.js expects 'x'
  san = san.replace(/^([a-h][18])([QRBN])/, '$1=$2');
  san = san.replace(/^([a-h]x[a-h][18])([QRBN])/, '$1=$2');
  return san;
}

// Extract individual move strings from text
function extractMoveStrings(text: string): string[] {
  const moves: string[] = [];
  let remaining = text.trim();

  // Remove common non-move tokens
  remaining = remaining.replace(/\bzz\b/gi, ''); // zugzwang marker
  remaining = remaining.replace(/\bbut\b/gi, ''); // "but" in tries
  remaining = remaining.replace(/\bwaiting\b/gi, ''); // "waiting" zugzwang
  remaining = remaining.replace(/\bzugzwang\.?\b/gi, ''); // "zugzwang" marker
  remaining = remaining.replace(/\bep\.?\b/gi, ''); // en passant marker


  while (remaining.length > 0) {
    remaining = remaining.trim();
    if (!remaining) break;

    // Skip any remaining parenthesized content (threats are extracted at line level)
    if (remaining[0] === '(') {
      const closeIdx = remaining.indexOf(')');
      if (closeIdx >= 0) {
        remaining = remaining.slice(closeIdx + 1);
        continue;
      }
    }

    // Skip slash (alternatives are expanded at line level before segment parsing)
    if (remaining[0] === '/') {
      remaining = remaining.slice(1);
      continue;
    }

    const castling = remaining.match(CASTLING_RE);
    if (castling) {
      moves.push(castling[0]);
      remaining = remaining.slice(castling[0].length);
      continue;
    }

    // "Any move" notation: "~", "S~", "Sd~", "Be~", etc.
    const anyMoveMatch = remaining.match(/^([KQRBSNP][a-h]?)?~([+#!?]*)/);
    if (anyMoveMatch) {
      const piece = anyMoveMatch[1] || '';
      const suffix = anyMoveMatch[2] || '';
      moves.push(piece + '~' + suffix);
      remaining = remaining.slice(anyMoveMatch[0].length);
      continue;
    }

    const m = remaining.match(ANY_MOVE_RE);
    if (m && m.index !== undefined) {
      if (m.index > 0) {
        // Skip non-move text before match
        remaining = remaining.slice(m.index);
        continue;
      }
      moves.push(m[0]);
      remaining = remaining.slice(m[0].length);
      continue;
    }

    // Skip one character and try again
    remaining = remaining.slice(1);
  }
  return moves;
}

// ── Segment parsing ─────────────────────────────────────

/** A line YACPDB marks as a cook: a "Cook:" / "Cooks 1.Sd7!" label at the head
 *  of the line, or a {…} note on it that says cook. The colon-or-move-number is
 *  what keeps a composer named Cook from matching. Both forms are the editor
 *  saying "this line is an unintended second solution", so both are kept out of
 *  the solutions a helpmate asks the solver to find. */
const COOK_LABEL = /^cooks?\b[ \t]*(:|\d+[ \t]*\.)/i;
const COOK_NOTE = /\bcooks?\b/i;
/** A twin label ("b)", "+c)") opens a new diagram, so a cook heading above it
 *  says nothing about what follows. */
const TWIN_LABEL = /^\+?[a-h]\)/i;

interface Segment {
  indent: number;
  lineIndex: number;
  segIndex: number;
  moveNum: number | null;
  isBlackNum: boolean;
  moves: string[];
  isKey: boolean;
  isTry: boolean;
  isThreat: boolean;
  hasThreatLabel: boolean; // "threat:" label — children are threats, not this segment itself
  /** The line this segment came from is marked as a cook (see COOK_LINE). */
  isCook: boolean;
  annotation: string;
  afterBlankLine: boolean; // preceded by a blank line (section break)
  /** The indent as written. `indent` is overwritten with a virtual one when the
   *  source does not indent its tree, and then it no longer says anything about
   *  what the writer put where. */
  sourceIndent: number;
}

/**
 * Expand slash alternatives in a line into multiple lines.
 * e.g., "   1...Rg3/Rxg4 2.O-O-O#" → ["   1...Rg3 2.O-O-O#", "   1...Rxg4 2.O-O-O#"]
 * Only expands "/" that's NOT followed by a move number (which indicates a full variation split).
 * Does NOT expand "/" inside parentheses (threats).
 */
function expandSlashAlternatives(line: string): string[] {
  const indent = line.length - line.trimStart().length;
  const prefix = line.slice(0, indent);
  let content = line.trimStart();
  if (!content) return [line];

  // Strip game-result markers first: the slashes in "1/2-1/2" (drawn studies)
  // would otherwise be expanded as move alternatives, duplicating the whole
  // line's variation. Result markers are not moves and carry no tree content.
  content = content.replace(/\b(?:1\/2\s*-\s*1\/2|1\/2|1-0|0-1)\b/g, ' ').trimEnd();
  if (!content) return [prefix];

  // Remove parenthesized content temporarily to avoid expanding "/" inside threats
  const parenParts: string[] = [];
  content = content.replace(/\([^)]*\)/g, (match) => {
    parenParts.push(match);
    return `__PAREN${parenParts.length - 1}__`;
  });

  // Find "/" that separates alternative moves (not followed by a move number)
  // Pattern: "Move1/Move2 continuation" or "Move1/Move2/Move3 continuation"
  // The "/" must be between move-like tokens, not followed by digit+dot
  const slashRe = /\/(?!\d+\.)/g;
  if (!slashRe.test(content)) {
    return [line]; // no alternatives to expand
  }

  // Find the portion containing "/" alternatives
  // Split content on move number boundaries to find which part has "/"
  const moveNumSplit = content.split(/(?<!\d)(?=\d+\.)/);
  let altPartIdx = -1;
  for (let i = 0; i < moveNumSplit.length; i++) {
    if (/\/(?!\d+\.)/.test(moveNumSplit[i])) {
      altPartIdx = i;
      break;
    }
  }
  if (altPartIdx < 0) return [line];

  const altPart = moveNumSplit[altPartIdx];
  const beforeAlt = moveNumSplit.slice(0, altPartIdx).join('');
  const afterAlt = moveNumSplit.slice(altPartIdx + 1).join('');

  // Split alternatives: "Rg3/Rxg4" → ["Rg3", "Rxg4"]
  // But keep the move number prefix (e.g., "1...Rg3/Rxg4" → prefix "1...", alts ["Rg3", "Rxg4"])
  // Match move number prefix: "1." or "1..." or "1. ..." etc.
  const altMoveNumMatch = altPart.match(/^(\d+\.+\s*)/);
  const altPrefix = altMoveNumMatch ? altMoveNumMatch[1] : '';
  const altBody = altPart.slice(altPrefix.length);
  const alternatives = altBody.split(/\/(?!\d+\.)/);

  // Create one line per alternative, each with the shared continuation
  const expandedLines = alternatives.map(alt => {
    let expanded = prefix + beforeAlt + altPrefix + alt.trim() + ' ' + afterAlt;
    // Restore parenthesized content
    expanded = expanded.replace(/__PAREN(\d+)__/g, (_, i) => parenParts[parseInt(i)]);
    return expanded;
  });

  return expandedLines;
}

/**
 * Repeat the single-group expansion until a line holds no alternatives left.
 *
 * One source line can carry alternatives on more than one move — YACPDB writes
 * "1...Nc1/Nc5/Na1/Na5 2.Nf3#/Nf7#/Ng6#/Nxd3#/Nd7#" for "any of these four
 * defenses is met by any of these five mates". expandSlashAlternatives only
 * expands the first group it finds, which used to leave the mates joined by
 * slashes in one segment; they were then read as a run of successive moves, so
 * a #2 printed a third and a fourth move number and handed White's mates to
 * Black. Expanding to the full cross product puts every mate on the second
 * move where it belongs, and the display folds the repeated defenses back into
 * one row.
 *
 * Depth is capped so a pathological line cannot expand without bound; a line
 * that hits the cap keeps whatever slashes are left rather than being dropped.
 */
function expandAllSlashAlternatives(line: string, depth = 0): string[] {
  const parts = expandSlashAlternatives(line);
  // A no-op returns the line itself; a real expansion always yields 2 or more.
  if (parts.length === 1 || depth >= 8) return parts;
  return parts.flatMap(p => expandAllSlashAlternatives(p, depth + 1));
}

/* One move in a comma list: short or long algebraic in YACPDB's letters (S
   for the knight, German D/T/L), captures written x, : or *, a promotion with
   or without "=", castling, an e.p. note, and the marks after it. */
const LIST_MOVE = '(?:[KQRBSNDTL]?[a-h]?[1-8]?[-x:*]?[a-h][1-8](?:=?[QRBSNDTL])?|0-0-0|O-O-O|0-0|O-O)(?:\\s?e\\.\\s?p\\.)?[+#!?]*';
const LIST_OF_MOVES = `${LIST_MOVE}(?:\\s*,\\s*${LIST_MOVE})+`;
const COMMA_LIST = new RegExp(`(?<=^|[\\s.…])${LIST_OF_MOVES}(?=[\\s;]|$)`, 'g');
const BLACK_NUMBER_BEFORE = /(\d+)\s*\.\s*(?:\.{2,3}|…)\s*$/;
const WHITE_NUMBER_BEFORE = /(\d+)\s*\.\s*$/;
const WHITE_MOVE_BEFORE = new RegExp(`(\\d+)\\s*\\.\\s*${LIST_MOVE}(?:\\s*[!?]+)?\\s+$`);
const WHITE_LIST_AFTER = new RegExp(`^(\\s+\\d+\\s*\\.\\s*)(${LIST_OF_MOVES})(\\s+#(?=\\s|$))?`);

/** What the text alone cannot say. In a selfmate it is Black who mates, so
 *  "2.e:f3, Sc2#" is White's move and Black's mate (D47248), not two mates of
 *  White's to choose from as "2. Qf5, Qe4#" is in a direct mate. */
export interface ParseOptions {
  selfmate?: boolean;
}

/* A list of White's moves is only taken as alternatives when it ends in a
   mate ("2. Qf5, Qe4#") or every move of it checks ("2.Sce2+,Sge2+"). Some
   sources use the comma to part White's move from Black's reply instead --
   "1. Ba6!!, Bf3+; 2. Kh3, Bg4+;" (D368962) -- where the reply may check or,
   in a selfmate, mate; the key's "!" in front of the comma tells those apart,
   and such texts part the moves with ";" as well (see expandCommaLists). */
function endsInMark(moves: string[], standaloneMate: boolean, selfmate: boolean): boolean {
  if (moves.slice(0, -1).some(m => /[!?]$/.test(m))) return false;
  if (moves.every(m => /\+[!?]*$/.test(m))) return true;
  // A check and then a mate ("2.Qe6+, K:e6#") is a move and its answer.
  if (moves.slice(0, -1).some(m => /\+[!?]*$/.test(m))) return false;
  return !selfmate && (standaloneMate || /#[!?]*$/.test(moves[moves.length - 1]));
}

/** The mark written once at the end of a list belongs to every move in it. */
function carryMark(moves: string[], standaloneMate: boolean): string[] {
  const mark = standaloneMate ? '#' : (moves[moves.length - 1].match(/([#+])[!?]*$/)?.[1] ?? '');
  if (!mark) return moves;
  return moves.map(m => /[#+]/.test(m) ? m : m.replace(/([!?]*)$/, mark + '$1'));
}

/**
 * Comma lists the other expansions do not reach. YACPDB writes three kinds:
 *
 *   "2. Qf5, Qe4#"             White's alternatives: either mates
 *   "2.Qf6+ Se5,Kc5 3.Qb6#"    Black's alternatives after a move of White's
 *   "1...Ba1,Sd6 2.Sef2,Sc5#"  as many defences as mates, paired in order:
 *                              1...Ba1 2.Sef2#, 1...Sd6 2.Sc5#
 *
 * Read as they stood, the second move of each list became the next move of
 * the line and was handed to the other side, so a #2 answered 2.Sef2 with a
 * Black "Sc5#" and the board waited on a reply it could not make. A list of
 * defences at the head of the line with one mate after it ("1... Sd5, Kf4
 * 2. Q:f5#") is left to expandCommaAlternatives, which has always done that.
 *
 * The first alternative stays where it is. The others become lines of their
 * own that open at the list's move number ("2...Kc5 3.Qb6#"), which the tree
 * builder hangs beside the first by that number -- but only in a text whose
 * indentation says nothing (see assignVirtualIndentsForSection); where the
 * indentation carries the tree, such a line would land wherever its indent
 * put it. There a list is expanded only where copying the whole line is
 * harmless: at its head, or in a line that opens with a black move, whose
 * copies are sibling defences the display folds together again.
 */
function expandCommaLists(line: string, flat: boolean, selfmate: boolean, depth = 0): string[] {
  if (depth >= 6 || !line.includes(',')) return [line];
  const lead = line.slice(0, line.length - line.trimStart().length);
  const stash: string[] = [];
  const clean = line.replace(/\{[^}]*\}|\([^()]*\)|\[[^\][]*\]/g, m => {
    stash.push(m);
    return `\uE001${stash.length - 1}\uE001`;
  });
  // "1. Nb3!, Ka4; 2. Ka2:, a5;": here the comma parts White's move from
  // Black's, and the semicolon parts the moves. Nothing in it is a list.
  if (/;\s*\d+\s*\./.test(clean)) return [line];
  const restore = (s: string) => s.replace(/\uE001(\d+)\uE001/g, (_, i) => stash[Number(i)]);
  const opensWithBlack = /^\s*\d+\s*\.\s*(?:\.{2,3}|…)/.test(clean);

  for (const m of clean.matchAll(COMMA_LIST)) {
    const start = m.index ?? 0;
    const before = clean.slice(0, start);
    let alts = m[0].split(/\s*,\s*/);
    let tail = clean.slice(start + m[0].length);
    let side: 'w' | 'b';
    let found: RegExpMatchArray | null;
    if ((found = before.match(BLACK_NUMBER_BEFORE))) side = 'b';
    else if ((found = before.match(WHITE_NUMBER_BEFORE))) side = 'w';
    else if ((found = before.match(WHITE_MOVE_BEFORE))) side = 'b';
    else continue;
    const num = Number(found[1]);
    const atHead = /^\s*\d+\s*\.\s*(?:\.{2,3}|…)?\s*$/.test(before);

    let partners: string[] | null = null;
    let between = '';
    if (side === 'b') {
      const w = tail.match(WHITE_LIST_AFTER);
      if (w) {
        const whites = w[2].split(/\s*,\s*/);
        if (whites.length === alts.length && endsInMark(whites, !!w[3], selfmate)) {
          partners = carryMark(whites, !!w[3]);
          between = w[1];
          tail = tail.slice(w[0].length);
        }
      }
      if (!partners && atHead) continue;
    } else {
      const standalone = /^\s+#(?=\s|$)/.exec(tail);
      if (!endsInMark(alts, !!standalone, selfmate)) continue;
      alts = carryMark(alts, !!standalone);
      if (standalone) tail = tail.slice(standalone[0].length);
    }

    const copyWholeLine = atHead || (!flat && opensWithBlack);
    if (!copyWholeLine && !flat) continue;
    const number = side === 'b' ? `${num}...` : `${num}.`;
    /* A line of its own gets the moves after the list but not the brackets
       and comments: "2. Qf3, Qh4# (2. Qg5?)" noted a threat that fails, and
       copied onto "2.Qh4#" it read as that move's threat, which drew the next
       defence under it (D228460). */
    const bareTail = tail.replace(/\s*\uE001\d+\uE001/g, '');
    const out = alts.map((alt, i) => {
      const own = i > 0 && !copyWholeLine;
      const head = own ? lead + number : before;
      return restore(head + (partners ? alt + between + partners[i] : alt) + (own ? bareTail : tail));
    });
    return out.flatMap(l => expandCommaLists(l, flat, selfmate, depth + 1));
  }
  return [line];
}

/** The same alternatives inside a threat: "(2.Qf5, Qe4#)" is two threats. */
function commaThreatsToSlashes(threat: string, selfmate: boolean): string {
  return threat.replace(COMMA_LIST, (list, offset: number, whole: string) => {
    const before = whole.slice(0, offset);
    if (before.trim() && !WHITE_NUMBER_BEFORE.test(before)) return list;
    const moves = list.split(/\s*,\s*/);
    return endsInMark(moves, false, selfmate) ? carryMark(moves, false).join('/') : list;
  });
}

/**
 * Expand comma-separated alternative defenses into multiple lines.
 * e.g., "1... Sd5, Kf4 2. Q:f5#" → ["1... Sd5 2. Q:f5#", "1... Kf4 2. Q:f5#"]
 * Also handles: "1... Kd1, Sd3/c2 2. Bg4#" and threats like "~ 2. Qc6, Qc7#"
 *
 * Pattern: after a move number (e.g., "1..."), a comma separating two move-like tokens
 * where both sides look like chess moves (piece + square or wildcard).
 */
function expandCommaAlternatives(line: string): string[] {
  const indent = line.length - line.trimStart().length;
  const prefix = line.slice(0, indent);
  const content = line.trimStart();
  if (!content) return [line];

  // Remove braced annotations temporarily
  const braceParts: string[] = [];
  let cleanContent = content.replace(/\{[^}]*\}/g, (match) => {
    braceParts.push(match);
    return `__BRACE${braceParts.length - 1}__`;
  });

  // Remove parenthesized content temporarily
  const parenParts: string[] = [];
  cleanContent = cleanContent.replace(/\([^)]*\)/g, (match) => {
    parenParts.push(match);
    return `__PAREN${parenParts.length - 1}__`;
  });

  // Look for comma between move-like tokens in defense position
  // Match: moveNum "..." defense1 "," defense2 continuation
  // The move-like pattern: optional piece letter + square or piece + ~
  const moveToken = /(?:[KQRBSNP][a-h]?[1-8]?[x*:]?[a-h][1-8](?:=?[QRBNS])?|[a-h][x*:]?[a-h][1-8](?:=?[QRBNS])?|[KQRBSNP]?[a-h]?~|0-0-0|O-O-O|0-0|O-O|[a-h][1-8](?:=[QRBNS])?)[+#!?]*/;
  const moveTokenSrc = moveToken.source;

  // Pattern: (prefix with move number) (move1), (move2) (rest with next move number)
  // We look for comma separating moves after "..." (black's move)
  const commaPattern = new RegExp(
    `^(\\d+\\.\\s*\\.{2,3}\\s*)(${moveTokenSrc})\\s*,\\s*(${moveTokenSrc}(?:\\s*(?:\\/\\s*${moveTokenSrc})?)*)\\s+(\\d+\\..*)$`
  );

  const m = cleanContent.match(commaPattern);
  if (!m) return [line];

  const moveNumPrefix = m[1]; // "1... "
  const firstDefense = m[2]; // "Sd5"
  const restDefenses = m[3]; // "Kf4" (could be "Kf4/c2")
  const continuation = m[4]; // "2. Q:f5#"

  // Split additional defenses by comma (in case of 3+ alternatives)
  const allDefenses = [firstDefense, ...restDefenses.split(/\s*,\s*/)];

  const restore = (s: string) => {
    let result = s;
    result = result.replace(/__PAREN(\d+)__/g, (_, i) => parenParts[parseInt(i)]);
    result = result.replace(/__BRACE(\d+)__/g, (_, i) => braceParts[parseInt(i)]);
    return result;
  };

  return allDefenses.map(def =>
    restore(prefix + moveNumPrefix + def.trim() + ' ' + continuation)
  );
}

/**
 * Blank out PGN-style variation parentheses: any top-level (...) group that
 * spans multiple lines, contains nested parens, or is never closed. The
 * line-level threat extraction only handles simple single-line pairs like
 * "(2.Rd1#)" — anything more complex (common in PGN-annotated studies) used
 * to leak its content into the segment stream, turning variation moves into
 * bogus root nodes so wrong first moves were accepted as correct.
 * The span is removed entirely (newlines included, replaced by one space) so
 * the surrounding main line joins back together — leaving whitespace-only
 * lines behind would act as blank-line section breaks and fragment the tree.
 */
function blankComplexParens(text: string): string {
  const chars: string[] = [...text];
  let depth = 0;
  let groupStart = -1;
  let maxDepth = 0;
  let hasNewline = false;
  const blank = (from: number, to: number) => {
    for (let i = from; i <= to; i++) chars[i] = '';
    chars[from] = ' ';
  };
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === '(') {
      depth++;
      if (depth === 1) { groupStart = i; maxDepth = 1; hasNewline = false; }
      else maxDepth = Math.max(maxDepth, depth);
    } else if (c === ')') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && (maxDepth > 1 || hasNewline)) blank(groupStart, i);
      }
    } else if (c === '\n' && depth > 0) {
      hasNewline = true;
    }
  }
  // Unclosed group (truncated solution text): blank to end of text
  if (depth > 0 && groupStart >= 0) blank(groupStart, chars.length - 1);
  return chars.join('');
}

function parseSegments(solutionText: string, opts: ParseOptions = {}): Segment[] {
  const segments: Segment[] = [];
  // Collapse newlines inside {...} annotations so multi-line annotations don't
  // leak their content as separate lines (e.g. "{\n1.Kf8? Bb2!}" in D523450).
  // A comment that opens at the end of one line and closes at the start of the
  // next leaves real moves after the closing brace; collapsing alone drags them
  // onto the previous line, where the deeper indent buries them under the move
  // above (D514's "2.Bc1-b2 #{" / "}1...f7-f5"). Give those their line back,
  // indented to where the closing brace stood.
  let collapsed = solutionText
    .replace(/(\{[^}]*\})([ \t]*)(?=\S)/g,
      (_m, annotation: string, gap: string, offset: number, whole: string) => {
      const flat = annotation.replace(/\s*\n\s*/g, ' ');
      if (!annotation.includes('\n')) return flat + gap;
      // Inside a PGN variation it is the parentheses that nest the moves, not
      // the line breaks, and restoring one changes which spans
      // blankComplexParens removes (D275454 gained two accepted keys that way).
      const before = whole.slice(0, offset);
      const open = (before.match(/\(/g) || []).length - (before.match(/\)/g) || []).length;
      if (open > 0) return flat + gap;
      // Text that carries the same line of play forward -- its move number is
      // higher than the one before the comment -- belongs on the line it is
      // already on. Only a move that starts a fresh variation, where the
      // number goes back, needs a line of its own. D394975 writes
      // "3.Qf5-e6 + Kc4-c5{" / "  }4.Qe6-b6 +": splitting that stranded the
      // rest of an s#5 and left it showing as a two-move fragment.
      const prevNumber = [...before.matchAll(/(?<!\d)(\d+)\s*\./g)].pop();
      const nextNumber = /^\s*(\d+)\s*\./.exec(whole.slice(offset + _m.length));
      // Only a numbered move earns a line back. Anything else -- most often a
      // second comment, as in D394911's "#{" / "}{ .. 2.Sd6? Be1! }" -- would
      // be left alone on a line that then reads as blank, and a blank line
      // resets the stack and drops the variations that follow it.
      if (!nextNumber) return flat + gap;
      if (prevNumber && Number(nextNumber[1]) > Number(prevNumber[1])) {
        return flat + gap;
      }
      // Indent the restored line to where the closing brace sat. Only the
      // leading whitespace of that line -- the rest of it is comment text
      // ("{cook\nGC}" would otherwise spill "GC" into the moves).
      const closingLine = annotation.slice(annotation.lastIndexOf('\n') + 1);
      const indent = /^[ \t]*/.exec(closingLine)?.[0] ?? '';
      return flat + '\n' + indent + gap;
    })
    .replace(/\{[^}]*\}/g, m => m.replace(/\s*\n\s*/g, ' '));
  // Then remove PGN-style multi-line/nested variation parens (see above).
  collapsed = blankComplexParens(collapsed);
  const rawLines = collapsed.split('\n');

  // Join continuation lines:
  // 1. Line ends with "-" (move split: "Be5-\nf4+" → "Be5-f4+")
  // 2. Line ends with "N." (move number split: "5.\nNd7" → "5. Nd7")
  const joinedLines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmedEnd = line.trimEnd();
    if (trimmedEnd.endsWith('-') && i + 1 < rawLines.length) {
      // Join with next line: "Be5- " + "f4+" → "Be5-f4+"
      const nextTrimmed = rawLines[i + 1].trimStart();
      joinedLines.push(trimmedEnd + nextTrimmed);
      i++; // skip next line
    } else if (/\d+\.\s*$/.test(trimmedEnd) && i + 1 < rawLines.length) {
      // Line ends with move number (e.g., "5.") — join with next line
      const nextTrimmed = rawLines[i + 1].trimStart();
      joinedLines.push(trimmedEnd + ' ' + nextTrimmed);
      i++;
    } else {
      joinedLines.push(line);
    }
  }

  // Expand comma-separated defenses before slash expansion.
  // Pattern: "1... Sd5, Kf4 2. Q:f5#" → two lines with same continuation.
  // The other comma lists first (expandCommaLists), which need to know
  // whether the indentation carries the tree -- the same small-spread test
  // assignVirtualIndentsForSection applies to the whole text.
  const lineIndents = joinedLines.filter(l => l.trim()).map(l => l.length - l.trimStart().length);
  const flat = lineIndents.length === 0 || Math.max(...lineIndents) - Math.min(...lineIndents) <= 3;
  const commaExpanded: string[] = [];
  for (const line of joinedLines.flatMap(l => expandCommaLists(l, flat, !!opts.selfmate))) {
    commaExpanded.push(...expandCommaAlternatives(line));
  }

  // Expand slash alternatives before parsing — every group on the line, not
  // just the first, or the leftovers get read as a run of successive moves.
  const lines: string[] = [];
  for (const line of commaExpanded) {
    lines.push(...expandAllSlashAlternatives(line));
  }

  let lineIndex = 0;
  let lastLineWasBlank = false;
  // "Cooks:" written on a line of its own is a heading: the lines under it are
  // the cooks (D655577, D537792). A twin label starts a new diagram and clears
  // it again.
  let inCookBlock = false;
  for (const line of lines) {
    const lineIndent = line.length - line.trimStart().length;
    const trimmed = line.trimStart();
    if (!trimmed) { lineIndex++; lastLineWasBlank = true; continue; }

    // Extract {...} annotations FIRST, replacing them with sentinels so that
    // (a) prose inside braces can't pollute key/try markers or threat parens, and
    // (b) move numbers inside braces don't tear the line apart when splitting.
    // Sentinels are resolved back into each segment's `annotation` below.
    const lineAnnotations: string[] = [];
    let trimmedClean = trimmed.replace(/\{[^}]*\}/g, (match) => {
      lineAnnotations.push(match.slice(1, -1).trim());
      return '\uE000' + (lineAnnotations.length - 1) + '\uE000';
    });

    // Extract parenthesized/bracketed threat content before splitting on move numbers
    // (splitting on \d+\. would break content like "(2.Rd1#)" or "[2.Qf7#]").
    // Parens and brackets are matched separately: a paren threat may carry mate
    // labels inside it — "(2.Bxe4#[A]/Rxe3#[B])" — and a single character class
    // closing on either "]" or ")" used to cut the match at the first label,
    // leaking "/Rxe3#" into the try's own segment as a phantom black defence.
    const lineThreatTexts: string[] = [];
    trimmedClean = trimmedClean.replace(/\([^()]*\)|\[[^\][]*\]/g, (match) => {
      const inner = match.slice(1, -1);
      lineThreatTexts.push(inner);
      return '';
    });

    // Whether this line is a recorded cook. The {…} notes are collected above,
    // so both spellings are visible here — the label sits at the head of the
    // line, the note can sit on any move of it.
    if (TWIN_LABEL.test(trimmed)) inCookBlock = false;
    const lineHasCookNote = COOK_LABEL.test(trimmed) || lineAnnotations.some(a => COOK_NOTE.test(a));
    const lineIsCook = lineHasCookNote || inCookBlock;
    const segmentsBeforeLine = segments.length;

    // Split on move number patterns
    const parts = trimmedClean.split(/(?<!\d)(?=\d+\.)/); // lookbehind: never split inside a number ("12." must not become "1"+"2.")
    let segIndex = 0;

    for (const part of parts) {
      let text = part.trim();
      if (!text) continue;

      // Resolve annotation sentinels: collect this segment's annotation text
      // and remove the markers before any flag/move parsing.
      let annotation = '';
      text = text.replace(/\uE000(\d+)\uE000/g, (_, idx) => {
        const a = lineAnnotations[parseInt(idx)] || '';
        if (a) annotation = annotation ? annotation + ' ' + a : a;
        return ' ';
      }).trim();
      if (!text) continue;

      const hasThreatLabel = /\bthreat:?\s*$/i.test(text);
      text = text.replace(/\bthreat:?\s*$/i, '').trim();

      // isThreat means this segment IS a threat move (from parens).
      // hasThreatLabel means this segment's CHILDREN are threats (e.g., "1.f4 ! threat:")
      // — the segment itself is a regular key/try move, not a threat.
      const isThreat = false;

      const moveNumMatch = text.match(/^(\d+)\.\s*(\.\.\.?)?/);
      let moveNum: number | null = null;
      let isBlackNum = false;

      if (moveNumMatch) {
        moveNum = parseInt(moveNumMatch[1]);
        isBlackNum = !!moveNumMatch[2];
        text = text.slice(moveNumMatch[0].length).trim();
      }

      text = text.replace(/^\.\.\.\s*/, '');
      if (!text) continue;

      const moves = extractMoveStrings(text);
      if (moves.length === 0) continue;

      // Key/try markers belong to the segment's OWN move (the first one) — only
      // markers adjacent to it count. A '!' later in the segment is typically a
      // refutation of a try on the same line ("1. Qh1? e4!") and must NOT mark
      // the try as a key move. Only the first move of a segment receives these
      // flags when nodes are built, so scan up to where the second move starts.
      let markerZone = text;
      if (moves.length > 1) {
        const firstEnd = text.indexOf(moves[0]) + moves[0].length;
        const secondStart = text.indexOf(moves[1], firstEnd);
        if (secondStart > 0) markerZone = text.slice(0, secondStart);
      }
      const isKey = markerZone.includes('!');
      const isTry = markerZone.includes('?');

      segments.push({
        indent: lineIndent,
        lineIndex,
        segIndex,
        moveNum,
        isBlackNum,
        moves,
        isKey,
        isTry,
        isThreat,
        hasThreatLabel,
        isCook: lineIsCook,
        annotation,
        afterBlankLine: segIndex === 0 && lastLineWasBlank,
        sourceIndent: lineIndent,
      });
      segIndex++;
    }

    // Add threat segments from parenthesized content extracted earlier.
    // A slash inside the parens is a DOUBLE threat: "(2.Bxe4#/Rxe3#)" is two
    // separate threats, not a sequence. Expand the alternatives into one
    // threat segment each. A sequence ("2.Re1 Kd5 3.Re5#") has no slash and
    // stays one segment, chained as before. Mate labels ("[A]") are metadata
    // and are stripped so they cannot glue to the move text.
    for (const threatText of lineThreatTexts) {
      const cleanThreat = threatText
        .replace(/\uE000\d+\uE000/g, ' ')
        .replace(/\[[^\][]*\]/g, ' ')
        .trim();
      for (const alt of expandAllSlashAlternatives(commaThreatsToSlashes(cleanThreat, !!opts.selfmate))) {
        const threatMoves = extractMoveStrings(alt.replace(/^\s*\d+\./, '').trim());
        if (threatMoves.length === 0) continue;
        segments.push({
          indent: lineIndent + 1,
          lineIndex,
          segIndex,
          moveNum: null,
          isBlackNum: false,
          moves: threatMoves,
          isKey: false,
          isTry: false,
          isThreat: true,
          hasThreatLabel: false,
          isCook: lineIsCook,
          annotation: '',
          afterBlankLine: false,
          sourceIndent: lineIndent,
        });
        segIndex++;
      }
    }

    // The note carried no moves of its own — it was a heading for the lines
    // that follow, not a mark on this one.
    if (lineHasCookNote && segments.length === segmentsBeforeLine) inCookBlock = true;

    lastLineWasBlank = false;
    lineIndex++;
  }

  // PGN-style solutions may be wrapped entirely in {...} — annotation extraction
  // would then leave nothing to parse. Fall back to treating braces as transparent
  // (strip only the brace characters, keep the content).
  if (segments.length === 0 && solutionText.includes('{')) {
    return parseSegments(solutionText.replace(/[{}]/g, ' '), opts);
  }

  return segments;
}

// ── Virtual indent assignment ────────────────────────────
// When all segments have the same indent (common in YACPDB), compute
// virtual indents from move numbers so the tree builder works correctly.

function assignVirtualIndentsForSection(segments: Segment[], firstMoveColor: 'w' | 'b'): void {
  if (segments.length <= 1) return;
  const nonThreatSegs = segments.filter(s => !s.isThreat);
  if (nonThreatSegs.length <= 1) return;
  // "Flat" text = indentation does not encode the tree. Historically this
  // required every segment to share one indent, but real flat texts often mix
  // 0-2 spaces (wrapped lines, tries indented by two — e.g. D259137), which
  // used to disable virtual indents entirely and shatter the mainline into
  // root fragments. Genuine tree indentation uses bigger steps (4+ per level),
  // so a small spread is still treated as flat.
  const indents = nonThreatSegs.map(s => s.indent);
  const spread = Math.max(...indents) - Math.min(...indents);
  if (spread > 3) return;

  let prevWasThreat = false;
  let threatBaseIndent = 0;
  let prevIndent = -1;

  for (const seg of segments) {
    if (seg.moveNum !== null) {
      const n = seg.moveNum;
      if (firstMoveColor === 'w') {
        seg.indent = seg.isBlackNum ? (n - 1) * 2 + 1 : (n - 1) * 2;
      } else {
        seg.indent = seg.isBlackNum ? (n - 1) * 2 : (n - 1) * 2 + 1;
      }
    } else if (!seg.isThreat && prevIndent >= 0) {
      // Un-numbered segment (a line starting with a bare reply move):
      // continuation of the previous segment, one level deeper — its raw
      // indent would otherwise pop the stack all the way to the root.
      seg.indent = prevIndent + 1;
    }

    // Threat continuations should be at parent indent + 1, not their move-number indent
    if (prevWasThreat) {
      seg.indent = threatBaseIndent + 1;
    }

    // Threat segments from parens: place at the indent of the key move (first seg on same line) + 1
    if (seg.isThreat && seg.moveNum === null) {
      const keySeg = segments.find(s => s.lineIndex === seg.lineIndex && !s.isThreat);
      if (keySeg) {
        seg.indent = keySeg.indent + 1;
      }
    }

    prevWasThreat = seg.isThreat;
    if (seg.isThreat) {
      threatBaseIndent = seg.indent;
    }
    if (!seg.isThreat) {
      // Deepest point of this segment's own chain (each move pushes one level)
      prevIndent = seg.indent + Math.max(0, seg.moves.length - 1);
    }
  }
}

function assignVirtualIndents(segments: Segment[], firstMoveColor: 'w' | 'b'): void {
  // Process each blank-line-separated section independently
  // This handles cases where try sections have different indentation from key sections
  let sectionStart = 0;
  for (let i = 0; i <= segments.length; i++) {
    if (i === segments.length || segments[i].afterBlankLine) {
      const section = segments.slice(sectionStart, i);
      if (section.length > 0) {
        assignVirtualIndentsForSection(section, firstMoveColor);
      }
      sectionStart = i;
    }
  }
}

// ── Build solution tree ─────────────────────────────────

function makeNode(moveText: string, color: 'w' | 'b', isKey: boolean, isTry: boolean, isThreat: boolean, annotation: string, isCook = false): SolutionNode {
  const isMate = moveText.includes('#');
  const isCheck = moveText.includes('+') && !isMate;

  const node: SolutionNode = {
    move: moveText.replace(/[!?]+/g, '').trim(),
    moveUci: yacpdbToUci(moveText),
    moveSan: yacpdbToSanApprox(moveText),
    isKey,
    isTry,
    isThreat,
    isMate,
    isCheck,
    annotation,
    children: [],
    color,
  };
  // Set only when true: every other node stays the shape it had before.
  if (isCook) node.isCook = true;
  return node;
}

/**
 * Parse PGN-style solution text (wrapped in {}) directly into a tree.
 * PGN solutions use line breaks for formatting only and () for side variations.
 */
function parsePgnSolution(text: string, firstMoveColor: 'w' | 'b'): SolutionNode[] {
  // Strip outer {} and join all lines into one
  let content = text.replace(/^\{|\}$/g, '').trim();
  // Remove result markers
  content = content.replace(/\s+(?:1-0|0-1|1\/2-1\/2)\s*$/, '');
  // Join all lines into one (line breaks are just formatting in PGN)
  content = content.replace(/\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
  // Remove common non-move tokens
  content = content.replace(/\bmain\b/gi, '');

  // Tokenize: extract move numbers, moves, (, ), and annotations
  const tokens: string[] = [];
  let remaining = content;
  while (remaining.length > 0) {
    remaining = remaining.trimStart();
    if (!remaining) break;

    if (remaining[0] === '(' || remaining[0] === ')') {
      tokens.push(remaining[0]);
      remaining = remaining.slice(1);
      continue;
    }

    // Move number: "1." or "1..."
    const numMatch = remaining.match(/^(\d+\.+\s*)/);
    if (numMatch) {
      remaining = remaining.slice(numMatch[0].length);
      // Skip move numbers (they're implicit in PGN)
      // But detect "..." for black's move
      if (numMatch[0].includes('...')) {
        tokens.push('...');
      }
      continue;
    }

    // Castling
    const castling = remaining.match(CASTLING_RE);
    if (castling) {
      tokens.push(castling[0]);
      remaining = remaining.slice(castling[0].length);
      continue;
    }

    // Move
    const m = remaining.match(ANY_MOVE_RE);
    if (m && m.index === 0) {
      tokens.push(m[0]);
      remaining = remaining.slice(m[0].length);
      continue;
    }

    // Skip one character
    remaining = remaining.slice(1);
  }

  // Build tree from tokens using a stack-based approach
  // Track ancestry: ancestors[i] is the parent of ancestors[i+1], lastNode is the deepest
  const rootNodes: SolutionNode[] = [];
  const ancestors: SolutionNode[] = []; // stack of ancestor nodes (excluding lastNode)
  let currentColor = firstMoveColor;
  let lastNode: SolutionNode | null = null;

  // Saved state for variation branches
  const savedStates: { ancestors: SolutionNode[]; lastNode: SolutionNode | null; color: 'w' | 'b' }[] = [];

  for (const token of tokens) {
    if (token === '(') {
      // Save current state: we'll create an alternative to the last move
      savedStates.push({
        ancestors: [...ancestors],
        lastNode,
        color: currentColor,
      });
      // Go back to the parent of lastNode (the position BEFORE lastNode was played)
      // The variation will be a sibling of lastNode
      if (lastNode) {
        currentColor = lastNode.color; // same color as the move being replaced
        // lastNode becomes the ancestor tip, so parent of lastNode is the new current
        lastNode = ancestors.length > 0 ? ancestors[ancestors.length - 1] : null;
        // Remove the last ancestor since we popped back
        if (ancestors.length > 0) ancestors.pop();
      }
    } else if (token === ')') {
      if (savedStates.length > 0) {
        const saved = savedStates.pop()!;
        ancestors.length = 0;
        ancestors.push(...saved.ancestors);
        lastNode = saved.lastNode;
        currentColor = saved.color;
      }
    } else if (token === '...') {
      // Black to move marker — skip (color alternation handles this)
    } else {
      // It's a move
      const node = makeNode(token, currentColor, false, false, false, '');
      if (lastNode) {
        lastNode.children.push(node);
        ancestors.push(lastNode);
      } else {
        rootNodes.push(node);
      }
      lastNode = node;
      currentColor = currentColor === 'w' ? 'b' : 'w';
    }
  }

  return rootNodes;
}

/**
 * Extract twin position modifications from solution text.
 * Returns FEN modifications for the a) twin if present.
 * Format: "a) bKa7-->a6" means move black King from a7 to a6.
 * Piece codes: b/w + K/Q/R/B/S/P, where S = Knight.
 */
/**
 * The text from "a)" on, or null when this is not a twin block.
 *
 * A zeroposition holds the block one line down. The diagram is not a problem
 * in its own right -- only the twins are -- and YACPDB says so first:
 * "{zeroposition}", "{(zero position)}", "{0-position}", or a fairy condition
 * by name. Read past a preamble like that so the twins are found.
 *
 * Only when it carries no moves. A study labels its variations "A)" and "B)"
 * at the start of a line, and twin markers are matched case-insensitively, so
 * a solution that has already begun would otherwise be cut into "twins" at its
 * own variation labels. The marker we skip forward to must be the lowercase
 * "a)" YACPDB writes twins with, for the same reason.
 */
function twinBlockStart(trimmed: string): string | null {
  if (/^a\)/i.test(trimmed)) return trimmed;
  const at = trimmed.search(/\n[ \t]*a\)/);
  if (at < 0) return null;
  const preamble = trimmed.slice(0, at).replace(/\{[^}]*\}/g, ' ');
  if (/\d\s*\.{1,3}\s*\S/.test(preamble)) return null; // a solution, not a preamble
  return trimmed.slice(at).replace(/^\s+/, '');
}

export function extractTwinFenMods(solutionText: string): FenMod[] | null {
  if (!solutionText) return null;
  const trimmed = twinBlockStart(normalizeCyrillicMoves(solutionText.trim()));
  if (!trimmed) return null;
  // Match "a) <modifications>" at the start
  const aMatch = trimmed.match(/^a\)\s*(.*?)(?:\n|$)/i);
  if (!aMatch) return null;
  /* The change and the start of the solution can share the line -- see the
     same cut in parseTwins, which this has to agree with or the board would
     not be the position twin a) is solved from. */
  const line = aMatch[1];
  const solAt = line.search(/(?<=\s)\d+\s*\./);
  const modLine = (solAt > 0 ? line.slice(0, solAt) : line).trim();
  if (!modLine) return null; // a) with no modification — diagram position

  const mods = parseTwinMods(modLine);
  return mods.length > 0 ? mods : null;
}

/** FEN modification: move, add, or remove a piece */
type FenMod =
  | { type: 'move'; from: string; to: string }
  | { type: 'swap'; a: string; b: string }
  | { type: 'add'; square: string; piece: string }   // piece = FEN char like 'P','p','N','n'
  | { type: 'remove'; square: string };

/** Convert YACPDB piece code to FEN char: wK→K, bK→k, wP→P, bS→n */
function pieceToFen(colorPiece: string): string {
  const color = colorPiece[0]; // 'w' or 'b'
  let piece = colorPiece[1].toUpperCase();
  if (piece === 'S') piece = 'N'; // Knight
  return color === 'w' ? piece : piece.toLowerCase();
}

/** Parse twin modification line into FenMod array */
/* How a twin names a piece. YACPDB is not consistent about it: colour first
   ("wR"), piece first ("RW"), or the colour left off entirely ("R"), and the
   arrow is written with one dash or two. */
const PIECE_TAG = '(?:[bw][KQRBSP]|[KQRBSP][bw]|[KQRBSP])';

export function parseTwinMods(modLine: string): FenMod[] {
  const mods: FenMod[] = [];
  if (!modLine) return mods;

  /* Each pattern blanks what it claimed before the next one reads, so an
     operand is never counted twice -- the "wR" of "-wRf3" as a substitution,
     or the "wRg1-->" of a swap as a move.

     The patterns run in the order that keeps them from stealing each other's
     text, which is not the order the changes have to be applied in: in
     "-wPh2 wKh3-->h2" the pawn has to leave h2 before the king arrives, or
     the king is what gets removed. So each change remembers where it was
     written and they are sorted back into that order at the end. */
  const at: number[] = [];
  let rest = modLine;
  const take = (pattern: RegExp, onMatch: (m: RegExpExecArray) => void) => {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(rest)) !== null) {
      const before = mods.length;
      onMatch(m);
      for (let i = before; i < mods.length; i++) at[i] = m.index;
    }
    pattern.lastIndex = 0;
    rest = rest.replace(pattern, (matched) => ' '.repeat(matched.length));
  };

  // Swap: "wRg1<-->wSh4", "SWc1<->KWf7" -- the two squares trade pieces. Read
  // before the move patterns, whose arrow is a part of this one.
  take(new RegExp(`${PIECE_TAG}([a-h][1-8])\\s*<-{1,2}>\\s*${PIECE_TAG}([a-h][1-8])`, 'gi'),
    m => mods.push({ type: 'swap', a: m[1], b: m[2] }));

  // Move: "bKa7-->a6", "wKc2 --> c1", "Ra3->f8"
  take(new RegExp(`${PIECE_TAG}([a-h][1-8])\\s*-{1,2}>\\s*([a-h][1-8])`, 'gi'),
    m => mods.push({ type: 'move', from: m[1], to: m[2] }));

  // Remove: "-wRf3", "-bBg8", "-Bd6", "- wPa6"
  take(new RegExp(`-\\s*${PIECE_TAG}([a-h][1-8])`, 'gi'),
    m => mods.push({ type: 'remove', square: m[1] }));

  // Add: "+wBb3" or "+bSg8"
  take(/\+([bw][KQRBSP])([a-h][1-8])/gi, m => {
    // Skip if this is "+b)" twin marker (not a piece addition)
    if (m[1].toLowerCase() === 'b)' || /^\+[b-z]\)/.test(m[0])) return;
    mods.push({ type: 'add', square: m[2], piece: pieceToFen(m[1]) });
  });

  // Substitution: a bare "wRa8" means the piece standing on a8 becomes a white
  // rook. Only the spelt-out colour counts here -- a bare "Ra8" would swallow
  // any stray piece-and-square in the line.
  take(/([bw][KQRBSP])([a-h][1-8])/gi,
    m => mods.push({ type: 'add', square: m[2], piece: pieceToFen(m[1]) }));

  return mods
    .map((mod, i) => ({ mod, i }))
    .sort((x, y) => at[x.i] - at[y.i] || x.i - y.i)
    .map(e => e.mod);
}

/**
 * Apply twin position modifications to a FEN string.
 * Supports move, add, and remove operations.
 */
export function applyTwinMods(fen: string, mods: FenMod[] | { from: string; to: string }[]): string {
  const parts = fen.split(' ');
  const rows = parts[0].split('/');

  // Convert FEN board to 8x8 array
  const board: string[][] = rows.map(row => {
    const cells: string[] = [];
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        for (let i = 0; i < parseInt(ch); i++) cells.push('');
      } else {
        cells.push(ch);
      }
    }
    return cells;
  });

  const sq = (s: string) => ({ col: s.charCodeAt(0) - 97, row: 8 - parseInt(s[1]) });

  for (const mod of mods) {
    if ('type' in mod) {
      // New FenMod format
      if (mod.type === 'move') {
        const f = sq(mod.from);
        const t = sq(mod.to);
        const piece = board[f.row][f.col];
        if (piece) {
          board[f.row][f.col] = '';
          board[t.row][t.col] = piece;
        }
      } else if (mod.type === 'swap') {
        const a = sq(mod.a);
        const b = sq(mod.b);
        const tmp = board[a.row][a.col];
        board[a.row][a.col] = board[b.row][b.col];
        board[b.row][b.col] = tmp;
      } else if (mod.type === 'remove') {
        const s = sq(mod.square);
        board[s.row][s.col] = '';
      } else if (mod.type === 'add') {
        const s = sq(mod.square);
        board[s.row][s.col] = mod.piece;
      }
    } else {
      // Legacy {from, to} format
      const f = sq(mod.from);
      const t = sq(mod.to);
      const piece = board[f.row][f.col];
      if (piece) {
        board[f.row][f.col] = '';
        board[t.row][t.col] = piece;
      }
    }
  }

  // Convert back to FEN
  const newRows = board.map(row => {
    let fenRow = '';
    let empty = 0;
    for (const cell of row) {
      if (cell === '') {
        empty++;
      } else {
        if (empty > 0) { fenRow += empty; empty = 0; }
        fenRow += cell;
      }
    }
    if (empty > 0) fenRow += empty;
    return fenRow;
  });

  parts[0] = newRows.join('/');
  return parts.join(' ');
}

export interface TwinData {
  id: string;          // "a", "b", "c"...
  label: string;       // "a) diagram", "b) bKa7→a6"
  fen: string;
  /** Who moves first here — a twin may carry its own stipulation ("{h#2}"). */
  firstColor: 'w' | 'b';
  solutionTree: SolutionNode[];
  fullSolutionTree: SolutionNode[];
}

/**
 * Parse all twins from solution text.
 * Returns array of twin data with computed FENs and solution trees.
 * Returns null if not a twin problem.
 */
/**
 * The prose comments in a YACPDB solution, in the order they appear.
 *
 * Most braces hold machine annotation -- "display-departure-file" is an
 * instruction to YACPDB's own renderer, "(S~)" restates the move next to it,
 * "A"/"[B]"/"(a)" label variations. Across 28,587 problems only 101 brace
 * groups were sentences, but those carry what the diagram cannot say: "Black
 * has no last move.", "Original stipulation: ...", "The position of Black
 * Pawns is illegal. One White piece must be removed!". Nearly half sit before
 * the first move, describing the problem rather than any move in it.
 *
 * So: keep what reads as a sentence, drop the rest.
 */
const MACHINE_NOTE = /^(?:display-departure-(?:file|rank)|cook|dual|zugzwang|stalemate|[A-Za-z]|\[[A-Za-z]\]|\([a-z]\)|#\d+)$/i;

export function extractSolutionNotes(solutionText: string): string[] {
  if (!solutionText) return [];
  const notes: string[] = [];
  const seen = new Set<string>();
  for (const m of solutionText.matchAll(/\{([^}]*)\}/g)) {
    const inner = m[1].replace(/\s+/g, ' ').trim().replace(/^\(([^()]*)\)$/, '$1').trim();
    if (!inner || MACHINE_NOTE.test(inner)) continue;
    const words = inner.split(' ').filter(Boolean);
    // A sentence, not a move or a label: several words, at least two of them
    // words rather than notation.
    const real = words.filter(w => /^[A-Za-zÀ-ÿ]{3,}$/.test(w.replace(/[.,;:!?()'"]/g, '')));
    if (words.length < 3 || real.length < 2) continue;
    if (seen.has(inner)) continue;
    seen.add(inner);
    notes.push(inner);
  }
  return notes;
}

/**
 * Rotate or mirror the whole board. YACPDB twins do this instead of moving
 * pieces one by one: "b) rotate 90" is the same diagram seen from another side,
 * and its solution is written in the turned coordinates -- so without the turn,
 * the moves land on empty squares.
 *
 * Directions follow the YACPDB convention, taken from the fairy app where they
 * were checked against that corpus. Castling and en passant do not survive a
 * board that has been picked up and put down again; the side to move does.
 */
export function transformBoard(
  fen: string,
  kind: 'rotate90' | 'rotate180' | 'rotate270' | 'mirrorH' | 'mirrorV' | 'diagA1H8' | 'diagA8H1',
): string {
  const parts = fen.split(' ');
  const grid: (string | null)[][] = parts[0].split('/').map(row => {
    const cells: (string | null)[] = [];
    for (const ch of row) {
      if (ch >= '1' && ch <= '9') for (let i = 0; i < parseInt(ch); i++) cells.push(null);
      else cells.push(ch);
    }
    while (cells.length < 8) cells.push(null);
    return cells.slice(0, 8);
  });
  while (grid.length < 8) grid.push(Array(8).fill(null));

  const out: (string | null)[][] = Array.from({ length: 8 }, () => Array<string | null>(8).fill(null));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      let nr = r, nc = c;
      switch (kind) {
        case 'rotate90': nr = 7 - c; nc = r; break;
        case 'rotate180': nr = 7 - r; nc = 7 - c; break;
        case 'rotate270': nr = c; nc = 7 - r; break;
        case 'mirrorH': nc = 7 - c; break;
        case 'mirrorV': nr = 7 - r; break;
        // Reflections in the two long diagonals: a1-h8 keeps a1 and h8 in
        // place, a8-h1 keeps a8 and h1.
        case 'diagA1H8': nr = 7 - c; nc = 7 - r; break;
        case 'diagA8H1': nr = c; nc = r; break;
      }
      out[nr][nc] = grid[r][c];
    }
  }

  const rows = out.map(row => {
    let str = '', empty = 0;
    for (const cell of row) {
      if (cell === null) empty++;
      else { if (empty) { str += empty; empty = 0; } str += cell; }
    }
    return empty ? str + empty : str;
  });
  return `${rows.join('/')} ${parts[1] || 'w'} - - 0 1`;
}

/**
 * Slide every piece by the vector the twin names: "shift h1 ==> g1" moves the
 * whole arrangement one file left. Anything pushed off the edge is dropped --
 * a twin that did that would not be a twin.
 */
export function shiftBoard(fen: string, from: string, to: string): string {
  const parts = fen.split(' ');
  const grid: (string | null)[][] = parts[0].split('/').map(row => {
    const cells: (string | null)[] = [];
    for (const ch of row) {
      if (ch >= '1' && ch <= '9') for (let i = 0; i < parseInt(ch); i++) cells.push(null);
      else cells.push(ch);
    }
    while (cells.length < 8) cells.push(null);
    return cells.slice(0, 8);
  });
  while (grid.length < 8) grid.push(Array(8).fill(null));

  const dCol = to.charCodeAt(0) - from.charCodeAt(0);
  const dRow = (8 - parseInt(to[1])) - (8 - parseInt(from[1]));
  const out: (string | null)[][] = Array.from({ length: 8 }, () => Array<string | null>(8).fill(null));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const nr = r + dRow, nc = c + dCol;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
      out[nr][nc] = grid[r][c];
    }
  }

  const rows = out.map(row => {
    let str = '', empty = 0;
    for (const cell of row) {
      if (cell === null) empty++;
      else { if (empty) { str += empty; empty = 0; } str += cell; }
    }
    return empty ? str + empty : str;
  });
  return `${rows.join('/')} ${parts[1] || 'w'} - - 0 1`;
}

/** "rotate 90", "mirror a1<-->h1", "reflect" — a whole-board twin change. */
const TWIN_GEO_RE = /\b(rotate\s*(?:90|180|270)|mirror|reflect)\b/i;
/** "shift h1 ==> g1" — the whole arrangement slides across the board. */
const TWIN_SHIFT_RE = /\bshift\s*([a-h][1-8])\s*=*>\s*([a-h][1-8])/i;

/** The two squares a mirror swaps, which is what names its axis. */
const TWIN_MIRROR_AXIS_RE = /([a-h][1-8])\s*<-+>\s*([a-h][1-8])/i;

/**
 * Read the axis out of "mirror a1<-->h1": the two squares that change places.
 * Same rank means the files are swapped, same file means the ranks are, and a
 * corner pair names one of the diagonals.
 */
function mirrorKindFrom(modLine: string): 'mirrorH' | 'mirrorV' | 'diagA1H8' | 'diagA8H1' {
  const m = modLine.match(TWIN_MIRROR_AXIS_RE);
  if (!m) return 'mirrorH';
  const [a, b] = [m[1].toLowerCase(), m[2].toLowerCase()];
  if (a[1] === b[1]) return 'mirrorH';
  if (a[0] === b[0]) return 'mirrorV';
  // The label names the two squares that TRADE PLACES, so the axis is the other
  // diagonal: sending a1 to h8 is a reflection in the a8-h1 diagonal.
  const pair = [a, b].sort().join('');
  return pair === 'a1h8' ? 'diagA8H1' : pair === 'a8h1' ? 'diagA1H8' : 'mirrorH';
}
/** "{h#2}" — a twin that also changes the stipulation. */
const TWIN_STIP_RE = /\{\s*([a-z]*[#=]\d*)\s*\}/i;

export function parseTwins(solutionText: string, originalFen: string, firstMoveColor: 'w' | 'b' = 'w', opts: ParseOptions = {}): TwinData[] | null {
  if (!solutionText) return null;
  const trimmed = twinBlockStart(normalizeCyrillicMoves(solutionText.trim()));
  if (!trimmed) return null; // Not a twin problem

  // Split into twin sections: "a) ...", "b) ...", "+c) ..."
  const twinRegex = /(?:^|\n)\s*(\+?)([a-z])\)\s*/gi;
  const splits: { id: string; cumulative: boolean; start: number; modLine: string }[] = [];
  let match;
  while ((match = twinRegex.exec(trimmed)) !== null) {
    splits.push({
      id: match[2].toLowerCase(),
      cumulative: match[1] === '+',
      start: match.index + match[0].length,
      modLine: '',
    });
  }

  if (splits.length < 2) return null; // Need at least a) and b)

  // Extract each twin's content
  const twins: { id: string; cumulative: boolean; modLine: string; solutionText: string }[] = [];
  for (let i = 0; i < splits.length; i++) {
    const end = i + 1 < splits.length ? trimmed.lastIndexOf('\n', splits[i + 1].start - 1) : trimmed.length;
    const content = trimmed.slice(splits[i].start, end > splits[i].start ? end : trimmed.length);
    // First line is the mod line, rest is solution
    const lines = content.split('\n');
    const firstLine = lines[0].trim();
    // Check if first line is a modification or the start of the solution
    // A substitution line ("wRa8", or several separated by spaces) carries no
    // punctuation to recognise it by, so accept it only when the whole line is
    // made of those tokens -- otherwise a line of solution moves could pass.
    const hasMod = !/^\d/.test(firstLine) && (
      TWIN_GEO_RE.test(firstLine)
      || TWIN_SHIFT_RE.test(firstLine)
      || TWIN_STIP_RE.test(firstLine)
      || new RegExp(`${PIECE_TAG}[a-h][1-8]\\s*<?-{1,2}>|^-\\s*${PIECE_TAG}[a-h][1-8]|^\\+[bw][KQRBSP][a-h]`, 'i').test(firstLine)
      || /^[bw][KQRBSP][a-h][1-8](?:\s+[bw][KQRBSP][a-h][1-8])*$/.test(firstLine)
    );
    /* A twin can hold its change and the start of its solution on one line:
       "a) wBf4-->a8 1. Sa6-c5 Kd4*c5 ...". Claiming the whole line as the
       change threw that first move away and left a) unsolvable -- with the
       key gone, the second move became the key. Cut at the move number. */
    const solOnModLine = hasMod ? firstLine.search(/(?<=\s)\d+\s*\./) : -1;
    const modLine = hasMod ? (solOnModLine > 0 ? firstLine.slice(0, solOnModLine).trim() : firstLine) : '';
    const solText = hasMod
      ? (solOnModLine > 0 ? [firstLine.slice(solOnModLine), ...lines.slice(1)].join('\n') : lines.slice(1).join('\n'))
      : content;
    twins.push({
      id: splits[i].id,
      cumulative: splits[i].cumulative,
      modLine,
      solutionText: solText.trim(),
    });
  }

  // Build FENs: a) starts from originalFen, +b) is cumulative from previous, b) from original
  const result: TwinData[] = [];
  let prevFen = originalFen;

  for (const twin of twins) {
    const baseFen = twin.cumulative ? prevFen : originalFen;
    // The board turns first, then pieces move on the board as it now stands:
    // "b) rotate 180 -wRc1" names c1 on the turned board.
    let fen = baseFen;
    const geo = twin.modLine.match(TWIN_GEO_RE);
    if (geo) {
      const g = geo[1].toLowerCase().replace(/\s+/g, '');
      if (g === 'rotate90') fen = transformBoard(fen, 'rotate90');
      else if (g === 'rotate180') fen = transformBoard(fen, 'rotate180');
      else if (g === 'rotate270') fen = transformBoard(fen, 'rotate270');
      else fen = transformBoard(fen, mirrorKindFrom(twin.modLine));
    }
    const shift = twin.modLine.match(TWIN_SHIFT_RE);
    if (shift) fen = shiftBoard(fen, shift[1].toLowerCase(), shift[2].toLowerCase());
    const mods = parseTwinMods(twin.modLine);
    if (mods.length > 0) fen = applyTwinMods(fen, mods);
    prevFen = fen;

    // A twin may set its own stipulation ("b) rotate 90 {h#2}"), and a helpmate
    // is Black to move whatever the problem's own stipulation says.
    const stip = twin.modLine.match(TWIN_STIP_RE);
    const twinColor: 'w' | 'b' = stip ? (/^h/i.test(stip[1]) ? 'b' : 'w') : firstMoveColor;
    if (twinColor === 'b' && fen.includes(' w ')) fen = fen.replace(' w ', ' b ');
    if (twinColor === 'w' && fen.includes(' b ')) fen = fen.replace(' b ', ' w ');

    // Parse solution for this twin
    const solNodes = parseSolution(twin.solutionText, twinColor, opts);
    const label = twin.modLine
      ? `${twin.id}) ${twin.modLine}`
      : `${twin.id}) diagram`;

    result.push({
      id: twin.id,
      label,
      fen,
      firstColor: twinColor,
      solutionTree: filterKeyMoves(solNodes, twinColor),
      fullSolutionTree: solNodes,
    });
  }

  return result.length >= 2 ? result : null;
}

/**
 * Parse YACPDB solution text into a tree structure.
 * @param solutionText - Raw solution text from YACPDB
 * @param firstMoveColor - Color of the side that moves first ('w' for direct/self, 'b' for helpmate)
 */
/** Debug/tooling helper: segments after virtual-indent assignment (scripts only). */
export function debugSegments(solutionText: string, firstMoveColor: 'w' | 'b' = 'w'): Segment[] {
  const segments = parseSegments(solutionText);
  assignVirtualIndents(segments, firstMoveColor);
  return segments;
}

export function parseSolution(solutionText: string, firstMoveColor: 'w' | 'b' = 'w', opts: ParseOptions = {}): SolutionNode[] {
  if (!solutionText || !solutionText.trim()) return [];

  // Detect PGN-style solutions (wrapped in {})
  // A true PGN solution is entirely wrapped in {} with optional result.
  // If content continues after the closing }, it's a comment followed by indent-based notation.
  // Normalize "1. ... h5" → "1...h5" (black move with spaces around dots)
  const trimmedInput = normalizeCyrillicMoves(solutionText.trim()).replace(/(\d+)\.\s+\.\.\./g, '$1...');
  if (trimmedInput.startsWith('{')) {
    const closingBrace = trimmedInput.indexOf('}');
    const afterBrace = closingBrace >= 0 ? trimmedInput.slice(closingBrace + 1).trim() : '';
    // Only use PGN parser if the entire content is within {} (possibly with trailing result marker)
    if (!afterBrace || /^(?:1-0|0-1|1\/2-1\/2)?\s*$/.test(afterBrace)) {
      return parsePgnSolution(trimmedInput, firstMoveColor);
    }
    // Otherwise, strip the leading {comment} and parse the rest as indent-based
    return parseSolution(afterBrace, firstMoveColor, opts);
  }

  let processedText = trimmedInput;
  // Handle twin problems: strip "a)" prefix and only parse the first twin section
  // Twins b), c), etc. modify the position and can't be solved with the original FEN
  const twinMatch = processedText.match(/^[a-z]\)\s*/i);
  if (twinMatch) {
    processedText = processedText.slice(twinMatch[0].length);
    // Remove everything from the next twin marker onwards (b), +c), etc.)
    // The label may also run straight into what follows it -- "b)1.Bс5!"
    // (D366935), "b)bPb6 ->e3" -- as parseTwins already allows; left in, twin
    // b)'s key sat in twin a)'s tree, where the board took it as a second key.
    // Such a label only ends twin a) if a) has moves of its own before it:
    // D325633 lists "a)diagram / b)- bPb4 / c)Ba1-->h8" first and gives the
    // solutions after all three.
    const spaced = processedText.search(/\n\s*\+?[b-z]\)\s/i);
    const glued = processedText.search(/\n\s*\+?[b-z]\)\S/i);
    let twinCut = spaced;
    if (glued >= 0 && (spaced < 0 || glued < spaced) && /\d\s*\./.test(processedText.slice(0, glued))) {
      twinCut = glued;
    }
    if (twinCut >= 0) processedText = processedText.slice(0, twinCut);
  }

  const segments = parseSegments(processedText, opts);
  if (segments.length === 0) return [];

  assignVirtualIndents(segments, firstMoveColor);

  const nodes: SolutionNode[] = [];
  // Stack tracks: the last node at each indent level, and where to add children.
  // moveNum/isBlackNum belong to the segment that opened the entry, so a later
  // segment can tell a genuine descendant from a sibling the source indented
  // by a stray space.
  const stack: {
    node: SolutionNode;
    indent: number;
    sourceIndent: number;
    isThreatParent: boolean;
    isThreatNode: boolean;
    moveNum: number | null;
    isBlackNum: boolean;
  }[] = [];

  let prevLineIndex = -1;
  let prevSegMoveNum: number | null = null;

  for (const seg of segments) {
    // Determine the starting color for this segment
    let color: 'w' | 'b';
    if (seg.isThreat) {
      // Threat continuations are the same color as the parent (attacker's follow-up)
      const parent = stack.length > 0 ? stack[stack.length - 1].node : null;
      color = parent ? parent.color : firstMoveColor;
    } else if (seg.isBlackNum) {
      // "1..." is the half-move of the side that does NOT own the numbers:
      // Black in a direct mate, but White in a helpmate (set play written
      // "1...Sd5-b6", or the White-to-play half of a duplex). It used to be
      // Black unconditionally, which painted every helpmate set-play line as
      // a black solution that could never be played.
      color = firstMoveColor === 'w' ? 'b' : 'w';
    } else if (seg.moveNum !== null) {
      color = firstMoveColor;
    } else {
      const parent = stack.length > 0 ? stack[stack.length - 1].node : null;
      color = parent ? (parent.color === 'w' ? 'b' : 'w') : firstMoveColor;
    }

    // For subsequent segments on the same line (e.g., "1...f4 2.Bh7#"),
    // chain to the last node's deepest point instead of using indent comparison.
    // Exceptions: threat segments and segments whose indent goes back (new variation)
    // Also chain when move number increases on the same line (handles non-uniform indent case)
    const stackTopIndent = stack.length > 0 ? stack[stack.length - 1].indent : -1;
    const moveNumIncreased = seg.moveNum !== null && prevSegMoveNum !== null && seg.moveNum > prevSegMoveNum;
    // Also treat "1.xxx 1...yyy" (same move number, white→black) as continuation on same line
    const moveNumContinued = seg.moveNum !== null && prevSegMoveNum !== null
      && seg.moveNum === prevSegMoveNum && seg.isBlackNum;
    // The first mover's move 1 can never continue what precedes it: after
    // "1...a8=Q#" (set play) the next thing on the same line that reads
    // "1.Ka6-b7" is a new line of play, not move 1 following move 1.
    const restartsAtMoveOne = seg.moveNum === 1 && !seg.isBlackNum && !seg.isThreat;
    const isSameLineFollow = seg.lineIndex === prevLineIndex && seg.segIndex > 0
      && !seg.isThreat && !restartsAtMoveOne
      && (seg.indent > stackTopIndent || moveNumIncreased || moveNumContinued);

    if (!isSameLineFollow) {
      /* A blank line separates the sections a source writes -- set play, each
         try, the key -- and each starts over at the left margin. It does not
         separate a line of play from the answers to it: sources put a blank
         line between the threat and the defences that follow it, and resetting
         there dropped every defence out of the key and into a root of its own,
         where key filtering discarded it (D2674 lost seven). So a segment
         indented deeper than the section it is standing in is a continuation of
         that section, blank line or not, and the indent decides where it
         attaches as usual.

         The indent as written, not the virtual one: a flat source has its
         indents computed from move numbers, where a defence always comes out
         deeper than the key, and the exception would swallow every section
         break in the file (D324140 lost its key to the try above it). */
      const blankBreaksSection = seg.afterBlankLine
        && !(stack.length > 0 && seg.sourceIndent > stack[0].sourceIndent);
      if (blankBreaksSection) {
        // Blank line = section break: reset stack to start a new section
        stack.length = 0;
      } else if (restartsAtMoveOne && stack.length > 0) {
        // The first mover's move 1 ("1.Bf6-d8 !", or a helpmate's plain
        // "1.Ke5-d4", on its own line or after set play on the same line)
        // starts a new solution, whatever came before it. This used to
        // require a key/try mark and a fresh line, so an unmarked helpmate
        // solution written after set play ("1...Sd5-b6 ...") was nested under
        // that set-play line and lost as a solution (H100803, H103130 and
        // ~1,800 others).
        stack.length = 0;
      } else {
        // Pop stack based on indent, and on the move itself: two moves with the
        // same number for the same side answer the same position, so one can
        // never be inside the other. Sources indent by hand and a defence
        // written one space shallow than its neighbours used to swallow every
        // defence that followed it (D40016).
        const sameTurnAs = (e: { moveNum: number | null; isBlackNum: boolean }) =>
          seg.moveNum !== null && e.moveNum === seg.moveNum && e.isBlackNum === seg.isBlackNum;
        /* A threat is what the attacker plays if the defender does nothing, so
           the answers to the defender's move 1 stand beside it, never inside
           it. A source that writes the threat on the key's own line
           ("1.Qa1-a8 ! threat:  2.Sd2-c4 #") leaves it at the key's indent,
           where indent alone cannot pop it, and every defence indented under
           the key was read as a continuation of the threat instead (D297 hid
           four that way, and key filtering then had nothing to keep). A move
           can never be inside a later one, so the number settles it.

           Threats only. The same rule applied to every node is more correct on
           its face and fixes a few hundred more, but retro solutions number
           moves by a convention of their own -- they undo moves rather than
           make them -- and it took two of them apart (D629598 went from one key
           to five, D676378 from one to three). */
        const threatOfALaterMove = (e: { isThreatNode: boolean; moveNum: number | null }) =>
          e.isThreatNode && e.moveNum !== null && seg.moveNum !== null && e.moveNum > seg.moveNum;
        /* "1...Bg6-h5" answers "1.Sf5-d4", whatever column it is written in.
           Plenty of sources put the defences flush with the key instead of
           indenting them under it, and the indent rule then popped the key and
           made every defence a root of its own, where key filtering dropped it
           (D511 lost four). So stop popping at the move of the same number by
           the other side -- the one this segment is an answer to. */
        const isTheMoveAnsweredBy = (e: { moveNum: number | null; isBlackNum: boolean }) =>
          seg.isBlackNum && !e.isBlackNum && e.moveNum !== null && e.moveNum === seg.moveNum;
        while (stack.length > 0
          && !isTheMoveAnsweredBy(stack[stack.length - 1])
          && (stack[stack.length - 1].indent >= seg.indent
            || sameTurnAs(stack[stack.length - 1])
            || threatOfALaterMove(stack[stack.length - 1]))) {
          stack.pop();
        }
      }
    }
    // If same-line follow: keep the stack as-is, chain from the last node

    // Threat child: parent has hasThreatLabel and this segment is a white continuation (not a defense)
    const isThreatChild = stack.length > 0 && stack[stack.length - 1].isThreatParent && !seg.isBlackNum;

    // Build nodes for all moves in this segment, chaining them
    let currentColor = color;

    // Save stack depth before threat segments so we can restore it after.
    // Only restore for parenthesized threats (seg.isThreat), NOT for hasThreatLabel children
    // (isThreatChild). hasThreatLabel threats span multiple lines — their children need to
    // stay on the stack so subsequent indented segments attach correctly via indent-based popping.
    const stackDepthBeforeThreat = seg.isThreat ? stack.length : -1;

    // Slash alternatives are expanded at line level, so just process linearly
    for (let i = 0; i < seg.moves.length; i++) {
      const isNodeThreat = i === 0 && (isThreatChild || seg.isThreat);
      const node = makeNode(
        seg.moves[i],
        currentColor,
        i === 0 ? seg.isKey : false,
        i === 0 ? seg.isTry : false,
        isNodeThreat,
        i === 0 ? seg.annotation : '',
        seg.isCook,
      );
      if (i === 0) node.moveNum = seg.moveNum;

      if (stack.length === 0) {
        nodes.push(node);
      } else {
        stack[stack.length - 1].node.children.push(node);
      }

      stack.push({
        node,
        indent: seg.indent + i,
        sourceIndent: seg.sourceIndent,
        isThreatParent: i === 0 && (seg.isThreat || seg.hasThreatLabel),
        isThreatNode: isNodeThreat,
        // Only the segment's opening move carries its number; the moves chained
        // after it on the same line are a different turn each.
        moveNum: i === 0 ? seg.moveNum : null,
        isBlackNum: i === 0 ? seg.isBlackNum : false,
      });
      currentColor = currentColor === 'w' ? 'b' : 'w';
    }

    // Restore stack after threat segments so subsequent continuations
    // attach to the correct parent (not to the threat subtree)
    if (stackDepthBeforeThreat >= 0) {
      stack.length = stackDepthBeforeThreat;
    }

    prevLineIndex = seg.lineIndex;
    prevSegMoveNum = seg.moveNum;
  }

  return nodes;
}

/**
 * Filter solution tree to only key moves (for solving).
 * Removes tries (??) from root nodes.
 */
/**
 * Drop broken-mainline fragments from a set of accepted root nodes.
 * When indent/stack reconstruction fails mid-text (long flat selfmates,
 * PGN-annotated studies), a mid-line move like "10. Ke5" can end up as a
 * root node — and would be accepted as a correct first move. Genuine first
 * moves are always numbered 1 (or carry no numbering at all), so roots
 * explicitly numbered > 1 are excluded — but only when at least one
 * move-1/unnumbered root remains, so we never end up with nothing.
 *
 * Exception: h#N.5 solutions omit White's opening half-move ("1... ...")
 * and number Black's real first move 2 (e.g. "1... ... 2.Kc6-d5 ..."), so
 * for black-first problems a move-2 black root is a genuine solution start.
 */
function dropFragmentRoots(nodes: SolutionNode[], firstMoveColor: 'w' | 'b'): SolutionNode[] {
  const genuine = nodes.filter(n =>
    n.moveNum == null
    || n.moveNum === 1
    || (n.moveNum === 2 && firstMoveColor === 'b' && n.color === 'b')
  );
  return genuine.length > 0 ? genuine : nodes;
}

export function filterKeyMoves(nodes: SolutionNode[], firstMoveColor: 'w' | 'b'): SolutionNode[] {
  // If any root node is a key move (!) with the correct color, filter out tries.
  // A node can carry both markers (e.g. flag pollution from odd notation) —
  // isTry always wins: a refuted try must never be accepted as a key.
  const keyNodes = nodes.filter(n => n.isKey && !n.isTry && n.color === firstMoveColor);
  if (keyNodes.length > 0) {
    return dropFragmentRoots(keyNodes, firstMoveColor);
  }

  // Even without explicit key moves, filter out tries (moves marked with ?)
  const nonTryNodes = nodes.filter(n => !n.isTry);
  if (nonTryNodes.length > 0) {
    return dropFragmentRoots(nonTryNodes, firstMoveColor);
  }

  return dropFragmentRoots(nodes, firstMoveColor);
}

// ── Helpers ─────────────────────────────────────────────

export function getValidMoves(tree: SolutionNode[], color: 'w' | 'b'): SolutionNode[] {
  return tree.filter(n => n.color === color);
}

export function findMoveInTree(nodes: SolutionNode[], uci: string): SolutionNode | null {
  for (const node of nodes) {
    if (node.moveUci === uci) return node;
  }
  return null;
}

export function getMainDefense(node: SolutionNode): SolutionNode | null {
  const defenses = node.children.filter(n => !n.isThreat);
  return defenses.length > 0 ? defenses[0] : null;
}

export interface SolutionLine {
  moves: { san: string; color: 'w' | 'b'; isKey: boolean; isMate: boolean; annotation: string }[];
  depth: number;
}

export function flattenSolution(nodes: SolutionNode[], depth: number = 0): SolutionLine[] {
  const lines: SolutionLine[] = [];

  for (const node of nodes) {
    const line: SolutionLine = {
      moves: [{
        san: node.moveSan,
        color: node.color,
        isKey: node.isKey,
        isMate: node.isMate,
        annotation: node.annotation,
      }],
      depth,
    };

    if (node.children.length === 0) {
      lines.push(line);
    } else {
      const threats = node.children.filter(n => n.isThreat);
      const responses = node.children.filter(n => !n.isThreat);

      for (const t of threats) {
        lines.push({
          moves: [...line.moves, {
            san: t.moveSan,
            color: t.color,
            isKey: false,
            isMate: t.isMate,
            annotation: 'threat',
          }],
          depth,
        });
      }

      for (const resp of responses) {
        const subLines = flattenSolution([resp], depth + 1);
        for (const sl of subLines) {
          lines.push({ moves: [...line.moves, ...sl.moves], depth: sl.depth });
        }
      }

      if (responses.length === 0 && threats.length === 0) {
        lines.push(line);
      }
    }
  }
  return lines;
}
