import { Chess } from 'chess.js';
import { parseSolution, filterKeyMoves, extractTwinFenMods, applyTwinMods, parseTwins } from '../src/services/solutionParser';
import { fetchProblem, metaToChessProblem, fixCastlingRights } from '../src/services/api';
import { flipDuplexRoots, mainLinePlays } from '../src/utils/duplex';
import { DUPLEX_IDS } from '../src/data/duplexIds';
import type { ChessProblem } from '../src/types';
import { opensOffNumber } from './problemParams';

/* Turning a problem as it comes out of the database into one the solver can
   play: the solution text parsed into a tree, the twin applied, and the FEN
   corrected where the source leaves it short.

   The site does the same work in App.tsx (ensureSolution / fixEnPassantFen),
   where it is a hook inside the component and cannot be imported. This is the
   one piece of the embed that is not the site's own code running: keep the two
   in step, or lift the app's copy out into a module both can call. */

/**
 * Fix FEN for problems where the solution requires en passant but the FEN
 * doesn't have the en passant square set (common in retro problems).
 * Mutates p.fen in-place if a fix is needed.
 */
function fixEnPassantFen(p: ChessProblem): void {
  if (p.solutionTree.length === 0) return;

  // Determine first move color from FEN turn
  const fenTurn = p.fen.split(' ')[1] as 'w' | 'b';
  const firstColor = p.genre === 'help' ? (opensOffNumber(p.stipulation) ? 'w' : 'b')
    : (p.genre === 'retro' && p.stipulation?.startsWith('h#')) ? 'b'
    : fenTurn;
  const firstNodes = p.solutionTree.filter(n => n.color === firstColor);

  for (const node of firstNodes) {
    // Check if the move is already playable
    try {
      const chess = new Chess(p.fen);
      const uci = node.moveUci;
      let move;
      if (uci.startsWith('san:')) {
        move = chess.move(uci.slice(4));
      } else if (uci.length >= 4) {
        move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
      }
      if (move) continue; // already works
    } catch { /* fall through to fix attempt */ }

    // Check if this looks like an en passant capture (pawn diagonal move to empty square)
    const uci = node.moveUci;
    if (uci.length < 4 || uci.startsWith('san:')) continue;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const fromCol = from.charCodeAt(0) - 97;
    const toCol = to.charCodeAt(0) - 97;
    const fromRow = parseInt(from[1]);
    const toRow = parseInt(to[1]);

    // En passant: pawn moves diagonally (col differs by 1, row differs by 1)
    if (Math.abs(fromCol - toCol) !== 1 || Math.abs(fromRow - toRow) !== 1) continue;

    // Verify the from-square has a pawn
    try {
      const chess = new Chess(p.fen);
      const piece = chess.get(from as never);
      if (!piece || piece.type !== 'p') continue;
    } catch { continue; }

    // The en passant target square is 'to' — patch the FEN
    const fenParts = p.fen.split(' ');
    if (fenParts.length >= 4 && fenParts[3] === '-') {
      fenParts[3] = to;
      const newFen = fenParts.join(' ');
      // Verify the fix works
      try {
        const chess = new Chess(newFen);
        const move = chess.move({ from, to });
        if (move) {
          p.fen = newFen;
          return;
        }
      } catch { /* patch didn't help */ }
    }
  }
}

/** Ensure a problem has a solutionTree (fetching its solution text if needed). */
export async function ensureSolution(p: ChessProblem): Promise<ChessProblem> {
  // Stub from the genre index (navigation before the full genre data has
  // loaded): everything except id/stipulation is missing — fetch the whole
  // problem, not just solutionText, or the board renders empty (0+0 pieces).
  // Must happen before the originalFen capture below.
  if (!p.fen) {
    const full = await fetchProblem(p.id);
    Object.assign(p, metaToChessProblem(full, full.solutionText));
  }
  // Save original FEN before twin modifications (needed for parseTwins)
  const originalFen = p._twinApplied ? (p._originalFen || p.fen) : p.fen;
  if (!p._originalFen) p._originalFen = originalFen;
  // Apply twin FEN modifications regardless of cache state
  if (p.solutionText && !p._twinApplied) {
    const twinMods = extractTwinFenMods(p.solutionText);
    if (twinMods) {
      p.fen = applyTwinMods(p.fen, twinMods);
      p._twinApplied = true;
    }
  }
  if (p.solutionTree.length > 0) return p; // already has solution
  if (!p.solutionText) {
    // Fetch solutionText from API
    const full = await fetchProblem(p.id);
    p.solutionText = full.solutionText;
  }
  // Retro: detect Black to move from solution text
  // Patterns: {Black to move}, solution starting with "..." or "...." (black move notation)
  const solutionStart = p.solutionText.replace(/^\{[^}]*\}\s*/, '').trimStart();
  const isRetroBlack = p.genre === 'retro' && (
    /\{[^}]*[Bb]lack to move/i.test(p.solutionText)
    || /^\.{2,}/.test(solutionStart)
    || /^\d+\.{3}/.test(solutionStart)
    || /^\d+\.\s+\.{2,}/.test(solutionStart)
  );
  /* Two different things, and for an h#N.5 they differ.

     `firstColor` is the side the numbering belongs to, which is what the
     parser is told: a helpmate's moves are numbered from Black, so "1..." is
     White's -- the opening half-move of an h#2.5 as much as the set play of an
     h#2.

     `rootColor` is the side that actually opens, which is what the solutions
     are filtered by. The same for every problem the database holds; White for
     a stipulation carrying a half move. */
  const firstColor = (p.genre === 'help' || (p.genre === 'retro' && p.stipulation.startsWith('h#'))) ? 'b'
    : isRetroBlack ? 'b' : 'w';
  const rootColor = p.genre === 'help' && opensOffNumber(p.stipulation) ? 'w' : firstColor;
  // Parser color: for solutions with "..." notation, the dots already encode colors,
  // so parser should use 'w' to avoid double-flip
  const solutionHasDots = /\.{3}/.test(p.solutionText) || /\.\s+\.{2}/.test(p.solutionText);
  const parserColor = (isRetroBlack && solutionHasDots) ? 'w' : firstColor;
  // Apply twin FEN modifications if not already done
  if (!p._twinApplied) {
    const twinMods = extractTwinFenMods(p.solutionText);
    if (twinMods) {
      p.fen = applyTwinMods(p.fen, twinMods);
      p._twinApplied = true;
    }
  }
  const allNodes = parseSolution(p.solutionText, parserColor);
  // Retro + {(illegal)}: flip colors
  if (p.genre === 'retro' && p.solutionText.includes('{(illegal')) {
    const flipColors = (nodes: typeof allNodes): void => {
      for (const n of nodes) {
        n.color = n.color === 'w' ? 'b' : 'w';
        flipColors(n.children);
      }
    };
    flipColors(allNodes);
  }
  // Duplex helpmate: the diagram is solved twice — Black to play, then
  // White to play with Black and White mating the white king. The source
  // numbers both halves alike, so the parser paints the White-to-play half
  // black; colour it right so it can be played and shown as White's. YACPDB
  // records Duplex in the entry's options (part of the stipulation), which
  // the database does not keep — hence the generated id list; the keyword
  // is a fallback that only about half the duplexes carry.
  const duplexTagged = p.genre === 'help' && (DUPLEX_IDS.has(p.id) || (p.keywords ?? []).includes('Duplex'));
  flipDuplexRoots(allNodes, fixCastlingRights(p.fen, p.solutionText), duplexTagged ? ['Duplex'] : [], p.genre);
  p.fullSolutionTree = allNodes;
  p.solutionTree = filterKeyMoves(allNodes, rootColor);
  // Helpmate set play ("1...Sd5-b6 ...": what would happen if White were
  // to move) is now coloured White by the parser. It is shown after the
  // solve, but it is not a solution to find — only a duplex asks for a
  // White-to-play line. Keep the tree if nothing else would be left.
  if (p.genre === 'help' && !duplexTagged) {
    const own = p.solutionTree.filter(n => n.color === rootColor);
    if (own.length > 0) p.solutionTree = own;
  }
  // Generate twin data for twin problems
  if (!p.twins) {
    p.twins = parseTwins(p.solutionText, p._originalFen || originalFen, parserColor) ?? undefined;
  }
  // Fix castling rights if solution contains O-O but FEN has none
  p.fen = fixCastlingRights(p.fen, p.solutionText);
  fixEnPassantFen(p);
  // Helpmates count their solutions and ask for every one, so only lines
  // the solver can actually play through on this board are counted (user
  // decision, 2026-09-02: err on the safe side). Lines that cannot be
  // entered stay in fullSolutionTree for the display. If nothing survives,
  // keep the tree as it was rather than leave the problem unsolvable.
  if (p.genre === 'help' && p.solutionTree.length > 1) {
    const playable = p.solutionTree.filter(root => mainLinePlays(p.fen, root));
    if (playable.length > 0) p.solutionTree = playable;
  }
  /* An h#N.5 opens with White. A Popeye position is commonly written with
     Black to move -- it is the side the numbering belongs to -- and the board
     takes the side to move from the FEN, so the opening half-move would be
     asked of the wrong side: the moves still go in (a helpmate's solver moves
     both sides) but the replay afterwards cannot rebuild the line from a
     position it does not start at, and it came out empty. */
  if (p.genre === 'help' && opensOffNumber(p.stipulation) && p.fen.includes(' b ')) {
    p.fen = p.fen.replace(' b ', ' w ');
  }
  // Retro: flip FEN turn to black if Black to move
  if (isRetroBlack && p.fen.includes(' w ')) {
    p.fen = p.fen.replace(' w ', ' b ');
  }
  // Black-to-move study ("1... Kxb8 2. b7 Ka7 3. Kc7 1-0"): YACPDB has no
  // side-to-move field, so the import filed every study as White to move.
  // When every recorded line opens with a black move, the diagram is
  // Black's turn; the solver (White) takes over after Black's first move,
  // which the board plays itself (useProblem.loadProblem).
  if (p.genre === 'study' && p.fen.includes(' w ')
      && p.solutionTree.length > 0 && p.solutionTree.every(n => n.color === 'b')) {
    p.fen = p.fen.replace(' w ', ' b ');
  }
  return p;
}
