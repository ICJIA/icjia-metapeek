<script setup lang="ts">
import type { MetaTags } from '~/types/meta'

interface Props {
  tags: MetaTags
}

const props = defineProps<Props>()
const toast = useToast()
const copied = ref(false)
const isEditing = ref(false)

// Editable values - initialized from props.tags
const editableValues = reactive({
  title: '',
  description: '',
  canonical: '',
  favicon: '',
  ogType: '',
  ogUrl: '',
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
  ogImageAlt: '',
  ogSiteName: '',
  twitterCard: '',
  twitterSite: '',
  twitterCreator: '',
  twitterTitle: '',
  twitterDescription: '',
  twitterImage: '',
  twitterImageAlt: '',
})

// Initialize editable values from tags
const initializeValues = () => {
  const tags = props.tags
  editableValues.title = tags.og.title || tags.title || ''
  editableValues.description = tags.og.description || tags.description || ''
  editableValues.canonical = tags.canonical || ''
  editableValues.favicon = tags.favicon || ''
  editableValues.ogType = tags.og.type || 'website'
  editableValues.ogUrl = tags.og.url || ''
  editableValues.ogTitle = tags.og.title || tags.title || ''
  editableValues.ogDescription = tags.og.description || tags.description || ''
  editableValues.ogImage = tags.og.image || ''
  editableValues.ogImageAlt = tags.og.imageAlt || ''
  editableValues.ogSiteName = tags.og.siteName || ''
  editableValues.twitterCard = tags.twitter.card || 'summary_large_image'
  editableValues.twitterSite = tags.twitter.site || ''
  editableValues.twitterCreator = tags.twitter.creator || ''
  editableValues.twitterTitle = tags.twitter.title || tags.og.title || tags.title || ''
  editableValues.twitterDescription = tags.twitter.description || tags.og.description || tags.description || ''
  editableValues.twitterImage = tags.twitter.image || tags.og.image || ''
  editableValues.twitterImageAlt = tags.twitter.imageAlt || tags.og.imageAlt || ''
}

// Watch for tag changes and reinitialize
watch(() => props.tags, () => {
  initializeValues()
}, { immediate: true, deep: true })

// Generate HTML from editable values
const generatedHtml = computed(() => {
  const lines: string[] = []
  
  // Title
  if (editableValues.title) {
    lines.push(`<title>${escapeHtml(editableValues.title)}</title>`)
  }
  
  // Description
  if (editableValues.description) {
    lines.push(`<meta name="description" content="${escapeHtml(editableValues.description)}">`)
  }
  
  // Viewport (always include)
  lines.push(`<meta name="viewport" content="width=device-width, initial-scale=1">`)
  
  // Canonical
  if (editableValues.canonical) {
    lines.push(`<link rel="canonical" href="${escapeHtml(editableValues.canonical)}">`)
  }
  
  // Favicon
  if (editableValues.favicon) {
    lines.push(`<link rel="icon" href="${escapeHtml(editableValues.favicon)}">`)
  }
  
  // Open Graph tags
  lines.push('')
  lines.push('<!-- Open Graph / Facebook -->')
  lines.push(`<meta property="og:type" content="${escapeHtml(editableValues.ogType || 'website')}">`)
  
  if (editableValues.ogUrl) {
    lines.push(`<meta property="og:url" content="${escapeHtml(editableValues.ogUrl)}">`)
  }
  
  if (editableValues.ogTitle) {
    lines.push(`<meta property="og:title" content="${escapeHtml(editableValues.ogTitle)}">`)
  }
  
  if (editableValues.ogDescription) {
    lines.push(`<meta property="og:description" content="${escapeHtml(editableValues.ogDescription)}">`)
  }
  
  if (editableValues.ogImage) {
    lines.push(`<meta property="og:image" content="${escapeHtml(editableValues.ogImage)}">`)
    if (editableValues.ogImageAlt) {
      lines.push(`<meta property="og:image:alt" content="${escapeHtml(editableValues.ogImageAlt)}">`)
    }
  }
  
  if (editableValues.ogSiteName) {
    lines.push(`<meta property="og:site_name" content="${escapeHtml(editableValues.ogSiteName)}">`)
  }
  
  // Twitter Card tags
  lines.push('')
  lines.push('<!-- Twitter -->')
  lines.push(`<meta name="twitter:card" content="${escapeHtml(editableValues.twitterCard || 'summary_large_image')}">`)
  
  if (editableValues.twitterSite) {
    lines.push(`<meta name="twitter:site" content="${escapeHtml(editableValues.twitterSite)}">`)
  }
  
  if (editableValues.twitterCreator) {
    lines.push(`<meta name="twitter:creator" content="${escapeHtml(editableValues.twitterCreator)}">`)
  }
  
  if (editableValues.twitterTitle) {
    lines.push(`<meta name="twitter:title" content="${escapeHtml(editableValues.twitterTitle)}">`)
  }
  
  if (editableValues.twitterDescription) {
    lines.push(`<meta name="twitter:description" content="${escapeHtml(editableValues.twitterDescription)}">`)
  }
  
  if (editableValues.twitterImage) {
    lines.push(`<meta name="twitter:image" content="${escapeHtml(editableValues.twitterImage)}">`)
    if (editableValues.twitterImageAlt) {
      lines.push(`<meta name="twitter:image:alt" content="${escapeHtml(editableValues.twitterImageAlt)}">`)
    }
  }
  
  return lines.join('\n')
})

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, (char) => map[char] || char)
}

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

const toggleEdit = () => {
  isEditing.value = !isEditing.value
}

const resetToOriginal = () => {
  initializeValues()
  toast.add({
    title: 'Reset to original values',
    icon: 'i-heroicons-arrow-path',
    color: 'neutral',
    timeout: 2000
  })
}

// Field definitions for the form
const basicFields = [
  { key: 'title', label: 'Title', placeholder: 'Page title' },
  { key: 'description', label: 'Description', placeholder: 'Page description', multiline: true },
  { key: 'canonical', label: 'Canonical URL', placeholder: 'https://example.com/page' },
  { key: 'favicon', label: 'Favicon', placeholder: '/favicon.ico' },
]

const ogFields = [
  { key: 'ogTitle', label: 'og:title', placeholder: 'Open Graph title' },
  { key: 'ogDescription', label: 'og:description', placeholder: 'Open Graph description', multiline: true },
  { key: 'ogUrl', label: 'og:url', placeholder: 'https://example.com/page' },
  { key: 'ogImage', label: 'og:image', placeholder: 'https://example.com/image.jpg' },
  { key: 'ogImageAlt', label: 'og:image:alt', placeholder: 'Image description' },
  { key: 'ogType', label: 'og:type', placeholder: 'website' },
  { key: 'ogSiteName', label: 'og:site_name', placeholder: 'Site Name' },
]

const twitterFields = [
  { key: 'twitterCard', label: 'twitter:card', placeholder: 'summary_large_image' },
  { key: 'twitterSite', label: 'twitter:site', placeholder: '@username' },
  { key: 'twitterCreator', label: 'twitter:creator', placeholder: '@author' },
  { key: 'twitterTitle', label: 'twitter:title', placeholder: 'Twitter title' },
  { key: 'twitterDescription', label: 'twitter:description', placeholder: 'Twitter description', multiline: true },
  { key: 'twitterImage', label: 'twitter:image', placeholder: 'https://example.com/twitter.jpg' },
  { key: 'twitterImageAlt', label: 'twitter:image:alt', placeholder: 'Image description' },
]
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">Generated HTML</h3>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {{ isEditing ? 'Edit values below, then copy the generated code' : 'Copy this snippet into your page\'s <head> section' }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton 
          v-if="isEditing"
          icon="i-heroicons-arrow-path"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Reset to original values"
          @click="resetToOriginal"
        >
          Reset
        </UButton>
        <UButton 
          :icon="isEditing ? 'i-heroicons-eye' : 'i-heroicons-pencil-square'"
          color="neutral"
          variant="soft"
          size="sm"
          @click="toggleEdit"
        >
          {{ isEditing ? 'Preview' : 'Edit' }}
        </UButton>
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
    </div>
    
    <!-- Edit Mode -->
    <div v-if="isEditing" class="space-y-6">
      <!-- Basic Meta Tags -->
      <div class="space-y-3">
        <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Basic Tags</h4>
        <div class="grid grid-cols-1 gap-3">
          <div v-for="field in basicFields" :key="field.key" class="space-y-1">
            <label :for="`edit-${field.key}`" class="text-xs font-medium text-gray-700 dark:text-gray-300">
              {{ field.label }}
            </label>
            <textarea
              v-if="field.multiline"
              :id="`edit-${field.key}`"
              v-model="editableValues[field.key as keyof typeof editableValues]"
              :placeholder="field.placeholder"
              rows="2"
              class="w-full px-3 py-2 text-sm rounded-md border-0 bg-white dark:bg-gray-900 
                     ring-1 ring-gray-300 dark:ring-gray-700 
                     focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                     placeholder:text-gray-400 dark:placeholder:text-gray-600"
            />
            <input
              v-else
              :id="`edit-${field.key}`"
              v-model="editableValues[field.key as keyof typeof editableValues]"
              type="text"
              :placeholder="field.placeholder"
              class="w-full px-3 py-2 text-sm rounded-md border-0 bg-white dark:bg-gray-900 
                     ring-1 ring-gray-300 dark:ring-gray-700 
                     focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                     placeholder:text-gray-400 dark:placeholder:text-gray-600"
            >
          </div>
        </div>
      </div>
      
      <!-- Open Graph Tags -->
      <div class="space-y-3">
        <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Open Graph</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div v-for="field in ogFields" :key="field.key" class="space-y-1" :class="{ 'sm:col-span-2': field.multiline }">
            <label :for="`edit-${field.key}`" class="text-xs font-medium text-gray-700 dark:text-gray-300">
              {{ field.label }}
            </label>
            <textarea
              v-if="field.multiline"
              :id="`edit-${field.key}`"
              v-model="editableValues[field.key as keyof typeof editableValues]"
              :placeholder="field.placeholder"
              rows="2"
              class="w-full px-3 py-2 text-sm rounded-md border-0 bg-white dark:bg-gray-900 
                     ring-1 ring-gray-300 dark:ring-gray-700 
                     focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                     placeholder:text-gray-400 dark:placeholder:text-gray-600"
            />
            <input
              v-else
              :id="`edit-${field.key}`"
              v-model="editableValues[field.key as keyof typeof editableValues]"
              type="text"
              :placeholder="field.placeholder"
              class="w-full px-3 py-2 text-sm rounded-md border-0 bg-white dark:bg-gray-900 
                     ring-1 ring-gray-300 dark:ring-gray-700 
                     focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                     placeholder:text-gray-400 dark:placeholder:text-gray-600"
            >
          </div>
        </div>
      </div>
      
      <!-- Twitter Card Tags -->
      <div class="space-y-3">
        <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Twitter Card</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div v-for="field in twitterFields" :key="field.key" class="space-y-1" :class="{ 'sm:col-span-2': field.multiline }">
            <label :for="`edit-${field.key}`" class="text-xs font-medium text-gray-700 dark:text-gray-300">
              {{ field.label }}
            </label>
            <textarea
              v-if="field.multiline"
              :id="`edit-${field.key}`"
              v-model="editableValues[field.key as keyof typeof editableValues]"
              :placeholder="field.placeholder"
              rows="2"
              class="w-full px-3 py-2 text-sm rounded-md border-0 bg-white dark:bg-gray-900 
                     ring-1 ring-gray-300 dark:ring-gray-700 
                     focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                     placeholder:text-gray-400 dark:placeholder:text-gray-600"
            />
            <input
              v-else
              :id="`edit-${field.key}`"
              v-model="editableValues[field.key as keyof typeof editableValues]"
              type="text"
              :placeholder="field.placeholder"
              class="w-full px-3 py-2 text-sm rounded-md border-0 bg-white dark:bg-gray-900 
                     ring-1 ring-gray-300 dark:ring-gray-700 
                     focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                     placeholder:text-gray-400 dark:placeholder:text-gray-600"
            >
          </div>
        </div>
      </div>
    </div>
    
    <!-- Code Block (always visible) -->
    <div class="relative rounded-lg overflow-hidden">
      <pre tabindex="0" class="p-4 bg-gray-900 dark:bg-black text-gray-100 text-xs leading-relaxed overflow-x-auto font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"><code>{{ generatedHtml }}</code></pre>
      
      <!-- Copy button overlay -->
      <button
        class="absolute top-2 right-2 p-1.5 rounded bg-gray-800 hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Copy code"
        @click="copyToClipboard"
      >
        <UIcon 
          :name="copied ? 'i-heroicons-check' : 'i-heroicons-clipboard'" 
          class="w-4 h-4 text-gray-400"
        />
      </button>
    </div>
    
    <!-- Tip -->
    <p class="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1.5">
      <UIcon name="i-heroicons-light-bulb" class="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{{ isEditing ? 'Edit the fields above to customize your meta tags. Changes update the code in real-time.' : 'Click "Edit" to customize values before copying. Ensure all image URLs are absolute (starting with https://).' }}</span>
    </p>
  </div>
</template>
