/* Talking to Popeye: what to hand it, and how to read what comes back.
 *
 * Ported from the Popeye Online page (~/Projects/popeye-solver, src/popeye.js
 * and the two helpers it uses out of src/fen.js), where every line of it was
 * worked out against the real program. Popeye itself -- public/popeye/py.js
 * and py.wasm -- is the compiled upstream, under the GPL; see /licenses.
 */

const FILES = 'abcdefgh';

interface FenParts { placement: string; side: 'w' | 'b'; castling: string; ep: string }

export function splitFen(fen: string): FenParts {
  const parts = String(fen).trim().split(/\s+/);
  return {
    placement: parts[0] || '',
    side: parts[1] === 'b' ? 'b' : 'w',
    castling: parts[2] && parts[2] !== '-' ? parts[2] : '',
    ep: parts[3] && parts[3] !== '-' ? parts[3] : '',
  };
}

/** The piece on a square, or null. Reads the placement directly, so it works
 *  on a position under construction that no rulebook would accept. */
export function pieceAt(fen: string, square: string): string | null {
  const rows = splitFen(fen).placement.split('/');
  const row = rows[8 - Number(square[1])];
  if (!row) return null;
  let c = 0;
  for (const ch of row) {
    if (/\d/.test(ch)) { c += Number(ch); continue; }
    if (c === square.charCodeAt(0) - 97) return ch;
    c++;
  }
  return null;
}

/**
 * A helpmate proper -- h#, h=, h== -- but not hs# (help-self), where White
 * moves first and the two sides are not cooperating all the way to the end.
 */
export function isHelpmate(stipulation: string): boolean {
  return /^\s*h(?!s)/i.test(stipulation);
}

/**
 * Castling rights the FEN withholds, expressed the way Popeye wants them: the
 * squares of the men that may no longer castle. Only squares that actually
 * hold the right piece are listed, so Popeye is never handed an empty square.
 */
function noCastlingSquares(fen: string): string[] {
  const { castling } = splitFen(fen);
  const wanted = [
    { right: 'K', square: 'h1', piece: 'R' },
    { right: 'Q', square: 'a1', piece: 'R' },
    { right: 'k', square: 'h8', piece: 'r' },
    { right: 'q', square: 'a8', piece: 'r' },
  ];
  return wanted
    .filter(w => !castling.includes(w.right) && pieceAt(fen, w.square) === w.piece)
    .map(w => w.square);
}

/**
 * The FEN's en-passant target square, rewritten as the pawn move that created
 * it. Popeye wants departure, skipped and arrival squares run together, e.g.
 * "d7d6d5". Without this Popeye never considers an en passant key.
 */
function enPassantTriple(fen: string): string | null {
  const { ep } = splitFen(fen);
  if (!/^[a-h][36]$/.test(ep)) return null;
  const file = ep[0];
  return ep[1] === '6'
    ? `${file}7${file}6${file}5`   // Black played file7-file5
    : `${file}2${file}3${file}4`;  // White played file2-file4
}

/** The position as Popeye lists it: a knight is an S, and each man is named
 *  by its piece letter and its square. */
export function fenToPopeyePieces(fen: string): string {
  const board = splitFen(fen).placement;
  const sides: Record<'White' | 'Black', string[]> = { White: [], Black: [] };
  board.split('/').forEach((rankText, rankIndex) => {
    let file = 0;
    for (const char of rankText) {
      if (/\d/.test(char)) { file += Number(char); continue; }
      const side = char === char.toUpperCase() ? 'White' : 'Black';
      const piece = char.toUpperCase() === 'N' ? 'S' : char.toUpperCase();
      sides[side].push(`${piece}${FILES[file]}${8 - rankIndex}`);
      file++;
    }
  });
  return `Pieces White ${sides.White.join(' ')}\n       Black ${sides.Black.join(' ')}`;
}

export function buildInput({ fen, stipulation, showTries = false }: {
  fen: string; stipulation: string; showTries?: boolean;
}): string {
  const options = ['Variation', 'NoBoard'];
  if (showTries) options.push('Try');
  /* Helpmates are the one kind Popeye is slow at: both sides cooperate, so
     nothing prunes the tree and h#4 routinely runs past the watchdog.
     Intelligent mode is Popeye's own answer to that (py-engl.txt: "intelligent
     (quick) solving of help(stale)mate moremovers"). Measured over 40 real
     h#4s: without it, 15 needed more than 20 s; with it, 39 of 40 finished
     inside 5 s and none was cut off. The solutions come back the same. */
  if (isHelpmate(stipulation)) options.push('Intelligent');

  const lines = ['BeginProblem', `Stipulation ${stipulation.trim()}`, `Option ${options.join(' ')}`];

  const noCastling = noCastlingSquares(fen);
  if (noCastling.length) lines.push(`Option NoCastling ${noCastling.join('')}`);

  const ep = enPassantTriple(fen);
  if (ep) lines.push(`Option EnPassant ${ep}`);

  lines.push(fenToPopeyePieces(fen), 'EndProblem', '');
  return lines.join('\n');
}

const BANNER = /^\s*Popeye\b.*\bv\d/;
const FINISHED = /^\s*solution finished\.?/m;
const COUNTERS = /^\s*(add_to_move_generation_stack|play_move|is_white_king_square_attacked|is_black_king_square_attacked):/;

/** True once Popeye has printed its end-of-problem marker. On a deep search
 *  the wasm build can overflow its stack and stop mid-sentence while still
 *  returning a zero exit code, so the marker is what says it finished. */
export function outputIsComplete(raw: string): boolean {
  return FINISHED.test(raw || '');
}

/**
 * Popeye writes the check and mate signs detached: "2.Qd2-d5 #", not
 * "2.Qd2-d5#". The move patterns the parser matches with do not allow a space
 * inside a move, so a detached sign is dropped instead of being read as part
 * of it -- and a mate stops being marked as one. Close the gap first.
 *
 * Only a digit, an upper-case letter or "=" may precede the gap, which is how
 * every real move ends. That keeps this away from a bracketed annotation like
 * "[+wRb4]" and from ordinary words.
 */
function attachDetachedMarks(text: string): string {
  return text.replace(/([0-9A-Z=])\s+([+#])(?=[\s,.!?]|$)/g, '$1$2');
}

/**
 * Strip the version banner, the timing line and the measurement counters,
 * leaving the solution text the parser expects.
 */
export function cleanOutput(raw: string): string {
  const kept = String(raw || '')
    .split('\n')
    .filter(line => !BANNER.test(line) && !COUNTERS.test(line) && !/^\s*solution finished/.test(line))
    .map(line => attachDetachedMarks(line.replace(/\s+$/, '')));
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Messages Popeye prints when it will not solve what it was given. These are
 * worth showing verbatim: they name the problem with the input.
 */
export function inputComplaints(raw: string, err: string): string[] {
  const text = `${raw || ''}\n${err || ''}`;
  const found: string[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (/input-error|offending item|problem ignored|both sides need a king|too much fairy|Couldn't allocate/i.test(t)) {
      if (!found.includes(t)) found.push(t);
    }
  }
  return found;
}
