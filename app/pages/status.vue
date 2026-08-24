<script setup lang="ts">
/**
 * @fileoverview /status — live service status, the human view of /api/status.
 *
 * Prerendered shell (routeRules) served from the CDN; the data is fetched
 * client-side so it is always live while the page itself costs no function
 * invocation. Not indexed — it's an operational page, not content.
 */
import type { StatusPayload } from "~~/server/api/status.get";

useSeoMeta({
  title: "Status — MetaPeek",
  description:
    "Live service status for MetaPeek: version, request totals, site-wide daily budgets, and failures.",
  robots: "noindex, nofollow",
});

const {
  data,
  error,
  status: fetchStatus,
  refresh,
} = useFetch<StatusPayload>("/api/status", { server: false, lazy: true });
</script>

<template>
  <div class="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
    <main id="main-content" class="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <header class="mb-8">
        <p class="text-sm">
          <NuxtLink
            to="/"
            class="text-gray-500 underline transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            &larr; MetaPeek
          </NuxtLink>
        </p>
        <h1 class="mt-3 text-2xl font-bold">Service status</h1>
      </header>

      <div
        v-if="fetchStatus === 'pending' || fetchStatus === 'idle'"
        class="rounded-lg border border-gray-200 p-5 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400"
        role="status"
        aria-live="polite"
      >
        Checking&hellip;
      </div>

      <div
        v-else-if="error || !data"
        class="rounded-lg border border-red-300 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/40"
        role="alert"
      >
        <p class="font-semibold">Could not load the status feed.</p>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          The site itself is serving (you are reading it), but /api/status did
          not answer.
        </p>
        <button
          type="button"
          class="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          @click="() => refresh()"
        >
          Try again
        </button>
      </div>

      <StatusReport v-else :status="data" />
    </main>
  </div>
</template>
