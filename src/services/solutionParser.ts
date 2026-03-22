import type { SolutionNode } from '../types';

// ── Move notation conversion ────────────────────────────

// Normalize German piece notation: D→Q (Dame), T→R (Turm), L→B (Läufer), S→N (Springer)
function normalizeGerman(s: string): string {
  return s.replace(/D/g, 'Q').replace(/T/g, 'R').replace(/L/g, 'B').replace(/S/g, 'N');
}

// Long algebraic: Piece + from + sep + to + promo (sep includes ':' for captures)
const LONG_RE = /([KQRBSNPDTL]?)([a-h][1-8])([-*x:])([a-h][1-8])(=?[QRBNSDTL])?([+#!?]*)/i;
// Any move pattern (for extracting from text)
// Note: [a-h][18][QRBNS] handles promotions without '=' (e.g., f8Q instead of f8=Q)
// Note: ':' is used as capture separator in some notations (e.g., R:c3)
const ANY_MOVE_RE = /(?:0-0-0|O-O-O|0-0|O-O|[KQRBSNPDTL]?[a-h][1-8][-*x:][a-h][1-8](?:=?[QRBNSDTL])?|[KQRBSNPDTL][a-h]?[1-8]?[x*:]?[a-h][1-8](?:=?[QRBNSDTL])?|[a-h][x*:][a-h][1-8](?:=?[QRBNSDTL])?|[a-h][18][QRBNSDTL]|[a-h][1-8](?:=[QRBNSDTL])?)([+#!?]*)/;
const CASTLING_RE = /^(0-0-0|O-O-O|0-0|O-O)([+#!?]*)/;

function yacpdbToUci(move: string): string {
  const clean = move.replace(/[+#!?]/g, '').trim();
  // "Any move" wildcard — can't be converted to UCI
  if (clean.includes('~')) return 'any';
  // Castling: use san: prefix so chess.js handles king position correctly
  if (clean === '0-0' || clean === 'O-O') return 'san:O-O';
  if (clean === '0-0-0' || clean === 'O-O-O') return 'san:O-O-O';

  // Long algebraic: Bf7-g8 → f7g8, also handles promotion without '=' (d7-d8Q)
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
    const promoRaw = mLong[5] || '';
    const promoChar = promoRaw.replace('=', '');
    const promo = promoChar ? '=' + normalizePiece(promoChar) : '';
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
  annotation: string;
  afterBlankLine: boolean; // preceded by a blank line (section break)
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
  const moveNumSplit = content.split(/(?=\d+\.)/);
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

function parseSegments(solutionText: string): Segment[] {
  const segments: Segment[] = [];
  const rawLines = solutionText.split('\n');

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
  // Pattern: "1... Sd5, Kf4 2. Q:f5#" → two lines with same continuation
  const commaExpanded: string[] = [];
  for (const line of joinedLines) {
    commaExpanded.push(...expandCommaAlternatives(line));
  }

  // Expand slash alternatives before parsing
  const lines: string[] = [];
  for (const line of commaExpanded) {
    lines.push(...expandSlashAlternatives(line));
  }

  let lineIndex = 0;
  let lastLineWasBlank = false;
  for (const line of lines) {
    const lineIndent = line.length - line.trimStart().length;
    const trimmed = line.trimStart();
    if (!trimmed) { lineIndex++; lastLineWasBlank = true; continue; }

    // Extract parenthesized/bracketed threat content before splitting on move numbers
    // (splitting on \d+\. would break content like "(2.Rd1#)" or "[2.Qf7#]")
    const lineThreatTexts: string[] = [];
    let trimmedClean = trimmed.replace(/[(\[][^)\]]+[)\]]/g, (match) => {
      const inner = match.slice(1, -1);
      lineThreatTexts.push(inner);
      return '';
    });

    // Split on move number patterns
    const parts = trimmedClean.split(/(?=\d+\.)/);
    let segIndex = 0;

    for (const part of parts) {
      let text = part.trim();
      if (!text) continue;

      const hasThreatLabel = /\bthreat:?\s*$/i.test(text);
      text = text.replace(/\bthreat:?\s*$/i, '').trim();

      const isKey = text.includes('!');
      const isTry = text.includes('?');
      // isThreat means this segment IS a threat move (from parens).
      // hasThreatLabel means this segment's CHILDREN are threats (e.g., "1.f4 ! threat:")
      // — the segment itself is a regular key/try move, not a threat.
      const isThreat = false;

      let annotation = '';
      const annoMatch = text.match(/\{([^}]*)\}/);
      if (annoMatch) {
        annotation = annoMatch[1];
        text = text.replace(/\{[^}]*\}/g, '').trim();
      }

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
        annotation,
        afterBlankLine: segIndex === 0 && lastLineWasBlank,
      });
      segIndex++;
    }

    // Add threat segments from parenthesized content extracted earlier
    for (const threatText of lineThreatTexts) {
      const cleanThreat = threatText.replace(/^\d+\./, '').trim();
      const threatMoves = extractMoveStrings(cleanThreat);
      if (threatMoves.length > 0) {
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
          annotation: '',
          afterBlankLine: false,
        });
        segIndex++;
      }
    }

    lastLineWasBlank = false;
    lineIndex++;
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
  const allSameIndent = nonThreatSegs.every(s => s.indent === nonThreatSegs[0].indent);
  if (!allSameIndent) return;

  let prevWasThreat = false;
  let threatBaseIndent = 0;

  for (const seg of segments) {
    if (seg.moveNum !== null) {
      const n = seg.moveNum;
      if (firstMoveColor === 'w') {
        seg.indent = seg.isBlackNum ? (n - 1) * 2 + 1 : (n - 1) * 2;
      } else {
        seg.indent = seg.isBlackNum ? (n - 1) * 2 : (n - 1) * 2 + 1;
      }
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

function makeNode(moveText: string, color: 'w' | 'b', isKey: boolean, isTry: boolean, isThreat: boolean, annotation: string): SolutionNode {
  const isMate = moveText.includes('#');
  const isCheck = moveText.includes('+') && !isMate;

  return {
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
export function extractTwinFenMods(solutionText: string): { from: string; to: string; }[] | null {
  if (!solutionText) return null;
  const trimmed = solutionText.trim();
  // Match "a) <modifications>" at the start
  const aMatch = trimmed.match(/^a\)\s*(.*?)(?:\n|$)/i);
  if (!aMatch) return null;
  const modLine = aMatch[1].trim();
  if (!modLine) return null; // a) with no modification — diagram position

  // Match patterns like "bKa7-->a6", "wRh1-->h3"
  const modPattern = /[bw][KQRBSP][a-h][1-8]\s*-->\s*[a-h][1-8]/gi;
  const mods = modLine.match(modPattern);
  if (!mods || mods.length === 0) return null;

  return mods.map(mod => {
    const clean = mod.replace(/\s/g, '');
    // e.g. "bKa7-->a6"
    const from = clean.slice(2, 4); // "a7"
    const to = clean.slice(7, 9);   // "a6"
    return { from, to };
  });
}

/** FEN modification: move, add, or remove a piece */
type FenMod =
  | { type: 'move'; from: string; to: string }
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
export function parseTwinMods(modLine: string): FenMod[] {
  const mods: FenMod[] = [];
  if (!modLine) return mods;

  // Move: "bKa7-->a6" or "wKc2 --> c1"
  const movePattern = /([bw][KQRBSP])([a-h][1-8])\s*-->\s*([a-h][1-8])/gi;
  let m;
  while ((m = movePattern.exec(modLine)) !== null) {
    mods.push({ type: 'move', from: m[2], to: m[3] });
  }

  // Remove: "-wRf3" or "-bBg8"
  const removePattern = /-([bw][KQRBSP])([a-h][1-8])/gi;
  while ((m = removePattern.exec(modLine)) !== null) {
    mods.push({ type: 'remove', square: m[2] });
  }

  // Add: "+wBb3" or "+bSg8"
  const addPattern = /\+([bw][KQRBSP])([a-h][1-8])/gi;
  while ((m = addPattern.exec(modLine)) !== null) {
    // Skip if this is "+b)" twin marker (not a piece addition)
    if (m[1].toLowerCase() === 'b)' || /^\+[b-z]\)/.test(m[0])) continue;
    mods.push({ type: 'add', square: m[2], piece: pieceToFen(m[1]) });
  }

  return mods;
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
  solutionTree: SolutionNode[];
  fullSolutionTree: SolutionNode[];
}

/**
 * Parse all twins from solution text.
 * Returns array of twin data with computed FENs and solution trees.
 * Returns null if not a twin problem.
 */
export function parseTwins(solutionText: string, originalFen: string, firstMoveColor: 'w' | 'b' = 'w'): TwinData[] | null {
  if (!solutionText) return null;
  const trimmed = solutionText.trim();
  if (!trimmed.match(/^a\)/i)) return null; // Not a twin problem

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
    const hasMod = /[bw][KQRBSP][a-h][1-8]\s*-->|^-[bw][KQRBSP]|^\+[bw][KQRBSP][a-h]/.test(firstLine);
    const modLine = hasMod ? firstLine : '';
    const solText = hasMod ? lines.slice(1).join('\n') : content;
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
    const mods = parseTwinMods(twin.modLine);
    const fen = mods.length > 0 ? applyTwinMods(baseFen, mods) : baseFen;
    prevFen = fen;

    // Parse solution for this twin
    const solNodes = parseSolution(twin.solutionText, firstMoveColor);
    const label = twin.modLine
      ? `${twin.id}) ${twin.modLine}`
      : `${twin.id}) diagram`;

    result.push({
      id: twin.id,
      label,
      fen,
      solutionTree: filterKeyMoves(solNodes, firstMoveColor),
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
export function parseSolution(solutionText: string, firstMoveColor: 'w' | 'b' = 'w'): SolutionNode[] {
  if (!solutionText || !solutionText.trim()) return [];

  // Detect PGN-style solutions (wrapped in {})
  // A true PGN solution is entirely wrapped in {} with optional result.
  // If content continues after the closing }, it's a comment followed by indent-based notation.
  // Normalize "1. ... h5" → "1...h5" (black move with spaces around dots)
  const trimmedInput = solutionText.trim().replace(/(\d+)\.\s+\.\.\./g, '$1...');
  if (trimmedInput.startsWith('{')) {
    const closingBrace = trimmedInput.indexOf('}');
    const afterBrace = closingBrace >= 0 ? trimmedInput.slice(closingBrace + 1).trim() : '';
    // Only use PGN parser if the entire content is within {} (possibly with trailing result marker)
    if (!afterBrace || /^(?:1-0|0-1|1\/2-1\/2)?\s*$/.test(afterBrace)) {
      return parsePgnSolution(trimmedInput, firstMoveColor);
    }
    // Otherwise, strip the leading {comment} and parse the rest as indent-based
    return parseSolution(afterBrace, firstMoveColor);
  }

  let processedText = trimmedInput;
  // Handle twin problems: strip "a)" prefix and only parse the first twin section
  // Twins b), c), etc. modify the position and can't be solved with the original FEN
  const twinMatch = processedText.match(/^[a-z]\)\s*/i);
  if (twinMatch) {
    processedText = processedText.slice(twinMatch[0].length);
    // Remove everything from the next twin marker onwards (b), +c), etc.)
    processedText = processedText.replace(/\n\s*\+?[b-z]\)\s.*/is, '');
  }

  const segments = parseSegments(processedText);
  if (segments.length === 0) return [];

  assignVirtualIndents(segments, firstMoveColor);

  const nodes: SolutionNode[] = [];
  // Stack tracks: the last node at each indent level, and where to add children
  const stack: { node: SolutionNode; indent: number; isThreatParent: boolean }[] = [];

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
      color = 'b';
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
    const isSameLineFollow = seg.lineIndex === prevLineIndex && seg.segIndex > 0
      && !seg.isThreat && (seg.indent > stackTopIndent || moveNumIncreased || moveNumContinued);

    if (!isSameLineFollow) {
      if (seg.afterBlankLine) {
        // Blank line = section break: reset stack to start a new section
        stack.length = 0;
      } else if (seg.moveNum === 1 && !seg.isBlackNum && (seg.isKey || seg.isTry) && stack.length > 0) {
        // Key/try move at move 1 (e.g., "1.Bf6-d8 !") after set play: new root section
        stack.length = 0;
      } else {
        // Pop stack based on indent
        while (stack.length > 0 && stack[stack.length - 1].indent >= seg.indent) {
          stack.pop();
        }
      }
    }
    // If same-line follow: keep the stack as-is, chain from the last node

    // Threat child: parent has hasThreatLabel and this segment is a white continuation (not a defense)
    const isThreatChild = stack.length > 0 && stack[stack.length - 1].isThreatParent && !seg.isBlackNum;

    // Build nodes for all moves in this segment, chaining them
    let currentColor = color;

    // Save stack depth before threat segments so we can restore it after
    const stackDepthBeforeThreat = (seg.isThreat || isThreatChild) ? stack.length : -1;

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
      );

      if (stack.length === 0) {
        nodes.push(node);
      } else {
        stack[stack.length - 1].node.children.push(node);
      }

      stack.push({ node, indent: seg.indent + i, isThreatParent: i === 0 && (seg.isThreat || seg.hasThreatLabel) });
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
export function filterKeyMoves(nodes: SolutionNode[], firstMoveColor: 'w' | 'b'): SolutionNode[] {
  // If any root node is a key move (!) with the correct color, filter out tries
  const keyNodes = nodes.filter(n => n.isKey && n.color === firstMoveColor);
  if (keyNodes.length > 0) {
    return keyNodes;
  }

  // Even without explicit key moves, filter out tries (moves marked with ?)
  const nonTryNodes = nodes.filter(n => !n.isTry);
  if (nonTryNodes.length > 0) {
    return nonTryNodes;
  }

  return nodes;
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
