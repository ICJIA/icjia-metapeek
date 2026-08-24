<script setup lang="ts">
/**
 * @fileoverview Large "start over" control, shown above and below the results
 * so it is reachable without scrolling in either direction.
 *
 * Stateless by design: it emits `reset` and the page owns the single
 * resetAll() definition.
 *
 * Achromatic on purpose. Every hue on this page is already spoken for: the
 * numbered steps run blue / purple / violet / cyan / teal / emerald / indigo /
 * orange, and red-amber-emerald mark the score. A coloured reset would read as
 * one more step. High-contrast neutral is the one register left, it matches the
 * app's Swiss `primary: 'neutral'` token, and being the only achromatic block
 * among pastel bands is exactly what makes it easy to find.
 */

withDefaults(
  defineProps<{
    /** Button text. */
    label?: string;
    /** Optional line under the button explaining what gets cleared. */
    hint?: string;
    /** Stretch to the container width — used for the full-width bottom bar. */
    block?: boolean;
  }>(),
  {
    label: "Start over",
    hint: undefined,
    block: false,
  },
);

defineEmits<{ reset: [] }>();
</script>

<template>
  <div class="flex flex-col items-center text-center">
    <button
      type="button"
      aria-label="Clear everything and start a new analysis"
      class="group inline-flex items-center justify-center gap-3 min-h-[56px] px-8 py-3.5 rounded-xl font-semibold text-base shadow-lg bg-gray-900 text-white hover:bg-gray-800 active:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-gray-900/40 dark:focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950"
      :class="block ? 'w-full sm:w-auto' : ''"
      @click="$emit('reset')"
    >
      <UIcon
        name="i-heroicons-arrow-path"
        class="w-5 h-5 shrink-0 transition-transform duration-300 motion-safe:group-hover:-rotate-180 motion-reduce:transition-none"
        aria-hidden="true"
      />
      {{ label }}
    </button>
    <p
      v-if="hint"
      data-test="reset-hint"
      class="text-sm text-gray-600 dark:text-gray-400 mt-2.5 max-w-md"
    >
      {{ hint }}
    </p>
  </div>
</template>
