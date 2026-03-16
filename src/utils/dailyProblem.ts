/**
 * Deterministic daily problem selection.
 * Uses golden ratio hashing to spread consecutive days across the problem set.
 */
export function getDailyProblemIndex(date: Date, totalProblems: number): number {
  // Days since Unix epoch in local timezone
  const daysSinceEpoch = Math.floor(
    (date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()) * 0.6180339887 % 1 * totalProblems
  );
  // Fallback: use simpler approach if NaN
  if (!Number.isFinite(daysSinceEpoch) || daysSinceEpoch < 0) {
    const days = Math.floor(date.getTime() / 86400000);
    return ((days * 2654435761) >>> 0) % totalProblems;
  }
  return daysSinceEpoch;
}

/**
 * Get a stable daily index using date components + golden ratio.
 * Same date always returns same index. Different dates spread evenly.
 */
export function getDailyIndex(date: Date, total: number): number {
  // Compute a unique day number from year/month/day
  const dayNum = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  // Golden ratio hash for good distribution
  const GOLDEN = 2654435761; // 2^32 * golden ratio
  const hash = ((dayNum * GOLDEN) >>> 0) / 4294967296; // normalize to [0, 1)
  return Math.floor(hash * total);
}
