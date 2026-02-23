<script setup lang="ts">
/**
 * @fileoverview AI Readiness panel. Displays the AI readiness verdict
 * and individual check results. Shown below the score card.
 */

import type { AiReadinessResult } from "#shared/types";

const props = defineProps<{
  result: AiReadinessResult;
  loading?: boolean;
}>();

const verdictConfig = computed(() => {
  switch (props.result.verdict) {
    case "ready":
      return {
        label: "AI Ready",
        icon: "i-heroicons-check-circle-solid",
        bg: "bg-emerald-100 dark:bg-emerald-900/50",
        text: "text-emerald-700 dark:text-emerald-300",
      };
    case "partial":
      return {
        label: "Partially AI Ready",
        icon: "i-heroicons-exclamation-circle-solid",
        bg: "bg-amber-100 dark:bg-amber-900/50",
        text: "text-amber-700 dark:text-amber-300",
      };
    case "not-ready":
      return {
        label: "Not AI Ready",
        icon: "i-heroicons-x-circle-solid",
        bg: "bg-red-100 dark:bg-red-900/50",
        text: "text-red-700 dark:text-red-300",
      };
  }
});

const statusIcon = (status: string) => {
  switch (status) {
    case "pass":
      return "i-heroicons-check-circle-solid";
    case "warn":
      return "i-heroicons-exclamation-circle-solid";
    case "fail":
      return "i-heroicons-x-circle-solid";
    default:
      return "i-heroicons-minus-circle-solid";
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case "pass":
      return "text-emerald-500";
    case "warn":
      return "text-amber-500";
    case "fail":
      return "text-red-500";
    default:
      return "text-gray-400";
  }
};
</script>

<template>
  <div
    class="bg-white dark:bg-gray-900 rounded-xl border border-violet-200 dark:border-violet-800 p-6"
  >
    <!-- Header -->
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-3">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">
          AI Readiness
        </h3>
        <span
          :class="[
            'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold',
            verdictConfig.bg,
            verdictConfig.text,
          ]"
        >
          <UIcon :name="verdictConfig.icon" class="w-4 h-4" />
          {{ verdictConfig.label }}
        </span>
      </div>
    </div>

    <!-- Prominent non-scoring banner -->
    <div
      class="mb-4 px-3 py-2 rounded-lg bg-violet-100 dark:bg-violet-900/30 border border-violet-300 dark:border-violet-700 border-dashed"
    >
      <p class="text-xs font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
        <UIcon name="i-heroicons-information-circle" class="w-4 h-4 flex-shrink-0" />
        Informational only — this assessment does not impact your meta tag quality score above.
      </p>
    </div>

    <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
      How well your page is prepared for AI systems (LLMs, AI search engines, AI agents) to understand and cite your content.
    </p>

    <!-- Loading state for server checks -->
    <div
      v-if="loading"
      class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4"
    >
      <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
      Checking robots.txt and llms.txt...
    </div>

    <!-- Check list -->
    <div class="space-y-3">
      <div
        v-for="check in result.checks"
        :key="check.id"
        class="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
      >
        <UIcon
          :name="statusIcon(check.status)"
          :class="['w-5 h-5 flex-shrink-0 mt-0.5', statusColor(check.status)]"
        />
        <div class="flex-1 min-w-0">
          <p class="font-medium text-gray-900 dark:text-white text-sm">
            {{ check.label }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            {{ check.message }}
          </p>
          <p
            v-if="check.suggestion"
            class="text-xs text-gray-500 dark:text-gray-400 mt-1"
          >
            {{ check.suggestion }}
          </p>
        </div>
      </div>
    </div>

    <!-- Info note -->
    <div
      class="mt-4 p-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-200 dark:border-violet-800"
    >
      <p class="text-xs text-violet-700 dark:text-violet-300">
        <UIcon name="i-heroicons-information-circle" class="inline-block w-3.5 h-3.5 mr-1 align-middle" />
        AI readiness checks evaluate whether AI systems like ChatGPT, Perplexity, Bing Copilot, and Claude can effectively understand, cite, and link to your content.
      </p>
    </div>
  </div>
</template>
