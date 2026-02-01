<script setup lang="ts">
import type { MetaTags } from '~/types/meta'
import { generateDefaultTags } from '~/utils/tagDefaults'

interface Props {
  tags: MetaTags
}

const props = defineProps<Props>()
const toast = useToast()

// Generate HTML snippet
const generatedHtml = computed(() => {
  return generateDefaultTags(props.tags)
})

// Copy to clipboard
const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(generatedHtml.value)
    toast.add({
      title: 'Copied to clipboard',
      description: 'HTML snippet copied successfully',
      icon: 'i-heroicons-check-circle',
      color: 'green',
      timeout: 2000
    })
  } catch (error) {
    toast.add({
      title: 'Copy failed',
      description: 'Unable to copy to clipboard',
      icon: 'i-heroicons-x-circle',
      color: 'red',
      timeout: 3000
    })
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold flex items-center gap-2">
          <UIcon name="i-heroicons-code-bracket" class="text-2xl" aria-hidden="true" />
          Generated HTML
        </h2>
        <UButton 
          icon="i-heroicons-clipboard-document"
          @click="copyToClipboard"
          aria-label="Copy HTML to clipboard"
        >
          Copy
        </UButton>
      </div>
    </template>
    
    <div class="space-y-3">
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Copy this snippet into your page's <code class="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">&lt;head&gt;</code> section.
        All values are pre-filled based on your current tags, with sensible defaults for anything missing.
      </p>
      
      <!-- Code block with syntax highlighting -->
      <div class="relative">
        <pre 
          class="p-4 bg-gray-900 dark:bg-black text-gray-100 rounded-lg overflow-x-auto text-sm font-mono"
          role="region"
          aria-label="Generated HTML code"
          tabindex="0"
        ><code>{{ generatedHtml }}</code></pre>
        
        <!-- Copy button overlay (for convenience) -->
        <UButton
          icon="i-heroicons-clipboard"
          size="xs"
          color="white"
          class="absolute top-2 right-2"
          @click="copyToClipboard"
          aria-label="Copy code"
        />
      </div>
    </div>
    
    <template #footer>
      <div class="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
        <UIcon name="i-heroicons-information-circle" class="flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          This HTML is ready to use. You can edit the values inline in your code editor before pasting.
          For best results, ensure all image URLs are absolute (starting with https://).
        </p>
      </div>
    </template>
  </UCard>
</template>
