# Phase 2 Implementation Status

**Last Updated:** February 4, 2026
**Status:** 🟡 Partial - Backend Complete, Frontend Pending

---

## Overview

| Component | Status | Priority | Notes |
|-----------|--------|----------|-------|
| **Backend (Server)** | ✅ Complete | - | Ready for testing |
| **Frontend (Client)** | ❌ Not Started | High | Required for Phase 2 |
| **Security Tests** | ❌ Not Started | High | Must complete before deploy |
| **Configuration** | 🟡 Partial | High | CORS needs adding |
| **Documentation** | ✅ Complete | - | Comprehensive |

---

## ✅ COMPLETED: Backend/Server Components

### 1. Server Proxy Endpoint ✅
**File:** `server/api/fetch.post.ts`

**Features implemented:**
- ✅ POST endpoint at `/api/fetch`
- ✅ Request validation (JSON structure, URL field, no extra fields)
- ✅ Optional bearer token authentication (dormant)
- ✅ SSRF protection before fetch
- ✅ Manual redirect handling with validation
- ✅ Response size limit (1MB)
- ✅ Timeout enforcement (10s)
- ✅ Script tag stripping (except JSON-LD)
- ✅ Error sanitization
- ✅ Netlify rate limiting config export
- ✅ Structured logging integration

**Testing needed:**
- [ ] Manual test with curl
- [ ] Test SSRF blocking
- [ ] Test rate limiting
- [ ] Test error responses
- [ ] Test redirect handling

---

### 2. Security Utilities ✅
**File:** `server/utils/proxy.ts`

**Functions implemented:**
- ✅ `validateUrl()` - DNS resolution + private IP blocking
- ✅ `isPrivateIp()` - Checks all RFC 1918, loopback, link-local, reserved ranges
- ✅ `extractHead()` - Strips scripts, keeps JSON-LD
- ✅ `extractBodySnippet()` - First 1KB for SPA detection
- ✅ `sanitizeErrorMessage()` - Prevents info leakage

**IP ranges blocked:**
- ✅ 10.0.0.0/8 (private)
- ✅ 172.16.0.0/12 (private)
- ✅ 192.168.0.0/16 (private)
- ✅ 127.0.0.0/8 (loopback)
- ✅ 169.254.0.0/16 (link-local + cloud metadata)
- ✅ 0.0.0.0/8, 224.0.0.0/4, 240.0.0.0/4 (reserved)

**Testing needed:**
- [ ] Unit tests for IP validation
- [ ] Unit tests for URL validation
- [ ] Unit tests for HTML extraction

---

### 3. Logging System ✅
**File:** `server/utils/logger.ts`

**Features implemented:**
- ✅ Structured JSON logging (production)
- ✅ Human-readable logging (development)
- ✅ Request ID generation and correlation
- ✅ URL sanitization (redact sensitive params)
- ✅ Log levels (info, warn, error, security)
- ✅ Success/error/blocked event logging
- ✅ Client IP extraction
- ✅ User agent extraction and truncation

**Testing needed:**
- [ ] Verify logs appear in Netlify dashboard
- [ ] Test sensitive parameter redaction
- [ ] Test log format in production vs dev

---

### 4. Documentation ✅

**Created:**
- ✅ `security-testing-guide.md` - 13 sections, comprehensive test cases
- ✅ `phase-2-security-checklist.md` - Quick reference, incident response
- ✅ `logging-and-monitoring.md` - Logging strategies, Netlify vs external

---

## ❌ MISSING: Frontend/Client Components

### 1. Client Composables (Critical - Must Implement)

#### `app/composables/useFetchProxy.ts` ❌
**Purpose:** Handle URL fetching via proxy

**Required features:**
```typescript
export function useFetchProxy() {
  // Call /api/fetch or external proxy URL
  // Handle response parsing
  // Map errors to user-friendly messages
  // Return parsed MetaTags

  return {
    fetchUrl: async (url: string) => Promise<MetaTags>,
    isLoading: Ref<boolean>,
    error: Ref<string | null>
  }
}
```

**Implementation notes:**
- Use `$fetch` from Nuxt
- Check `metapeekConfig.proxy.externalUrl`
- If null, use `/api/fetch`
- If set, use external URL
- Handle all error codes (400, 429, 504, etc.)

---

#### `app/composables/useFetchStatus.ts` ❌
**Purpose:** State machine for fetch lifecycle

**Required state types:**
```typescript
type FetchState =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'fetching'; startedAt: number; url: string }
  | { status: 'parsing' }
  | { status: 'complete'; timing: number }
  | { status: 'error'; code: string; message: string; suggestion: string }
```

**Required features:**
- Track elapsed time during fetch (update every 100ms)
- Progressive status messages:
  - 0-5s: "Fetching..."
  - 5-8s: "Still fetching... target site may be slow" (amber)
  - 8-10s: "Waiting for response... will timeout at 10s" (red)
- Map error codes to messages (from design doc section 5, lines 292-333)
- Accessible announcements (aria-live)

**Error code mapping:**
```typescript
const ERROR_MESSAGES = {
  TIMEOUT: 'Request timed out...',
  RATE_LIMITED: 'Rate limit reached...',
  INVALID_URL: 'That doesn\'t look like a valid URL...',
  SSRF_BLOCKED: 'That URL can\'t be fetched...',
  FETCH_FAILED: 'Could not fetch that URL...',
  DNS_FAILED: 'Could not resolve that hostname...',
  RESPONSE_TOO_LARGE: 'Response was too large...',
  PARSE_ERROR: 'Couldn\'t parse the response...',
  SERVER_ERROR: 'MetaPeek encountered an internal error...',
  NETWORK_ERROR: 'Network request failed...'
}
```

---

#### `app/composables/useSpaDetection.ts` ❌
**Purpose:** Detect single-page applications

**Required interface:**
```typescript
interface SPADetectionResult {
  isSPA: boolean
  confidence: 'low' | 'medium' | 'high'
  score: number
  signals: string[]
}

export function useSpaDetection() {
  return {
    detectSpa: (bodySnippet: string, tags: MetaTags) => SPADetectionResult
  }
}
```

**Scoring system (from design doc):**
- +3: Body has single mount div (`<div id="app">`, `<div id="__nuxt">`, `<div id="root">`)
- +2: Title is generic (Vite App, React App, Vue App, Loading...)
- +2: No OG tags but has large JS bundles (script tags with src)
- +1: Body text content < 100 chars (excluding script/style tags)
- +1: Framework-specific classes (ng-app, v-app, etc.)

**Thresholds:**
- score < 5: `isSPA: false`
- score 5-6: `isSPA: true, confidence: 'medium'`
- score >= 7: `isSPA: true, confidence: 'high'`

---

### 2. UI Updates to `app/pages/index.vue` (Critical - Must Implement)

#### Input Section Updates ❌

**Add URL input mode:**
- [ ] Tab/toggle to switch between "Paste HTML" and "Fetch URL"
- [ ] URL input field with validation
- [ ] Detect URL format automatically (starts with http/https)
- [ ] Manual "Fetch" button (never auto-fetch, even with ?url=)

**Status bar (appears during fetch):**
- [ ] Position: directly below input field
- [ ] Shows: URL being fetched (truncated to 60 chars)
- [ ] Shows: Elapsed time counter (updates every 100ms)
- [ ] Shows: Progressive status messages (neutral → amber @ 5s → red @ 8s)
- [ ] Accessible: `role="status"` and `aria-live="polite"`

**Skeleton placeholders:**
- [ ] Show during fetch state
- [ ] Static shapes (not animated) for preview cards
- [ ] Use `aria-hidden="true"` (screen reader ignores)

---

#### SPA Warning Banner ❌

**When to show:**
- SPA detected with confidence >= 'medium'

**Design:**
- [ ] Prominent warning banner above preview cards
- [ ] Clear, actionable message (from design doc line 123):
  > "⚠ This page appears to be a single-page application. The HTML returned by the server contains no meaningful content or meta tags. Social platforms and search engines fetch HTML without executing JavaScript — they will see an empty page. Consider server-side rendering (SSR), static site generation (SSG), or injecting meta tags via server middleware."
- [ ] Explain WHY it's a problem
- [ ] Suggest solutions (SSR, SSG, meta tag injection)
- [ ] Show confidence level and signals
- [ ] Accessible: `role="alert"` for immediate announcement

---

#### Shareable URLs ❌

**Feature:** Support `?url=https://example.com` in URL

**Behavior:**
- [ ] Parse `url` query parameter on page load
- [ ] Pre-fill URL input field
- [ ] Switch to "Fetch URL" tab
- [ ] **DO NOT** auto-fetch (requires manual click)
- [ ] Why: Prevents bots/crawlers from triggering proxy invocations

**Implementation:**
```typescript
const route = useRoute()

onMounted(() => {
  const urlParam = route.query.url
  if (urlParam && typeof urlParam === 'string') {
    inputMode.value = 'url'
    inputUrl.value = urlParam
    // DO NOT call fetch automatically
  }
})
```

---

## 🟡 PARTIAL: Configuration

### CORS Configuration (Must Add)

**Current state:** ❌ Not configured in `nuxt.config.ts`

**Required:**

```typescript
// nuxt.config.ts
import metapeekConfig from './metapeek.config'

export default defineNuxtConfig({
  // ... existing config

  routeRules: {
    '/api/**': {
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': metapeekConfig.cors.allowedOrigins[0],
        'Access-Control-Allow-Methods': metapeekConfig.cors.allowedMethods.join(', '),
        'Access-Control-Allow-Headers': metapeekConfig.cors.allowedHeaders.join(', '),
      }
    }
  }
})
```

**For multiple origins (future):**
- Use server middleware to dynamically reflect Origin header
- Check against `metapeekConfig.cors.allowedOrigins` array

---

### Netlify Configuration

**Current state:** Unknown - need to verify `netlify.toml`

**Required settings:**
```toml
[build]
  command = "yarn build"
  publish = ".output/public"

[functions]
  node_bundler = "esbuild"

# Rate limiting handled by export config in fetch.post.ts
```

**Before deploy:**
- [ ] Request 26-second function timeout from Netlify support
- [ ] Verify rate limit config appears in deploy log

---

## ❌ MISSING: Tests

### Security Tests (Critical - Must Complete)

**Required test files:**

#### `tests/security/ssrf.test.ts` ❌
```typescript
// Unit tests for SSRF protection
- Test isPrivateIp() for all blocked ranges
- Test validateUrl() for localhost, metadata, private IPs
- Test protocol whitelist
```

#### `tests/security/proxy.test.ts` ❌
```typescript
// Unit tests for proxy utilities
- Test extractHead() strips scripts correctly
- Test extractBodySnippet() limits size
- Test sanitizeErrorMessage() removes sensitive info
```

#### `tests/security/integration.test.ts` ❌
```typescript
// Integration tests (requires test server)
- Test actual fetch to public URL (success)
- Test fetch to localhost (blocked)
- Test fetch to 169.254.169.254 (blocked)
- Test timeout behavior
- Test redirect handling
- Test rate limiting
```

---

### SPA Detection Tests ❌

#### `tests/unit/useSpaDetection.test.ts` ❌
```typescript
- Test scoring system
- Test confidence levels
- Test detection signals
- Test edge cases (empty body, no scripts, etc.)
```

---

### E2E Tests ❌

#### `tests/e2e/url-fetching.spec.ts` ❌
```typescript
- Test URL input mode
- Test fetch button
- Test status bar updates
- Test error handling
- Test SPA warning display
- Test shareable URLs
```

---

## Priority Implementation Order

### 🔴 Critical (Must Do Before Deploy)

1. **Add CORS to `nuxt.config.ts`** (5 minutes)
2. **Create `useFetchProxy.ts`** (30 minutes)
3. **Create `useFetchStatus.ts`** (45 minutes)
4. **Create `useSpaDetection.ts`** (30 minutes)
5. **Update `app/pages/index.vue`** (2-3 hours)
   - Add URL input mode
   - Add status bar
   - Add skeleton placeholders
   - Add SPA warning banner
   - Add shareable URL support
6. **Write security tests** (2 hours)
   - SSRF tests
   - Proxy utility tests
7. **Manual testing** (1 hour)
   - Test with real URLs
   - Test SSRF blocking
   - Test rate limiting
   - Test error cases

**Total estimated time:** 7-9 hours

---

### 🟡 Important (Should Do Before Deploy)

1. **Create SPA detection tests** (1 hour)
2. **Create E2E tests for URL fetching** (1 hour)
3. **Request Netlify timeout increase** (5 minutes + wait time)
4. **Verify Netlify rate limit config** (5 minutes after deploy)
5. **Update README with Phase 2 status** (10 minutes)

**Total estimated time:** 2-3 hours

---

### 🟢 Nice to Have (Can Do After Deploy)

1. Better loading animations
2. More detailed SPA detection signals
3. Export logs to external service
4. Analytics dashboard

---

## Implementation Checklist

Copy this to track your progress:

```markdown
## Server (Backend) ✅
- [x] Create server/utils/proxy.ts
- [x] Create server/api/fetch.post.ts
- [x] Create server/utils/logger.ts
- [x] Add Netlify rate limit config export

## Client (Frontend) ❌
- [ ] Add CORS to nuxt.config.ts
- [ ] Create app/composables/useFetchProxy.ts
- [ ] Create app/composables/useFetchStatus.ts
- [ ] Create app/composables/useSpaDetection.ts
- [ ] Update app/pages/index.vue
  - [ ] Add URL input mode (tab/toggle)
  - [ ] Add fetch button
  - [ ] Add status bar with elapsed time
  - [ ] Add skeleton placeholders
  - [ ] Add SPA warning banner
  - [ ] Add shareable URL support (?url=)

## Testing ❌
- [ ] Create tests/security/ssrf.test.ts
- [ ] Create tests/security/proxy.test.ts
- [ ] Create tests/unit/useSpaDetection.test.ts
- [ ] Create tests/e2e/url-fetching.spec.ts
- [ ] Manual testing with curl
- [ ] Test SSRF blocking
- [ ] Test rate limiting
- [ ] Test error handling

## Configuration ❌
- [ ] Request Netlify 26s timeout
- [ ] Verify netlify.toml settings
- [ ] Verify rate limit appears in deploy log
- [ ] Test CORS from different origins

## Documentation ✅
- [x] Security testing guide
- [x] Security checklist
- [x] Logging guide
- [ ] Update README Phase 2 status
```

---

## Quick Start: Next Steps

**To complete Phase 2 implementation:**

1. **Start with CORS** (easiest win):
   ```bash
   # Edit nuxt.config.ts and add routeRules
   ```

2. **Create composables** (order matters):
   ```bash
   # 1. useFetchProxy.ts (calls the API)
   # 2. useFetchStatus.ts (tracks state)
   # 3. useSpaDetection.ts (analyzes response)
   ```

3. **Update UI** (biggest task):
   ```bash
   # Edit app/pages/index.vue
   # Add new sections progressively
   ```

4. **Test security**:
   ```bash
   # Create test files
   yarn test tests/security/
   ```

5. **Manual testing**:
   ```bash
   yarn dev
   # Test with real URLs
   # Test SSRF blocking
   ```

---

## Files to Create (Summary)

**Composables:**
- `app/composables/useFetchProxy.ts`
- `app/composables/useFetchStatus.ts`
- `app/composables/useSpaDetection.ts`

**Tests:**
- `tests/security/ssrf.test.ts`
- `tests/security/proxy.test.ts`
- `tests/unit/useSpaDetection.test.ts`
- `tests/e2e/url-fetching.spec.ts`

**Configuration:**
- Update `nuxt.config.ts` (add CORS)

**UI:**
- Update `app/pages/index.vue` (major changes)

---

## Estimated Completion Time

**If working continuously:** 1-2 days
**If working part-time:** 3-5 days

**Most time-consuming part:** Updating the UI (`index.vue`) with proper state management, status displays, and accessibility.

**Fastest to implement:** CORS configuration, basic composables.

---

**Last Updated:** February 4, 2026
**Next Review:** After composables are created
