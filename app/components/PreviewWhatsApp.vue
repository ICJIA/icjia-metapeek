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
  return props.title.length > 80 ? props.title.substring(0, 80) + '...' : props.title
})

const truncatedDescription = computed(() => {
  if (!props.description) return 'Your page description'
  return props.description.length > 100 ? props.description.substring(0, 100) + '...' : props.description
})

const displayUrl = computed(() => {
  if (!props.url) return 'example.com'
  try {
    const url = new URL(props.url)
    return url.hostname.replace('www.', '')
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
        <div class="w-5 h-5 rounded bg-[#25D366] flex items-center justify-center">
          <span class="text-white text-xs font-bold">W</span>
        </div>
        <span class="text-sm font-medium">WhatsApp</span>
      </div>
      <AppTooltip text="How your link appears in WhatsApp chats">
        <UIcon
          name="i-heroicons-information-circle"
          class="w-5 h-5 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 cursor-help transition-colors"
        />
      </AppTooltip>
    </div>

    <!-- Preview -->
    <div class="p-4">
      <div class="max-w-sm bg-white dark:bg-[#1F2C34] rounded-lg overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700">
        <!-- Image -->
        <div
          v-if="image && !imageError"
          class="aspect-[1.91/1] bg-gray-100 dark:bg-gray-800"
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
          class="aspect-[1.91/1] bg-gray-100 dark:bg-gray-800 flex items-center justify-center"
        >
          <UIcon name="i-heroicons-photo" class="w-8 h-8 text-gray-300 dark:text-gray-600" />
        </div>

        <!-- Content -->
        <div class="p-3 bg-white dark:bg-[#1F2C34]">
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
            {{ displayUrl }}
          </p>
          <p class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
            {{ truncatedTitle }}
          </p>
          <p class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
            {{ truncatedDescription }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
