// app/composables/useSpaDetection.ts
// SPA detection heuristics with scoring system

import type { MetaTags } from '~/types/meta'

export interface SPADetectionResult {
  isSPA: boolean
  confidence: 'low' | 'medium' | 'high'
  score: number
  signals: string[]
}

/**
 * Composable for detecting single-page applications
 * Based on design doc section 2, lines 106-122
 */
export function useSpaDetection() {
  /**
   * Check if body contains a single mount div pattern
   * Common patterns: <div id="app">, <div id="__nuxt">, <div id="root">, etc.
   */
  const hasSingleMountDiv = (bodySnippet: string): boolean => {
    const mountPatterns = [
      /<div\s+id=["']app["']/i,
      /<div\s+id=["']__nuxt["']/i,
      /<div\s+id=["']root["']/i,
      /<div\s+id=["']__next["']/i,
      /<div\s+id=["']main["']/i,
      /<div\s+class=["'][^"']*ng-app[^"']*["']/i,
      /<div\s+class=["'][^"']*v-app[^"']*["']/i,
    ]

    return mountPatterns.some(pattern => pattern.test(bodySnippet))
  }

  /**
   * Check if body has minimal content (true SPA with empty HTML)
   */
  const hasMinimalBodyContent = (bodySnippet: string): boolean => {
    // Check if body has very little actual text content
    const strippedBody = bodySnippet
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    return strippedBody.length < 100
  }

  /**
   * Check if body has substantial content (likely SSG/SSR, not pure SPA)
   */
  const hasSubstantialContent = (bodySnippet: string): boolean => {
    const strippedBody = bodySnippet
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    return strippedBody.length > 500
  }

  /**
   * Check if title is generic (framework default)
   */
  const hasGenericTitle = (title?: string): boolean => {
    if (!title) return false

    const genericTitles = [
      'vite app',
      'react app',
      'vue app',
      'angular app',
      'svelte app',
      'next.js',
      'nuxt',
      'loading...',
      'loading',
      'welcome',
      'home',
    ]

    const lowerTitle = title.toLowerCase().trim()
    return genericTitles.some(generic => lowerTitle === generic || lowerTitle.startsWith(generic))
  }

  /**
   * Check if page has no OG tags but has JavaScript bundles
   */
  const hasJsButNoOG = (tags: MetaTags, bodySnippet: string): boolean => {
    const hasOgTags = !!(tags.og?.title || tags.og?.description || tags.og?.image)
    const hasJsBundles = /<script[^>]+src=/i.test(bodySnippet)

    return !hasOgTags && hasJsBundles
  }

  /**
   * Check if body text content is minimal
   */
  const hasMinimalContent = (bodySnippet: string): boolean => {
    // Remove script and style tags
    const strippedBody = bodySnippet
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .trim()

    return strippedBody.length < 100
  }

  /**
   * Check for framework-specific classes or attributes
   */
  const hasFrameworkClasses = (bodySnippet: string): boolean => {
    const frameworkPatterns = [
      /ng-app/i,
      /ng-controller/i,
      /v-app/i,
      /v-cloak/i,
      /data-reactroot/i,
      /data-react-helmet/i,
    ]

    return frameworkPatterns.some(pattern => pattern.test(bodySnippet))
  }

  /**
   * Check for bundled/chunked JavaScript files (webpack, vite, etc.)
   * Strong signal of a build process for SPAs
   */
  const hasBundledJS = (bodySnippet: string): boolean => {
    const bundlePatterns = [
      /\.(chunk|bundle|app|main|vendor)\.[a-f0-9]+\.js/i,  // Hashed filenames
      /webpack/i,
      /vite/i,
      /__webpack/i,
      /_next\/static/i,  // Next.js
      /_nuxt\//i,        // Nuxt.js
    ]

    return bundlePatterns.some(pattern => pattern.test(bodySnippet))
  }

  /**
   * Detect if the page is likely a SPA using scoring heuristics (CONSERVATIVE MODE)
   *
   * Key principle: SSG/SSR sites have mount divs + proper meta tags.
   * True SPAs have mount divs + missing/poor meta tags.
   *
   * Scoring signals:
   * +3: Body has single mount div
   * +3: Minimal body content (< 100 chars) - TRUE SPA indicator
   * +2: Has bundled/chunked JS files (webpack, vite, etc.)
   * +2: Generic title (framework default)
   * +2: No OG tags but has JS bundles
   * +1: Has framework-specific class names
   * -4: Has mount div BUT proper meta tags (og:title, og:description, title) - SSG/SSR with hydration
   * -3: Has substantial content (> 500 chars) - SSG/SSR, not SPA
   *
   * Thresholds:
   * score < 5: Not SPA (likely static or SSG/SSR)
   * score 5-6: Likely SPA (medium confidence)
   * score >= 7: Definitely SPA (high confidence)
   */
  const detectSpa = (bodySnippet: string, tags: MetaTags): SPADetectionResult => {
    let score = 0
    const signals: string[] = []

    const hasMountDiv = hasSingleMountDiv(bodySnippet)
    const hasProperMetaTags = !!(tags.og?.title && tags.og?.description && tags.title && !hasGenericTitle(tags.title))

    // Signal 1: Single mount div (+3)
    if (hasMountDiv) {
      score += 3
      signals.push('Body contains framework mount div (app/root/__nuxt/etc.)')
    }

    // Signal 2: Minimal body content (+3) - STRONGEST SPA INDICATOR
    // This separates true SPAs (empty HTML) from SSG/SSR (full HTML)
    if (hasMinimalBodyContent(bodySnippet)) {
      score += 3
      signals.push('Body has minimal text content (<100 chars) - everything rendered by JS')
    }

    // Signal 3: Bundled JS files (+2)
    if (hasBundledJS(bodySnippet)) {
      score += 2
      signals.push('Bundled/chunked JavaScript files detected (webpack/vite build artifacts)')
    }

    // Signal 4: Generic title (+2)
    if (hasGenericTitle(tags.title)) {
      score += 2
      signals.push(`Title is generic framework default: "${tags.title}"`)
    }

    // Signal 5: No OG tags but has JS (+2)
    if (hasJsButNoOG(tags, bodySnippet)) {
      score += 2
      signals.push('Page has JavaScript bundles but no Open Graph tags')
    }

    // Signal 6: Framework classes (+1)
    if (hasFrameworkClasses(bodySnippet)) {
      score += 1
      signals.push('Framework-specific classes or attributes detected')
    }

    // NEGATIVE Signal 1: Mount div + Proper meta tags (-4) - SSG/SSR with hydration
    // This is KEY: static generated sites have both framework code AND good meta tags
    if (hasMountDiv && hasProperMetaTags) {
      score -= 4
      signals.push('Has framework mount div BUT also proper meta tags (og:title, og:description, title) - likely SSG/SSR with hydration, not pure SPA')
    }

    // NEGATIVE Signal 2: Substantial content (-3) - SSG/SSR with hydration, not pure SPA
    if (hasSubstantialContent(bodySnippet)) {
      score -= 3
      signals.push('Body has substantial text content (>500 chars) - likely static site with hydration, not pure SPA')
    }

    // Determine result based on score
    let isSPA = false
    let confidence: 'low' | 'medium' | 'high' = 'low'

    if (score >= 7) {
      isSPA = true
      confidence = 'high'
    } else if (score >= 5) {
      isSPA = true
      confidence = 'medium'
    }

    return {
      isSPA,
      confidence,
      score,
      signals,
    }
  }

  return {
    detectSpa,
  }
}
