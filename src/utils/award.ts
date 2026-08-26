/** Award filter: has an award / has none / not filtering.
 *
 * About 28% of problems carry an award (measured 2026-08-26: 165,624 of
 * 587,623). The tier detail ("1st Prize" vs "HM" vs "Comm.") is deliberately
 * not exposed — the filter is a toggle pair, not a ranking.
 */
export type AwardFilter = 'all' | 'awarded' | 'none';

export function matchesAwardFilter(award: string | null | undefined, filter: AwardFilter): boolean {
  if (filter === 'all') return true;
  const has = !!award && award.trim() !== '';
  return filter === 'awarded' ? has : !has;
}
