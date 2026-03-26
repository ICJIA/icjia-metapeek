# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0] - 2026-03-26

### Added

- Security audit document (SECURITY-AUDIT.md) with red/blue team findings
- Changelog (CHANGELOG.md) following Keep a Changelog format
- GitHub link and version number in footer

### Fixed

- WCAG 2.1 AA color contrast violations on export buttons, char count, and image recommendation text
- Scrollable `<pre>` regions now keyboard-accessible (`tabindex="0"`)
- iMessage preview domain text contrast on dark backgrounds
- Accessibility tests updated for URL-default input mode

## [0.7.0] - 2026-03-26

### Added

- SEO insights panel with tech stack and analytics detection
- `llms.txt` support for AI crawler discoverability
- MetaPeek CLI as a monorepo workspace package

### Changed

- UX improvements across analysis and results panels

### Security

- Hardened SSRF, IPv6, authentication timing, CSS injection, and CLI protections

## [0.6.0] - 2026-03-25

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

## [0.5.0] - 2026-03-24

### Added

- `GET /api/analyze` endpoint for server-side URL fetching
- Isomorphic shared core for client and server analysis
- SPA detection warning in Step 1

### Fixed

- Background color consistency across sections
- Reset button placement

## [0.4.0] - 2026-03-23

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

## [0.3.0] - 2026-03-22

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

## [0.2.0] - 2026-03-21

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

## [0.1.0] - 2026-03-20

### Added

- Initial client-side MVP for meta tag analysis
- Swiss design-inspired modern UI
- Social media preview cards (Open Graph, X/Twitter)
- Character count validation for title and description
- Accessibility optimizations (96% Lighthouse score, WCAG AA contrast)
- Tailwind CSS integration
- Unit tests, accessibility tests, and Netlify deployment configuration
- Sample HTML loader for quick testing
