// app/composables/useDiagnostics.ts

import type { MetaTags, Diagnostics, DiagnosticResult } from '~/types/meta'
import { LIMITS } from '~/utils/constants'

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
