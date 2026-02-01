import { describe, it, expect } from 'vitest'
import { useMetaParser } from '~/composables/useMetaParser'

describe('useMetaParser', () => {
  const { parseMetaTags } = useMetaParser()

  describe('parseMetaTags', () => {
    it('extracts title tag', () => {
      const html = '<html><head><title>Test Page Title</title></head></html>'
      const result = parseMetaTags(html)
      expect(result.title).toBe('Test Page Title')
    })

    it('extracts meta description', () => {
      const html = '<html><head><meta name="description" content="A test description"></head></html>'
      const result = parseMetaTags(html)
      expect(result.description).toBe('A test description')
    })

    it('extracts viewport meta', () => {
      const html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head></html>'
      const result = parseMetaTags(html)
      expect(result.viewport).toBe('width=device-width, initial-scale=1')
    })

    it('extracts robots meta', () => {
      const html = '<html><head><meta name="robots" content="noindex, nofollow"></head></html>'
      const result = parseMetaTags(html)
      expect(result.robots).toBe('noindex, nofollow')
    })

    it('extracts canonical link', () => {
      const html = '<html><head><link rel="canonical" href="https://example.com/page"></head></html>'
      const result = parseMetaTags(html)
      expect(result.canonical).toBe('https://example.com/page')
    })

    it('extracts favicon from rel="icon"', () => {
      const html = '<html><head><link rel="icon" href="/favicon.ico"></head></html>'
      const result = parseMetaTags(html)
      expect(result.favicon).toBe('/favicon.ico')
    })

    it('extracts favicon from rel="shortcut icon"', () => {
      const html = '<html><head><link rel="shortcut icon" href="/favicon.png"></head></html>'
      const result = parseMetaTags(html)
      expect(result.favicon).toBe('/favicon.png')
    })

    it('extracts theme-color meta', () => {
      const html = '<html><head><meta name="theme-color" content="#007bff"></head></html>'
      const result = parseMetaTags(html)
      expect(result.themeColor).toBe('#007bff')
    })

    describe('Open Graph tags', () => {
      it('extracts og:title', () => {
        const html = '<html><head><meta property="og:title" content="OG Title"></head></html>'
        const result = parseMetaTags(html)
        expect(result.og.title).toBe('OG Title')
      })

      it('extracts og:description', () => {
        const html = '<html><head><meta property="og:description" content="OG Description"></head></html>'
        const result = parseMetaTags(html)
        expect(result.og.description).toBe('OG Description')
      })

      it('extracts og:image', () => {
        const html = '<html><head><meta property="og:image" content="https://example.com/image.jpg"></head></html>'
        const result = parseMetaTags(html)
        expect(result.og.image).toBe('https://example.com/image.jpg')
      })

      it('extracts og:url', () => {
        const html = '<html><head><meta property="og:url" content="https://example.com/page"></head></html>'
        const result = parseMetaTags(html)
        expect(result.og.url).toBe('https://example.com/page')
      })

      it('extracts og:type', () => {
        const html = '<html><head><meta property="og:type" content="article"></head></html>'
        const result = parseMetaTags(html)
        expect(result.og.type).toBe('article')
      })

      it('extracts og:site_name', () => {
        const html = '<html><head><meta property="og:site_name" content="Example Site"></head></html>'
        const result = parseMetaTags(html)
        expect(result.og.siteName).toBe('Example Site')
      })

      it('extracts og:image:alt', () => {
        const html = '<html><head><meta property="og:image:alt" content="Alt text"></head></html>'
        const result = parseMetaTags(html)
        expect(result.og.imageAlt).toBe('Alt text')
      })
    })

    describe('Twitter Card tags', () => {
      it('extracts twitter:card', () => {
        const html = '<html><head><meta name="twitter:card" content="summary_large_image"></head></html>'
        const result = parseMetaTags(html)
        expect(result.twitter.card).toBe('summary_large_image')
      })

      it('extracts twitter:site', () => {
        const html = '<html><head><meta name="twitter:site" content="@example"></head></html>'
        const result = parseMetaTags(html)
        expect(result.twitter.site).toBe('@example')
      })

      it('extracts twitter:creator', () => {
        const html = '<html><head><meta name="twitter:creator" content="@author"></head></html>'
        const result = parseMetaTags(html)
        expect(result.twitter.creator).toBe('@author')
      })

      it('extracts twitter:title', () => {
        const html = '<html><head><meta name="twitter:title" content="Twitter Title"></head></html>'
        const result = parseMetaTags(html)
        expect(result.twitter.title).toBe('Twitter Title')
      })

      it('extracts twitter:description', () => {
        const html = '<html><head><meta name="twitter:description" content="Twitter Description"></head></html>'
        const result = parseMetaTags(html)
        expect(result.twitter.description).toBe('Twitter Description')
      })

      it('extracts twitter:image', () => {
        const html = '<html><head><meta name="twitter:image" content="https://example.com/twitter.jpg"></head></html>'
        const result = parseMetaTags(html)
        expect(result.twitter.image).toBe('https://example.com/twitter.jpg')
      })
    })

    describe('JSON-LD structured data', () => {
      it('extracts valid JSON-LD', () => {
        const html = `<html><head>
          <script type="application/ld+json">{"@type": "Organization", "name": "Test"}</script>
        </head></html>`
        const result = parseMetaTags(html)
        expect(result.structuredData).toHaveLength(1)
        expect(result.structuredData[0]).toEqual({ '@type': 'Organization', name: 'Test' })
      })

      it('handles multiple JSON-LD blocks', () => {
        const html = `<html><head>
          <script type="application/ld+json">{"@type": "Organization"}</script>
          <script type="application/ld+json">{"@type": "WebPage"}</script>
        </head></html>`
        const result = parseMetaTags(html)
        expect(result.structuredData).toHaveLength(2)
      })

      it('skips invalid JSON-LD gracefully', () => {
        const html = `<html><head>
          <script type="application/ld+json">{invalid json}</script>
        </head></html>`
        const result = parseMetaTags(html)
        expect(result.structuredData).toHaveLength(0)
      })
    })

    describe('complete HTML document', () => {
      it('parses a full HTML document correctly', () => {
        const html = `<!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <title>Complete Test Page</title>
            <meta name="description" content="Full page description">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link rel="canonical" href="https://example.com/">
            <link rel="icon" href="/favicon.ico">
            <meta property="og:title" content="OG Title">
            <meta property="og:description" content="OG Description">
            <meta property="og:image" content="https://example.com/og.jpg">
            <meta property="og:url" content="https://example.com/">
            <meta property="og:type" content="website">
            <meta name="twitter:card" content="summary_large_image">
            <meta name="twitter:site" content="@example">
          </head>
          <body><h1>Hello</h1></body>
          </html>`
        
        const result = parseMetaTags(html)
        
        expect(result.title).toBe('Complete Test Page')
        expect(result.description).toBe('Full page description')
        expect(result.canonical).toBe('https://example.com/')
        expect(result.favicon).toBe('/favicon.ico')
        expect(result.og.title).toBe('OG Title')
        expect(result.og.description).toBe('OG Description')
        expect(result.og.image).toBe('https://example.com/og.jpg')
        expect(result.twitter.card).toBe('summary_large_image')
        expect(result.twitter.site).toBe('@example')
      })
    })

    describe('missing tags', () => {
      it('returns undefined for missing title', () => {
        const html = '<html><head></head></html>'
        const result = parseMetaTags(html)
        expect(result.title).toBeUndefined()
      })

      it('returns undefined for missing description', () => {
        const html = '<html><head></head></html>'
        const result = parseMetaTags(html)
        expect(result.description).toBeUndefined()
      })

      it('returns empty og object properties for missing OG tags', () => {
        const html = '<html><head></head></html>'
        const result = parseMetaTags(html)
        expect(result.og.title).toBeUndefined()
        expect(result.og.description).toBeUndefined()
        expect(result.og.image).toBeUndefined()
      })
    })
  })
})
