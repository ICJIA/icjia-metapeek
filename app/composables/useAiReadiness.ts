/**
 * @fileoverview Vue composable for AI readiness assessment.
 * Combines parsed meta tags with server-fetched robots.txt/llms.txt data.
 *
 * @module composables/useAiReadiness
 */

import { assessAiReadiness } from "#shared/ai-readiness";
import type { MetaTags, AiReadinessResult, AiCheckResponse } from "#shared/types";

export type { AiReadinessResult, AiReadinessCheck } from "#shared/types";

/**
 * Composable for AI readiness assessment.
 *
 * @returns Object with assess functions and reactive state
 */
export function useAiReadiness() {
  const aiResult = ref<AiReadinessResult | null>(null);
  const aiLoading = ref(false);

  /**
   * Runs AI readiness assessment for paste HTML mode (no server fetch needed).
   */
  const assessFromHtml = (tags: MetaTags) => {
    aiResult.value = assessAiReadiness(tags, { pasteMode: true });
  };

  /**
   * Runs AI readiness assessment for URL fetch mode.
   * Fetches robots.txt and llms.txt via /api/ai-check, then combines with meta tags.
   */
  const assessFromUrl = async (tags: MetaTags, url: string) => {
    aiLoading.value = true;

    try {
      const response = await $fetch<AiCheckResponse>("/api/ai-check", {
        params: { url },
      });

      aiResult.value = assessAiReadiness(tags, {
        robotsTxt: response.robotsTxt,
        llmsTxt: response.llmsTxt,
      });
    } catch {
      // If the ai-check endpoint fails, still run HTML-only checks
      aiResult.value = assessAiReadiness(tags, {
        robotsTxt: null,
        llmsTxt: null,
      });
    } finally {
      aiLoading.value = false;
    }
  };

  const reset = () => {
    aiResult.value = null;
    aiLoading.value = false;
  };

  return {
    aiResult: readonly(aiResult),
    aiLoading: readonly(aiLoading),
    assessFromHtml,
    assessFromUrl,
    reset,
  };
}
