# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## Security Audit Summary

The most recent red team / blue team audit was performed on **2026-05-26**. The previous audit ran on 2026-03-26 and most of its priority-1 findings were resolved in v0.9.0; this round focuses on supply-chain CVEs, security-header baselines, and tooling. See [SECURITY-AUDIT.md](SECURITY-AUDIT.md) for the full report.

### 2026-05-26 Audit — What changed

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| RT-13 | High | **undici 7.21.0 has 3 WebSocket DoS CVEs** (CVE-2026-1528 / 1526 / 2229) — undici is our direct HTTP client | **Fixed in v0.14.0** — `pnpm.overrides` pin undici to `>=7.24.0`. We don't use WebSockets, but hygiene matters |
| RT-14 | High | **h3 1.15.5 SSE injection** (CVE-2026-33128) — newlines in SSE field values escape the wire format | **Fixed in v0.14.0** — override pins h3 to `>=1.15.6`. We don't use h3 SSE either |
| RT-15 | Critical | **fast-xml-parser entity-expansion bypass** — incomplete fix for CVE-2026-26278, transitive via `@nuxtjs/seo > sitemap` | **Fixed in v0.14.0** — override pins to `>=5.5.6`; `fast-xml-builder` pinned to `>=1.1.7` |
| RT-16 | Medium | **CSP missing baseline directives** — no `base-uri`, `form-action`, `object-src`, `upgrade-insecure-requests` | **Fixed in v0.14.0** — added all four to `netlify.toml`. Blocks `<base>` injection, off-origin form posts, legacy plugins, and mixed-content downgrades |
| RT-17 | Medium | **Missing cross-origin isolation headers** — no COOP / CORP | **Fixed in v0.14.0** — `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-site` |
| RT-18 | Low | **Permissions-Policy disabled only 4 features** — camera, microphone, geolocation, payment | **Fixed in v0.14.0** — expanded to 20+ features (USB, serial, bluetooth, midi, accelerometer, gyroscope, magnetometer, autoplay, display-capture, encrypted-media, picture-in-picture, screen-wake-lock, sync-xhr, web-share, xr-spatial-tracking, publickey-credentials-get) |
| RT-19 | Low | **Missing X-Permitted-Cross-Domain-Policies / X-DNS-Prefetch-Control** | **Fixed in v0.14.0** — `none` and `off` added to defend against legacy Flash/Acrobat policies and reduce passive network leak |
| RT-20 | Info | **Build still uses yarn 1 (classic)** — slower, no content-addressable store, weak workspace support | **Fixed in v0.14.0** — migrated to pnpm 10.33.0; lockfile regenerated, Netlify build command updated, `[dev]` block added for prod-parity local dev |
| RT-21 | Moderate | **nuxt-og-image transitive vulns** (CVE GHSA-pqhr / mg36 / c7xp) — SSRF, reflected XSS, DoS in dynamic OG image rendering | **Accepted** — we don't generate OG images at request time; the app uses static `public/og-image-v2.png`. Override attempted but breaks Nuxt's prerender (unhead 2.1.15 ABI conflict). Will revisit when @nuxtjs/seo 5.x stabilizes with Nuxt 4.4 |

### Previously-resolved findings (from 2026-03-26 audit) — confirmed in v0.14.0

| ID | Severity | Resolution |
|----|----------|------------|
| RT-01 | High | Streaming size check via `pinnedFetch` (for-await loop, byte counter, mid-download abort) — verified in `server/utils/fetcher.ts` |
| RT-03 | High | `extractBodySnippet` strips scripts, styles, and HTML tags — text-only output |
| RT-05 | Medium | Content-Type validation rejects non-HTML with 422 |
| RT-06 | Medium | `crypto.randomUUID()` for request IDs |
| RT-09 | Low | Redundant `Cookie: ""` header removed |
| BD-08 gap | — | Sensitive-param redaction in logs is now case-insensitive |

### Still accepted (from 2026-03-26 audit)

- **RT-02** (CSP `'unsafe-inline'` for scripts) — removing requires per-request nonce integration with Nuxt 4. Vue's template interpolation auto-escapes, so no current XSS vector exists. Deferred to a dedicated CSP hardening sprint.
- **RT-04** (CORS `allowedOrigins[0]` only) — production single-origin works correctly; localhost dev uses same-origin so unaffected.
- **RT-07** (Network errors discriminate ENOTFOUND / ECONNREFUSED / ETIMEDOUT) — kept because the messages help legitimate users debug; edge rate limiting mitigates scanning abuse.
- **RT-08** (`img-src *` in CSP) — required by design; users analyze OG images on arbitrary domains.
- **RT-10** (Rate limiting is Netlify-edge-only) — no immediate plan to deploy elsewhere; app-level fallback in `metapeek.config.ts` is wired up but not enabled.
- **RT-11** (`extractHead` regex lazy match) — only affects the lightweight `/api/fetch` route; `/api/analyze` uses cheerio.
- **RT-12** (No server-side CORS enforcement) — API is intentionally public; `METAPEEK_API_KEY` opts in to bearer-token auth.

### Audit status — TL;DR

- `pnpm audit --prod --audit-level high` → **0 findings**
- `pnpm audit --prod --audit-level moderate` → 3 (all `nuxt-og-image`, not exploitable in our usage)
- `pnpm audit --audit-level high` → 1 (`js-cookie` via `@vue/test-utils`, **dev-only**)
- 139 unit + security tests pass
- Local production build succeeds with Nitro netlify preset

A full red team / blue team security audit was performed on 2026-03-26. See [SECURITY-AUDIT.md](SECURITY-AUDIT.md) for the complete report with proof-of-concept code and remediation guidance.

**Overall Posture: GOOD** — 0 critical vulnerabilities. The application implements substantially above-average security controls for a URL-fetching proxy, including DNS pinning, IPv4/IPv6 private IP blocking, redirect re-validation, and timing-safe authentication — all rated EXCELLENT by the blue team assessment.

### Findings and Status

| ID | Severity | Finding | Risk | Status |
|----|----------|---------|------|--------|
| RT-01 | High | **Chunked encoding bypasses Content-Length size check** — server downloads full response into memory before rejecting oversized payloads | Attacker could exhaust server memory with concurrent large requests | **Fixed in v0.9.0** — replaced `ofetch` with streaming `undici.request()` that counts bytes during download and aborts immediately when limit exceeded |
| RT-02 | High | **CSP allows `unsafe-inline` for scripts** — weakens XSS protection | If any future XSS vector appears, CSP will not block it | Accepted — required by Nuxt/Vue inline scripts; no current XSS vectors exist (Vue auto-escapes all template interpolation) |
| RT-03 | High | **Body snippet returns unsanitized HTML** — first 1024 chars of `<body>` forwarded raw, could contain CSRF tokens or API keys from target sites | Information disclosure of target site data to MetaPeek users | **Fixed in v0.9.0** — `extractBodySnippet` now strips all HTML tags, scripts, and styles, returning text-only content |
| RT-04 | Medium | **CORS only sets first origin from array** — `localhost` origin is added but never used in the header | Dev-only — production works correctly with single origin | Accepted — no production impact; dev uses same-origin requests |
| RT-05 | Medium | **No Content-Type validation on responses** — binary files (PDF, ZIP) downloaded and parsed as HTML | Wastes server resources on non-HTML responses | **Fixed in v0.9.0** — rejects responses that are not `text/html` or `application/xhtml+xml` with a 422 error |
| RT-06 | Medium | **Request IDs use `Math.random()`** — predictable, not cryptographically secure | Log correlation IDs could be forged if attacker has log access | **Fixed in v0.9.0** — replaced with `crypto.randomUUID()` |
| RT-07 | Medium | **Error messages reveal network topology** — distinct messages for DNS failure vs connection refused vs timeout | Attacker could use MetaPeek as a network reconnaissance oracle | Accepted — specific errors help legitimate users debug; rate limiting mitigates scanning |
| RT-08 | Medium | **`img-src *` in CSP** — allows loading images from any origin | By design — MetaPeek previews OG images from arbitrary domains; user's browser connects directly to image hosts | Accepted — inherent to the application's purpose |
| RT-09 | Low | **`Cookie: ""` header is a no-op** — `credentials: "omit"` already prevents cookies | No security impact; redundant header | **Fixed in v0.9.0** — removed redundant header |
| RT-10 | Low | **Rate limiting is Netlify-edge-only** — no fallback if deployed elsewhere | No impact on current Netlify deployment | Accepted — add app-level fallback if deployment target changes |
| RT-11 | Low | **`extractHead` regex lazy match** — premature `</head>` in comments truncates parsing | Edge case affecting parsing accuracy, not security; cheerio parser handles this correctly in `/api/analyze` | Accepted — low impact, only affects `/api/fetch` route |
| RT-12 | Low | **No server-side CORS enforcement** — headers instruct browsers, but non-browser clients bypass CORS | API is intentionally public; non-browser access is expected | Accepted — activate `METAPEEK_API_KEY` env var if access control needed |

### What's Already Well-Defended

| Defense | Rating | What It Stops |
|---------|--------|---------------|
| DNS pinning (TOCTOU prevention) | EXCELLENT | DNS rebinding attacks where IP changes between validation and fetch |
| IPv4 + IPv6 private IP blocking | EXCELLENT | SSRF to internal services, cloud metadata (169.254.169.254), loopback |
| Redirect re-validation per hop | EXCELLENT | SSRF via open redirect chains (public URL → internal IP) |
| Timing-safe auth comparison | EXCELLENT | Timing side-channel attacks on API key |
| Script stripping in head extraction | GOOD | XSS from forwarded JavaScript in fetched HTML |
| Structured logging with redaction | GOOD | Sensitive data (tokens, keys) leaking into logs |
| Security headers (HSTS, CSP, X-Frame-Options) | GOOD | Clickjacking, MIME sniffing, protocol downgrade |
| Parameter pollution rejection | GOOD | Unexpected fields influencing server behavior |

---

## Accessibility Audit Summary

A full axe-core (WCAG 2.1 AA) accessibility audit was performed on 2026-03-26 using Playwright + @axe-core/playwright across multiple page states (initial load, analyzed content, code editor, keyboard navigation).

**Result: 0 violations** — all issues found during the audit were fixed in v0.8.0.

| Category | Status | Details |
|----------|--------|---------|
| Color contrast (WCAG 1.4.3) | PASS | Fixed 7+ elements: export buttons, char count, image text, iMessage preview |
| Keyboard accessibility (WCAG 2.1.1) | PASS | All interactive elements reachable; scrollable regions now focusable |
| Skip navigation (WCAG 2.4.1) | PASS | Skip link present and functional |
| Focus order (WCAG 2.4.3) | PASS | 32 focusable elements in logical tab order |
| ARIA landmarks | PASS | Live regions properly nested in landmarks |

**Tests:** 5 Playwright tests (3 axe-core scans + 2 keyboard navigation) — all passing with 0 violations.

---

## [0.14.0] - 2026-05-26

### Security

- **Supply-chain CVE patches** — pinned undici `>=7.24.0`, h3 `>=1.15.6`,
  fast-xml-parser `>=5.5.6`, fast-xml-builder `>=1.1.7` via
  `pnpm.overrides`. Resolves CVE-2026-1528 / 1526 / 2229 (undici
  WebSocket DoS), CVE-2026-33128 (h3 SSE injection), and the
  fast-xml-parser entity-expansion bypass (incomplete fix for
  CVE-2026-26278).
- **CSP hardening** — added `base-uri 'self'`, `form-action 'self'`,
  `object-src 'none'`, and `upgrade-insecure-requests` to the
  `Content-Security-Policy` header. Blocks `<base>` injection,
  off-origin form posts, legacy plugin loading, and mixed-content
  downgrades.
- **Cross-origin isolation** — added `Cross-Origin-Opener-Policy:
  same-origin` and `Cross-Origin-Resource-Policy: same-site`.
- **Expanded Permissions-Policy** — from 4 disabled features to 20+
  (camera, microphone, geolocation, payment, USB, serial, bluetooth,
  midi, accelerometer, gyroscope, magnetometer, autoplay,
  display-capture, encrypted-media, picture-in-picture,
  screen-wake-lock, sync-xhr, web-share, xr-spatial-tracking,
  publickey-credentials-get, fullscreen=self).
- **Additional defense-in-depth headers** —
  `X-Permitted-Cross-Domain-Policies: none` (blocks legacy
  Flash/Acrobat cross-domain) and `X-DNS-Prefetch-Control: off`
  (reduces passive network leak).
- **Dependency upgrade** — Nuxt 4.3.0 → 4.4.6 (closes navigateTo
  reflected-XSS advisory GHSA-fx6j-w5w5-h468).

### Changed

- **Package manager: yarn 1 → pnpm 10.33.0.** `yarn.lock` removed,
  `pnpm-lock.yaml` committed. `packageManager` field added to
  `package.json` so Corepack installs the exact version on every
  machine and in CI. `pnpm-workspace.yaml` replaces the
  `package.json:workspaces` field. Disk usage is much smaller
  (content-addressable store) and installs are faster.
- **Netlify build command:** `yarn build` → `pnpm build`.
  `PNPM_FLAGS = "--shamefully-hoist"` added to `[build.environment]`
  per Netlify's documented Nuxt + pnpm requirement so SSR modules
  (unhead, `@nuxtjs/seo`) resolve consistently. `.npmrc` mirrors this
  locally with `shamefully-hoist=true`.

### Added

- **`pnpm start-dev-server`** — kills stale `nuxt dev` / `netlify dev` /
  `vite` / `nitro` processes (and frees ports 3000 / 8888), then runs
  `netlify dev` so the local environment mirrors prod: `/api/*` hits
  the Nitro server, `/.netlify/functions/fetch-spa` hits the standalone
  Chromium lambda, and the `netlify.toml` headers/redirects apply at
  the edge. Script at `scripts/start-dev-server.sh`.
- **`[dev]` block in `netlify.toml`** — explicit `targetPort = 3000`,
  `port = 8888`, `framework = "#auto"`, `autoLaunch = false` so
  `netlify dev` behaves deterministically.
- **`pnpm audit` script** — wraps `pnpm audit --prod --audit-level high`
  for CI/local checks.

### Verified

- `pnpm audit --prod --audit-level high`: **0 vulnerabilities**
- `pnpm test`: **139 / 139 pass** (unit + security)
- `pnpm build`: succeeds with Nitro `netlify` preset
- See full audit table above for status of every previous + new finding

---

## [0.13.1] - 2026-05-26

### Performance

- Enabled Nuxt 4's `features.inlineStyles` so the prerendered landing
  page no longer waits on the 200 KB `entry.css` round-trip before
  first paint. The page's used CSS is inlined directly into the SSR'd
  HTML; the external CSS bundle shrinks to 743 B (only dynamic chunks
  remain). HTML grows from ~30 KB to ~228 KB (~45 KB gzipped) but the
  saved roundtrip dominates on mobile latency.

### Fixed

- Header ICJIA logo had no explicit `width`/`height` attributes,
  contributing to Cumulative Layout Shift. Added `width="250"
  height="175"` (the PNG's natural size); CSS classes
  (`h-12 sm:h-14 w-auto`) continue to control display size.

### Verified

- Mobile Lighthouse Performance: **93 → 100** ✓
- Mobile Lighthouse Accessibility: **100** ✓
- Desktop Lighthouse Performance / Accessibility: **100 / 100** ✓
- axe-core WCAG 2.1 AA: **0 violations** ✓

---

## CLI [2.3.0] - 2026-05-26

### Added

- AI readiness assessment ported from the web app — 9 parallel checks
  (JSON-LD, authorship, freshness, canonical, language, description
  quality, AI crawl directives, robots.txt AI-bot access, llms.txt)
  with a `ready` / `partial` / `not-ready` verdict.
- `--no-ai-check` to skip the assessment when the two extra HTTP
  requests aren't wanted.

### Important

- AI readiness is a **parallel verdict** and does NOT affect the A-F
  weighted score or the exit code — CI pipelines built on 2.2.x keep
  working unchanged. See [packages/cli/CHANGELOG.md](packages/cli/CHANGELOG.md).

---

## CLI [2.2.0] - 2026-05-26

The bundled CLI tool at `packages/cli/` is versioned independently. The
standalone [icjia-metapeek-cli](https://github.com/ICJIA/icjia-metapeek-cli)
repository has been archived; this monorepo is now the single source of
truth. See [packages/cli/CHANGELOG.md](packages/cli/CHANGELOG.md) for the
full CLI changelog.

### Added

- `--sitemap <url>` — crawl every URL in a sitemap.xml in one pass; emits
  per-URL summary, markdown table, or aggregated JSON.
- `--html-file <path>` — analyze HTML on disk instead of fetching a live
  URL. Mutually exclusive with `--sitemap`.

### Fixed

- og:image scoring no longer awards 100 when the image URL is unreachable
  (CSP/hotlink/4xx/DNS). Failed fetches now score 0/fail; unrecognized
  formats now score 60/warning.

### Tests

- 13 new test cases backed by two HTML fixtures. The broken-og:image
  fixture uses an RFC 6761 `.test` TLD so tests stay deterministic and
  fully offline. Suite: 92 pass / 0 fail.

---

## [0.13.0] - 2026-04-24

### Fixed

- `app.vue` was at the project root but Nuxt 4's default `srcDir` is `app/`, so the custom root component was silently ignored in favor of Nuxt's built-in default template. `<UToaster />` never mounted, meaning toast notifications from `useToast()` were not displayed. Moved to `app/app.vue`.

### Added

- Full-screen centered "Loading" indicator, rendered in SSR output and faded out after client hydration. Accessible (`role="status"`, `aria-live="polite"`), respects `prefers-reduced-motion`. Matches the dark theme used by the existing `spa-loading-template.html`.
- `<NuxtLoadingIndicator>` progress bar for client-side route transitions.

### Performance

- Landing page (`/`) now prerendered at build time via `routeRules: { "/": { prerender: true } }`. Served as static HTML from Netlify's CDN — eliminates the ~1–3 s Netlify Function cold start for first-time visitors. `/api/*` routes continue to run as serverless functions.

## [0.12.0] - 2026-03-26

### Fixed

- SPA detection heuristic broadened — now triggers when Open Graph tags are missing (not just when title/description are absent), catching sites like `icjia.illinois.gov` that have basic meta tags but rely on JavaScript to inject OG tags

## [0.11.0] - 2026-03-26

### Added

- SPA rendering support via headless Chromium (`@sparticuz/chromium` + `puppeteer-core`)
- Standalone Netlify function (`/api/fetch-spa`) with isolated Chromium binary bundle
- SPA auto-detection — banner appears when Open Graph tags are missing from static HTML
- "Render with JavaScript" button to re-analyze using headless browser
- Success state shows "(rendered with JavaScript)" when SPA renderer was used

### Security

- Chromium DNS restricted to target hostname only (`--host-resolver-rules`) to prevent in-page JS from reaching internal IPs
- SSRF validation runs before Chromium launch (mirrors existing `validateUrl` logic)
- Timing-safe bearer token auth on SPA endpoint
- Request interception blocks images, media, fonts, WebSockets during render (reduced attack surface)
- Tighter rate limiting (3/min vs 10/min for standard fetch)

## [0.10.0] - 2026-03-26

### Added

- JSON-LD structured data (`WebApplication` schema with author, dates, license, pricing)
- Author meta tag (`Illinois Criminal Justice Information Authority`)
- Content freshness meta tags (`article:published_time`, `article:modified_time`)
- Auto-fetch on "Load Example" in URL mode (no need to click "Fetch" separately)

### Changed

- Description lengthened from 63 to 123 characters for better AI summarization

## [0.9.0] - 2026-03-26

### Security

- **RT-01 FIXED:** Streaming response size validation — replaced `ofetch` buffered download with `undici.request()` streaming that counts bytes during download and aborts immediately when the 5MB limit is exceeded, preventing memory exhaustion from chunked-encoding responses
- **RT-03 FIXED:** Body snippet sanitization — `extractBodySnippet` now strips all HTML tags, `<script>`, and `<style>` elements, returning text-only content to prevent leaking CSRF tokens, API keys, or session data from target sites
- **RT-05 FIXED:** Content-Type validation — rejects non-HTML responses (`application/pdf`, `image/*`, etc.) with a 422 error before processing, preventing wasted resources on binary files
- **RT-06 FIXED:** Cryptographic request IDs — replaced `Math.random()` with `crypto.randomUUID()` for unpredictable log correlation IDs
- **RT-09 FIXED:** Removed redundant `Cookie: ""` header from fetch requests (already handled by `credentials: "omit"`)
- **BD-08 FIXED:** Log URL sanitization now uses case-insensitive parameter matching (catches `Token`, `API_KEY`, `SECRET`, etc.)

## [0.8.0] - 2026-03-26

### Added

- Security audit document ([SECURITY-AUDIT.md](SECURITY-AUDIT.md)) with red/blue team findings
- Changelog ([CHANGELOG.md](CHANGELOG.md)) following Keep a Changelog format
- GitHub link and version number in footer (version links to changelog)

### Fixed

- WCAG 2.1 AA color contrast violations on export buttons, char count, and image recommendation text
- Scrollable `<pre>` regions now keyboard-accessible (`tabindex="0"`)
- iMessage preview domain text contrast on dark backgrounds
- Accessibility tests updated for URL-default input mode

## [0.7.0] - 2026-03-09

### Added

- SEO insights panel with tech stack and analytics detection
- `llms.txt` support for AI crawler discoverability
- MetaPeek CLI as a monorepo workspace package

### Changed

- UX improvements across analysis and results panels

### Security

- Hardened SSRF, IPv6, authentication timing, CSS injection, and CLI protections

## [0.6.0] - 2026-02-23

### Added

- AI readiness assessment with 9 automated checks
- AI readiness panel UI component and composable
- `htmlLang` extraction and AI readiness types in meta parser
- API endpoint for AI readiness checks

### Changed

- Improved security hardening and AI readiness detail display

### Security

- Hardened XSS, SSRF, authentication timing, and HTTP headers
- Preserve `<html>` tag in `extractHead` for safer parsing

## [0.5.0] - 2026-02-12

### Added

- `GET /api/analyze` endpoint for server-side URL fetching
- Isomorphic shared core for client and server analysis
- SPA detection warning in Step 1

### Fixed

- Background color consistency across sections
- Reset button placement

## [0.4.0] - 2026-02-04

### Added

- Meta tag scoring system with detailed diagnostics
- MIT License
- ESLint configuration with zero warnings
- Nuxt SEO module and Open Graph image

### Changed

- Redesigned image analysis with per-platform compatibility checks
- Step 4 renamed to "Meta Results" with actual tag values in diagnostics
- Character overage highlighting for title and description fields

### Security

- Rate limiting implementation

## [0.3.0] - 2026-02-02

### Added

- Step 5: Export results (JSON, Markdown, HTML report, clipboard, original HTML)
- Comprehensive meta tag parsing and display
- Image analysis for Open Graph and social previews

### Changed

- Redesigned hero section into two-column layout
- Clarified Step 1 instructions to emphasize `<head>` section
- Enlarged MetaPeek title and ICJIA logo in navbar
- Distinct high-contrast colors for export buttons

### Fixed

- CORS errors for external image analysis
- Tooltip viewport boundary handling

## [0.2.0] - 2026-02-01

### Added

- LinkedIn preview card
- Custom `AppTooltip` component with smart auto-positioning and mobile responsiveness
- ICJIA logo and favicon in header
- GitHub icon in header navigation

### Changed

- Renamed Twitter preview to X/Twitter
- Improved textarea placeholder text

### Fixed

- Tooltip z-index layering issues
- Info icon contrast for better visibility
- UNotifications provider placement in `app.vue`
- ARIA live region landmark structure for accessibility

## [0.1.0] - 2026-02-01

### Added

- Initial client-side MVP for meta tag analysis
- Swiss design-inspired modern UI
- Social media preview cards (Open Graph, X/Twitter)
- Character count validation for title and description
- Accessibility optimizations (96% Lighthouse score, WCAG AA contrast)
- Tailwind CSS integration
- Unit tests, accessibility tests, and Netlify deployment configuration
- Sample HTML loader for quick testing
