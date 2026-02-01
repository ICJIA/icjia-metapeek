<script setup lang="ts">
interface Props {
  title?: string
  description?: string
  image?: string
}

const props = defineProps<Props>()

// Truncate title at 90 characters (Facebook limit)
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

// Image with fallback
const imageUrl = computed(() => {
  return props.image || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" fill="%23e5e7eb"%3E%3Crect width="1200" height="630"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="48" fill="%239ca3af"%3ENo image%3C/text%3E%3C/svg%3E'
})
</script>

<template>
  <UCard>
    <template #header>
      <h3 class="text-lg font-semibold flex items-center gap-2">
        <UIcon name="i-heroicons-share" class="text-xl" aria-hidden="true" />
        Facebook / LinkedIn Preview
      </h3>
    </template>
    
    <div 
      class="facebook-preview min-h-[200px] border border-gray-200 dark:border-gray-700 rounded overflow-hidden" 
      role="region" 
      aria-label="Facebook and LinkedIn share card preview"
    >
      <!-- Image with 1.91:1 aspect ratio -->
      <div class="relative w-full" style="aspect-ratio: 1.91 / 1; background: #f3f4f6;">
        <img 
          :src="imageUrl" 
          :alt="title ? `Preview image for: ${title}` : 'Share preview image'"
          class="w-full h-full object-cover"
        />
      </div>
      
      <!-- Content -->
      <div class="p-3 bg-gray-50 dark:bg-gray-800">
        <p class="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">
          EXAMPLE.COM
        </p>
        <p class="font-semibold text-base text-gray-900 dark:text-gray-100 mb-1">
          {{ truncatedTitle }}
        </p>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ truncatedDescription }}
        </p>
      </div>
    </div>
    
    <template #footer>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        Facebook and LinkedIn use a 1.91:1 aspect ratio. Images should be at least 1200×630px.
      </p>
    </template>
  </UCard>
</template>
