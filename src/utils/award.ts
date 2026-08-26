/** Award-tier classification for the award filter.
 *
 * YACPDB award strings are near-uniformly "tier, source" ("1st Prize, Die
 * Schwalbe", "HM, The Problemist", "Comm., Ideal-Mate Review"), so the tier is
 * read off the front. Measured 2026-08-26 over 165,624 awarded problems:
 * Prize 63,561 / HM 48,848 / Comm 41,068 / other spellings ~12,000.
 */
export type AwardTier = 'prize' | 'hm' | 'comm' | 'other';

export type AwardFilter = 'all' | 'any' | 'hm' | 'prize';

export function awardTier(award: string | null | undefined): AwardTier | null {
  if (!award) return null;
  if (/pri[zs]e|\bpr\.|\bpl\./i.test(award)) return 'prize';
  if (/\bh\.?m\b|honou?r/i.test(award)) return 'hm';
  if (/comm/i.test(award)) return 'comm';
  return 'other';
}

export function matchesAwardFilter(award: string | null | undefined, filter: AwardFilter): boolean {
  if (filter === 'all') return true;
  const tier = awardTier(award);
  if (tier === null) return false;
  if (filter === 'any') return true;
  if (filter === 'hm') return tier === 'prize' || tier === 'hm';
  return tier === 'prize';
}
