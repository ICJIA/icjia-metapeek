<script setup lang="ts">
import type { MetaTags } from '~/types/meta'
import { generateDefaultTags } from '~/utils/tagDefaults'

interface Props {
  tags: MetaTags
}

const props = defineProps<Props>()
const toast = useToast()
const copied = ref(false)

const generatedHtml = computed(() => generateDefaultTags(props.tags))

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(generatedHtml.value)
    copied.value = true
    toast.add({
      title: 'Copied to clipboard',
      icon: 'i-heroicons-check-circle',
      color: 'success',
      timeout: 2000
    })
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    toast.add({
      title: 'Failed to copy',
      icon: 'i-heroicons-x-circle',
      color: 'error',
      timeout: 3000
    })
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">Generated HTML</h3>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Copy this snippet into your page's &lt;head&gt; section
        </p>
      </div>
      <UButton 
        :icon="copied ? 'i-heroicons-check' : 'i-heroicons-clipboard-document'"
        :color="copied ? 'success' : 'neutral'"
        variant="soft"
        size="sm"
        @click="copyToClipboard"
      >
        {{ copied ? 'Copied' : 'Copy' }}
      </UButton>
    </div>
    
    <!-- Code Block -->
    <div class="relative rounded-lg overflow-hidden">
      <pre class="p-4 bg-gray-900 dark:bg-black text-gray-100 text-xs leading-relaxed overflow-x-auto font-mono"><code>{{ generatedHtml }}</code></pre>
      
      <!-- Copy button overlay -->
      <button
        @click="copyToClipboard"
        class="absolute top-2 right-2 p-1.5 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
        aria-label="Copy code"
      >
        <UIcon 
          :name="copied ? 'i-heroicons-check' : 'i-heroicons-clipboard'" 
          class="w-4 h-4 text-gray-400"
        />
      </button>
    </div>
    
    <!-- Tip -->
    <p class="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1.5">
      <UIcon name="i-heroicons-light-bulb" class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      <span>Ensure all image URLs are absolute (starting with https://) for best results.</span>
    </p>
  </div>
</template>
