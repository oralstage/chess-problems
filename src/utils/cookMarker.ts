/**
 * Cook detection.
 *
 * YACPDB records cooks in two independent places, and the `Cooked` keyword is
 * only one of them — roughly a third of the entries that document a cook carry
 * no keyword at all, spelling it out in the solution text instead:
 *
 *   1.Qc6-d5 + ! {(Cook)}                    ← brace annotation
 *   Cooks 1. Sd7!+  1. Sef7!+  1. Sg6!+      ← trailing label line
 *
 * The keyword alone therefore understates how many problems are known to be
 * cooked. Both forms mean the same thing, so both drive the same badge.
 */

import type { SolutionNode } from '../types';

/** Does this solution line carry a cook mark anywhere along it? The parser
 *  flags every move of a line it reads as a cook, so the root of a line is
 *  enough in practice; the walk covers a note left deeper down a branch. */
export function isCookedLine(node: SolutionNode): boolean {
  return !!node.isCook || node.children.some(isCookedLine);
}

/** A `cook` mention inside a {…} annotation: {(Cook)}, {cook}, {cook!}, {cook JU}… */
const BRACE_COOK = /\{[^}]{0,60}\bcooks?\b/i;

/** A line-leading label: "Cook:", "Cooks :", "Cooks 1. Sd7!+".
 *  Requires a colon or a move number after the word so author names
 *  ("Cook, Eugene Beauharnais") never match. */
const LABEL_COOK = /(^|\n)[ \t]*cooks?\b[ \t]*(:|\d+[ \t]*\.)/i;

export function hasCookMarker(solutionText: string | undefined | null): boolean {
  if (!solutionText) return false;
  return BRACE_COOK.test(solutionText) || LABEL_COOK.test(solutionText);
}

export function isCookedProblem(
  keywords: string[] | undefined | null,
  solutionText: string | undefined | null,
): boolean {
  return !!keywords?.includes('Cooked') || hasCookMarker(solutionText);
}
