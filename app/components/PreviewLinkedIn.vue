<script setup lang="ts">
interface Props {
  title?: string
  description?: string
  image?: string
}

const props = defineProps<Props>()

const truncatedTitle = computed(() => {
  if (!props.title) return 'Your Page Title'
  return props.title.length > 120 ? props.title.substring(0, 120) + '...' : props.title
})

const truncatedDescription = computed(() => {
  if (!props.description) return 'Your page description'
  return props.description.length > 200 ? props.description.substring(0, 200) + '...' : props.description
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
        <div class="w-5 h-5 rounded bg-[#0A66C2] flex items-center justify-center">
          <span class="text-white text-[10px] font-bold">in</span>
        </div>
        <span class="text-sm font-medium">LinkedIn</span>
      </div>
      <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-gray-400" title="How your page appears when shared on LinkedIn" />
    </div>
    
    <!-- Preview -->
    <div class="p-4">
      <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <!-- Image -->
        <div 
          v-if="image && !imageError"
          class="aspect-[1.91/1] bg-gray-100 dark:bg-gray-800 max-h-40"
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
          class="aspect-[1.91/1] bg-gray-100 dark:bg-gray-800 flex items-center justify-center max-h-40"
        >
          <UIcon name="i-heroicons-photo" class="w-8 h-8 text-gray-300 dark:text-gray-600" />
        </div>
        
        <!-- Content -->
        <div class="p-3 bg-gray-50 dark:bg-gray-800/50">
          <p class="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug mb-1">
            {{ truncatedTitle }}
          </p>
          <p class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-1">
            {{ truncatedDescription }}
          </p>
          <p class="text-[10px] text-gray-500 dark:text-gray-500 uppercase tracking-wider">example.com</p>
        </div>
      </div>
    </div>
  </div>
</template>
