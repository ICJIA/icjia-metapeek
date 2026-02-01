<script setup lang="ts">
interface Props {
  card?: string
  title?: string
  description?: string
  image?: string
}

const props = defineProps<Props>()

// Determine card type (default to summary_large_image)
const cardType = computed(() => {
  return props.card === 'summary' ? 'summary' : 'summary_large_image'
})

// Truncate title at 70 characters
const truncatedTitle = computed(() => {
  if (!props.title) return 'Your Page Title'
  return props.title.length > 70 
    ? props.title.substring(0, 70) + '...' 
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
  return props.image || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1200" height="628" fill="%23e5e7eb"%3E%3Crect width="1200" height="628"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="48" fill="%239ca3af"%3ENo image%3C/text%3E%3C/svg%3E'
})
</script>

<template>
  <UCard>
    <template #header>
      <h3 class="text-lg font-semibold flex items-center gap-2">
        <UIcon name="i-heroicons-chat-bubble-left-right" class="text-xl" aria-hidden="true" />
        X / Twitter Preview
      </h3>
    </template>
    
    <div 
      class="twitter-preview min-h-[200px] border border-gray-200 dark:border-gray-700 rounded overflow-hidden" 
      role="region" 
      :aria-label="`Twitter ${cardType} card preview`"
    >
      <!-- Large image card (2:1 ratio) -->
      <div v-if="cardType === 'summary_large_image'" class="relative w-full" style="aspect-ratio: 2 / 1; background: #f3f4f6;">
        <img 
          :src="imageUrl" 
          :alt="title ? `Preview image for: ${title}` : 'Tweet preview image'"
          class="w-full h-full object-cover"
        />
      </div>
      
      <!-- Content -->
      <div class="p-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
        <!-- Summary card with small image -->
        <div v-if="cardType === 'summary'" class="flex gap-3">
          <div class="flex-1">
            <p class="font-semibold text-base text-gray-900 dark:text-gray-100 mb-1">
              {{ truncatedTitle }}
            </p>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">
              {{ truncatedDescription }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              example.com
            </p>
          </div>
          <div class="w-24 h-24 flex-shrink-0 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
            <img 
              :src="imageUrl" 
              :alt="title ? `Preview image for: ${title}` : 'Tweet preview image'"
              class="w-full h-full object-cover"
            />
          </div>
        </div>
        
        <!-- Large image card content -->
        <div v-else>
          <p class="font-semibold text-base text-gray-900 dark:text-gray-100 mb-1">
            {{ truncatedTitle }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">
            {{ truncatedDescription }}
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            example.com
          </p>
        </div>
      </div>
    </div>
    
    <template #footer>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        {{ cardType === 'summary' 
          ? 'Summary card (1:1 ratio, small image). Minimum 144×144px.' 
          : 'Large image card (2:1 ratio). Minimum 300×157px, recommended 1200×628px.' 
        }}
      </p>
    </template>
  </UCard>
</template>
