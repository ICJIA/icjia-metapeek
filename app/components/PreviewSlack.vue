<script setup lang="ts">
interface Props {
  title?: string
  description?: string
  image?: string
  favicon?: string
  url?: string
}

const props = defineProps<Props>()

const truncatedTitle = computed(() => {
  if (!props.title) return 'Your Page Title'
  return props.title.length > 90 ? props.title.substring(0, 90) + '...' : props.title
})

const truncatedDescription = computed(() => {
  if (!props.description) return 'Your page description'
  return props.description.length > 150 ? props.description.substring(0, 150) + '...' : props.description
})

const displayDomain = computed(() => {
  if (!props.url) return 'example.com'
  try {
    return new URL(props.url).hostname
  } catch {
    return 'example.com'
  }
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
        <div class="w-5 h-5 rounded bg-[#4A154B] flex items-center justify-center">
          <span class="text-white text-xs font-bold">#</span>
        </div>
        <span class="text-sm font-medium">Slack</span>
      </div>
      <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-gray-400" title="How your link unfurls in Slack messages" />
    </div>
    
    <!-- Preview -->
    <div class="p-4">
      <div class="flex">
        <!-- Slack's signature left border -->
        <div class="w-1 bg-gray-300 dark:bg-gray-600 rounded-full flex-shrink-0" />
        
        <div class="pl-3 flex-1 min-w-0">
          <!-- Domain -->
          <div class="flex items-center gap-1.5 mb-1">
            <img 
              v-if="favicon"
              :src="favicon" 
              alt=""
              class="w-4 h-4 rounded-sm"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
            />
            <span class="text-sm font-bold text-gray-900 dark:text-gray-100">
              {{ displayDomain }}
            </span>
          </div>
          
          <!-- Title -->
          <p class="text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer mb-0.5">
            {{ truncatedTitle }}
          </p>
          
          <!-- Description -->
          <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {{ truncatedDescription }}
          </p>
          
          <!-- Image (inline, compact) -->
          <div 
            v-if="image && !imageError"
            class="mt-2 max-w-[200px] rounded overflow-hidden border border-gray-200 dark:border-gray-700"
          >
            <img 
              :src="image" 
              :alt="title || 'Preview'"
              class="max-h-24 w-auto object-contain"
              @error="handleImageError"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
