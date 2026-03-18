/**
 * Fairy problem exclusion filter.
 * Uses the is_fairy column (pre-computed) for fast filtering.
 */
export function addFairyExclusion(conditions: string[], _bindings: (string | number)[]): void {
  conditions.push('is_fairy = 0');
}
