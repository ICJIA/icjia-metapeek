# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## Security Audit Summary

Security scans, **newest first**. Each entry links to the full write-up —
finding, why it mattered in this codebase, and what was done about it — in
[SECURITY-AUDIT.md](SECURITY-AUDIT.md).

| Date | Scan | Result |
|------|------|--------|
| **2026-08-24** | [Dependency drift sweep + proxy hardening](SECURITY-AUDIT.md#scan--2026-08-24--dependency-drift-sweep--proxy-hardening) | 67 advisories found (3 critical / 33 high) after 3 months of unwatched drift. All fixed via refreshed `pnpm.overrides`; 3 remain with no upstream patch and are listed in `auditConfig.ignoreCves` (unreachable code paths). Also: SPA renderer DNS-pinned (DR-03), non-HTML responses rejected pre-download (DR-04), rate-limit table de-duplicated (DR-05), weekly CI audit added (DR-06), OG-image runtime removed (DR-07), and **a 2-month-old production 502 on `/api/analyze` found and fixed** (DR-08). |
| **2026-07-17** | [RT-10 realized in production](SECURITY-AUDIT.md#scan--2026-07-17--rate-limiting-was-never-active-rt-10-realized) | Rate limiting was **never active** — Nitro deploys all routes as one function, so Netlify never read the per-route configs (nuxt/nuxt#33721). Practical severity HIGH, not the LOW originally filed. Application-level enforcement shipped in 0.15.0. |
| **2026-05-26** | [Supply-chain CVEs + header baseline](SECURITY-AUDIT.md#scan--2026-05-26--supply-chain-cves--header-baseline) | 3 dependency CVEs pinned out (undici, h3, fast-xml-parser); CSP gained `base-uri`/`form-action`/`object-src`/`upgrade-insecure-requests`; COOP/CORP added; Permissions-Policy expanded to 20+ features; yarn → pnpm. All fixed in v0.14.0. |
| **2026-03-26** | [Full red team / blue team audit](SECURITY-AUDIT.md#scan--2026-03-26--full-red-team--blue-team-audit) | 0 critical, 3 high, 5 medium, 4 low. **Posture: GOOD.** SSRF protections (DNS pinning, IPv4/IPv6 private-range blocking, per-hop redirect re-validation, timing-safe auth) rated EXCELLENT. High findings fixed in v0.9.0. |

### Current status

- `pnpm audit --prod --audit-level high` → **exits clean**
- 3 advisories have no upstream patch (`extract-zip` CVE-2026-56876, `image-size` CVE-2025-71329/71330) and are listed explicitly in `pnpm.auditConfig.ignoreCves` — neither code path is reachable in MetaPeek, and listing them keeps a genuinely new finding failing the build. Re-review when `puppeteer-core` / `@nuxtjs/seo` upgrade. See DR-02
- **233** unit, security, and integration tests pass (plus 7 Playwright e2e)
- Production build succeeds with the Nitro netlify preset, prerender included
- Re-checked automatically: `.github/workflows/audit.yml`, weekly and on every dependency change

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

## [0.17.2] - 2026-08-24

Three fixes from the adversarial review of the same day's work.

### Fixed

- **A reset during an in-flight fetch no longer resurrects the results.**
  `handleFetchUrl`/`handleFetchSpa` wrote their state unconditionally after the
  await, so clicking "Start over" (or switching input modes) while a slow site
  was still fetching let the late response repopulate the page that had just
  been cleared — with the URL box empty but results present. An `analysisEpoch`
  counter now bumps on every reset and mode switch; each fetch captures it
  before awaiting and bails if it changed. Reproduced first with a Playwright
  test that delays `/api/fetch` by 1.5s and resets mid-flight: on the old code
  the stale title reappeared in 11 elements.
- **The top "Start over" bar no longer appears on the first keystroke.** It was
  keyed on "anything typed", and it sits *above* the input — so typing one
  character inserted the band and shoved the focused field ~140px down the
  page. It now appears only once an analysis exists; the typed-but-unanalyzed
  state keeps the small Clear link in the Step 1 header.
- **Function logs no longer contain raw IP addresses.** The request_log table
  has only ever stored hashes, but `logSuccess`/`logError`/`logBlocked` were
  writing the raw address into Netlify's retained function logs — making the
  "raw IPs are never stored" claim true for the database and false for the
  logs. Every log entry now carries `ipHash`, the same truncated SHA-256 the
  rate limiter keys its buckets on, so the two stores correlate.

### Tests

- 233 unit/security/integration (+4 logger) and 7 Playwright e2e (+2 behavior:
  the mid-flight reset race and the top-bar gating), alongside the 5
  accessibility tests, all passing.

---

## [0.17.1] - 2026-08-24

### Changed

- **Export buttons fill their row.** The download and copy buttons were
  auto-width in a left-aligned flex row, so on a wide screen they clustered at
  the left with a stretch of empty panel to their right. They are now a
  responsive grid — three across for downloads, two for copy, collapsing to one
  column below the `sm` breakpoint — at `size="xl"`. Measured: 343x56 each at
  1440px (grid spans the full 1054px panel), 233x56 at 820px, and full-width
  308x56 single column at 390px, with no horizontal overflow at any width and
  every button comfortably above the 44px touch-target minimum.
- `AppTooltip` gained a `block` prop. Its wrapper is `inline-flex`, which is
  correct around an inline control but prevents a wrapped button from filling a
  grid cell; `block` stretches the wrapper and the trigger.
- The "copied!" confirmation moved to its own row with reserved height and
  `aria-live="polite"`, so it is announced to screen readers and can no longer
  reflow the button grid when it appears.

### Fixed

- **"https:// prefix added" could appear on a URL that already had a scheme.**
  The check was `!/^https?:\/\//` → prepend, which is right for a bare domain
  but wrong for a mistyped one: `https:/example.com` (one slash) failed the
  test and became `https://https:/example.com`, reported as a prefix merely
  being "added". Also affected `https//example.com`, `https:///example.com`,
  and similar. Input now goes through `normalizeUrlInput`, which repairs a
  malformed http(s) scheme instead of stacking another one in front, leaves
  valid and non-http schemes untouched, and distinguishes "URL corrected" from
  "https:// prefix added" in the toast. 8 new tests.

---

## [0.17.0] - 2026-08-24

### Added

- **Large "Start over" button, above the steps and again below the results.**
  Clearing everything previously meant finding a small ghost "Clear" link in the
  Step 1 header, clicking the logo, or scrolling to the very bottom of an
  ~11,800px page. The new control appears in both places, so it is reachable
  without scrolling from either end, and both are the same `ResetButton`
  component rather than two hand-styled buttons that can drift.

  It is deliberately achromatic — high-contrast near-black in light mode, white
  in dark. Every hue on the page is already assigned to a numbered step (blue,
  purple, violet, cyan, teal, emerald, indigo, orange) or to a score badge
  (red/amber/emerald), so a coloured reset would read as one more step. Neutral
  is the one register left, it matches the app's Swiss `primary: 'neutral'`
  token, and being the only achromatic block among pastel bands is what makes
  it easy to find. Replaces the previous violet bottom button, which collided
  with the violet step marker.

  The top bar only renders once there is something to clear, so an untouched
  page is not fronted by a button that does nothing. A "Cleared" toast confirms
  the action, since the page empties and scrolls away under the click.

### Fixed

- **5 TypeScript errors that 0.16.1 shipped with.** The `DiscardableBody`
  interface added in that release declared `dump(opts?: { limit?: number })`,
  but undici's real signature requires `limit` inside the optional object, so
  every call site failed to typecheck. It went unnoticed because that release
  was verified with tests, lint, and a production build — and `nuxt build` does
  not typecheck. Only `pnpm typecheck` catches it.

- **`vitest.config.ts` did not compile.** Two Vite majors are installed —
  vitest 3.2 brings Vite 7, Nuxt 4.5 is built on Vite 8 — so `defineConfig`
  (from vitest) rejected the plugin returned by `@vitejs/plugin-vue` (hoisted
  from Nuxt). The two are structurally compatible and the tests always ran; only
  the types disagreed. Now cast to vitest's own `Plugin` type, with a note to
  drop the cast once the two agree on a Vite major.
- **`@vitejs/plugin-vue` was imported but never declared.** `vitest.config.ts`
  relied on `shamefully-hoist=true` putting it in scope. Added to
  `devDependencies` so the import is honest and does not break if hoisting
  changes. (`playwright.config.ts`, reported alongside this, typechecks clean —
  the errors were coming from `vitest.config.ts`.)
- **`pnpm typecheck` did not cover the root config files.** Nuxt's generated
  tsconfig includes `app/`, `shared/`, and `server/`, but not
  `vitest.config.ts` or `playwright.config.ts` — which is how a config that
  failed to compile sat unnoticed behind a green typecheck. `typecheck` now
  also runs `tsconfig.tools.json` over them. Verified by reintroducing the
  error and confirming the check fails.

  Deliberately scoped to the root config files. Covering `tests/` and
  `scripts/` needs Nuxt's auto-import and `.mjs` resolution; a config that only
  half-replicates that reports false positives, which is worse than no check.
  Those remain uncovered, and are called out here rather than papered over.

### Added

- **`.github/workflows/verify.yml`** — runs lint, typecheck, and the test suite
  on every push and PR. Directly closes the gap above: nothing was running
  `pnpm typecheck` automatically, so a green build read as a green change.
- **`postinstall: nuxt prepare`** — `eslint.config.mjs` imports the generated
  `.nuxt/eslint.config.mjs`, so lint and typecheck fail on any clean checkout
  until Nuxt has prepared. The first CI run failed on exactly this; the
  conventional Nuxt postinstall hook fixes it for CI and fresh clones alike.

### Tests

- 221 passing (+7): `tests/unit/ResetButton.test.ts` covers the label, the
  `reset` event, the accessible name, the optional hint, and the 44px touch
  target. Accessibility suite still reports 0 WCAG 2.1 AA violations.

---

## [0.16.1] - 2026-08-24

### Fixed

- **`/api/analyze` returned 502 in production for any page with an og:image.**
  Found by testing the deployed site after releasing 0.16.0. `probeImageUrl`
  called `body.destroy()` on the undici response; undici emits that AbortError
  (`UND_ERR_ABORTED`) asynchronously and out-of-band, so it lands as an
  `uncaughtException` that no `try/catch` can reach and that terminates the
  Lambda. `example.com` worked only because it has no og:image to probe.

  Pre-existing since 0.15.0 (2026-07-17) — confirmed by replaying the request
  against that release's deploy permalink, where it fails identically. It never
  reproduced locally: the Nitro dev server survives an uncaught exception and
  Lambda does not, so a green build, green tests, and a working dev server were
  all consistent with the primary API being broken for two months.

  All five `body.destroy()` sites in `server/utils/fetcher.ts` now go through a
  `discardBody()` helper built on `dump()`. This also covers the two additional
  `destroy()` calls that 0.16.0 introduced on the redirect and non-HTML paths,
  which fire far more often and would have widened the crash.

### Tests

- 214 passing. `tests/unit/fetcher.test.ts` now models the real failure — the
  fake body throws asynchronously from `destroy()` — and asserts that no code
  path calls `destroy()` at all.

---

## [0.16.0] - 2026-08-24

### Security

- **Dependency drift closed.** `pnpm audit --prod --audit-level high` had gone
  from 0 findings (2026-05-26) to 67 advisories — 3 critical, 33 high — because
  nothing re-ran it between manual audits. Two sat on production paths: an
  **undici** TLS certificate-validation bypass (the HTTP client every proxied
  fetch uses) and a **nuxt** route-rule middleware bypass (rate limiting *is*
  Nitro middleware). Resolved by `pnpm update` plus a refreshed
  `pnpm.overrides` block; `undici` is now a direct dependency, since the proxy
  imports it directly. Three advisories remain with no upstream fix
  (`extract-zip`, `image-size` ×2) and are documented as accepted — neither code
  path is reachable here — they are listed in `pnpm.auditConfig.ignoreCves` so
  the exception is reviewable and a new finding still fails the audit.
- **OG-image rendering runtime removed (RT-21 closed).** v0.14.0 accepted RT-21
  (SSRF, reflected XSS, DoS in `nuxt-og-image`) as unreachable, since MetaPeek
  serves a static image. Pinning `>=6.2.5` fixed the advisories and the build
  passed — but the **running app returned HTTP 500**: v6 changed the runtime API
  and the v5-style `defineOgImage({ url, … })` call threw on every render. Rather
  than adapt the call, the module is now disabled (`ogImage: { enabled: false }`)
  and the tags are declared with `useSeoMeta`. An entire OG-rendering stack
  (Satori, Resvg, `/__og-image__/` routes) is no longer shipped for a feature the
  app does not use. The rest of `@nuxtjs/seo` is unaffected.
- **SPA renderer DNS-pinned.** `fetch-spa` validated DNS in Node, then let
  Chromium re-resolve the target itself (`EXCLUDE <hostname>`), reopening the
  rebinding window the Nitro fetcher already closes. Chromium is now pinned to
  the validated address: `MAP <hostname> <ip>, MAP * ~NOTFOUND`. Rule order is
  load-bearing (first match wins) and is asserted by tests.
- **Non-HTML responses rejected before download.** The Content-Type check ran
  after the whole body streamed in, so a 5 MB PDF was fetched just to be 422'd,
  and every redirect hop's body was downloaded although only `Location` is used.
  `pinnedFetch` gained an `onHeaders` hook; both now cost nothing.

### Added

- **`logs.sh`** — reads the Supabase `request_log` the rate limiter has been
  writing since 0.15.0 and nothing had ever read. `recent`, `day`, `denied`,
  `hosts`, `stats`, `grep`, and `tail`, with `--table/--csv/--tsv/--md/--copy`
  output and Chicago-local timestamps. Its first run surfaced 10 denied
  requests from one IP hash walking `/api/graphql`, `/api/v1/env`, and
  `/api/account` — a credential scanner, correctly throttled.
- **`.github/workflows/audit.yml`** — `pnpm audit --prod --audit-level high`
  weekly, on every `package.json`/`pnpm-lock.yaml` change, and on demand. This
  is the control that would have caught the drift above.
- **`shared/rate-limit-config.mjs`** — the tier table, previously duplicated by
  hand in `metapeek.config.ts` and `fetch-spa.mjs` under a "keep in sync"
  comment. Both now import it; a test asserts they are the same object.

### Changed

- **`app/pages/index.vue` reduced from 2,991 to 1,934 lines.** The report
  builders (JSON, Markdown, LLM handoff, standalone HTML) moved to
  `app/utils/exporters.ts` as pure functions over an `ExportSnapshot`. Behavior
  is unchanged; they are now unit-testable, and 17 tests cover them — including
  HTML escaping and CSS-color sanitization of hostile tag values.
- Dependencies updated within their ranges: Nuxt 4.4.6 → 4.5.2, Nuxt UI 4.4 →
  4.11, Vue 3.5.34 → 3.5.41, puppeteer-core, Playwright, ESLint, and others.

### Fixed

- `coverage/` was committed to the repository (22 stale HTML files from
  February) and missing from `.gitignore`. Untracked and ignored.
- README badges showed Nuxt 4.3.0 and a hand-maintained "100%" coverage claim
  that measured only part of the codebase.

### Performance

- Production bundle **20 MB → 12.5 MB** (5.47 → 3.99 MB gzip), from dropping the
  unused OG-image rendering stack.

### Tests

- 173 → **213** passing: exporters (17), fetch-spa DNS pinning (8), fetcher
  streaming discipline (3), shared rate-limit config (2), `logs.sh` query
  building (10). Plus 5 Playwright/axe-core accessibility tests, still at 0
  WCAG 2.1 AA violations.
- Verification now includes a **running-app check** (HTTP 200, expected `og:`
  and `twitter:` meta tags, a live `/api/analyze` call, and an SSRF rejection),
  not just a green build. That check is the only reason the 500 above was found
  before deploy.

---

## [0.15.1] - 2026-07-17

### Documentation

- README Authentication section and `.env.example` now explain that
  `METAPEEK_API_KEY` is self-generated (`openssl rand -base64 32`) — it
  does not come from any service — and that setting it switches the API
  into private mode: keyless requests (including the web UI's own
  fetches) get 401, while valid-key requests bypass rate limiting.

## [0.15.0] - 2026-07-17

### Fixed

- **Rate limiting was silently unenforced in production.** The per-route
  `export const config` rate limits in `server/api/*.ts` were dead code —
  Nitro bundles all routes into one Netlify function (`path: "/*"`), so
  Netlify never read them (nuxt/nuxt#33721). Verified live: 14 requests in
  ~30s, all 200. Replaced with application-level enforcement (below).
- **`/api/fetch-spa` returned 500 on every production request.** The pnpm
  migration (0.14.0) left `node_modules/@sparticuz/chromium` as a symlink
  into `.pnpm/`, and the function bundle lost the package — the import
  crashed at init before any logging. `included_files` now covers both the
  symlink path and the `.pnpm` real path.
- **A broken `og:image` scored green.** A browser load failure emitted a
  null status that diagnostics treated as success. The client now reports
  `loadFailed` (yellow "could not be verified"), and `/api/analyze` probes
  the image URL server-side (SSRF-validated HEAD, ranged-GET fallback) so
  an unreachable image is red — matching the CLI's existing verdict.

### Added

- **Tiered, Supabase-backed rate limiting** enforced in a Nitro middleware
  for all `/api/*` routes and inside `fetch-spa`: trusted targets
  (`*.illinois.gov`, `*.icjia.app`) 30/min · 500/day per IP (SPA renders
  3/min · 60/day); all other targets 5/min · 50/day (SPA 1/min · 10/day);
  plus a site-wide daily budget (2,000 standard + 100 SPA) that returns 503
  when exhausted. Atomic Postgres RPC with fixed windows, hashed IPs only,
  in-memory per-instance fallback (fail-open) when Supabase is absent or
  erroring, `Retry-After` on 429/503, and a `METAPEEK_API_KEY` bearer
  bypass. Env: `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (see `.env.example`).
- **Request logging** piggybacked on the same rate-limit RPC (zero extra
  round-trips): target URL/host, tier, allow/deny verdict, hashed IP, user
  agent. 90-day retention via pg_cron; raw IPs never stored.
- **og:image grade gate:** a missing or unreachable image caps the score at
  55 (grade F) with `score.gated` + `score.gateReason` in API responses and
  an explanatory banner in the UI. Applied identically in web, API, and CLI.
- **CDN caching for `/api/analyze`** — successful responses cached 60s per
  URL (`Netlify-CDN-Cache-Control` + `Netlify-Vary: query=url`).
- **CLI ↔ shared scorer parity tests** (`tests/integration/cli-parity.test.ts`)
  run the CLI's fixtures through both implementations.
- **Deployed smoke test** (`scripts/smoke-rate-limit.mjs <base-url> [--spa]`)
  bursts a deploy until it sees a 429 — the test class that would have
  caught the unenforced configs.

### Changed

- `tests/unit/rateLimit.test.ts` (config-shape assertions) replaced by
  behavior tests: `rateLimitCore.test.ts` + `rateLimitMiddleware.test.ts`.
- CLI 2.4.0: same og:image grade gate + `gated`/`gateReason` JSON fields.

## [0.14.1] - 2026-06-06

### Fixed

- **Icons bundled offline; no runtime Iconify API calls.** `@nuxt/icon` was
  resolving Heroicons from `api.iconify.design` at runtime, which the strict
  CSP (`connect-src 'self'`) correctly blocked — breaking icons in the browser
  console. Added `icon.clientBundle.scan` (bundles the 38 statically-used icons
  from the already-installed `@iconify-json/heroicons` and
  `@iconify-json/simple-icons` collections into the client) plus
  `icon.fallbackToApi: "server-only"` (the browser never calls the Iconify API;
  the server resolves any stray icon from the local collections). The CSP is
  unchanged. (`nuxt.config.ts`.)

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
