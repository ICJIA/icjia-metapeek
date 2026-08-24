<script setup lang="ts">
/**
 * @fileoverview Renders the /api/status payload: verdict, build identity,
 * dependency check, daily budget meters, request totals, and failure counts.
 * Pure presentational — the page owns the fetch and passes the payload in,
 * so this component tests without any Nuxt runtime.
 */
import { computed } from "vue";
import type { StatusPayload } from "~~/server/api/status.get";

const props = defineProps<{ status: StatusPayload }>();

const healthy = computed(() => props.status.ok);

/** "2026-08-24T03:00:00+00:00" -> "Aug 24, 2026, 10:00 PM CT" (site's zone). */
function formatWhen(iso: string | undefined | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return (
    date.toLocaleString("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " CT"
  );
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

const budgetRows = computed(() => {
  const budget = props.status.budget;
  if (!budget) return [];
  return [
    { key: "api", label: "Daily API budget", note: "plain fetch + analyze", ...budget.api },
    { key: "spa", label: "Daily SPA budget", note: "headless-Chromium renders", ...budget.spa },
  ].map((row) => {
    const percent = row.limit > 0 ? Math.min(100, Math.round((row.used / row.limit) * 100)) : 0;
    return {
      ...row,
      percent,
      // The counter keeps counting denied attempts after the cap trips, so
      // `used` can exceed `limit`. The visible number stays raw (demand is
      // signal) but the meter value must not leave its own range.
      meterValue: Math.min(row.used, row.limit),
      capReached: row.used >= row.limit,
      barClass:
        percent >= 100
          ? "bg-red-500"
          : percent >= 80
            ? "bg-amber-500"
            : "bg-emerald-500",
    };
  });
});

const usageRows = computed(() => {
  const usage = props.status.usage;
  if (!usage) return [];
  return [
    { label: "Last 24 hours", ...usage.last24h },
    { label: "Last 30 days", ...usage.last30d },
  ];
});

const supabaseSummary = computed(() => {
  const check = props.status.checks.supabase;
  if (!check.configured) return "not configured (local development)";
  if (check.ok === false) return "unreachable";
  return typeof check.latencyMs === "number" ? `connected · ${check.latencyMs} ms` : "connected";
});
</script>

<template>
  <div class="space-y-8">
    <!-- Verdict -->
    <section
      class="rounded-lg border p-5"
      :class="
        healthy
          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40'
          : 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
      "
    >
      <p class="flex items-center gap-2.5 text-lg font-semibold text-gray-900 dark:text-gray-100">
        <span
          class="h-2.5 w-2.5 shrink-0 rounded-full"
          :class="healthy ? 'bg-emerald-500' : 'bg-red-500'"
          aria-hidden="true"
        />
        {{ healthy ? "All systems normal" : "Service degraded" }}
      </p>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
        <span class="font-mono">v{{ status.version }}</span>
        <template v-if="status.commit">
          · commit <span class="font-mono">{{ status.commit }}</span>
        </template>
        <template v-if="status.builtAt"> · deployed {{ formatWhen(status.builtAt) }}</template>
        · checked {{ formatWhen(status.now) }}
      </p>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Supabase (rate limiting + logs): {{ supabaseSummary }}
      </p>
    </section>

    <!-- Daily budgets -->
    <section v-if="budgetRows.length" aria-labelledby="status-budget-heading">
      <h2
        id="status-budget-heading"
        class="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
      >
        Site-wide daily budgets
      </h2>
      <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Shared across all visitors — the backstop that keeps MetaPeek free.
        Each window runs 24 hours from its first request.
      </p>
      <div class="mt-3 grid gap-4 sm:grid-cols-2">
        <div
          v-for="row in budgetRows"
          :key="row.key"
          class="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
        >
          <div class="flex items-baseline justify-between gap-2">
            <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ row.label }}</p>
            <p class="text-sm tabular-nums text-gray-600 dark:text-gray-400">
              {{ formatCount(row.used) }} / {{ formatCount(row.limit) }}
            </p>
          </div>
          <div
            class="mt-2 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
            role="meter"
            :aria-label="row.label"
            :aria-valuenow="row.meterValue"
            aria-valuemin="0"
            :aria-valuemax="row.limit"
            :aria-valuetext="`${formatCount(row.used)} of ${formatCount(row.limit)} used`"
          >
            <div
              class="h-full rounded-full transition-[width]"
              :class="row.barClass"
              :style="{ width: `${row.percent}%` }"
            />
          </div>
          <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {{ row.note }}
            <template v-if="row.windowStartedAt">
              · window began {{ formatWhen(row.windowStartedAt) }}
            </template>
            <template v-if="row.capReached">
              · cap reached — further requests are being declined
            </template>
          </p>
        </div>
      </div>
    </section>

    <!-- Requests -->
    <section v-if="usageRows.length" aria-labelledby="status-usage-heading">
      <h2
        id="status-usage-heading"
        class="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
      >
        Requests
      </h2>
      <div class="mt-3 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <table class="w-full text-sm">
          <caption class="sr-only">
            Request totals by window: total, allowed, denied, and the split
            between plain API fetches and headless-Chromium renders.
          </caption>
          <thead>
            <tr class="border-b border-gray-200 text-left dark:border-gray-800">
              <th scope="col" class="px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400">Window</th>
              <th scope="col" class="px-4 py-2.5 text-right font-medium text-gray-500 dark:text-gray-400">Total</th>
              <th scope="col" class="px-4 py-2.5 text-right font-medium text-gray-500 dark:text-gray-400">Allowed</th>
              <th scope="col" class="px-4 py-2.5 text-right font-medium text-gray-500 dark:text-gray-400">Denied</th>
              <th scope="col" class="px-4 py-2.5 text-right font-medium text-gray-500 dark:text-gray-400">API</th>
              <th scope="col" class="px-4 py-2.5 text-right font-medium text-gray-500 dark:text-gray-400">SPA</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in usageRows"
              :key="row.label"
              class="border-b border-gray-100 last:border-0 dark:border-gray-800/60"
            >
              <th scope="row" class="px-4 py-2.5 text-left font-normal text-gray-900 dark:text-gray-100">
                {{ row.label }}
              </th>
              <td class="px-4 py-2.5 text-right tabular-nums text-gray-900 dark:text-gray-100">{{ formatCount(row.total) }}</td>
              <td class="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-400">{{ formatCount(row.allowed) }}</td>
              <td class="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-400">{{ formatCount(row.denied) }}</td>
              <td class="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-400">{{ formatCount(row.api) }}</td>
              <td class="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-400">{{ formatCount(row.spa) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Failures -->
    <section v-if="status.errors" aria-labelledby="status-errors-heading">
      <h2
        id="status-errors-heading"
        class="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
      >
        Failures
      </h2>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
        <template v-if="status.errors.last30d === 0">
          No failures recorded in the last 30 days.
        </template>
        <template v-else>
          {{ formatCount(status.errors.last24h) }} in the last 24 hours ·
          {{ formatCount(status.errors.last30d) }} in the last 30 days
          <template v-if="status.errors.lastAt">
            · most recent {{ formatWhen(status.errors.lastAt) }}
          </template>
        </template>
      </p>
    </section>

    <!-- Meta -->
    <p class="text-xs text-gray-500 dark:text-gray-400">
      Request and failure logs keep {{ status.retentionDays.requestLog }} days of
      history; raw IP addresses are never stored.
      <a
        href="/api/status"
        class="underline transition-colors hover:text-gray-900 dark:hover:text-gray-100"
      >View raw JSON</a>
    </p>
  </div>
</template>
