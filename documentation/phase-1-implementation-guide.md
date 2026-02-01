# Phase 1 Implementation Guide

This guide walks through the specific steps to implement Phase 1 (Client-Side MVP) of MetaPeek. Follow this after completing project setup.

---

## Project Initialization

### 1. Create Nuxt Project

```bash
# Create new Nuxt 3 project
npx nuxi@latest init icjia-metapeek

cd icjia-metapeek

# Install latest Nuxt UI
npm install @nuxt/ui

# Install additional dependencies
npm install cheerio

# Install dev dependencies
npm install --save-dev @nuxt/test-utils vitest @vue/test-utils happy-dom @axe-core/playwright
```

### 2. Configure Nuxt

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  
  devtools: { enabled: true },
  
  ssr: true, // MetaPeek practices what it preaches
  
  typescript: {
    strict: true,
    typeCheck: true
  },
  
  app: {
    head: {
      title: 'MetaPeek — Meta Tag & Open Graph Previewer',
      meta: [
        { name: 'description', content: 'Inspect, preview, and fix HTML meta tags and Open Graph markup. Fast, clean, and actionable.' },
        { property: 'og:title', content: 'MetaPeek — Meta Tag & Open Graph Previewer' },
        { property: 'og:description', content: 'Inspect, preview, and fix HTML meta tags and Open Graph markup.' },
        { property: 'og:type', content: 'website' }
      ]
    }
  }
})
```

### 3. Create Configuration File

```typescript
// metapeek.config.ts
const metapeekConfig = {
  site: {
    name: 'MetaPeek',
    url: 'https://metapeek.icjia.app',
    description: 'Inspect, preview, and fix HTML meta tags and Open Graph markup.',
  },
  
  proxy: {
    externalUrl: null as string | null,
    userAgent: 'MetaPeek/1.0 (+https://metapeek.icjia.app)',
    fetchTimeoutMs: 10_000,
    maxResponseBytes: 1_048_576,
    maxRedirects: 5,
    maxUrlLength: 2048,
    allowHttpInDev: true,
  },
  
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'] as const,
  },
  
  cors: {
    allowedOrigins: [
      'https://metapeek.icjia.app',
      'http://localhost:3000',
    ],
    allowedMethods: ['POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
  
  favicon: {
    clientSideFallback: true,
  },
  
  diagnostics: {
    flagNoindex: true,
    flagNoFollow: true,
  },
} as const

export default metapeekConfig
export type MetaPeekConfig = typeof metapeekConfig
```

### 4. Set Up Testing

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '.nuxt/',
        'tests/',
      ]
    }
  }
})
```

```json
// package.json - add scripts
{
  "scripts": {
    "dev": "nuxt dev",
    "build": "nuxt build",
    "generate": "nuxt generate",
    "preview": "nuxt preview",
    "test:unit": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  }
}
```

---

## Step-by-Step Implementation

### Step 1: Create Type Definitions

```typescript
// types/meta.ts
export interface MetaTags {
  title?: string
  description?: string
  viewport?: string
  robots?: string
  canonical?: string
  favicon?: string
  themeColor?: string
  
  og: {
    title?: string
    description?: string
    type?: string
    url?: string
    image?: string
    imageAlt?: string
    siteName?: string
    locale?: string
  }
  
  twitter: {
    card?: string
    site?: string
    creator?: string
    title?: string
    description?: string
    image?: string
    imageAlt?: string
  }
  
  structuredData: Array<Record<string, any>>
}

export interface DiagnosticResult {
  status: 'green' | 'yellow' | 'red'
  icon: 'check' | 'warning' | 'error'
  message: string
  suggestion?: string
}

export interface Diagnostics {
  overall: DiagnosticResult
  title: DiagnosticResult
  description: DiagnosticResult
  ogTags: DiagnosticResult
  ogImage: DiagnosticResult
  twitterCard: DiagnosticResult
  canonical: DiagnosticResult
  robots: DiagnosticResult
}
```

### Step 2: Implement Meta Parser Composable

```typescript
// composables/useMetaParser.ts
import type { MetaTags } from '~/types/meta'

export const useMetaParser = () => {
  const parseMetaTags = (html: string): MetaTags => {
    // Use DOMParser (available in all modern browsers)
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    
    // Helper to get meta content
    const getMeta = (selector: string): string | undefined => {
      const element = doc.querySelector(selector)
      return element?.getAttribute('content') || undefined
    }
    
    // Helper to get multiple meta tags
    const getMetaMultiple = (selector: string): string[] => {
      return Array.from(doc.querySelectorAll(selector))
        .map(el => el.getAttribute('content'))
        .filter((content): content is string => content !== null)
    }
    
    // Extract title
    const title = doc.querySelector('title')?.textContent || undefined
    
    // Extract basic meta tags
    const description = getMeta('meta[name="description"]')
    const viewport = getMeta('meta[name="viewport"]')
    const robots = getMeta('meta[name="robots"]')
    const themeColor = getMeta('meta[name="theme-color"]')
    
    // Extract canonical
    const canonicalLink = doc.querySelector('link[rel="canonical"]')
    const canonical = canonicalLink?.getAttribute('href') || undefined
    
    // Extract favicon
    const faviconLink = doc.querySelector('link[rel="icon"], link[rel="shortcut icon"]')
    const favicon = faviconLink?.getAttribute('href') || undefined
    
    // Extract Open Graph tags
    const og = {
      title: getMeta('meta[property="og:title"]'),
      description: getMeta('meta[property="og:description"]'),
      type: getMeta('meta[property="og:type"]'),
      url: getMeta('meta[property="og:url"]'),
      image: getMeta('meta[property="og:image"]'),
      imageAlt: getMeta('meta[property="og:image:alt"]'),
      siteName: getMeta('meta[property="og:site_name"]'),
      locale: getMeta('meta[property="og:locale"]'),
    }
    
    // Extract Twitter Card tags
    const twitter = {
      card: getMeta('meta[name="twitter:card"]'),
      site: getMeta('meta[name="twitter:site"]'),
      creator: getMeta('meta[name="twitter:creator"]'),
      title: getMeta('meta[name="twitter:title"]'),
      description: getMeta('meta[name="twitter:description"]'),
      image: getMeta('meta[name="twitter:image"]'),
      imageAlt: getMeta('meta[name="twitter:image:alt"]'),
    }
    
    // Extract JSON-LD structured data
    const structuredData: Array<Record<string, any>> = []
    const ldJsonScripts = doc.querySelectorAll('script[type="application/ld+json"]')
    
    ldJsonScripts.forEach(script => {
      try {
        const data = JSON.parse(script.textContent || '')
        structuredData.push(data)
      } catch (e) {
        // Invalid JSON - skip it
        console.warn('Invalid JSON-LD found:', e)
      }
    })
    
    return {
      title,
      description,
      viewport,
      robots,
      canonical,
      favicon,
      themeColor,
      og,
      twitter,
      structuredData
    }
  }
  
  return {
    parseMetaTags
  }
}
```

### Step 3: Implement Diagnostics Composable

```typescript
// composables/useDiagnostics.ts
import type { MetaTags, Diagnostics, DiagnosticResult } from '~/types/meta'

// Character limits from design doc
const LIMITS = {
  TITLE_GOOGLE: 60,
  DESCRIPTION_GOOGLE: 160,
  OG_TITLE: 90,
  OG_DESCRIPTION: 200,
}

export const useDiagnostics = () => {
  const generateDiagnostics = (tags: MetaTags): Diagnostics => {
    // Title checks
    const title = checkTitle(tags.title)
    
    // Description checks
    const description = checkDescription(tags.description)
    
    // OG tags checks
    const ogTags = checkOGTags(tags.og)
    
    // OG image checks
    const ogImage = checkOGImage(tags.og.image)
    
    // Twitter card checks
    const twitterCard = checkTwitterCard(tags.twitter, tags.og)
    
    // Canonical checks
    const canonical = checkCanonical(tags.canonical)
    
    // Robots checks
    const robots = checkRobots(tags.robots)
    
    // Overall status (worst of all checks)
    const overall = determineOverallStatus([
      title, description, ogTags, ogImage, twitterCard, canonical, robots
    ])
    
    return {
      overall,
      title,
      description,
      ogTags,
      ogImage,
      twitterCard,
      canonical,
      robots
    }
  }
  
  const checkTitle = (title?: string): DiagnosticResult => {
    if (!title) {
      return {
        status: 'red',
        icon: 'error',
        message: 'Title tag missing',
        suggestion: 'Add a <title> tag with a descriptive page title'
      }
    }
    
    if (title.length > LIMITS.TITLE_GOOGLE) {
      return {
        status: 'yellow',
        icon: 'warning',
        message: `Title exceeds ${LIMITS.TITLE_GOOGLE} characters (${title.length})`,
        suggestion: 'Google may truncate titles longer than 60 characters in search results'
      }
    }
    
    return {
      status: 'green',
      icon: 'check',
      message: 'Title tag present and optimal length'
    }
  }
  
  const checkDescription = (description?: string): DiagnosticResult => {
    if (!description) {
      return {
        status: 'red',
        icon: 'error',
        message: 'Meta description missing',
        suggestion: 'Add <meta name="description" content="...">'
      }
    }
    
    if (description.length > LIMITS.DESCRIPTION_GOOGLE) {
      return {
        status: 'yellow',
        icon: 'warning',
        message: `Description exceeds ${LIMITS.DESCRIPTION_GOOGLE} characters (${description.length})`,
        suggestion: 'Google may truncate descriptions longer than 160 characters'
      }
    }
    
    if (description.length < 50) {
      return {
        status: 'yellow',
        icon: 'warning',
        message: 'Description is very short',
        suggestion: 'Consider adding more detail (aim for 120-160 characters)'
      }
    }
    
    return {
      status: 'green',
      icon: 'check',
      message: 'Meta description present and optimal length'
    }
  }
  
  const checkOGTags = (og: MetaTags['og']): DiagnosticResult => {
    if (!og.title && !og.description && !og.image) {
      return {
        status: 'red',
        icon: 'error',
        message: 'Open Graph tags missing',
        suggestion: 'Add og:title, og:description, and og:image for social media sharing'
      }
    }
    
    const missing = []
    if (!og.title) missing.push('og:title')
    if (!og.description) missing.push('og:description')
    if (!og.image) missing.push('og:image')
    
    if (missing.length > 0) {
      return {
        status: 'yellow',
        icon: 'warning',
        message: `Missing: ${missing.join(', ')}`,
        suggestion: 'Add all three core Open Graph tags for optimal social sharing'
      }
    }
    
    return {
      status: 'green',
      icon: 'check',
      message: 'All required Open Graph tags present'
    }
  }
  
  const checkOGImage = (image?: string): DiagnosticResult => {
    if (!image) {
      return {
        status: 'yellow',
        icon: 'warning',
        message: 'og:image not set',
        suggestion: 'Add og:image for better social media previews'
      }
    }
    
    // Check if image URL is relative
    if (!image.startsWith('http://') && !image.startsWith('https://')) {
      return {
        status: 'yellow',
        icon: 'warning',
        message: 'og:image is a relative path',
        suggestion: 'Use an absolute URL (https://...) for og:image'
      }
    }
    
    return {
      status: 'green',
      icon: 'check',
      message: 'og:image present with absolute URL'
    }
  }
  
  const checkTwitterCard = (twitter: MetaTags['twitter'], og: MetaTags['og']): DiagnosticResult => {
    const hasOG = og.title || og.description || og.image
    
    if (!twitter.card && hasOG) {
      return {
        status: 'yellow',
        icon: 'warning',
        message: 'Twitter Card tags missing',
        suggestion: 'Add <meta name="twitter:card" content="summary_large_image"> for better X/Twitter previews'
      }
    }
    
    if (twitter.card) {
      return {
        status: 'green',
        icon: 'check',
        message: 'Twitter Card configured'
      }
    }
    
    return {
      status: 'green',
      icon: 'check',
      message: 'Twitter Card tags optional (will fall back to Open Graph)'
    }
  }
  
  const checkCanonical = (canonical?: string): DiagnosticResult => {
    if (!canonical) {
      return {
        status: 'yellow',
        icon: 'warning',
        message: 'Canonical URL missing',
        suggestion: 'Consider adding <link rel="canonical" href="..."> to prevent duplicate content issues'
      }
    }
    
    return {
      status: 'green',
      icon: 'check',
      message: 'Canonical URL present'
    }
  }
  
  const checkRobots = (robots?: string): DiagnosticResult => {
    if (!robots) {
      return {
        status: 'green',
        icon: 'check',
        message: 'No robots restrictions (page will be indexed)'
      }
    }
    
    if (robots.includes('noindex')) {
      return {
        status: 'yellow',
        icon: 'warning',
        message: 'Page is set to noindex',
        suggestion: 'This page will not appear in search results. Remove noindex if this is unintentional.'
      }
    }
    
    return {
      status: 'green',
      icon: 'check',
      message: 'Robots meta tag present'
    }
  }
  
  const determineOverallStatus = (results: DiagnosticResult[]): DiagnosticResult => {
    const hasRed = results.some(r => r.status === 'red')
    const hasYellow = results.some(r => r.status === 'yellow')
    
    if (hasRed) {
      return {
        status: 'red',
        icon: 'error',
        message: 'Critical issues found',
        suggestion: 'Fix red items for basic meta tag functionality'
      }
    }
    
    if (hasYellow) {
      return {
        status: 'yellow',
        icon: 'warning',
        message: 'Some improvements recommended',
        suggestion: 'Address yellow items for optimal sharing and SEO'
      }
    }
    
    return {
      status: 'green',
      icon: 'check',
      message: 'All checks passed'
    }
  }
  
  return {
    generateDiagnostics
  }
}
```

### Step 4: Create Preview Components

Start with one component as a template:

```vue
<!-- components/PreviewGoogle.vue -->
<script setup lang="ts">
interface Props {
  title?: string
  description?: string
  url?: string
}

const props = defineProps<Props>()

// Truncate title at 60 characters (Google's approximate limit)
const truncatedTitle = computed(() => {
  if (!props.title) return 'Untitled'
  return props.title.length > 60 
    ? props.title.substring(0, 60) + '...' 
    : props.title
})

// Truncate description at 160 characters
const truncatedDescription = computed(() => {
  if (!props.description) return ''
  return props.description.length > 160
    ? props.description.substring(0, 160) + '...'
    : props.description
})

// Format URL for display
const displayUrl = computed(() => {
  if (!props.url) return 'example.com'
  try {
    const parsed = new URL(props.url)
    return parsed.hostname + parsed.pathname
  } catch {
    return props.url
  }
})
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="text-lg font-semibold flex items-center gap-2">
        <UIcon name="i-heroicons-magnifying-glass" />
        Google Search Preview
      </h2>
    </template>
    
    <div class="google-preview" role="img" aria-label="Google search result preview">
      <cite class="text-sm text-emerald-700 dark:text-emerald-400 not-italic">
        {{ displayUrl }}
      </cite>
      
      <h3 class="text-xl text-blue-700 dark:text-blue-400 mt-1 hover:underline cursor-pointer">
        {{ truncatedTitle }}
      </h3>
      
      <p v-if="description" class="text-sm text-gray-600 dark:text-gray-400 mt-1">
        {{ truncatedDescription }}
      </p>
      
      <p v-else class="text-sm text-gray-400 italic mt-1">
        No description provided
      </p>
    </div>
    
    <template #footer>
      <p class="text-xs text-gray-500">
        This shows how your page appears in Google search results. Title truncates at ~60 characters.
      </p>
    </template>
  </UCard>
</template>
```

Implement similar components for:
- `PreviewFacebook.vue` (1.91:1 image aspect ratio)
- `PreviewTwitter.vue` (handles summary vs summary_large_image)
- `PreviewSlack.vue` (includes favicon)

### Step 5: Create Main Page

```vue
<!-- pages/index.vue -->
<script setup lang="ts">
const { parseMetaTags } = useMetaParser()
const { generateDiagnostics } = useDiagnostics()

const inputHtml = ref('')
const parsedTags = ref<MetaTags | null>(null)
const diagnostics = ref<Diagnostics | null>(null)

const analyze = () => {
  if (!inputHtml.value.trim()) return
  
  // Parse HTML
  parsedTags.value = parseMetaTags(inputHtml.value)
  
  // Generate diagnostics
  diagnostics.value = generateDiagnostics(parsedTags.value)
}

// Auto-analyze when input changes (with debounce)
const debouncedAnalyze = useDebounceFn(analyze, 500)
watch(inputHtml, () => {
  if (inputHtml.value.trim()) {
    debouncedAnalyze()
  }
})

// SEO for the tool itself
useHead({
  title: 'MetaPeek — Meta Tag & Open Graph Previewer',
  meta: [
    { name: 'description', content: 'Inspect, preview, and fix HTML meta tags and Open Graph markup. Fast, clean, and actionable.' }
  ]
})
</script>

<template>
  <div class="container mx-auto px-4 py-8 max-w-6xl">
    <header class="mb-8">
      <h1 class="text-4xl font-bold mb-2">
        MetaPeek
      </h1>
      <p class="text-lg text-gray-600 dark:text-gray-400">
        Inspect, preview, and fix HTML meta tags and Open Graph markup
      </p>
    </header>
    
    <main>
      <!-- Input Section -->
      <section class="mb-8">
        <UCard>
          <UFormGroup 
            label="Paste HTML" 
            description="Paste your page's HTML or just the <head> section"
          >
            <UTextarea
              v-model="inputHtml"
              :rows="10"
              placeholder="<html>
  <head>
    <title>Your Page Title</title>
    <meta property='og:title' content='...' />
    ...
  </head>
</html>"
              aria-label="HTML input"
            />
          </UFormGroup>
          
          <template #footer>
            <div class="flex justify-end">
              <UButton 
                @click="analyze"
                :disabled="!inputHtml.trim()"
              >
                Analyze Meta Tags
              </UButton>
            </div>
          </template>
        </UCard>
      </section>
      
      <!-- Results Section -->
      <section v-if="parsedTags && diagnostics">
        <!-- Preview Cards -->
        <div class="mb-8">
          <h2 class="text-2xl font-bold mb-4">
            Platform Previews
          </h2>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
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
            />
          </div>
        </div>
        
        <!-- Diagnostics Panel -->
        <DiagnosticsPanel :diagnostics="diagnostics" class="mb-8" />
        
        <!-- Code Generator -->
        <CodeGenerator :tags="parsedTags" />
      </section>
    </main>
  </div>
</template>
```

---

## Testing Phase 1

After implementing all components, run through the checklist:

1. **Unit tests:** Run `npm run test:coverage` - aim for >80%
2. **Accessibility:** Run axe DevTools - zero violations
3. **Manual testing:** Use the pre-launch checklist Phase 1 items
4. **Visual testing:** Compare previews with actual platforms

---

## Common Issues and Solutions

### Issue: DOMParser not available in tests
**Solution:** Use happy-dom or jsdom test environment (already configured in vitest.config.ts)

### Issue: Preview cards don't match platforms exactly
**Solution:** Use browser DevTools to inspect actual platform OG preview rendering and match CSS closely

### Issue: Accessibility audit fails
**Solution:** See accessibility-guidelines.md for specific fixes

### Issue: TypeScript errors
**Solution:** Ensure all types are properly defined in types/meta.ts and imported correctly

---

## Next Steps After Phase 1

Once Phase 1 is complete and all checklist items pass:

1. Commit to git
2. Deploy to Netlify for initial testing
3. Review with accessibility tools in production
4. Begin Phase 2 (proxy implementation)

See the design document Phase 2 section for server route implementation details.
