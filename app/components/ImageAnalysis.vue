<script setup lang="ts">
import { IMAGE_SPECS } from '~/utils/constants'

interface Props {
  imageUrl?: string
}

const props = defineProps<Props>()

interface ImageInfo {
  width: number
  height: number
  aspectRatio: number
  fileSize?: number
  format?: string
  loading: boolean
  error: string | null
}

const imageInfo = ref<ImageInfo>({
  width: 0,
  height: 0,
  aspectRatio: 0,
  loading: false,
  error: null
})

// Platform requirements for quick reference
const platformRequirements = [
  { 
    name: 'Facebook', 
    recommended: '1200 × 630', 
    min: '200 × 200',
    ratio: '1.91:1'
  },
  { 
    name: 'X (Twitter)', 
    recommended: '1200 × 628', 
    min: '300 × 157',
    ratio: '2:1'
  },
  { 
    name: 'LinkedIn', 
    recommended: '1200 × 627', 
    min: '200 × 200',
    ratio: '1.91:1'
  },
]

// Analyze image when URL changes
watch(() => props.imageUrl, async (url) => {
  if (!url) {
    imageInfo.value = { width: 0, height: 0, aspectRatio: 0, loading: false, error: null }
    return
  }
  
  imageInfo.value.loading = true
  imageInfo.value.error = null
  
  try {
    // Load image to get dimensions
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = url
    })
    
    imageInfo.value.width = img.naturalWidth
    imageInfo.value.height = img.naturalHeight
    imageInfo.value.aspectRatio = img.naturalWidth / img.naturalHeight
    
    // Try to get file size via fetch (may fail due to CORS)
    try {
      const response = await fetch(url, { method: 'HEAD', mode: 'cors' })
      const contentLength = response.headers.get('content-length')
      if (contentLength) {
        imageInfo.value.fileSize = parseInt(contentLength, 10)
      }
      const contentType = response.headers.get('content-type')
      if (contentType) {
        imageInfo.value.format = contentType.split('/')[1]?.toUpperCase()
      }
    } catch {
      // CORS blocked - that's okay, we still have dimensions
    }
    
  } catch (e) {
    imageInfo.value.error = 'Could not analyze image (CORS or invalid URL)'
  } finally {
    imageInfo.value.loading = false
  }
}, { immediate: true })

// Format file size
const formattedSize = computed(() => {
  if (!imageInfo.value.fileSize) return null
  const kb = imageInfo.value.fileSize / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(2)} MB`
})

// Check if image meets requirements
const meetsMinimum = computed(() => {
  if (!imageInfo.value.width) return null
  return imageInfo.value.width >= 200 && imageInfo.value.height >= 200
})

const meetsRecommended = computed(() => {
  if (!imageInfo.value.width) return null
  return imageInfo.value.width >= 1200 && imageInfo.value.height >= 630
})

const aspectRatioStatus = computed(() => {
  if (!imageInfo.value.aspectRatio) return null
  const ratio = imageInfo.value.aspectRatio
  // Ideal is 1.91:1, acceptable range is roughly 1.5:1 to 2.5:1
  if (ratio >= 1.8 && ratio <= 2.0) return 'optimal'
  if (ratio >= 1.5 && ratio <= 2.5) return 'acceptable'
  return 'suboptimal'
})
</script>

<template>
  <div class="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-photo" class="w-5 h-5 text-purple-500" />
        <span class="text-sm font-medium">Image Analysis</span>
      </div>
      <AppTooltip text="og:image dimensions and size compared to platform requirements">
        <UIcon 
          name="i-heroicons-information-circle" 
          class="w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help transition-colors" 
        />
      </AppTooltip>
    </div>
    
    <div class="p-4">
      <!-- No image -->
      <div v-if="!imageUrl" class="text-center py-6 text-gray-500 dark:text-gray-400">
        <UIcon name="i-heroicons-photo" class="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p class="text-sm">No og:image found</p>
      </div>
      
      <!-- Loading -->
      <div v-else-if="imageInfo.loading" class="text-center py-6 text-gray-500 dark:text-gray-400">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 mx-auto mb-2 animate-spin" />
        <p class="text-sm">Analyzing image...</p>
      </div>
      
      <!-- Error -->
      <div v-else-if="imageInfo.error" class="text-center py-6">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8 mx-auto mb-2 text-amber-500" />
        <p class="text-sm text-gray-600 dark:text-gray-400">{{ imageInfo.error }}</p>
        <p class="text-xs text-gray-500 dark:text-gray-500 mt-1">Image URL: {{ imageUrl?.substring(0, 50) }}...</p>
      </div>
      
      <!-- Results -->
      <div v-else class="space-y-4">
        <!-- Image Preview & Dimensions -->
        <div class="flex gap-4">
          <!-- Thumbnail -->
          <div class="w-24 h-24 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
            <img 
              :src="imageUrl" 
              alt="OG Image preview"
              class="w-full h-full object-cover"
            />
          </div>
          
          <!-- Dimensions Info -->
          <div class="flex-1 space-y-2">
            <div class="flex items-center gap-2">
              <span class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ imageInfo.width }} × {{ imageInfo.height }}
              </span>
              <span class="text-sm text-gray-500 dark:text-gray-400">pixels</span>
            </div>
            
            <div class="flex flex-wrap gap-2 text-xs">
              <span v-if="formattedSize" class="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                {{ formattedSize }}
              </span>
              <span v-if="imageInfo.format" class="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                {{ imageInfo.format }}
              </span>
              <span class="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                {{ imageInfo.aspectRatio.toFixed(2) }}:1 ratio
              </span>
            </div>
            
            <!-- Status badges -->
            <div class="flex flex-wrap gap-2">
              <UBadge 
                v-if="meetsRecommended"
                color="success" 
                size="xs" 
                variant="subtle"
              >
                Meets recommended size
              </UBadge>
              <UBadge 
                v-else-if="meetsMinimum"
                color="warning" 
                size="xs" 
                variant="subtle"
              >
                Below recommended (1200×630)
              </UBadge>
              <UBadge 
                v-else-if="meetsMinimum === false"
                color="error" 
                size="xs" 
                variant="subtle"
              >
                Below minimum (200×200)
              </UBadge>
              
              <UBadge 
                v-if="aspectRatioStatus === 'optimal'"
                color="success" 
                size="xs" 
                variant="subtle"
              >
                Optimal aspect ratio
              </UBadge>
              <UBadge 
                v-else-if="aspectRatioStatus === 'suboptimal'"
                color="warning" 
                size="xs" 
                variant="subtle"
              >
                May be cropped
              </UBadge>
            </div>
          </div>
        </div>
        
        <!-- Platform Requirements Reference -->
        <div class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Platform Requirements
          </p>
          <div class="grid grid-cols-3 gap-2 text-xs">
            <div 
              v-for="platform in platformRequirements" 
              :key="platform.name"
              class="p-2 rounded bg-gray-50 dark:bg-gray-800/50"
            >
              <p class="font-medium text-gray-700 dark:text-gray-300 mb-1">{{ platform.name }}</p>
              <p class="text-gray-500 dark:text-gray-400">{{ platform.recommended }}</p>
              <p class="text-gray-400 dark:text-gray-500 text-[10px]">min: {{ platform.min }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
