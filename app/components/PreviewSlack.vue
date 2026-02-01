<script setup lang="ts">
interface Props {
  title?: string
  description?: string
  image?: string
  favicon?: string
  url?: string
}

const props = defineProps<Props>()

// Truncate title at 90 characters
const truncatedTitle = computed(() => {
  if (!props.title) return 'Your Page Title'
  return props.title.length > 90 
    ? props.title.substring(0, 90) + '...' 
    : props.title
})

// Truncate description at 200 characters
const truncatedDescription = computed(() => {
  if (!props.description) return 'Your page description'
  return props.description.length > 200
    ? props.description.substring(0, 200) + '...'
    : props.description
})

// Extract domain from URL for display
const displayDomain = computed(() => {
  if (!props.url) return 'example.com'
  try {
    const parsed = new URL(props.url)
    return parsed.hostname
  } catch {
    return 'example.com'
  }
})

// Image with fallback
const imageUrl = computed(() => {
  return props.image || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" fill="%23e5e7eb"%3E%3Crect width="1200" height="630"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="48" fill="%239ca3af"%3ENo image%3C/text%3E%3C/svg%3E'
})

// Favicon with fallback (globe icon)
const faviconUrl = computed(() => {
  return props.favicon || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%239ca3af"%3E%3Cpath d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/%3E%3C/svg%3E'
})
</script>

<template>
  <UCard>
    <template #header>
      <h3 class="text-lg font-semibold flex items-center gap-2">
        <UIcon name="i-heroicons-chat-bubble-oval-left-ellipsis" class="text-xl" aria-hidden="true" />
        Slack Unfurl Preview
      </h3>
    </template>
    
    <div 
      class="slack-preview bg-white dark:bg-gray-900 rounded-lg overflow-hidden" 
      role="region" 
      aria-label="Slack link unfurl preview"
    >
      <!-- Slack-style unfurl with left border -->
      <div class="flex border-l-4 border-gray-400 dark:border-gray-500 ml-2">
        <div class="pl-3 py-2 flex-1">
          <!-- Header with favicon and domain -->
          <div class="flex items-center gap-1.5 mb-1">
            <img 
              :src="faviconUrl" 
              alt=""
              aria-hidden="true"
              class="w-4 h-4 rounded-sm"
            />
            <span class="text-sm font-bold text-gray-900 dark:text-gray-100">
              {{ displayDomain }}
            </span>
          </div>
          
          <!-- Title -->
          <p class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer mb-0.5">
            {{ truncatedTitle }}
          </p>
          
          <!-- Description -->
          <p class="text-sm text-gray-600 dark:text-gray-400 leading-snug">
            {{ truncatedDescription }}
          </p>
          
          <!-- Image (inline, smaller like Slack shows) -->
          <div v-if="image" class="mt-2 max-w-xs">
            <img 
              :src="imageUrl" 
              :alt="title ? `Preview image for: ${title}` : 'Slack unfurl image'"
              class="rounded border border-gray-200 dark:border-gray-700 max-h-48 w-auto object-contain"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
            />
          </div>
        </div>
      </div>
    </div>
    
    <template #footer>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        Slack unfurls show favicon, site name, title, description, and og:image when shared in channels.
      </p>
    </template>
  </UCard>
</template>
