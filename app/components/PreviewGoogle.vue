<script setup lang="ts">
interface Props {
  title?: string
  description?: string
  url?: string
}

const props = defineProps<Props>()

// Truncate title at 60 characters (Google's approximate limit)
const truncatedTitle = computed(() => {
  if (!props.title) return 'Untitled'
  return props.title.length > 60 
    ? props.title.substring(0, 60) + '...' 
    : props.title
})

// Truncate description at 160 characters
const truncatedDescription = computed(() => {
  if (!props.description) return ''
  return props.description.length > 160
    ? props.description.substring(0, 160) + '...'
    : props.description
})

// Format URL for display
const displayUrl = computed(() => {
  if (!props.url) return 'example.com'
  try {
    const parsed = new URL(props.url)
    return parsed.hostname + parsed.pathname
  } catch {
    return props.url
  }
})
</script>

<template>
  <UCard>
    <template #header>
      <h3 class="text-lg font-semibold flex items-center gap-2">
        <UIcon name="i-heroicons-magnifying-glass" class="text-xl" aria-hidden="true" />
        Google Search Preview
      </h3>
    </template>
    
    <div 
      class="google-preview min-h-[120px]" 
      role="region" 
      aria-label="Google search result preview"
    >
      <cite class="text-sm text-emerald-700 dark:text-emerald-400 not-italic block">
        {{ displayUrl }}
      </cite>
      
      <p class="text-xl text-blue-700 dark:text-blue-400 mt-1 hover:underline cursor-pointer font-normal">
        {{ truncatedTitle }}
      </p>
      
      <p v-if="description" class="text-sm text-gray-600 dark:text-gray-400 mt-1">
        {{ truncatedDescription }}
      </p>
      
      <p v-else class="text-sm text-gray-400 italic mt-1">
        No description provided
      </p>
    </div>
    
    <template #footer>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        Shows how your page appears in Google search results. Title truncates at ~60 characters.
      </p>
    </template>
  </UCard>
</template>
