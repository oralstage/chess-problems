import { Chess } from 'chess.js';

type Move = ReturnType<Chess['move']>;

/**
 * Play a SAN move that chess.js may reject as ambiguous.
 *
 * Problem sources write moves the way a reader understands them, not the way
 * a strict parser does: "Sc6#" when two knights can reach c6 but only one
 * mates, "Be5#" with two bishops, "Rd6" with two rooks. chess.js throws on
 * such a move. Here the candidates that fit the piece, destination and
 * promotion are tried, and the one whose result matches the mark the source
 * put on the move — mate for "#", check for "+", neither otherwise — is kept.
 * If that still leaves several, the move is genuinely ambiguous and nothing
 * is played: guessing would accept a move the composer did not write.
 */
export function moveSanLenient(chess: Chess, san: string): Move | null {
  const clean = san.replace(/[!?]/g, '');
  try {
    const m = chess.move(clean);
    if (m) return m;
  } catch { /* ambiguous or illegal as written — resolve below */ }

  const bare = clean.replace(/[+#]/g, '');
  const wantsMate = clean.includes('#');
  const wantsCheck = !wantsMate && clean.includes('+');
  const m = bare.match(/^([KQRBN])?([a-h])?([1-8])?x?([a-h][1-8])(?:=?([QRBN]))?$/);
  if (!m) return null;
  const piece = (m[1] ?? 'P').toLowerCase();
  const fromFile = m[2];
  const fromRank = m[3];
  const to = m[4];
  const promotion = m[5]?.toLowerCase();

  const candidates = chess.moves({ verbose: true }).filter(v =>
    v.to === to
    && v.piece === piece
    && (!fromFile || v.from[0] === fromFile)
    && (!fromRank || v.from[1] === fromRank)
    && (promotion ? v.promotion === promotion : !v.promotion || piece !== 'p'));
  if (candidates.length === 0) return null;

  const fitting = candidates.filter(v => {
    const after = new Chess(chess.fen());
    const played = after.move(v);
    if (!played) return false;
    if (wantsMate) return after.isCheckmate();
    if (wantsCheck) return after.isCheck() && !after.isCheckmate();
    return !after.isCheck();
  });
  const pick = fitting.length === 1 ? fitting[0] : candidates.length === 1 ? candidates[0] : null;
  if (!pick) return null;
  try {
    return chess.move(pick);
  } catch {
    return null;
  }
}
