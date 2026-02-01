<script setup lang="ts">
import type { Diagnostics } from '~/types/meta'

interface Props {
  diagnostics: Diagnostics
}

const props = defineProps<Props>()

// Map status to color classes
const getStatusColor = (status: 'green' | 'yellow' | 'red') => {
  switch (status) {
    case 'green':
      return 'text-green-600 dark:text-green-400'
    case 'yellow':
      return 'text-yellow-600 dark:text-yellow-400'
    case 'red':
      return 'text-red-600 dark:text-red-400'
  }
}

// Map status to background color
const getStatusBgColor = (status: 'green' | 'yellow' | 'red') => {
  switch (status) {
    case 'green':
      return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
    case 'yellow':
      return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
    case 'red':
      return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
  }
}

// Map icon to Heroicon name
const getIconName = (icon: 'check' | 'warning' | 'error') => {
  switch (icon) {
    case 'check':
      return 'i-heroicons-check-circle'
    case 'warning':
      return 'i-heroicons-exclamation-triangle'
    case 'error':
      return 'i-heroicons-x-circle'
  }
}

// Diagnostic items
const diagnosticItems = computed(() => [
  { label: 'Title', result: props.diagnostics.title },
  { label: 'Description', result: props.diagnostics.description },
  { label: 'Open Graph Tags', result: props.diagnostics.ogTags },
  { label: 'OG Image', result: props.diagnostics.ogImage },
  { label: 'Twitter Card', result: props.diagnostics.twitterCard },
  { label: 'Canonical URL', result: props.diagnostics.canonical },
  { label: 'Robots Meta', result: props.diagnostics.robots },
])
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="text-2xl font-bold flex items-center gap-2">
        <UIcon name="i-heroicons-clipboard-document-check" class="text-2xl" aria-hidden="true" />
        Diagnostics
      </h2>
    </template>
    
    <!-- Overall Status -->
    <div 
      class="mb-4 p-4 rounded-lg border"
      :class="getStatusBgColor(diagnostics.overall.status)"
      role="status"
      aria-live="polite"
    >
      <div class="flex items-start gap-3">
        <UIcon 
          :name="getIconName(diagnostics.overall.icon)" 
          class="text-2xl flex-shrink-0 mt-0.5"
          :class="getStatusColor(diagnostics.overall.status)"
          aria-hidden="true"
        />
        <div class="flex-1">
          <p class="font-semibold text-lg mb-1" :class="getStatusColor(diagnostics.overall.status)">
            {{ diagnostics.overall.message }}
          </p>
          <p v-if="diagnostics.overall.suggestion" class="text-sm text-gray-700 dark:text-gray-300">
            {{ diagnostics.overall.suggestion }}
          </p>
        </div>
      </div>
    </div>
    
    <!-- Individual Checks -->
    <div class="space-y-3">
      <div 
        v-for="item in diagnosticItems" 
        :key="item.label"
        class="flex items-start gap-3 p-3 rounded-lg border"
        :class="getStatusBgColor(item.result.status)"
      >
        <UIcon 
          :name="getIconName(item.result.icon)" 
          class="text-xl flex-shrink-0 mt-0.5"
          :class="getStatusColor(item.result.status)"
          :aria-label="item.result.status === 'green' ? 'Pass' : item.result.status === 'yellow' ? 'Warning' : 'Error'"
        />
        
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-sm mb-1">
            {{ item.label }}
          </p>
          <p class="text-sm text-gray-700 dark:text-gray-300 mb-1">
            {{ item.result.message }}
          </p>
          <p v-if="item.result.suggestion" class="text-xs text-gray-600 dark:text-gray-400 italic">
            {{ item.result.suggestion }}
          </p>
        </div>
      </div>
    </div>
    
    <template #footer>
      <div class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <div class="flex items-center gap-1">
          <UIcon name="i-heroicons-check-circle" class="text-green-600" aria-hidden="true" />
          <span>Pass</span>
        </div>
        <div class="flex items-center gap-1">
          <UIcon name="i-heroicons-exclamation-triangle" class="text-yellow-600" aria-hidden="true" />
          <span>Warning</span>
        </div>
        <div class="flex items-center gap-1">
          <UIcon name="i-heroicons-x-circle" class="text-red-600" aria-hidden="true" />
          <span>Error</span>
        </div>
      </div>
    </template>
  </UCard>
</template>
