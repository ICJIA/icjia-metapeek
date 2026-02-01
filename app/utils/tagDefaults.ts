// app/utils/tagDefaults.ts

import type { MetaTags } from '~/types/meta'

/**
 * Generate sensible defaults for missing meta tags
 */
export function generateDefaultTags(tags: MetaTags, sourceUrl?: string): string {
  const lines: string[] = []
  
  // Title
  const title = tags.og.title || tags.title || 'Your Page Title'
  lines.push(`<title>${escapeHtml(title)}</title>`)
  
  // Description
  const description = tags.og.description || tags.description || 'Your page description goes here.'
  lines.push(`<meta name="description" content="${escapeHtml(description)}">`)
  
  // Viewport (always include)
  lines.push(`<meta name="viewport" content="width=device-width, initial-scale=1">`)
  
  // Canonical
  if (tags.canonical || sourceUrl) {
    lines.push(`<link rel="canonical" href="${escapeHtml(tags.canonical || sourceUrl || '')}">`)
  }
  
  // Favicon
  if (tags.favicon) {
    lines.push(`<link rel="icon" href="${escapeHtml(tags.favicon)}">`)
  }
  
  // Open Graph tags
  lines.push('')
  lines.push('<!-- Open Graph / Facebook -->')
  lines.push(`<meta property="og:type" content="${tags.og.type || 'website'}">`)
  
  if (tags.og.url || sourceUrl) {
    lines.push(`<meta property="og:url" content="${escapeHtml(tags.og.url || sourceUrl || '')}">`)
  }
  
  lines.push(`<meta property="og:title" content="${escapeHtml(tags.og.title || title)}">`)
  lines.push(`<meta property="og:description" content="${escapeHtml(tags.og.description || description)}">`)
  
  if (tags.og.image) {
    lines.push(`<meta property="og:image" content="${escapeHtml(tags.og.image)}">`)
    if (tags.og.imageAlt) {
      lines.push(`<meta property="og:image:alt" content="${escapeHtml(tags.og.imageAlt)}">`)
    }
  }
  
  if (tags.og.siteName) {
    lines.push(`<meta property="og:site_name" content="${escapeHtml(tags.og.siteName)}">`)
  }
  
  // Twitter Card tags
  lines.push('')
  lines.push('<!-- Twitter -->')
  lines.push(`<meta name="twitter:card" content="${tags.twitter.card || 'summary_large_image'}">`)
  
  if (tags.twitter.site) {
    lines.push(`<meta name="twitter:site" content="${escapeHtml(tags.twitter.site)}">`)
  }
  
  if (tags.twitter.creator) {
    lines.push(`<meta name="twitter:creator" content="${escapeHtml(tags.twitter.creator)}">`)
  }
  
  lines.push(`<meta name="twitter:title" content="${escapeHtml(tags.twitter.title || tags.og.title || title)}">`)
  lines.push(`<meta name="twitter:description" content="${escapeHtml(tags.twitter.description || tags.og.description || description)}">`)
  
  if (tags.twitter.image || tags.og.image) {
    lines.push(`<meta name="twitter:image" content="${escapeHtml(tags.twitter.image || tags.og.image || '')}">`)
    if (tags.twitter.imageAlt || tags.og.imageAlt) {
      lines.push(`<meta name="twitter:image:alt" content="${escapeHtml(tags.twitter.imageAlt || tags.og.imageAlt || '')}">`)
    }
  }
  
  return lines.join('\n')
}

/**
 * Escape HTML special characters
 */
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
