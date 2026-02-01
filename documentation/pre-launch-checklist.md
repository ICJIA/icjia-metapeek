# MetaPeek Pre-Launch Checklist

This checklist must be completed before deploying MetaPeek to production. Items are organized by phase and priority.

## Phase 1 (Client-Side MVP) - Required Before Phase 2

### Development Setup
- [ ] Initialize Nuxt 3 project with latest stable version
- [ ] Install and configure Nuxt UI (latest version)
- [ ] Install TypeScript and configure `tsconfig.json`
- [ ] Create `metapeek.config.ts` with all configuration values
- [ ] Set up ESLint and Prettier
- [ ] Initialize git repository
- [ ] Create `.gitignore` (exclude `node_modules`, `.nuxt`, `.output`, `.env`)
- [ ] Lock dependencies in `package-lock.json`

### Core Functionality
- [ ] Implement `useMetaParser.ts` composable (client-side, DOMParser)
- [ ] Build all four preview components (Google, Facebook, Twitter, Slack)
- [ ] Create diagnostics panel with scoring system
- [ ] Implement code generator with editable output
- [ ] Test with variety of HTML samples (valid, malformed, missing tags)

### Accessibility (WCAG 2.1 AA)
- [ ] All interactive elements keyboard accessible
- [ ] Logical tab order throughout application
- [ ] Visible focus indicators on all focusable elements (test with keyboard-only navigation)
- [ ] Screen reader announces status changes (test with NVDA/JAWS/VoiceOver)
- [ ] Color contrast meets 4.5:1 minimum (verify with contrast checker)
- [ ] All status indicators use icon + text + color (not color alone)
- [ ] All form inputs have associated labels
- [ ] Run axe DevTools scan - zero violations
- [ ] Run Lighthouse accessibility audit - score 100

### Testing
- [ ] Test paste-HTML workflow with various input types
- [ ] Verify character limit warnings display correctly
- [ ] Confirm preview cards match platform rendering
- [ ] Test with screen magnification (200% zoom)
- [ ] Test on mobile viewport

### Performance
- [ ] Client-side parsing completes in under 100ms (measure with browser DevTools)
- [ ] No layout shifts during content load (check CLS metric)
- [ ] First contentful paint under 1 second

---

## Phase 2 (Live URL Fetching) - Required Before Production

### Infrastructure Setup
- [ ] Request 26-second function timeout from Netlify support (if on Pro plan)
- [ ] Verify timeout increase confirmed before continuing Phase 2 development
- [ ] Configure Netlify rate limiting in `server/api/fetch.post.ts`
- [ ] Set up CORS configuration in `nuxt.config.ts`
- [ ] Create `METAPEEK_API_KEY` environment variable in Netlify (leave empty initially)

### Server Route Implementation
- [ ] Implement `server/api/fetch.post.ts` with Nitro event handler
- [ ] Create `server/utils/proxy.ts` with security utilities
- [ ] Implement `validateUrl()` with SSRF protection
- [ ] Implement `extractHead()` with script tag stripping
- [ ] Implement `extractBodySnippet()` (first 1KB only)
- [ ] Add redirect chain tracking in ofetch `onResponse` hook
- [ ] Verify rate limit config export format is correct

### Security Testing (Critical)
- [ ] Test SSRF validation with known-bad URLs:
  - [ ] `http://localhost:3000`
  - [ ] `http://127.0.0.1`
  - [ ] `http://169.254.169.254/latest/meta-data/` (AWS metadata)
  - [ ] `http://metadata.google.internal` (GCP metadata)
  - [ ] `http://10.0.0.1` (private network)
  - [ ] `http://192.168.1.1` (private network)
  - [ ] `http://172.16.0.1` (private network)
- [ ] Verify DNS resolution blocks private IPs
- [ ] Test URL length limit (reject URLs > 2048 chars)
- [ ] Test request body validation (reject unexpected fields)
- [ ] Verify response size limit (abort at 1MB)
- [ ] Test fetch timeout (abort at 10 seconds)
- [ ] Verify redirect loop protection (max 5 redirects)
- [ ] Confirm script tags stripped from response

### Rate Limiting
- [ ] Test rate limit enforcement (script 31 requests in 60 seconds)
- [ ] Verify 429 response returned when limit hit
- [ ] Confirm rate-limited requests don't count as invocations (check Netlify dashboard)
- [ ] Verify paste-HTML mode still works when rate-limited
- [ ] Check Netlify deploy log mentions rate limiting rule

### UX Implementation
- [ ] Implement fetch status state machine (`useFetchStatus.ts`)
- [ ] Add elapsed-time counter during fetch
- [ ] Progressive status messages (neutral → amber → red at 5s/8s)
- [ ] Skeleton placeholders during loading
- [ ] All error codes mapped to user-friendly messages
- [ ] Status bar with `role="status"` and `aria-live="polite"`
- [ ] Errors with `role="alert"` for immediate announcement
- [ ] Success announcement includes count ("Loaded 4 preview cards")

### SPA Detection
- [ ] Implement `useSpaDetection.ts` with scoring system
- [ ] Test with known SPAs (Vite default, Create React App, etc.)
- [ ] Verify warning message displays correctly
- [ ] Test side-by-side comparison (fetch vs paste)

### Shareable URLs
- [ ] Implement query parameter support (`?url=...`)
- [ ] Pre-populate input field but DO NOT auto-fetch
- [ ] Require manual "Fetch" button click
- [ ] Test with bot user agents (verify no auto-invocation)

### Testing
- [ ] Test with slow-responding URLs (8+ seconds)
- [ ] Test with timeout scenario (10+ seconds)
- [ ] Test with redirect chains (1, 3, 5 redirects)
- [ ] Test with non-HTML responses (JSON, XML, image)
- [ ] Test with very large responses (> 1MB)
- [ ] Test with HTTPS and HTTP (dev vs production)
- [ ] Verify CORS from allowed origins
- [ ] Verify CORS blocked from other origins

### Monitoring Setup
- [ ] Note baseline invocation count after first deploy
- [ ] Set calendar reminder to check invocation count weekly (first month)
- [ ] Document how to check Netlify function logs
- [ ] Create runbook for abuse response (see escalation path in design doc)

---

## Production Deployment

### Pre-Deploy
- [ ] All Phase 1 and Phase 2 checklists completed
- [ ] All accessibility tests passing
- [ ] All security tests passing
- [ ] Code reviewed for sensitive information (no hardcoded secrets)
- [ ] Environment variables documented

### Netlify Configuration
- [ ] `netlify.toml` configured
- [ ] Build command set correctly
- [ ] Publish directory set correctly
- [ ] Environment variables set:
  - [ ] `NODE_ENV=production`
  - [ ] `METAPEEK_API_KEY` created (leave empty for launch)
- [ ] Custom domain configured (`metapeek.icjia.app`)
- [ ] SSL certificate active

### First Deploy
- [ ] Deploy to Netlify
- [ ] Verify rate limit in deploy log
- [ ] Test fetch from production URL
- [ ] Verify CORS headers in browser DevTools
- [ ] Test with actual social media URLs
- [ ] Run Lighthouse audit on production
- [ ] Test shareable URL (verify no auto-fetch)

### Post-Deploy Monitoring
- [ ] Check function invocation count after 24 hours
- [ ] Check function error rate
- [ ] Verify no SSRF attempts in logs
- [ ] Test from different geographic locations
- [ ] Monitor for any accessibility issues reported

---

## Phase 3 (Polish & Power Features) - Optional Enhancements

### OG Image Analysis
- [ ] Implement client-side image fetch with CORS fallback
- [ ] Show crop overlays for platform aspect ratios
- [ ] Report dimensions, file size, format
- [ ] Flag oversized/undersized images

### Structured Data
- [ ] Parse JSON-LD blocks
- [ ] Validate basic schema.org structure
- [ ] Pretty-print JSON output

### Diff/Compare Mode
- [ ] Two-column layout implementation
- [ ] Tag-level difference highlighting
- [ ] Side-by-side preview cards

### Additional Export Options
- [ ] Download as HTML file
- [ ] Copy as JSON
- [ ] Raw HTML debug view

---

## Continuous Requirements

These apply throughout all phases:

- [ ] All new components meet WCAG 2.1 AA requirements
- [ ] All new interactive states are keyboard accessible
- [ ] All new dynamic content announced to screen readers
- [ ] No new dependencies added without security review
- [ ] All config changes committed to `metapeek.config.ts` (not `.env`)
- [ ] All user-facing error messages are plain-language with suggestions
