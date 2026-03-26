# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## Security Audit Summary

A full red team / blue team security audit was performed on 2026-03-26. See [SECURITY-AUDIT.md](SECURITY-AUDIT.md) for the complete report with proof-of-concept code and remediation guidance.

**Overall Posture: GOOD** — 0 critical vulnerabilities. The application implements substantially above-average security controls for a URL-fetching proxy, including DNS pinning, IPv4/IPv6 private IP blocking, redirect re-validation, and timing-safe authentication — all rated EXCELLENT by the blue team assessment.

### Findings and Status

| ID | Severity | Finding | Risk | Status |
|----|----------|---------|------|--------|
| RT-01 | High | **Chunked encoding bypasses Content-Length size check** — server downloads full response into memory before rejecting oversized payloads | Attacker could exhaust server memory with concurrent large requests | Open — requires streaming size validation refactor |
| RT-02 | High | **CSP allows `unsafe-inline` for scripts** — weakens XSS protection | If any future XSS vector appears, CSP will not block it | Accepted — required by Nuxt/Vue inline scripts; no current XSS vectors exist (Vue auto-escapes all template interpolation) |
| RT-03 | High | **Body snippet returns unsanitized HTML** — first 1024 chars of `<body>` forwarded raw, could contain CSRF tokens or API keys from target sites | Information disclosure of target site data to MetaPeek users | Open — fix is to strip HTML tags or remove script tags from body snippet (~30 min) |
| RT-04 | Medium | **CORS only sets first origin from array** — `localhost` origin is added but never used in the header | Dev-only — production works correctly with single origin | Accepted — no production impact; dev uses same-origin requests |
| RT-05 | Medium | **No Content-Type validation on responses** — binary files (PDF, ZIP) downloaded and parsed as HTML | Wastes server resources on non-HTML responses | Open — add `text/html` check before processing (~15 min) |
| RT-06 | Medium | **Request IDs use `Math.random()`** — predictable, not cryptographically secure | Log correlation IDs could be forged if attacker has log access | Open — replace with `crypto.randomUUID()` (~5 min) |
| RT-07 | Medium | **Error messages reveal network topology** — distinct messages for DNS failure vs connection refused vs timeout | Attacker could use MetaPeek as a network reconnaissance oracle | Accepted — specific errors help legitimate users debug; rate limiting mitigates scanning |
| RT-08 | Medium | **`img-src *` in CSP** — allows loading images from any origin | By design — MetaPeek previews OG images from arbitrary domains; user's browser connects directly to image hosts | Accepted — inherent to the application's purpose |
| RT-09 | Low | **`Cookie: ""` header is a no-op** — `credentials: "omit"` already prevents cookies | No security impact; redundant header | Open — trivial cleanup (~5 min) |
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
