<script setup lang="ts">
import type { Diagnostics } from '~/types/meta'
import type { MetaTags } from '~/types/meta'

interface Props {
  diagnostics: Diagnostics
  tags?: MetaTags
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

// Truncate long text for display
const truncate = (text: string | undefined, maxLength: number = 100) => {
  if (!text) return null
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
}

const diagnosticItems = computed(() => [
  { 
    label: 'Title', 
    key: 'title', 
    result: props.diagnostics.title,
    value: props.tags?.title,
    charCount: props.tags?.title?.length
  },
  { 
    label: 'Description', 
    key: 'description', 
    result: props.diagnostics.description,
    value: props.tags?.description,
    charCount: props.tags?.description?.length
  },
  { 
    label: 'Open Graph', 
    key: 'ogTags', 
    result: props.diagnostics.ogTags,
    details: [
      { label: 'og:title', value: props.tags?.og?.title },
      { label: 'og:description', value: props.tags?.og?.description },
      { label: 'og:type', value: props.tags?.og?.type },
      { label: 'og:url', value: props.tags?.og?.url },
      { label: 'og:site_name', value: props.tags?.og?.siteName },
    ].filter(d => d.value)
  },
  { 
    label: 'OG Image', 
    key: 'ogImage', 
    result: props.diagnostics.ogImage,
    value: props.tags?.og?.image
  },
  { 
    label: 'Twitter Card', 
    key: 'twitterCard', 
    result: props.diagnostics.twitterCard,
    details: [
      { label: 'twitter:card', value: props.tags?.twitter?.card },
      { label: 'twitter:site', value: props.tags?.twitter?.site },
      { label: 'twitter:creator', value: props.tags?.twitter?.creator },
    ].filter(d => d.value)
  },
  { 
    label: 'Canonical URL', 
    key: 'canonical', 
    result: props.diagnostics.canonical,
    value: props.tags?.canonical
  },
  { 
    label: 'Robots', 
    key: 'robots', 
    result: props.diagnostics.robots,
    value: props.tags?.robots
  },
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
          :class="['w-5 h-5 shrink-0 mt-0.5', getStatusColor(diagnostics.overall.status)]"
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
        class="px-4 py-4 bg-white dark:bg-gray-900"
      >
        <!-- Header row -->
        <div class="flex items-start gap-3">
          <UIcon 
            :name="getStatusIcon(item.result.status)" 
            :class="['w-5 h-5 shrink-0 mt-0.5', getStatusColor(item.result.status)]"
          />
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-medium text-gray-900 dark:text-gray-100">
                {{ item.label }}
              </span>
              <div class="flex items-center gap-2">
                <span v-if="item.charCount" class="text-xs text-gray-400">
                  {{ item.charCount }} chars
                </span>
                <UBadge 
                  :color="item.result.status === 'green' ? 'success' : item.result.status === 'yellow' ? 'warning' : 'error'"
                  size="xs"
                  variant="subtle"
                >
                  {{ item.result.status === 'green' ? 'Pass' : item.result.status === 'yellow' ? 'Warning' : 'Error' }}
                </UBadge>
              </div>
            </div>
            
            <!-- Status message -->
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ item.result.message }}
            </p>
            
            <!-- Actual value (single value) -->
            <div v-if="item.value" class="mt-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <p class="text-sm font-mono text-gray-700 dark:text-gray-300 break-all">
                {{ truncate(item.value, 200) }}
              </p>
            </div>
            
            <!-- Details (multiple values) -->
            <div v-if="item.details && item.details.length > 0" class="mt-2 space-y-1">
              <div 
                v-for="detail in item.details" 
                :key="detail.label"
                class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              >
                <span class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28">
                  {{ detail.label }}
                </span>
                <span class="text-sm font-mono text-gray-700 dark:text-gray-300 break-all">
                  {{ truncate(detail.value, 150) }}
                </span>
              </div>
            </div>
            
            <!-- Suggestion -->
            <p v-if="item.result.suggestion" class="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">
              💡 {{ item.result.suggestion }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
