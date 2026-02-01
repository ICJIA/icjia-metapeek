# MetaPeek Testing Strategy

This document outlines the testing approach for MetaPeek, organized by component and phase. Given the security-sensitive nature of the proxy and the accessibility requirements, testing is not optional.

---

## Testing Principles

1. **Security-critical code requires explicit tests.** The SSRF validation, rate limiting, and input validation must have comprehensive unit tests before the proxy goes live.

2. **Accessibility is tested manually and automatically.** Automated tools catch obvious issues; manual testing with real assistive technologies catches the rest.

3. **Preview accuracy is tested visually.** The preview components should be compared side-by-side with actual platform renders using known test cases.

4. **Error states are tested explicitly.** Every error code path should have a test case that verifies the correct message and suggestion are shown.

---

## Phase 1: Client-Side Testing

### Unit Tests (Vitest)

#### `useMetaParser.ts`
```typescript
describe('useMetaParser', () => {
  test('extracts title from valid HTML', () => {
    const html = '<html><head><title>Test Page</title></head></html>'
    const result = parseMetaTags(html)
    expect(result.title).toBe('Test Page')
  })

  test('extracts OG tags', () => {
    const html = `
      <head>
        <meta property="og:title" content="OG Title">
        <meta property="og:description" content="OG Description">
        <meta property="og:image" content="https://example.com/image.jpg">
      </head>
    `
    const result = parseMetaTags(html)
    expect(result.og.title).toBe('OG Title')
    expect(result.og.description).toBe('OG Description')
    expect(result.og.image).toBe('https://example.com/image.jpg')
  })

  test('handles malformed HTML gracefully', () => {
    const html = '<head><title>Test<meta property="og:title" content="OG">'
    const result = parseMetaTags(html)
    expect(result.title).toBe('Test')
    expect(result.og.title).toBe('OG')
  })

  test('handles missing tags', () => {
    const html = '<html><head></head></html>'
    const result = parseMetaTags(html)
    expect(result.title).toBeUndefined()
    expect(result.og.title).toBeUndefined()
  })

  test('handles duplicate meta tags (last wins)', () => {
    const html = `
      <head>
        <meta property="og:title" content="First">
        <meta property="og:title" content="Second">
      </head>
    `
    const result = parseMetaTags(html)
    expect(result.og.title).toBe('Second')
  })

  test('extracts JSON-LD structured data', () => {
    const html = `
      <head>
        <script type="application/ld+json">
          {"@context": "https://schema.org", "@type": "Article", "headline": "Test"}
        </script>
      </head>
    `
    const result = parseMetaTags(html)
    expect(result.structuredData).toBeDefined()
    expect(result.structuredData[0]['@type']).toBe('Article')
  })

  test('handles invalid JSON-LD gracefully', () => {
    const html = `
      <head>
        <script type="application/ld+json">
          {invalid json}
        </script>
      </head>
    `
    const result = parseMetaTags(html)
    expect(result.structuredData).toEqual([])
  })
})
```

#### `useDiagnostics.ts`
```typescript
describe('useDiagnostics', () => {
  test('flags missing OG tags as red', () => {
    const tags = { title: 'Test' }
    const diagnostics = generateDiagnostics(tags)
    expect(diagnostics.ogTags.status).toBe('red')
    expect(diagnostics.ogTags.message).toContain('Open Graph tags missing')
  })

  test('flags missing Twitter card as yellow when OG present', () => {
    const tags = {
      og: { title: 'Test', description: 'Desc', image: 'https://example.com/img.jpg' }
    }
    const diagnostics = generateDiagnostics(tags)
    expect(diagnostics.twitterCard.status).toBe('yellow')
    expect(diagnostics.twitterCard.message).toContain('Twitter Card')
  })

  test('flags relative OG image URL as yellow', () => {
    const tags = {
      og: { image: '/images/test.jpg' }
    }
    const diagnostics = generateDiagnostics(tags)
    expect(diagnostics.ogImage.status).toBe('yellow')
    expect(diagnostics.ogImage.message).toContain('absolute URL')
  })

  test('flags title over character limit', () => {
    const tags = {
      title: 'A'.repeat(70)
    }
    const diagnostics = generateDiagnostics(tags)
    expect(diagnostics.title.status).toBe('yellow')
    expect(diagnostics.title.message).toContain('exceeds')
  })

  test('all green when tags are optimal', () => {
    const tags = {
      title: 'Perfect Title',
      description: 'Perfect description under 160 chars',
      og: {
        title: 'Perfect OG Title',
        description: 'Perfect OG description',
        image: 'https://example.com/image.jpg',
        url: 'https://example.com'
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Twitter Title',
        description: 'Twitter description'
      }
    }
    const diagnostics = generateDiagnostics(tags)
    expect(diagnostics.overall.status).toBe('green')
  })
})
```

### Component Tests (Vitest + Testing Library)

Test preview components render correctly with various inputs:

```typescript
describe('PreviewGoogle', () => {
  test('truncates title at 60 characters', () => {
    const { getByText } = render(PreviewGoogle, {
      props: { title: 'A'.repeat(80), description: 'Test', url: 'https://example.com' }
    })
    const titleElement = getByText(/A{60}/)
    expect(titleElement.textContent.length).toBeLessThanOrEqual(60)
  })

  test('displays full URL in green', () => {
    const { getByText } = render(PreviewGoogle, {
      props: { title: 'Test', description: 'Test', url: 'https://example.com/path' }
    })
    expect(getByText('https://example.com/path')).toBeDefined()
  })
})

describe('PreviewFacebook', () => {
  test('shows 1.91:1 aspect ratio for image', () => {
    const { container } = render(PreviewFacebook, {
      props: { title: 'Test', description: 'Test', image: 'https://example.com/img.jpg' }
    })
    const img = container.querySelector('img')
    // Check aspect ratio is enforced via CSS
    expect(img?.style.aspectRatio).toBe('1.91 / 1')
  })
})
```

### Manual Testing Checklist

- [ ] Paste valid HTML with all tags → all previews render correctly
- [ ] Paste HTML with missing OG tags → diagnostics show red status
- [ ] Paste HTML with very long title → preview shows truncation
- [ ] Paste malformed HTML → parser doesn't crash
- [ ] Test with real HTML from: Facebook, Twitter, GitHub, New York Times
- [ ] Compare rendered previews with actual social platform previews
- [ ] Test code generator: copy output, paste into test HTML file, verify validity

---

## Phase 2: Server-Side Testing

### Security Unit Tests (Critical)

#### `validateUrl()` - SSRF Protection
```typescript
describe('validateUrl', () => {
  test('blocks localhost', async () => {
    const result = await validateUrl('http://localhost:3000')
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('Internal')
  })

  test('blocks 127.0.0.1', async () => {
    const result = await validateUrl('http://127.0.0.1')
    expect(result.ok).toBe(false)
  })

  test('blocks AWS metadata endpoint', async () => {
    const result = await validateUrl('http://169.254.169.254/latest/meta-data/')
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('private IP')
  })

  test('blocks 10.0.0.0/8 private network', async () => {
    const result = await validateUrl('http://10.0.0.1')
    expect(result.ok).toBe(false)
  })

  test('blocks 192.168.0.0/16 private network', async () => {
    const result = await validateUrl('http://192.168.1.1')
    expect(result.ok).toBe(false)
  })

  test('blocks 172.16.0.0/12 private network', async () => {
    const result = await validateUrl('http://172.16.0.1')
    expect(result.ok).toBe(false)
  })

  test('blocks GCP metadata', async () => {
    const result = await validateUrl('http://metadata.google.internal')
    expect(result.ok).toBe(false)
  })

  test('rejects URLs over max length', async () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(3000)
    const result = await validateUrl(longUrl)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('too long')
  })

  test('allows valid public HTTPS URL', async () => {
    const result = await validateUrl('https://example.com')
    expect(result.ok).toBe(true)
  })

  test('blocks HTTP in production', async () => {
    process.env.NODE_ENV = 'production'
    const result = await validateUrl('http://example.com')
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('Protocol not allowed')
  })

  test('allows HTTP in development when configured', async () => {
    process.env.NODE_ENV = 'development'
    const result = await validateUrl('http://localhost:3000')
    // Should still be blocked by hostname check
    expect(result.ok).toBe(false)
  })
})
```

#### `isPrivateIp()`
```typescript
describe('isPrivateIp', () => {
  test('identifies 10.x.x.x as private', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true)
    expect(isPrivateIp('10.255.255.255')).toBe(true)
  })

  test('identifies 192.168.x.x as private', () => {
    expect(isPrivateIp('192.168.0.1')).toBe(true)
    expect(isPrivateIp('192.168.255.255')).toBe(true)
  })

  test('identifies 172.16-31.x.x as private', () => {
    expect(isPrivateIp('172.16.0.1')).toBe(true)
    expect(isPrivateIp('172.31.255.255')).toBe(true)
  })

  test('identifies 127.x.x.x as loopback', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true)
    expect(isPrivateIp('127.255.255.255')).toBe(true)
  })

  test('identifies 169.254.x.x as link-local', () => {
    expect(isPrivateIp('169.254.169.254')).toBe(true)
  })

  test('identifies public IPs as not private', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false)
    expect(isPrivateIp('1.1.1.1')).toBe(false)
    expect(isPrivateIp('93.184.216.34')).toBe(false) // example.com
  })
})
```

#### `extractHead()` - Script Stripping
```typescript
describe('extractHead', () => {
  test('extracts head content', () => {
    const html = '<html><head><title>Test</title></head><body></body></html>'
    const result = extractHead(html)
    expect(result).toContain('<title>Test</title>')
  })

  test('strips executable script tags', () => {
    const html = `
      <head>
        <title>Test</title>
        <script>alert('xss')</script>
        <script src="evil.js"></script>
      </head>
    `
    const result = extractHead(html)
    expect(result).not.toContain('alert')
    expect(result).not.toContain('evil.js')
    expect(result).toContain('<title>Test</title>')
  })

  test('preserves JSON-LD script tags', () => {
    const html = `
      <head>
        <script type="application/ld+json">{"@type": "Article"}</script>
      </head>
    `
    const result = extractHead(html)
    expect(result).toContain('application/ld+json')
    expect(result).toContain('@type')
  })
})
```

### Integration Tests

#### Rate Limiting
```typescript
describe('Rate limiting', () => {
  test('allows requests under limit', async () => {
    for (let i = 0; i < 30; i++) {
      const response = await fetch('/api/fetch', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com' })
      })
      expect(response.status).toBe(200)
    }
  })

  test('blocks 31st request', async () => {
    // Make 30 requests
    for (let i = 0; i < 30; i++) {
      await fetch('/api/fetch', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com' })
      })
    }
    
    // 31st should be rate limited
    const response = await fetch('/api/fetch', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com' })
    })
    expect(response.status).toBe(429)
  })
})
```

#### Redirect Chain Tracking
```typescript
describe('Redirect chain', () => {
  test('tracks single redirect', async () => {
    const response = await fetch('/api/fetch', {
      method: 'POST',
      body: JSON.stringify({ url: 'http://example.com' }) // redirects to https
    })
    const data = await response.json()
    expect(data.redirectChain).toHaveLength(1)
    expect(data.redirectChain[0].from).toBe('http://example.com')
    expect(data.redirectChain[0].to).toContain('https://')
  })

  test('stops at max redirects', async () => {
    // Use a URL known to have many redirects
    const response = await fetch('/api/fetch', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://test-redirect-chain.example' })
    })
    const data = await response.json()
    expect(data.redirectChain.length).toBeLessThanOrEqual(5)
  })
})
```

### Error State Testing

Test every error code path:

```typescript
describe('Error handling', () => {
  test('timeout returns correct error', async () => {
    const response = await fetch('/api/fetch', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://httpstat.us/200?sleep=15000' })
    })
    const data = await response.json()
    expect(data.ok).toBe(false)
    expect(data.error).toContain('timeout')
  })

  test('invalid URL returns correct error', async () => {
    const response = await fetch('/api/fetch', {
      method: 'POST',
      body: JSON.stringify({ url: 'not-a-url' })
    })
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.message).toContain('Invalid URL')
  })

  test('non-existent domain returns DNS error', async () => {
    const response = await fetch('/api/fetch', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://this-domain-does-not-exist-12345.com' })
    })
    const data = await response.json()
    expect(data.ok).toBe(false)
  })
})
```

### Manual Integration Testing

- [ ] Deploy to Netlify staging/preview
- [ ] Test with curl from external IP
- [ ] Verify CORS headers with browser fetch from different origin
- [ ] Test rate limit by scripting 31 requests
- [ ] Test with slow-responding server (use httpstat.us)
- [ ] Test with large response (use service that returns >1MB)
- [ ] Verify Netlify function logs show invocations
- [ ] Check Netlify dashboard invocation count

---

## Accessibility Testing

### Automated Tests

Run on every component and page:

```bash
# Install axe-core
npm install --save-dev @axe-core/playwright

# Run Lighthouse CI
npm install --save-dev @lhci/cli
```

```typescript
// Example Playwright + axe test
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('should not have any automatically detectable accessibility issues', async ({ page }) => {
  await page.goto('http://localhost:3000')
  
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  
  expect(accessibilityScanResults.violations).toEqual([])
})
```

### Manual Accessibility Testing

Required before Phase 1 completion:

#### Keyboard Navigation
- [ ] Tab through entire page in logical order
- [ ] Verify focus indicators visible on all interactive elements
- [ ] Test all functionality using keyboard only (no mouse)
- [ ] Enter key submits forms
- [ ] Escape key dismisses modals/toasts
- [ ] Arrow keys work in any custom widgets

#### Screen Reader Testing (test with at least 2)
- [ ] **NVDA (Windows):** Test full workflow (paste HTML, review results)
- [ ] **JAWS (Windows):** Verify status announcements
- [ ] **VoiceOver (macOS):** Test fetch workflow with status updates
- [ ] All images have appropriate alt text or are marked decorative
- [ ] Form labels are announced correctly
- [ ] Status changes announced (fetching → complete)
- [ ] Error messages announced immediately
- [ ] Dynamic content announced (preview cards loading)

#### Color and Contrast
- [ ] Run Lighthouse contrast audit (must pass)
- [ ] Use browser DevTools color picker to verify 4.5:1 ratio
- [ ] Test status indicators without color (ensure icon + text convey meaning)
- [ ] Test in grayscale mode (macOS: Cmd+Opt+F5 → Color Filters)

#### Zoom and Text Scaling
- [ ] Test at 200% browser zoom - no content cut off
- [ ] Test with browser text-only zoom - layout doesn't break
- [ ] Test at 400% zoom - still functional (optional AA+)

#### Focus Management
- [ ] When preview results load, does focus move logically?
- [ ] When error occurs, does focus move to error message?
- [ ] When modal/toast appears, is focus trapped appropriately?

---

## Visual/Manual Testing

### Preview Accuracy

Compare MetaPeek previews with actual platform renders using these test URLs:

- [ ] **GitHub:** `https://github.com/torvalds/linux` - has complete OG tags
- [ ] **New York Times:** Any article - good example of news meta tags
- [ ] **Dev.to:** Any article - developer-focused site
- [ ] **Create React App default:** Test SPA detection
- [ ] **Netlify landing page:** Well-optimized tags
- [ ] **Personal blog with missing tags:** Test diagnostic warnings

For each, verify:
1. MetaPeek preview matches actual Facebook share preview
2. MetaPeek preview matches actual Twitter card
3. MetaPeek preview matches Slack unfurl
4. Character truncation happens at correct limits

### Cross-Browser Testing

Test on:
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

---

## Performance Testing

### Client-Side Performance
```typescript
describe('Performance', () => {
  test('parsing completes under 100ms', () => {
    const html = generateLargeHtmlSample() // ~500KB HTML
    const start = performance.now()
    const result = parseMetaTags(html)
    const duration = performance.now() - start
    expect(duration).toBeLessThan(100)
  })
})
```

### Lighthouse Audits
- [ ] Performance score > 90
- [ ] Accessibility score = 100
- [ ] Best Practices score > 90
- [ ] SEO score > 90

---

## Test Coverage Goals

- **Security utilities:** 100% coverage (critical)
- **Parser logic:** > 90% coverage
- **Composables:** > 80% coverage
- **Components:** > 70% coverage (focus on logic, not pure UI)

Run coverage:
```bash
npm run test:coverage
```

---

## Continuous Testing

### Pre-Commit Hooks
```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run lint && npm run test:unit"
    }
  }
}
```

### CI/CD Pipeline
```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run lint
      - run: npm run test:unit
      - run: npm run test:accessibility
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## When Tests Fail

1. **Security test failure:** Do not proceed until fixed. SSRF vulnerabilities are not acceptable.
2. **Accessibility test failure:** Do not merge until fixed. WCAG 2.1 AA is mandatory.
3. **Unit test failure:** Fix before merging to main branch.
4. **Integration test failure:** Investigate immediately - may indicate infrastructure issue.

---

## Testing Resources

- **WCAG 2.1 Guidelines:** https://www.w3.org/WAI/WCAG21/quickref/
- **axe DevTools:** https://www.deque.com/axe/devtools/
- **Lighthouse:** Built into Chrome DevTools
- **NVDA:** https://www.nvaccess.org/download/
- **Color Contrast Analyzer:** https://www.tpgi.com/color-contrast-checker/
- **WAVE:** https://wave.webaim.org/
