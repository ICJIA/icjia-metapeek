<script setup lang="ts">
/**
 * @fileoverview The live up/down dot on the header's Status link — green when
 * /api/status last said ok, red when it said not-ok or could not be reached,
 * neutral while unknown. Pure presentational: the page owns the fetch and
 * passes the verdict in (true / false / null = unknown). The dot is
 * decorative; the verdict is also spelled out in visually-hidden text so the
 * color is never the only signal.
 */
import { computed } from "vue";

const props = defineProps<{ ok: boolean | null }>();

const dotClass = computed(() => {
  if (props.ok === true) return "bg-emerald-500";
  if (props.ok === false) return "bg-red-500";
  return "bg-gray-400 dark:bg-gray-600";
});

const label = computed(() => {
  if (props.ok === true) return "All systems normal";
  if (props.ok === false) return "Service degraded";
  return "Status";
});
</script>

<template>
  <span class="inline-flex items-center">
    <span
      data-test="status-beacon-dot"
      class="h-2 w-2 rounded-full"
      :class="dotClass"
      aria-hidden="true"
    />
    <span class="sr-only">{{ label }}</span>
  </span>
</template>
