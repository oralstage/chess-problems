/* Problems whose recorded key cannot be played on this board at all.
 *
 * Found by replaying every direct mate-in-1 in the database — 200 of them —
 * through the site's own pipeline: fixCastlingRights, parseSolution,
 * filterKeyMoves, then chess.js. These 31 are the ones where no key move is
 * legal in the diagram, so there is no way to enter the solution:
 *
 *   - "1. ~ #" records no move at all, only that one exists
 *   - retro and joke problems ask for something off the board — a rotation, a
 *     piece lifted, a proof of what the last move was
 *   - "Black to play mates in 1" task problems record Black's keys under a
 *     diagram that says White to move
 *   - en passant keys need a last move the FEN does not carry
 *
 * D481856 is the one that could be saved instead of skipped: its diagram wants
 * the en passant square d6, and with it 1.exd6# is legal and mate. It comes off
 * this list the day the FEN is fixed. D650724 cannot be saved — its six en
 * passant keys each need a different last move, and one FEN holds one.
 *
 * Only mate-in-1 has been checked this way. The other pools may hold the same
 * kind of thing; nothing here claims otherwise.
 */
export const UNPLAYABLE_IDS = [
  305155, 306369, 306996, 327642, 328200, 328206, 328214, 328684, 342239,
  355882, 388496, 479773, 481856, 507273, 532909, 544646, 544684, 588250,
  597299, 608168, 625355, 639302, 649200, 650724, 650726, 650727, 650755,
  650762, 650770, 650771, 652942,
];

/** Numeric literals rather than bindings: D1 allows 100 of those per statement. */
export function addUnplayableExclusion(conditions: string[]): void {
  conditions.push(`id NOT IN (${UNPLAYABLE_IDS.join(',')})`);
}
