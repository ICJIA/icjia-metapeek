<script setup lang="ts">
interface Props {
  card?: string
  title?: string
  description?: string
  image?: string
}

const props = defineProps<Props>()

const cardType = computed(() => props.card === 'summary' ? 'summary' : 'summary_large_image')

const truncatedTitle = computed(() => {
  if (!props.title) return 'Your Page Title'
  return props.title.length > 70 ? props.title.substring(0, 70) + '...' : props.title
})

const truncatedDescription = computed(() => {
  if (!props.description) return 'Your page description'
  return props.description.length > 150 ? props.description.substring(0, 150) + '...' : props.description
})

const imageError = ref(false)
const handleImageError = () => {
  imageError.value = true
}
</script>

<template>
  <div class="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-5 h-5 rounded bg-black dark:bg-white flex items-center justify-center">
          <span class="text-white dark:text-black text-xs font-bold">𝕏</span>
        </div>
        <span class="text-sm font-medium">X / Twitter</span>
      </div>
      <UTooltip :text="`${cardType === 'summary' ? 'Summary' : 'Large image'} card preview for X (Twitter)`">
        <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-gray-400 cursor-help" />
      </UTooltip>
    </div>
    
    <!-- Preview -->
    <div class="p-4">
      <div class="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <!-- Large Image Card -->
        <template v-if="cardType === 'summary_large_image'">
          <div 
            v-if="image && !imageError"
            class="aspect-[2/1] bg-gray-100 dark:bg-gray-800 max-h-36"
          >
            <img 
              :src="image" 
              :alt="title || 'Preview'"
              class="w-full h-full object-cover"
              @error="handleImageError"
            />
          </div>
          <div 
            v-else 
            class="aspect-[2/1] bg-gray-100 dark:bg-gray-800 flex items-center justify-center max-h-36"
          >
            <UIcon name="i-heroicons-photo" class="w-8 h-8 text-gray-300 dark:text-gray-600" />
          </div>
          <div class="p-3">
            <p class="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug">
              {{ truncatedTitle }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
              {{ truncatedDescription }}
            </p>
            <p class="text-xs text-gray-400 mt-1">example.com</p>
          </div>
        </template>
        
        <!-- Summary Card (small image) -->
        <template v-else>
          <div class="flex p-3 gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug">
                {{ truncatedTitle }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                {{ truncatedDescription }}
              </p>
              <p class="text-xs text-gray-400 mt-1">example.com</p>
            </div>
            <div 
              v-if="image && !imageError"
              class="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800"
            >
              <img 
                :src="image" 
                :alt="title || 'Preview'"
                class="w-full h-full object-cover"
                @error="handleImageError"
              />
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
