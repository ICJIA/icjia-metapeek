import { describe, it, expect } from 'vitest'
import { generateDefaultTags } from '~/utils/tagDefaults'
import type { MetaTags } from '~/types/meta'

describe('tagDefaults', () => {
  // Helper to create a base MetaTags object
  const createMetaTags = (overrides: Partial<MetaTags> = {}): MetaTags => ({
    title: undefined,
    description: undefined,
    viewport: undefined,
    robots: undefined,
    canonical: undefined,
    favicon: undefined,
    themeColor: undefined,
    og: {
      title: undefined,
      description: undefined,
      type: undefined,
      url: undefined,
      image: undefined,
      imageAlt: undefined,
      siteName: undefined,
      locale: undefined,
    },
    twitter: {
      card: undefined,
      site: undefined,
      creator: undefined,
      title: undefined,
      description: undefined,
      image: undefined,
      imageAlt: undefined,
    },
    structuredData: [],
    ...overrides,
  })

  describe('generateDefaultTags', () => {
    describe('title generation', () => {
      it('uses og:title when available', () => {
        const tags = createMetaTags({
          title: 'Page Title',
          og: {
            title: 'OG Title',
            description: undefined,
            type: undefined,
            url: undefined,
            image: undefined,
            imageAlt: undefined,
            siteName: undefined,
            locale: undefined,
          }
        })
        const result = generateDefaultTags(tags)
        expect(result).toContain('<title>OG Title</title>')
      })

      it('falls back to title when og:title is missing', () => {
        const tags = createMetaTags({ title: 'Page Title' })
        const result = generateDefaultTags(tags)
        expect(result).toContain('<title>Page Title</title>')
      })

      it('uses default title when both are missing', () => {
        const tags = createMetaTags()
        const result = generateDefaultTags(tags)
        expect(result).toContain('<title>Your Page Title</title>')
      })
    })

    describe('description generation', () => {
      it('uses og:description when available', () => {
        const tags = createMetaTags({
          description: 'Page Description',
          og: {
            title: undefined,
            description: 'OG Description',
            type: undefined,
            url: undefined,
            image: undefined,
            imageAlt: undefined,
            siteName: undefined,
            locale: undefined,
          }
        })
        const result = generateDefaultTags(tags)
        expect(result).toContain('<meta name="description" content="OG Description">')
      })

      it('falls back to description when og:description is missing', () => {
        const tags = createMetaTags({ description: 'Page Description' })
        const result = generateDefaultTags(tags)
        expect(result).toContain('<meta name="description" content="Page Description">')
      })

      it('uses default description when both are missing', () => {
        const tags = createMetaTags()
        const result = generateDefaultTags(tags)
        expect(result).toContain('<meta name="description" content="Your page description goes here.">')
      })
    })

    describe('viewport meta tag', () => {
      it('always includes viewport meta tag', () => {
        const tags = createMetaTags()
        const result = generateDefaultTags(tags)
        expect(result).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">')
      })
    })

    describe('canonical link', () => {
      it('includes canonical when provided in tags', () => {
        const tags = createMetaTags({ canonical: 'https://example.com/page' })
        const result = generateDefaultTags(tags)
        expect(result).toContain('<link rel="canonical" href="https://example.com/page">')
      })

      it('uses sourceUrl when canonical is missing', () => {
        const tags = createMetaTags()
        const result = generateDefaultTags(tags, 'https://source.com/page')
        expect(result).toContain('<link rel="canonical" href="https://source.com/page">')
      })

      it('omits canonical when both are missing', () => {
        const tags = createMetaTags()
        const result = generateDefaultTags(tags)
        expect(result).not.toContain('rel="canonical"')
      })
    })

    describe('favicon link', () => {
      it('includes favicon when provided', () => {
        const tags = createMetaTags({ favicon: '/favicon.ico' })
        const result = generateDefaultTags(tags)
        expect(result).toContain('<link rel="icon" href="/favicon.ico">')
      })

      it('omits favicon when missing', () => {
        const tags = createMetaTags()
        const result = generateDefaultTags(tags)
        expect(result).not.toContain('rel="icon"')
      })
    })

    describe('Open Graph tags', () => {
      it('includes OG section comment', () => {
        const tags = createMetaTags()
        const result = generateDefaultTags(tags)
        expect(result).toContain('<!-- Open Graph / Facebook -->')
      })

      it('defaults og:type to website', () => {
        const tags = createMetaTags()
        const result = generateDefaultTags(tags)
        expect(result).toContain('<meta property="og:type" content="website">')
      })

      it('uses provided og:type', () => {
        const tags = createMetaTags({
          og: {
            title: undefined,
            description: undefined,
            type: 'article',
            url: undefined,
            image: undefined,
            imageAlt: undefined,
            siteName: undefined,
            locale: undefined,
          }
        })
        const result = generateDefaultTags(tags)
        expect(result).toContain('<meta property="og:type" content="article">')
      })

      it('includes og:url when provided', () => {
        const tags = createMetaTags({
          og: {
            title: undefined,
            description: undefined,
            type: undefined,
            url: 'https://example.com/',
            image: undefined,
            imageAlt: undefined,
            siteName: undefined,
            locale: undefined,
          }
        })
        const result = generateDefaultTags(tags)
        expect(result).toContain('<meta property="og:url" content="https://example.com/">')
      })

      it('uses sourceUrl for og:url when og:url is missing', () => {
        const tags = createMetaTags()
        const result = generateDefaultTags(tags, 'https://source.com/')
        expect(result).toContain('<meta property="og:url" content="https://source.com/">')
      })

      it('includes og:image when provided', () => {
        const tags = createMetaTags({
          og: {
            title: undefined,
            description: undefined,
            type: undefined,
            url: undefined,
            image: 'https://example.com/image.jpg',
            imageAlt: undefined,
            siteName: undefined,
            locale: undefined,
          }
        })
        const result = generateDefaultTags(tags)
        expect(result).toContain('<meta property="og:image" content="https://example.com/image.jpg">')
      })

      it('includes og:image:alt when og:image and imageAlt are provided', () => {
        const tags = createMetaTags({
          og: {
            title: undefined,
            description: undefined,
            type: undefined,
            url: undefined,
            image: 'https://example.com/image.jpg',
            imageAlt: 'Alt text for image',
            siteName: undefined,
            locale: undefined,
          }
        })
        const result = generateDefaultTags(tags)
        expect(result).toContain('<meta property="og:image:alt" content="Alt text for image">')
      })

      it('omits og:image:alt when imageAlt is missing', () => {
        const tags = createMetaTags({
          og: {
            title: undefined,
            description: undefined,
            type: undefined,
            url: undefined,
            image: 'https://example.com/image.jpg',
            imageAlt: undefined,
            siteName: undefined,
            locale: undefined,
          }
        })
        const result = generateDefaultTags(tags)
        expect(result).not.toContain('og:image:alt')
      })

      it('includes og:site_name when provided', () => {
        const tags = createMetaTags({
          og: {
            title: undefined,
            description: undefined,
            type: undefined,
            url: undefined,
            image: undefined,
            imageAlt: undefined,
            siteName: 'Example Site',
            locale: undefined,
          }
        })
        const result = generateDefaultTags(tags)
        expect(result).toContain('<meta property="og:site_name" content="Example Site">')
      })
    })

    describe('Twitter Card tags', () => {
      it('includes Twitter section comment', () => {
        const tags = createMetaTags()
        const result = generateDefaultTags(tags)
        expect(result).toContain('<!-- Twitter -->')
      })

      it('defaults twitter:card to summary_large_image', () => {
        const tags = createMetaTags()
        const result = generateDefaultTags(tags)
        expect(result).toContain('<meta name="twitter:card" content="summary_large_image">')
      })

      it('uses provided twitter:card', () => {
        const tags = createMetaTags({
          twitter: {
            card: 'summary',
            site: undefined,
            creator: undefined,
            title: undefined,
            description: undefined,
            image: undefined,
            imageAlt: undefined,
          }
        })
        const result = generateDefaultTags(tags)
        expect(result).toContain('<meta name="twitter:card" content="summary">')
      })

      it('includes twitter:site when provided', () => {
        const tags = createMetaTags({
          twitter: {
            card: undefined,
            site: '@example',
            creator: undefined,
            title: undefined,
            description: undefined,
            image: undefined,
            imageAlt: undefined,
          }
        })
        const result = generateDefaultTags(tags)
        expect(result).toContain('<meta name="twitter:site" content="@example">')
      })

      it('includes twitter:creator when provided', () => {
        const tags = createMetaTags({
          twitter: {
            card: undefined,
            site: undefined,
            creator: '@author',
            title: undefined,
            description: undefined,
            image: undefined,
            imageAlt: undefined,
          }
        })
        const result = generateDefaultTags(tags)
        expect(result).toContain('<meta name="twitter:creator" content="@author">')
      })

      it('uses twitter:title with fallback chain', () => {
        // Test twitter:title
        const tags1 = createMetaTags({
          twitter: {
            card: undefined,
            site: undefined,
            creator: undefined,
            title: 'Twitter Title',
            description: undefined,
            image: undefined,
            imageAlt: undefined,
          }
        })
        expect(generateDefaultTags(tags1)).toContain('<meta name="twitter:title" content="Twitter Title">')

        // Test fallback to og:title
        const tags2 = createMetaTags({
          og: {
            title: 'OG Title',
            description: undefined,
            type: undefined,
            url: undefined,
            image: undefined,
            imageAlt: undefined,
            siteName: undefined,
            locale: undefined,
          }
        })
        expect(generateDefaultTags(tags2)).toContain('<meta name="twitter:title" content="OG Title">')
      })

      it('includes twitter:image from twitter or falls back to og:image', () => {
        // Test twitter:image
        const tags1 = createMetaTags({
          twitter: {
            card: undefined,
            site: undefined,
            creator: undefined,
            title: undefined,
            description: undefined,
            image: 'https://example.com/twitter.jpg',
            imageAlt: undefined,
          }
        })
        expect(generateDefaultTags(tags1)).toContain('<meta name="twitter:image" content="https://example.com/twitter.jpg">')

        // Test fallback to og:image
        const tags2 = createMetaTags({
          og: {
            title: undefined,
            description: undefined,
            type: undefined,
            url: undefined,
            image: 'https://example.com/og.jpg',
            imageAlt: undefined,
            siteName: undefined,
            locale: undefined,
          }
        })
        expect(generateDefaultTags(tags2)).toContain('<meta name="twitter:image" content="https://example.com/og.jpg">')
      })

      it('includes twitter:image:alt with fallback chain', () => {
        const tags = createMetaTags({
          og: {
            title: undefined,
            description: undefined,
            type: undefined,
            url: undefined,
            image: 'https://example.com/og.jpg',
            imageAlt: 'OG Alt',
            siteName: undefined,
            locale: undefined,
          }
        })
        const result = generateDefaultTags(tags)
        expect(result).toContain('<meta name="twitter:image:alt" content="OG Alt">')
      })
    })

    describe('HTML escaping', () => {
      it('escapes ampersands', () => {
        const tags = createMetaTags({ title: 'Title & Subtitle' })
        const result = generateDefaultTags(tags)
        expect(result).toContain('<title>Title &amp; Subtitle</title>')
      })

      it('escapes less than signs', () => {
        const tags = createMetaTags({ title: 'Title < Other' })
        const result = generateDefaultTags(tags)
        expect(result).toContain('<title>Title &lt; Other</title>')
      })

      it('escapes greater than signs', () => {
        const tags = createMetaTags({ title: 'Title > Other' })
        const result = generateDefaultTags(tags)
        expect(result).toContain('<title>Title &gt; Other</title>')
      })

      it('escapes double quotes', () => {
        const tags = createMetaTags({ description: 'Said "Hello"' })
        const result = generateDefaultTags(tags)
        expect(result).toContain('content="Said &quot;Hello&quot;"')
      })

      it('escapes single quotes', () => {
        const tags = createMetaTags({ description: "It's great" })
        const result = generateDefaultTags(tags)
        expect(result).toContain("content=\"It&#039;s great\"")
      })

      it('escapes multiple special characters', () => {
        const tags = createMetaTags({ title: '<script>alert("XSS")</script>' })
        const result = generateDefaultTags(tags)
        expect(result).toContain('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;')
      })
    })

    describe('complete output structure', () => {
      it('generates valid HTML structure with all tags', () => {
        const tags = createMetaTags({
          title: 'Test Page',
          description: 'Test description',
          canonical: 'https://example.com/test',
          favicon: '/favicon.png',
          og: {
            title: 'OG Test Title',
            description: 'OG Test Description',
            type: 'article',
            url: 'https://example.com/test',
            image: 'https://example.com/image.jpg',
            imageAlt: 'Test image',
            siteName: 'Test Site',
            locale: undefined,
          },
          twitter: {
            card: 'summary_large_image',
            site: '@testsite',
            creator: '@testauthor',
            title: 'Twitter Test Title',
            description: 'Twitter Test Description',
            image: 'https://example.com/twitter.jpg',
            imageAlt: 'Twitter image',
          }
        })

        const result = generateDefaultTags(tags)

        // Check all expected tags are present
        expect(result).toContain('<title>OG Test Title</title>')
        expect(result).toContain('<meta name="description"')
        expect(result).toContain('<meta name="viewport"')
        expect(result).toContain('<link rel="canonical"')
        expect(result).toContain('<link rel="icon"')
        expect(result).toContain('<meta property="og:type"')
        expect(result).toContain('<meta property="og:url"')
        expect(result).toContain('<meta property="og:title"')
        expect(result).toContain('<meta property="og:description"')
        expect(result).toContain('<meta property="og:image"')
        expect(result).toContain('<meta property="og:image:alt"')
        expect(result).toContain('<meta property="og:site_name"')
        expect(result).toContain('<meta name="twitter:card"')
        expect(result).toContain('<meta name="twitter:site"')
        expect(result).toContain('<meta name="twitter:creator"')
        expect(result).toContain('<meta name="twitter:title"')
        expect(result).toContain('<meta name="twitter:description"')
        expect(result).toContain('<meta name="twitter:image"')
        expect(result).toContain('<meta name="twitter:image:alt"')
      })

      it('uses newline separators between lines', () => {
        const tags = createMetaTags({ title: 'Test' })
        const result = generateDefaultTags(tags)
        expect(result.split('\n').length).toBeGreaterThan(1)
      })
    })
  })
})
