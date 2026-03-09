<script setup lang="ts">
/**
 * @fileoverview SEO Insights panel. Displays advisory (non-scoring) SEO
 * checks with detailed info for developers.
 */

import type { SeoInsightsResult } from "#shared/types";

const props = defineProps<{
  result: SeoInsightsResult;
}>();

const summaryLabel = computed(() => {
  const { pass, warn, info, na } = props.result.summary;
  const parts: string[] = [];
  if (pass) parts.push(`${pass} pass`);
  if (warn) parts.push(`${warn} advisory`);
  if (info) parts.push(`${info} info`);
  if (na) parts.push(`${na} n/a`);
  return parts.join(" · ");
});

const statusIcon = (status: string) => {
  switch (status) {
    case "pass":
      return "i-heroicons-check-circle-solid";
    case "warn":
      return "i-heroicons-exclamation-circle-solid";
    case "info":
      return "i-heroicons-information-circle-solid";
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
    case "info":
      return "text-blue-500";
    default:
      return "text-gray-400";
  }
};
</script>

<template>
  <div
    class="bg-white dark:bg-gray-900 rounded-xl border border-teal-200 dark:border-teal-800 p-6"
  >
    <!-- Header -->
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-3">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">
          SEO Insights
        </h3>
        <span
          class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300"
        >
          {{ summaryLabel }}
        </span>
      </div>
    </div>

    <!-- Non-scoring banner -->
    <div
      class="mb-4 px-3 py-2 rounded-lg bg-teal-100 dark:bg-teal-900/30 border border-teal-300 dark:border-teal-700 border-dashed"
    >
      <p class="text-xs font-semibold text-teal-700 dark:text-teal-300 flex items-center gap-1.5">
        <UIcon name="i-heroicons-information-circle" class="w-4 h-4 flex-shrink-0" />
        Developer insights only — these checks do not impact your meta tag quality score or AI readiness verdict.
      </p>
    </div>

    <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
      Additional SEO signals and best practices that can improve your page's search visibility, performance, and accessibility.
    </p>

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
          <pre
            v-if="check.detail"
            class="mt-2 p-3 rounded-md bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap break-all overflow-x-auto max-h-48 overflow-y-auto"
          >{{ check.detail }}</pre>
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
      class="mt-4 p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-800"
    >
      <p class="text-xs text-teal-700 dark:text-teal-300">
        <UIcon name="i-heroicons-information-circle" class="inline-block w-3.5 h-3.5 mr-1 align-middle" />
        These checks surface SEO signals beyond the core meta tag score — including encoding, internationalization, accessibility, performance hints, and HTML structure best practices.
      </p>
    </div>
  </div>
</template>
