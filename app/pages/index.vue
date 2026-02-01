<script setup lang="ts">
import type { MetaTags, Diagnostics } from '~/types/meta'

const colorMode = useColorMode()
const { parseMetaTags } = useMetaParser()
const { generateDiagnostics } = useDiagnostics()

const inputHtml = ref('')
const parsedTags = ref<MetaTags | null>(null)
const diagnostics = ref<Diagnostics | null>(null)
const hasAnalyzed = ref(false)
const activeTab = ref('previews')

const analyze = () => {
  if (!inputHtml.value.trim()) {
    parsedTags.value = null
    diagnostics.value = null
    hasAnalyzed.value = false
    return
  }
  
  parsedTags.value = parseMetaTags(inputHtml.value)
  diagnostics.value = generateDiagnostics(parsedTags.value)
  hasAnalyzed.value = true
}

// Auto-analyze with fast debounce for snappy feel
const debouncedAnalyze = useDebounceFn(analyze, 300)
watch(inputHtml, () => {
  if (inputHtml.value.trim()) {
    debouncedAnalyze()
  } else {
    parsedTags.value = null
    diagnostics.value = null
    hasAnalyzed.value = false
  }
})

// Sample HTML
const sampleHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitHub · Build and ship software on a single, collaborative platform</title>
  <meta name="description" content="Join the world's most widely adopted AI-powered developer platform where millions of developers, businesses, and the largest open source community build software that advances humanity.">
  
  <!-- Open Graph -->
  <meta property="og:site_name" content="GitHub">
  <meta property="og:type" content="website">
  <meta property="og:title" content="GitHub · Build and ship software on a single, collaborative platform">
  <meta property="og:url" content="https://github.com/">
  <meta property="og:description" content="Join the world's most widely adopted AI-powered developer platform where millions of developers, businesses, and the largest open source community build software.">
  <meta property="og:image" content="https://github.githubassets.com/assets/github-logo-55c5b9a1fe52.png">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@github">
  <meta name="twitter:title" content="GitHub">
  <meta name="twitter:description" content="Build and ship software on a single, collaborative platform.">
  <meta name="twitter:image" content="https://github.githubassets.com/assets/github-logo-55c5b9a1fe52.png">
  
  <link rel="canonical" href="https://github.com/">
  <link rel="icon" href="https://github.githubassets.com/favicons/favicon.svg">
</head>
<body>
  <h1>Welcome to GitHub</h1>
</body>
</html>`

const loadSample = () => {
  inputHtml.value = sampleHtml
}

const clearInput = () => {
  inputHtml.value = ''
}

// Tab items for results
const tabs = [
  { label: 'Previews', value: 'previews', icon: 'i-heroicons-eye' },
  { label: 'Diagnostics', value: 'diagnostics', icon: 'i-heroicons-clipboard-document-check' },
  { label: 'Code', value: 'code', icon: 'i-heroicons-code-bracket' }
]
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
    <!-- Skip link for keyboard users -->
    <a href="#main-content" class="skip-link">Skip to main content</a>
    
    <!-- Header -->
    <header class="sticky top-0 z-50 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800">
      <div class="max-w-6xl mx-auto px-4 sm:px-6">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center gap-3">
            <img 
              src="~/assets/images/icjia-logo.png" 
              alt="ICJIA Logo" 
              class="h-8 w-auto"
            />
            <span class="text-xl font-bold tracking-tight">MetaPeek</span>
            <span class="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded">Beta</span>
          </div>
          <div class="flex items-center gap-1">
            <ClientOnly>
              <button
                @click="colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'"
                class="p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[44px] min-h-[44px] flex items-center justify-center"
                :aria-label="colorMode.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
              >
                <UIcon 
                  :name="colorMode.value === 'dark' ? 'i-heroicons-sun' : 'i-heroicons-moon'" 
                  class="w-5 h-5 text-gray-600 dark:text-gray-400"
                  aria-hidden="true"
                />
              </button>
              <template #fallback><div class="w-9 h-9" aria-hidden="true" /></template>
            </ClientOnly>
            <a
              href="https://github.com/ICJIA/icjia-metapeek"
              target="_blank"
              rel="noopener"
              class="p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="View on GitHub"
            >
              <UIcon name="i-simple-icons-github" class="w-5 h-5 text-gray-600 dark:text-gray-400" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </header>

    <main id="main-content" class="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <!-- Hero Section - Minimal -->
      <div class="mb-8">
        <p class="text-sm text-gray-600 dark:text-gray-300 uppercase tracking-wider font-medium mb-2">
          Meta Tag Inspector
        </p>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
          Analyze your Open Graph markup
        </h1>
        <p class="text-gray-700 dark:text-gray-300 max-w-2xl">
          Paste HTML to preview how your page appears on Google, Facebook, Twitter, and Slack.
        </p>
      </div>

    <!-- Input Section - Full Width, Modern -->
    <div class="mb-8">
      <div class="flex items-center justify-between mb-3">
        <label for="html-input" class="text-sm font-medium text-gray-700 dark:text-gray-300">
          HTML Source
        </label>
        <div class="flex items-center gap-2">
          <UButton
            v-if="inputHtml.trim()"
            size="sm"
            variant="ghost"
            color="neutral"
            icon="i-heroicons-x-mark"
            @click="clearInput"
          >
            Clear
          </UButton>
          <UButton
            size="sm"
            variant="soft"
            color="neutral"
            icon="i-heroicons-document-duplicate"
            @click="loadSample"
          >
            Load Example
          </UButton>
        </div>
      </div>
      
      <div class="relative">
        <textarea
          id="html-input"
          v-model="inputHtml"
          rows="10"
          placeholder="Paste your HTML here..."
          class="w-full px-4 py-3 rounded-lg border-0 bg-white dark:bg-gray-900 
                 ring-1 ring-gray-300 dark:ring-gray-700 
                 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                 font-mono text-sm leading-relaxed
                 placeholder:text-gray-400 dark:placeholder:text-gray-600
                 resize-none transition-shadow duration-150"
          spellcheck="false"
        />
        
        <!-- Status indicator -->
        <div class="absolute bottom-3 right-3 flex items-center gap-3 text-xs">
          <span class="text-gray-500 dark:text-gray-400 tabular-nums">
            {{ inputHtml.length.toLocaleString() }} chars
          </span>
          <span 
            v-if="hasAnalyzed" 
            class="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Analyzed
          </span>
        </div>
      </div>
    </div>

    <!-- Results Section -->
    <div v-if="parsedTags && diagnostics" class="space-y-6">
      <!-- Tab Navigation -->
      <div class="border-b border-gray-200 dark:border-gray-800">
        <nav class="flex gap-6" aria-label="Results tabs">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            @click="activeTab = tab.value"
            :class="[
              'flex items-center gap-2 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.value 
                ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white' 
                : 'border-transparent text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
            ]"
          >
            <UIcon :name="tab.icon" class="w-4 h-4" />
            {{ tab.label }}
            <UBadge 
              v-if="tab.value === 'diagnostics'" 
              :color="diagnostics.overall.status === 'green' ? 'success' : diagnostics.overall.status === 'yellow' ? 'warning' : 'error'"
              size="xs"
              variant="subtle"
            >
              {{ diagnostics.overall.status === 'green' ? '✓' : diagnostics.overall.status === 'yellow' ? '!' : '✕' }}
            </UBadge>
          </button>
        </nav>
      </div>

      <!-- Tab Panels -->
      <div class="min-h-[400px]">
        <!-- Previews Tab -->
        <div v-show="activeTab === 'previews'" class="space-y-6">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PreviewGoogle 
              :title="parsedTags.og.title || parsedTags.title"
              :description="parsedTags.og.description || parsedTags.description"
              :url="parsedTags.og.url || parsedTags.canonical"
            />
            <PreviewFacebook
              :title="parsedTags.og.title"
              :description="parsedTags.og.description"
              :image="parsedTags.og.image"
            />
            <PreviewTwitter
              :card="parsedTags.twitter.card"
              :title="parsedTags.twitter.title || parsedTags.og.title"
              :description="parsedTags.twitter.description || parsedTags.og.description"
              :image="parsedTags.twitter.image || parsedTags.og.image"
            />
            <PreviewSlack
              :title="parsedTags.og.title || parsedTags.title"
              :description="parsedTags.og.description || parsedTags.description"
              :image="parsedTags.og.image"
              :favicon="parsedTags.favicon"
              :url="parsedTags.og.url || parsedTags.canonical"
            />
          </div>
        </div>

        <!-- Diagnostics Tab -->
        <div v-show="activeTab === 'diagnostics'">
          <DiagnosticsPanel :diagnostics="diagnostics" />
        </div>

        <!-- Code Tab -->
        <div v-show="activeTab === 'code'">
          <CodeGenerator :tags="parsedTags" />
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <UIcon name="i-heroicons-code-bracket" class="w-8 h-8 text-gray-400" />
      </div>
      <h2 class="text-lg font-semibold mb-1">No HTML to analyze</h2>
      <p class="text-gray-600 dark:text-gray-300 mb-4 max-w-sm">
        Paste your page's HTML above or try an example to see how your meta tags render across platforms.
      </p>
      <UButton 
        @click="loadSample" 
        variant="soft"
        color="neutral"
        icon="i-heroicons-sparkles"
        size="md"
      >
        Load Example
      </UButton>
    </div>

    <!-- Footer -->
    <footer class="mt-16 pt-6 border-t border-gray-200 dark:border-gray-800">
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500 dark:text-gray-400">
        <p>
          Built by <a href="https://icjia.illinois.gov" class="underline hover:text-gray-900 dark:hover:text-gray-100 transition-colors inline-block py-2">ICJIA</a>
        </p>
        <p class="flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          No tracking · No ads · No account
        </p>
      </div>
    </footer>
  </main>
  </div>
</template>
