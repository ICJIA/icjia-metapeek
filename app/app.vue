<script setup lang="ts">
const initLoading = ref(true);

onMounted(() => {
  initLoading.value = false;
});
</script>

<template>
  <div>
    <NuxtLoadingIndicator color="#60a5fa" :height="3" />
    <NuxtPage />
    <UToaster />
    <Transition name="app-init-fade">
      <div
        v-if="initLoading"
        class="app-init-loader"
        role="status"
        aria-live="polite"
        aria-label="Loading MetaPeek"
      >
        <div class="app-init-loader__inner">
          <svg
            class="app-init-loader__spinner"
            width="44"
            height="44"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span class="app-init-loader__text">Loading</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style>
.app-init-loader {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f172a;
  z-index: 9999;
}

.app-init-loader__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.875rem;
  color: #f1f5f9;
  font-family:
    system-ui,
    -apple-system,
    "Segoe UI",
    sans-serif;
}

.app-init-loader__spinner {
  color: #60a5fa;
  animation: app-init-spin 1s linear infinite;
}

.app-init-loader__text {
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

@keyframes app-init-spin {
  to {
    transform: rotate(360deg);
  }
}

.app-init-fade-leave-active {
  transition: opacity 0.25s ease;
}

.app-init-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .app-init-loader__spinner {
    animation: none;
  }
  .app-init-fade-leave-active {
    transition: none;
  }
}
</style>
