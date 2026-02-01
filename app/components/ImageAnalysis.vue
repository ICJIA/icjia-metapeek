<script setup lang="ts">
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

// Platform requirements with min dimensions
const platforms = [
  { 
    name: 'Facebook', 
    icon: 'f',
    iconBg: 'bg-blue-600',
    minWidth: 200, 
    minHeight: 200,
    recWidth: 1200,
    recHeight: 630,
    description: 'Feed & link shares'
  },
  { 
    name: 'LinkedIn', 
    icon: 'in',
    iconBg: 'bg-blue-700',
    minWidth: 200, 
    minHeight: 200,
    recWidth: 1200,
    recHeight: 627,
    description: 'Post shares'
  },
  { 
    name: 'X (Twitter)', 
    icon: '𝕏',
    iconBg: 'bg-black dark:bg-white dark:text-black',
    minWidth: 300, 
    minHeight: 157,
    recWidth: 1200,
    recHeight: 628,
    description: 'Summary large image'
  },
  { 
    name: 'Slack', 
    icon: '#',
    iconBg: 'bg-purple-600',
    minWidth: 200, 
    minHeight: 200,
    recWidth: 800,
    recHeight: 418,
    description: 'Link unfurls'
  },
  { 
    name: 'Google', 
    icon: 'G',
    iconBg: 'bg-red-500',
    minWidth: 200, 
    minHeight: 200,
    recWidth: 1200,
    recHeight: 630,
    description: 'Discover & News'
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
    
  } catch {
    imageInfo.value.error = 'Could not load image'
  } finally {
    imageInfo.value.loading = false
  }
}, { immediate: true })

// Format file size
const formattedSize = computed(() => {
  if (!imageInfo.value.fileSize) return null
  const kb = imageInfo.value.fileSize / 1024
  if (kb < 1024) return `${kb.toFixed(0)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
})

// Check platform compatibility
const getPlatformStatus = (platform: typeof platforms[0]) => {
  if (!imageInfo.value.width) return 'unknown'
  
  const { width, height } = imageInfo.value
  const meetsMin = width >= platform.minWidth && height >= platform.minHeight
  const meetsRec = width >= platform.recWidth && height >= platform.recHeight
  
  if (meetsRec) return 'optimal'
  if (meetsMin) return 'acceptable'
  return 'fail'
}

// Overall status
const overallStatus = computed(() => {
  if (!imageInfo.value.width) return null
  const statuses = platforms.map(p => getPlatformStatus(p))
  if (statuses.every(s => s === 'optimal')) return 'optimal'
  if (statuses.every(s => s !== 'fail')) return 'acceptable'
  return 'issues'
})
</script>

<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between mb-5">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
          <UIcon name="i-heroicons-photo" class="w-4 h-4 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h3 class="font-semibold text-gray-900 dark:text-white">Step 2: Check Image Compatibility</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">Will your og:image display correctly on each platform?</p>
        </div>
      </div>
      <div v-if="overallStatus === 'optimal'" class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
        <UIcon name="i-heroicons-check-circle-solid" class="w-5 h-5" />
        <span class="text-sm font-medium">All platforms</span>
      </div>
      <div v-else-if="overallStatus === 'acceptable'" class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
        <UIcon name="i-heroicons-exclamation-circle-solid" class="w-5 h-5" />
        <span class="text-sm font-medium">Could be larger</span>
      </div>
      <div v-else-if="overallStatus === 'issues'" class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300">
        <UIcon name="i-heroicons-x-circle-solid" class="w-5 h-5" />
        <span class="text-sm font-medium">Issues found</span>
      </div>
    </div>
    
    <!-- Content -->
    <div class="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5">
      <!-- No image -->
      <div v-if="!imageUrl" class="text-center py-8 text-gray-500 dark:text-gray-400">
        <UIcon name="i-heroicons-photo" class="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p class="font-medium">No og:image found</p>
        <p class="text-sm mt-1">Add an og:image tag to enable social media previews</p>
      </div>
      
      <!-- Loading -->
      <div v-else-if="imageInfo.loading" class="text-center py-8 text-gray-500 dark:text-gray-400">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 mx-auto mb-2 animate-spin" />
        <p class="text-sm">Analyzing image...</p>
      </div>
      
      <!-- Error -->
      <div v-else-if="imageInfo.error" class="text-center py-8">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-10 h-10 mx-auto mb-2 text-amber-500" />
        <p class="font-medium text-gray-700 dark:text-gray-300">{{ imageInfo.error }}</p>
        <p class="text-xs text-gray-500 dark:text-gray-500 mt-2 font-mono">{{ imageUrl?.substring(0, 60) }}...</p>
      </div>
      
      <!-- Results -->
      <div v-else class="space-y-5">
        <!-- Image Info Row -->
        <div class="flex items-start gap-4">
          <!-- Thumbnail -->
          <div class="w-28 h-28 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 shrink-0 ring-1 ring-gray-200 dark:ring-gray-700">
            <img 
              :src="imageUrl" 
              alt="OG Image preview"
              class="w-full h-full object-cover"
            />
          </div>
          
          <!-- Dimensions -->
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2 mb-2">
              <span class="text-3xl font-bold text-gray-900 dark:text-white">
                {{ imageInfo.width.toLocaleString() }} × {{ imageInfo.height.toLocaleString() }}
              </span>
              <span class="text-sm text-gray-500 dark:text-gray-400">px</span>
            </div>
            
            <div class="flex flex-wrap gap-2 text-sm">
              <span v-if="formattedSize" class="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-600 dark:text-gray-400">
                {{ formattedSize }}
              </span>
              <span v-if="imageInfo.format" class="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-600 dark:text-gray-400">
                {{ imageInfo.format }}
              </span>
              <span class="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-600 dark:text-gray-400">
                {{ imageInfo.aspectRatio.toFixed(2) }}:1
              </span>
            </div>
            
            <p class="text-xs text-gray-500 dark:text-gray-500 mt-2">
              Recommended: 1200 × 630 px or larger (1.91:1 aspect ratio)
            </p>
          </div>
        </div>
        
        <!-- Platform Compatibility Grid -->
        <div class="border-t border-gray-100 dark:border-gray-800 pt-5">
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Platform Compatibility
          </p>
          
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div 
              v-for="platform in platforms" 
              :key="platform.name"
              :class="[
                'p-3 rounded-lg border transition-colors',
                getPlatformStatus(platform) === 'optimal' 
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' 
                  : getPlatformStatus(platform) === 'acceptable'
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              ]"
            >
              <div class="flex items-center gap-2 mb-2">
                <!-- Platform icon -->
                <div :class="['w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold', platform.iconBg]">
                  {{ platform.icon }}
                </div>
                <span class="font-medium text-sm text-gray-900 dark:text-white">{{ platform.name }}</span>
                
                <!-- Status icon -->
                <UIcon 
                  v-if="getPlatformStatus(platform) === 'optimal'"
                  name="i-heroicons-check-circle-solid" 
                  class="w-5 h-5 text-emerald-500 ml-auto"
                />
                <UIcon 
                  v-else-if="getPlatformStatus(platform) === 'acceptable'"
                  name="i-heroicons-exclamation-circle-solid" 
                  class="w-5 h-5 text-amber-500 ml-auto"
                />
                <UIcon 
                  v-else
                  name="i-heroicons-x-circle-solid" 
                  class="w-5 h-5 text-red-500 ml-auto"
                />
              </div>
              
              <p 
                :class="[
                  'text-xs',
                  getPlatformStatus(platform) === 'optimal' 
                    ? 'text-emerald-700 dark:text-emerald-300' 
                    : getPlatformStatus(platform) === 'acceptable'
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-red-700 dark:text-red-300'
                ]"
              >
                <template v-if="getPlatformStatus(platform) === 'optimal'">
                  Meets recommended size
                </template>
                <template v-else-if="getPlatformStatus(platform) === 'acceptable'">
                  Works, but could be sharper
                </template>
                <template v-else>
                  Below {{ platform.minWidth }}×{{ platform.minHeight }} minimum
                </template>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
