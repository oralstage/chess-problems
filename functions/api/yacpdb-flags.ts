/**
 * YACPDB's marks that an entry is not a sound diagram to solve: "To delete",
 * "Position?" (diagram in doubt) and "Wrong position (see References)". The
 * page opens these without a live board (src/utils/noSolution.ts keeps the
 * same list), so rated games and the daily must never pick one.
 */
export const FLAG_KEYWORDS = ['To delete', 'Position?', 'Wrong position (see References)'];

/** SQL conditions on problems.keywords (a JSON array) excluding the marks. */
export const FLAG_EXCLUSIONS = FLAG_KEYWORDS.map(k => `keywords NOT LIKE '%"${k}"%'`);

/** True when a problems.keywords JSON string carries one of the marks. */
export function hasFlagKeyword(keywordsJson: unknown): boolean {
  const s = String(keywordsJson ?? '');
  return FLAG_KEYWORDS.some(k => s.includes(`"${k}"`));
}
