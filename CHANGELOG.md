# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## Security Audit Summary

A full red team / blue team security audit was performed on 2026-03-26. See [SECURITY-AUDIT.md](SECURITY-AUDIT.md) for the complete report.

**Overall Posture: GOOD** — substantially above-average security for a URL-fetching proxy.

| Severity | Count | Key Findings |
|----------|-------|-------------|
| Critical | 0 | None |
| High | 3 | Content-Length bypass via chunked encoding, CSP `unsafe-inline`, body snippet raw HTML leakage |
| Medium | 5 | CORS first-origin-only, no Content-Type validation, `Math.random()` request IDs, error oracle, `img-src *` |
| Low | 4 | Cookie header no-op, edge-only rate limiting, regex edge cases, log param case sensitivity |
| Info | 3 | All properly mitigated (IPv4-mapped IPv6, parameter pollution, timing-safe auth) |

**Blue Team Highlights:**
- DNS pinning SSRF protection — EXCELLENT
- IPv4 + IPv6 private IP blocking — EXCELLENT
- Redirect re-validation on each hop — EXCELLENT
- Timing-safe authentication — EXCELLENT
- Structured logging with sensitive data redaction — GOOD
- Security headers (HSTS, CSP, X-Frame-Options) — GOOD

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
