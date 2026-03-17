import type { SolutionNode } from '../types';

// ── Move notation conversion ────────────────────────────

// Long algebraic: Piece + from + sep + to + promo (sep includes ':' for captures)
const LONG_RE = /([KQRBSNP]?)([a-h][1-8])([-*x:])([a-h][1-8])(=?[QRBNS])?([+#!?]*)/i;
// Any move pattern (for extracting from text)
// Note: [a-h][18][QRBNS] handles promotions without '=' (e.g., f8Q instead of f8=Q)
// Note: ':' is used as capture separator in some notations (e.g., R:c3)
const ANY_MOVE_RE = /(?:0-0-0|O-O-O|0-0|O-O|[KQRBSNP]?[a-h][1-8][-*x:][a-h][1-8](?:=?[QRBNS])?|[KQRBSNP][a-h]?[1-8]?[x*:]?[a-h][1-8](?:=?[QRBNS])?|[a-h][x*:][a-h][1-8](?:=?[QRBNS])?|[a-h][18][QRBNS]|[a-h][1-8](?:=[QRBNS])?)([+#!?]*)/;
const CASTLING_RE = /^(0-0-0|O-O-O|0-0|O-O)([+#!?]*)/;

function yacpdbToUci(move: string): string {
  const clean = move.replace(/[+#!?]/g, '').trim();
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
  let sanClean = clean.replace(/S/g, 'N');
  sanClean = sanClean.replace(/^([a-h][18])([QRBN])$/, '$1=$2');
  return 'san:' + sanClean;
}

function normalizePiece(p: string): string {
  return p === 'S' || p === 's' ? 'N' : p;
}

function yacpdbToSanApprox(move: string): string {
  const clean = move.replace(/[!?]/g, '').trim();
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

  // Already in SAN-like format - normalize S→N and add '=' for bare promotions
  let san = clean.replace(/S/g, 'N');
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

    // Skip slash alternatives like "Kd4/Be6"
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

function parseSegments(solutionText: string): Segment[] {
  const segments: Segment[] = [];
  const lines = solutionText.split('\n');

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

function assignVirtualIndents(segments: Segment[], firstMoveColor: 'w' | 'b'): void {
  if (segments.length <= 1) return;
  // Only check non-threat segments for uniform indent (threat segments have indent+1 from extraction)
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
 * Parse YACPDB solution text into a tree structure.
 * @param solutionText - Raw solution text from YACPDB
 * @param firstMoveColor - Color of the side that moves first ('w' for direct/self, 'b' for helpmate)
 */
export function parseSolution(solutionText: string, firstMoveColor: 'w' | 'b' = 'w'): SolutionNode[] {
  if (!solutionText || !solutionText.trim()) return [];

  const segments = parseSegments(solutionText);
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
    const isSameLineFollow = seg.lineIndex === prevLineIndex && seg.segIndex > 0
      && !seg.isThreat && (seg.indent > stackTopIndent || moveNumIncreased);

    if (!isSameLineFollow) {
      if (seg.afterBlankLine) {
        // Blank line = section break: reset stack to start a new section
        stack.length = 0;
      } else {
        // Pop stack based on indent
        while (stack.length > 0 && stack[stack.length - 1].indent >= seg.indent) {
          stack.pop();
        }
      }
    }
    // If same-line follow: keep the stack as-is, chain from the last node

    const isThreatChild = stack.length > 0 && stack[stack.length - 1].isThreatParent;
    // Clear one-shot threat flag so subsequent siblings aren't marked as threats
    if (isThreatChild && stack.length > 0) {
      stack[stack.length - 1].isThreatParent = false;
    }

    // Build nodes for all moves in this segment, chaining them
    let currentColor = color;

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
