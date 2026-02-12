/**
 * @fileoverview Vue composable wrapper for shared scoring logic.
 * Delegates to shared/score.ts for the actual implementation.
 *
 * @module composables/useMetaScore
 */

import { computeScore } from "#shared/score";

export type { ScoreCategory, MetaScore } from "#shared/types";

/**
 * Composable for computing meta tag quality score from diagnostics.
 *
 * @returns Object with computeScore function
 */
export function useMetaScore() {
  return { computeScore };
}
