/**
 * @fileoverview Vue composable wrapper for shared parser logic.
 * Delegates to shared/parser.ts for the actual implementation.
 *
 * @module composables/useMetaParser
 */

import { parseMetaTags } from "#shared/parser";

/**
 * Composable for parsing HTML and extracting meta tags.
 *
 * @returns Object with parseMetaTags function
 */
export const useMetaParser = () => {
  return { parseMetaTags };
};
