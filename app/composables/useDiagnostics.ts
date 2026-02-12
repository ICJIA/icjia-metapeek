/**
 * @fileoverview Vue composable wrapper for shared diagnostics logic.
 * Delegates to shared/diagnostics.ts for the actual implementation.
 *
 * @module composables/useDiagnostics
 */

import { generateDiagnostics } from "#shared/diagnostics";

export type { ImageAnalysisResult } from "#shared/types";

/**
 * Composable for generating meta tag diagnostics.
 *
 * @returns Object with generateDiagnostics function
 */
export const useDiagnostics = () => {
  return { generateDiagnostics };
};
