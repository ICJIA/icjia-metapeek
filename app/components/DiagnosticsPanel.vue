<script setup lang="ts">
import type { Diagnostics, DiagnosticResult } from '~/types/meta'

interface Props {
  diagnostics: Diagnostics
}

const props = defineProps<Props>()

const getStatusColor = (status: 'green' | 'yellow' | 'red') => {
  const colors = {
    green: 'text-emerald-600 dark:text-emerald-400',
    yellow: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400'
  }
  return colors[status]
}

const getStatusBg = (status: 'green' | 'yellow' | 'red') => {
  const colors = {
    green: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
    yellow: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
  }
  return colors[status]
}

const getStatusIcon = (status: 'green' | 'yellow' | 'red') => {
  const icons = {
    green: 'i-heroicons-check-circle',
    yellow: 'i-heroicons-exclamation-triangle',
    red: 'i-heroicons-x-circle'
  }
  return icons[status]
}

const diagnosticItems = computed(() => [
  { label: 'Title', key: 'title', result: props.diagnostics.title },
  { label: 'Description', key: 'description', result: props.diagnostics.description },
  { label: 'Open Graph', key: 'ogTags', result: props.diagnostics.ogTags },
  { label: 'OG Image', key: 'ogImage', result: props.diagnostics.ogImage },
  { label: 'Twitter Card', key: 'twitterCard', result: props.diagnostics.twitterCard },
  { label: 'Canonical', key: 'canonical', result: props.diagnostics.canonical },
  { label: 'Robots', key: 'robots', result: props.diagnostics.robots },
])
</script>

<template>
  <div class="space-y-4">
    <!-- Overall Status -->
    <div 
      :class="[
        'p-4 rounded-lg border',
        getStatusBg(diagnostics.overall.status)
      ]"
    >
      <div class="flex items-start gap-3">
        <UIcon 
          :name="getStatusIcon(diagnostics.overall.status)" 
          :class="['w-5 h-5 flex-shrink-0 mt-0.5', getStatusColor(diagnostics.overall.status)]"
        />
        <div>
          <p :class="['font-semibold', getStatusColor(diagnostics.overall.status)]">
            {{ diagnostics.overall.message }}
          </p>
          <p v-if="diagnostics.overall.suggestion" class="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            {{ diagnostics.overall.suggestion }}
          </p>
        </div>
      </div>
    </div>
    
    <!-- Individual Checks -->
    <div class="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden divide-y divide-gray-200 dark:divide-gray-800">
      <div 
        v-for="item in diagnosticItems" 
        :key="item.key"
        class="px-4 py-3 flex items-start gap-3 bg-white dark:bg-gray-900"
      >
        <UIcon 
          :name="getStatusIcon(item.result.status)" 
          :class="['w-4 h-4 flex-shrink-0 mt-0.5', getStatusColor(item.result.status)]"
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
              {{ item.label }}
            </span>
            <UBadge 
              :color="item.result.status === 'green' ? 'success' : item.result.status === 'yellow' ? 'warning' : 'error'"
              size="xs"
              variant="subtle"
            >
              {{ item.result.status === 'green' ? 'Pass' : item.result.status === 'yellow' ? 'Warning' : 'Error' }}
            </UBadge>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            {{ item.result.message }}
          </p>
          <p v-if="item.result.suggestion" class="text-xs text-gray-500 dark:text-gray-500 mt-1 italic">
            {{ item.result.suggestion }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
