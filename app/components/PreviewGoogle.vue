<script setup lang="ts">
interface Props {
  title?: string
  description?: string
  url?: string
}

const props = defineProps<Props>()

const truncatedTitle = computed(() => {
  if (!props.title) return 'Untitled Page'
  return props.title.length > 60 ? props.title.substring(0, 60) + '...' : props.title
})

const truncatedDescription = computed(() => {
  if (!props.description) return 'No description provided'
  return props.description.length > 160 ? props.description.substring(0, 160) + '...' : props.description
})

const displayUrl = computed(() => {
  if (!props.url) return 'example.com'
  try {
    const parsed = new URL(props.url)
    return parsed.hostname + parsed.pathname.replace(/\/$/, '')
  } catch {
    return props.url
  }
})
</script>

<template>
  <div class="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-5 h-5 rounded bg-gradient-to-br from-blue-500 via-red-500 to-yellow-500 flex items-center justify-center">
          <span class="text-white text-xs font-bold">G</span>
        </div>
        <span class="text-sm font-medium">Google</span>
      </div>
      <AppTooltip text="How your page appears in Google search results">
        <UIcon 
          name="i-heroicons-information-circle" 
          class="w-5 h-5 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 cursor-help transition-colors" 
        />
      </AppTooltip>
    </div>
    
    <!-- Preview -->
    <div class="p-4">
      <div class="space-y-1">
        <p class="text-xs text-gray-600 dark:text-gray-400">
          {{ displayUrl }}
        </p>
        <p class="text-lg text-blue-700 dark:text-blue-400 hover:underline cursor-pointer leading-snug">
          {{ truncatedTitle }}
        </p>
        <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          {{ truncatedDescription }}
        </p>
      </div>
    </div>
  </div>
</template>
