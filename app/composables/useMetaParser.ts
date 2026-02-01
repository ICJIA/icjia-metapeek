// app/composables/useMetaParser.ts

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
