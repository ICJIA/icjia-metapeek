/**
 * @fileoverview Generates diagnostic results for meta tags. Evaluates title,
 * description, OG tags, OG image, Twitter Card, canonical, and robots.
 *
 * @module composables/useDiagnostics
 */

import type { MetaTags, Diagnostics, DiagnosticResult } from '~/types/meta'
import { LIMITS } from '~/utils/constants'

/**
 * Result of image dimension analysis from ImageAnalysis component.
 */
export interface ImageAnalysisResult {
  width: number
  height: number
  overallStatus: 'optimal' | 'acceptable' | 'issues' | null
}

/**
 * Composable for generating meta tag diagnostics.
 *
 * @returns Object with generateDiagnostics function
 */
export const useDiagnostics = () => {
  /**
   * Generates diagnostics for all meta tag categories.
   *
   * @param tags - Parsed meta tags from useMetaParser
   * @param imageAnalysis - Optional image dimension analysis for og:image validation
   * @returns Diagnostics with status (green/yellow/red) and messages per category
   */
  const generateDiagnostics = (tags: MetaTags, imageAnalysis?: ImageAnalysisResult): Diagnostics => {
    // Title checks
    const title = checkTitle(tags.title)
    
    // Description checks
    const description = checkDescription(tags.description)
    
    // OG tags checks
    const ogTags = checkOGTags(tags.og)

    // OG image checks (with optional dimension analysis)
    const ogImage = checkOGImage(tags.og.image, imageAnalysis)

    // Twitter card checks
    const twitterCard = checkTwitterCard(tags.twitter, tags.og)

    // Canonical checks (with og:url for trailing slash validation)
    const canonical = checkCanonical(tags.canonical, tags.og.url)

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
    const missing = []
    if (!og.title) missing.push('og:title')
    if (!og.description) missing.push('og:description')
    if (!og.image) missing.push('og:image')

    // All 3 missing or 2+ missing = RED (critical failure)
    if (missing.length >= 2) {
      return {
        status: 'red',
        icon: 'error',
        message: `Missing: ${missing.join(', ')}`,
        suggestion: 'Add all three core Open Graph tags for social media sharing'
      }
    }

    // Only 1 missing = YELLOW (partial implementation)
    if (missing.length === 1) {
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
  
  const checkOGImage = (image?: string, imageAnalysis?: ImageAnalysisResult): DiagnosticResult => {
    if (!image) {
      return {
        status: 'red',
        icon: 'error',
        message: 'og:image missing',
        suggestion: 'Add og:image — this is critical for social media previews'
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

    // If we have dimension analysis, score based on image quality
    if (imageAnalysis && imageAnalysis.overallStatus) {
      if (imageAnalysis.overallStatus === 'issues') {
        return {
          status: 'red',
          icon: 'error',
          message: `Image too small (${imageAnalysis.width}×${imageAnalysis.height}px)`,
          suggestion: 'Image fails minimum size requirements for most platforms. Use at least 1200×630px for optimal social sharing.'
        }
      }

      if (imageAnalysis.overallStatus === 'acceptable') {
        return {
          status: 'yellow',
          icon: 'warning',
          message: `Image meets minimums but could be larger (${imageAnalysis.width}×${imageAnalysis.height}px)`,
          suggestion: 'Image will work but may appear pixelated on some platforms. Recommended: 1200×630px or larger.'
        }
      }

      // overallStatus === 'optimal'
      return {
        status: 'green',
        icon: 'check',
        message: `Image dimensions optimal (${imageAnalysis.width}×${imageAnalysis.height}px)`
      }
    }

    // No dimension analysis yet (still loading) - give provisional green
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
        status: 'red',
        icon: 'error',
        message: 'Twitter Card missing',
        suggestion: 'Add <meta name="twitter:card" content="summary_large_image"> for X/Twitter previews'
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
  
  const checkCanonical = (canonical?: string, ogUrl?: string): DiagnosticResult => {
    if (!canonical) {
      return {
        status: 'red',
        icon: 'error',
        message: 'Canonical URL missing',
        suggestion: 'Add <link rel="canonical" href="..."> to prevent duplicate content issues'
      }
    }

    // Check for trailing slash inconsistency with og:url
    if (ogUrl) {
      const canonicalNormalized = canonical.replace(/\/$/, '')
      const ogUrlNormalized = ogUrl.replace(/\/$/, '')

      // If URLs are the same except for trailing slash, warn about inconsistency
      if (canonicalNormalized === ogUrlNormalized && canonical !== ogUrl) {
        const canonicalHasSlash = canonical.endsWith('/')
        const ogUrlHasSlash = ogUrl.endsWith('/')

        return {
          status: 'yellow',
          icon: 'warning',
          message: 'Trailing slash inconsistency with og:url',
          suggestion: `Canonical ${canonicalHasSlash ? 'has' : 'lacks'} trailing slash but og:url ${ogUrlHasSlash ? 'has' : 'lacks'} it. WHY THIS MATTERS FOR SEO: Search engines treat URLs with and without trailing slashes as technically different pages (e.g., /page vs /page/). This inconsistency can split your ranking signals between two versions of the same content, causing duplicate content issues that hurt SEO. Social platforms may share one URL while search engines index another. Fix: Choose one format (with or without trailing slash) and use it consistently across canonical, og:url, and all meta tags.`
        }
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
