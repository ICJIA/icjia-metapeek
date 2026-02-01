<script setup lang="ts">
import type { MetaTags, Diagnostics } from '~/types/meta'

const { parseMetaTags } = useMetaParser()
const { generateDiagnostics } = useDiagnostics()

const inputHtml = ref('')
const parsedTags = ref<MetaTags | null>(null)
const diagnostics = ref<Diagnostics | null>(null)
const hasAnalyzed = ref(false)

const analyze = () => {
  if (!inputHtml.value.trim()) {
    parsedTags.value = null
    diagnostics.value = null
    hasAnalyzed.value = false
    return
  }
  
  // Parse HTML
  parsedTags.value = parseMetaTags(inputHtml.value)
  
  // Generate diagnostics
  diagnostics.value = generateDiagnostics(parsedTags.value)
  
  hasAnalyzed.value = true
}

// Auto-analyze when input changes (with debounce)
const debouncedAnalyze = useDebounceFn(analyze, 500)
watch(inputHtml, () => {
  if (inputHtml.value.trim()) {
    debouncedAnalyze()
  } else {
    parsedTags.value = null
    diagnostics.value = null
    hasAnalyzed.value = false
  }
})

// SEO for the tool itself
useHead({
  title: 'MetaPeek — Meta Tag & Open Graph Previewer',
  meta: [
    { name: 'description', content: 'Inspect, preview, and fix HTML meta tags and Open Graph markup. Fast, clean, and actionable. Paste HTML and see platform-specific previews instantly.' }
  ]
})

// Sample HTML for demonstration
const sampleHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Illinois Criminal Justice Information Authority</title>
  <meta name="description" content="The Illinois Criminal Justice Information Authority is a state agency dedicated to improving the administration of criminal justice.">
  
  <!-- Open Graph -->
  <meta property="og:title" content="ICJIA — Illinois Criminal Justice Information Authority">
  <meta property="og:description" content="Research, grants, and data to improve Illinois criminal justice policy and practice.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://icjia.illinois.gov">
  <meta property="og:image" content="https://icjia.illinois.gov/og-image.jpg">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="ICJIA — Illinois Criminal Justice Information Authority">
  <meta name="twitter:description" content="Research, grants, and data to improve Illinois criminal justice policy and practice.">
  
  <link rel="canonical" href="https://icjia.illinois.gov">
</head>
<body>
  <h1>Welcome to ICJIA</h1>
</body>
</html>`

const loadSample = () => {
  inputHtml.value = sampleHtml
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <div class="container mx-auto px-4 py-8 max-w-7xl">
      <!-- Header -->
      <header class="mb-8">
        <h1 class="text-4xl md:text-5xl font-bold mb-3 text-gray-900 dark:text-gray-100">
          MetaPeek
        </h1>
        <p class="text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-3xl">
          Inspect, preview, and fix HTML meta tags and Open Graph markup. Paste your HTML below to see how your page appears across platforms.
        </p>
      </header>
      
      <main>
        <!-- Input Section -->
        <section class="mb-8">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-xl font-semibold">
                  Paste HTML
                </h2>
                <UButton
                  size="sm"
                  variant="ghost"
                  @click="loadSample"
                >
                  Load Sample
                </UButton>
              </div>
            </template>
            
            <UFormGroup 
              label="HTML Input" 
              description="Paste your page's HTML or just the <head> section. Analysis happens automatically as you type."
              :help="hasAnalyzed ? 'Analysis complete' : 'Start typing to see results'"
            >
              <UTextarea
                v-model="inputHtml"
                :rows="12"
                placeholder="<html>
  <head>
    <title>Your Page Title</title>
    <meta name=&quot;description&quot; content=&quot;...&quot;>
    <meta property=&quot;og:title&quot; content=&quot;...&quot;>
    <meta property=&quot;og:image&quot; content=&quot;https://...&quot;>
    ...
  </head>
</html>"
                aria-label="HTML input"
                class="font-mono text-sm"
              />
            </UFormGroup>
            
            <template #footer>
              <div class="flex items-center justify-between">
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  {{ inputHtml.length }} characters
                </p>
                <UButton 
                  v-if="inputHtml.trim()"
                  variant="ghost"
                  size="sm"
                  icon="i-heroicons-x-mark"
                  @click="inputHtml = ''"
                  aria-label="Clear input"
                >
                  Clear
                </UButton>
              </div>
            </template>
          </UCard>
        </section>
        
        <!-- Results Section -->
        <section v-if="parsedTags && diagnostics" class="space-y-8">
          <!-- Preview Cards -->
          <div>
            <h2 class="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">
              Platform Previews
            </h2>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
              See how your page appears when shared on different platforms. These previews match actual platform rendering.
            </p>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
          
          <!-- Diagnostics Panel -->
          <DiagnosticsPanel :diagnostics="diagnostics" />
          
          <!-- Code Generator -->
          <CodeGenerator :tags="parsedTags" />
        </section>
        
        <!-- Empty State -->
        <section v-else class="text-center py-16">
          <div class="max-w-md mx-auto">
            <UIcon 
              name="i-heroicons-document-text" 
              class="text-6xl text-gray-400 dark:text-gray-600 mx-auto mb-4"
              aria-hidden="true"
            />
            <h3 class="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
              No HTML to analyze yet
            </h3>
            <p class="text-gray-600 dark:text-gray-400 mb-4">
              Paste your HTML above to see platform previews, diagnostics, and generated code snippets.
            </p>
            <UButton @click="loadSample" icon="i-heroicons-sparkles">
              Try Sample HTML
            </UButton>
          </div>
        </section>
      </main>
      
      <!-- Footer -->
      <footer class="mt-16 pt-8 border-t border-gray-200 dark:border-gray-800 text-center text-sm text-gray-600 dark:text-gray-400">
        <p>
          Built by <a href="https://icjia.illinois.gov" class="underline hover:text-gray-900 dark:hover:text-gray-200">Illinois Criminal Justice Information Authority</a>
        </p>
        <p class="mt-2">
          Fast, clean, accessible. No ads, no tracking, no account required.
        </p>
      </footer>
    </div>
  </div>
</template>
