<script setup lang="ts">
interface Props {
  title?: string
  description?: string
  image?: string
  url?: string
}

const props = defineProps<Props>()

const truncatedTitle = computed(() => {
  if (!props.title) return 'Your Page Title'
  return props.title.length > 70 ? props.title.substring(0, 70) + '...' : props.title
})

const displayUrl = computed(() => {
  if (!props.url) return 'example.com'
  try {
    const url = new URL(props.url)
    return url.hostname.replace('www.', '').toUpperCase()
  } catch {
    return 'EXAMPLE.COM'
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
        <div class="w-5 h-5 rounded-full bg-gradient-to-br from-[#5AC8FA] to-[#007AFF] flex items-center justify-center">
          <svg class="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10h8c1.1 0 2-.9 2-2V12c0-5.52-4.48-10-10-10zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8s8 3.59 8 8v6h-8z"/>
          </svg>
        </div>
        <span class="text-sm font-medium">iMessage</span>
      </div>
      <AppTooltip text="How your link previews in iMessage on iOS and macOS">
        <UIcon
          name="i-heroicons-information-circle"
          class="w-5 h-5 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 cursor-help transition-colors"
        />
      </AppTooltip>
    </div>

    <!-- Preview -->
    <div class="p-4">
      <div class="max-w-xs bg-[#E9E9EB] dark:bg-[#3A3A3C] rounded-2xl overflow-hidden shadow-sm">
        <!-- Image -->
        <div
          v-if="image && !imageError"
          class="aspect-video bg-gray-100 dark:bg-gray-800"
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
          class="aspect-video bg-gray-200 dark:bg-gray-700 flex items-center justify-center"
        >
          <UIcon name="i-heroicons-photo" class="w-8 h-8 text-gray-400 dark:text-gray-500" />
        </div>

        <!-- Content -->
        <div class="p-2 bg-[#E9E9EB] dark:bg-[#3A3A3C]">
          <p class="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-0.5 line-clamp-2">
            {{ truncatedTitle }}
          </p>
          <p class="text-[10px] text-gray-600 dark:text-gray-400 uppercase tracking-wider">
            {{ displayUrl }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
