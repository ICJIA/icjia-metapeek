/**
 * @fileoverview Vue composable for SEO insights assessment.
 * Wraps the shared seo-insights logic with reactive state.
 *
 * @module composables/useSeoInsights
 */

import { assessSeoInsights } from "#shared/seo-insights";
import type { MetaTags, SeoInsightsResult } from "#shared/types";

export type { SeoInsightsResult, SeoInsightCheck } from "#shared/types";

/**
 * Composable for SEO insights (advisory, non-scoring checks).
 *
 * @returns Object with assess functions and reactive state
 */
export function useSeoInsights() {
  const seoInsightsResult = ref<SeoInsightsResult | null>(null);

  const assessFromHtml = (tags: MetaTags) => {
    seoInsightsResult.value = assessSeoInsights(tags, { urlMode: false });
  };

  const assessFromUrl = (tags: MetaTags) => {
    seoInsightsResult.value = assessSeoInsights(tags, { urlMode: true });
  };

  const reset = () => {
    seoInsightsResult.value = null;
  };

  return {
    seoInsightsResult: readonly(seoInsightsResult),
    assessFromHtml,
    assessFromUrl,
    reset,
  };
}
