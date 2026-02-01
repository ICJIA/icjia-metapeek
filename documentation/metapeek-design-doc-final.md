# MetaPeek — Meta Tag & Open Graph Previewer

## High-Level Design Document

**Author:** Chris  
**Date:** February 2026  
**Status:** Final  
**Target URL:** metapeek.icjia.app (configurable in `metapeek.config.ts`)

---

## 1. Project Summary

MetaPeek is a fast, clean, single-purpose web tool for inspecting, previewing, and generating HTML meta tags and Open Graph markup. It accepts either a live URL or pasted HTML, extracts all relevant meta/OG/Twitter/structured data tags, renders platform-specific share previews, diagnoses problems, and generates corrected markup.

The tool exists because current alternatives are either ad-bloated, paywalled, single-platform, or preview-only without actionable fixes. MetaPeek is opinionated about being fast and ugly-free.

---

## 2. Core Principles

**Fast.** No loading spinners for local analysis. Pasted HTML should parse and render previews in under 100ms. Live URL fetching should feel snappy — show a skeleton, stream results as they resolve.

**Clean.** No ads. No account walls. No cookie banners. No analytics beyond basic server logs. One page, one input, one purpose.

**Actionable.** Don't just show what's wrong — generate the fix. Every diagnostic should have a corresponding code snippet the user can copy.

**Accessible.** WCAG 2.1 AA compliance is mandatory, not optional. This tool exists to help people build better web experiences — it must exemplify accessibility best practices. Every component, interaction, and state change must be designed with keyboard navigation, screen readers, and assistive technologies as first-class concerns from day one.

**Honest about SPAs.** Most meta tag tools silently fail on client-rendered apps. MetaPeek should explicitly detect and flag when a page appears to be an SPA whose meta tags won't be visible to crawlers or social platform scrapers.

---

## 3. Development Phases

### Phase 1 — Client-Side MVP

The goal is a working tool with zero backend dependencies. Everything runs in the browser.

**Input:** A single text area that accepts either a raw HTML `<head>` block or a full HTML document. No URL fetching yet — just paste and parse.

**Parser:** Extract the following from pasted HTML:

- `<title>`
- `<meta name="description">`
- `<meta name="viewport">`
- `<meta name="robots">`
- `<link rel="canonical">`
- `<link rel="icon">` / `<link rel="shortcut icon">`
- All `<meta property="og:*">` tags
- All `<meta name="twitter:*">` tags
- `<meta name="theme-color">`
- Any `<script type="application/ld+json">` blocks (detect presence, validate JSON parse)

**Preview cards:** Render mock previews for:

- Google Search result (title, URL, description — with truncation at realistic character limits)
- Facebook / LinkedIn share card (og:title, og:description, og:image with 1.91:1 aspect ratio crop preview)
- Twitter/X card (twitter:card type detection — summary vs. summary_large_image, with appropriate layout)
- Slack unfurl (title, description, image, favicon)

**Diagnostics panel:** A checklist showing:

- Present / missing / malformed status for each tag category (color-coded: green, yellow, red)
- Character counts for title and description with platform-specific limits highlighted
- OG image dimension check (if image URL is accessible, fetch and measure; otherwise flag as "unable to verify")
- Warnings for common mistakes: missing og:url, og:type defaulting to "website," twitter:card missing, description duplicated vs. distinct from og:description

**Code generator:** A copyable HTML snippet containing all recommended tags, pre-filled with whatever was extracted plus sensible defaults for anything missing. User can edit values inline before copying. Implementation: contenteditable `<pre>` block with syntax highlighting (using Nuxt UI's code component) or a structured form with individual input fields for each tag value — choose based on which provides better UX during Phase 1 development.

**Deliverable:** A working Nuxt 4 app deployed on Netlify. Single page. No backend.

---

### Phase 2 — Live URL Fetching

Add the ability to enter a URL and have the tool fetch the page's HTML automatically.

**Proxy architecture — two options, both supported:**

Option A: **Netlify serverless function.** A Nitro server route at `/api/fetch` that accepts a URL, performs a server-side HTTP GET, and returns the `<head>` content. This is the default for production.

Option B: **DigitalOcean proxy.** A lightweight Express or Fastify server running on an existing droplet. Single endpoint: `POST /api/fetch` with `{ url: "..." }`. This is the fallback or development option, and useful if Netlify function cold starts become annoying.

The app supports configuring the proxy endpoint via `metapeek.config.ts` (`proxy.externalUrl`) so switching between Netlify functions and the DO proxy requires only a config change and a `git push`.

**Fetch behavior:**

- Set a reasonable User-Agent string (identify as MetaPeek, not as Googlebot or a browser)
- Follow redirects (up to 5 hops), report the redirect chain
- Timeout at 10 seconds
- Return only the `<head>` content plus the first 1KB of `<body>` (enough to detect SPA shell patterns)
- Strip any inline `<script>` content from the response before sending to client (security hygiene)
- No robots.txt checking — MetaPeek is a diagnostic tool, not a crawler. It makes a single GET request on behalf of a human user, comparable to View Source. The complexity of fetching, parsing, and caching robots.txt is not justified for this use case.

**SPA detection heuristics:**

When the fetched HTML is analyzed, flag as "likely SPA" if:

- The `<body>` contains only a single `<div id="app">` or `<div id="__nuxt">` or similar mount point with no meaningful text content
- There are no `<meta property="og:*">` tags but the page loads JavaScript bundles
- The `<title>` is generic (e.g., the framework default) or missing

Implementation uses a scoring system in `useSpaDetection.ts`:

```typescript
interface SPADetectionResult {
  isSPA: boolean
  confidence: 'low' | 'medium' | 'high'
  score: number
  signals: string[]
}

// Scoring signals:
// +3: Body has single mount div (<div id="app">, <div id="__nuxt">, <div id="root">, etc.)
// +2: Title is generic (Vite App, React App, Vue App, Loading..., or matches framework defaults)
// +2: No OG tags but has large JS bundles (script tags with src)
// +1: Body text content < 100 chars (excluding script/style tags)
// +1: Has framework-specific class names (ng-app, v-app, etc.)

// Threshold: score >= 5 = "likely SPA" (medium confidence), score >= 7 = "definitely SPA" (high confidence)
```

Display a clear, non-dismissive warning: "This page appears to be a single-page application. Meta tags may be injected by JavaScript after page load, which means social platforms and search engines will not see them when sharing or indexing this URL. Consider server-side rendering (SSR) or static meta tag injection."

**Input field upgrade:** Replace the text area with a combo input — detect whether the input looks like a URL (starts with http/https or matches a domain pattern) and route to the proxy, otherwise treat as pasted HTML. Keep the paste option explicitly available via a toggle or tab.

**Deliverable:** Live URL fetching works in both dev and production. SPA detection is functional. Proxy is deployable to both Netlify and DigitalOcean.

---

### Phase 3 — Polish & Power Features

**OG image analysis:**

- Fetch the og:image URL client-side first (respecting CORS). If CORS blocks the fetch, fall back to server-side proxy fetch.
- Report actual dimensions, file size, and format
- Show a crop overlay for Facebook (1.91:1), Twitter summary_large_image (2:1), and Twitter summary (1:1) so the user can see what gets cut
- Flag if the image is too small (< 200x200), too large (> 8MB), or an unsupported format
- Note: Server-side image fetching creates a second proxy invocation per URL check. The client-side-first approach minimizes this cost.

**Structured data viewer:**

- Parse any `<script type="application/ld+json">` blocks
- Pretty-print the JSON
- Validate against schema.org basics: does it have @context, @type, and the minimum required properties for its type?
- Don't try to be a full structured data validator (Google's Rich Results Test exists for that) — just surface whether it's present and parseable

**Diff / compare mode:**

- Two-column layout: "Before" and "After"
- Paste or fetch two different URLs (or a URL and a modified HTML block)
- Highlight tag-level differences
- Show preview cards side by side
- Useful for verifying that a deploy actually fixed the meta tags

**Export options:**

- Copy tags as HTML snippet (already in Phase 1)
- Download as `.html` file containing just the `<head>` block
- Copy as JSON (structured representation of all extracted tags)
- View raw HTML debug mode (collapsible section showing the actual `<head>` string returned by the proxy — useful for debugging parsing issues)

**Deliverable:** A polished tool that handles the full inspect-diagnose-fix-verify workflow.

---

## 4. User Stories

These are the concrete ways someone uses MetaPeek day to day. They cover both the paste-HTML workflow (Phase 1, no server needed) and the live-URL workflow (Phase 2, requires proxy). Each story walks through what the user does, what they see, and where MetaPeek adds value over just viewing source.

### Story 1: "I'm building a page locally and want to check my meta tags before I deploy."

**Who:** A developer working on `localhost:3000` in dev mode.

**What happens:**

1. The developer opens MetaPeek in a browser tab.
2. In their local project, they open the page in another tab, right-click → View Page Source, and copy the `<head>` block (or the whole HTML document — MetaPeek doesn't care).
3. They paste it into MetaPeek's text area. The input mode is "Paste HTML" (the default).
4. Instantly — under 100ms, no spinner, no server call — MetaPeek parses the HTML and populates all four preview cards (Google, Facebook, Twitter/X, Slack), the diagnostics panel, and the code generator.
5. The diagnostics panel shows a yellow warning: *"og:image is set to a relative path (`/images/hero.jpg`). Social platforms require an absolute URL. Suggested fix: `https://yourdomain.com/images/hero.jpg`."*
6. The developer fixes the path in the code generator's editable field, copies the corrected snippet, pastes it into their `<head>`, and refreshes the local page.
7. They paste the updated HTML into MetaPeek again. All green. Done.

**Key MetaPeek value:** No waiting. No deploy. No "share on Facebook and see what happens." The developer catches the relative-path mistake before anyone else sees it.

### Story 2: "I just deployed a fix to our OG tags and want to verify it's live."

**Who:** A developer or content person checking a production URL.

**What happens:**

1. They open MetaPeek and switch to the "Fetch URL" tab (Phase 2).
2. They paste `https://icjia.illinois.gov/some-report` into the input field.
3. MetaPeek shows a loading state: the input field gets a subtle animated border, a status line appears below it reading *"Fetching https://icjia.illinois.gov/some-report..."* with an elapsed-time counter, and the preview area shows skeleton placeholders.
4. After ~1.5 seconds, the proxy returns the HTML. The skeletons dissolve into real preview cards. The status line updates to *"Fetched in 1,482ms"* and fades out after a few seconds.
5. The diagnostics panel shows all green for OG tags, but flags a warning: *"twitter:card is missing. Without it, Twitter/X defaults to 'summary' (small image). Add `<meta name="twitter:card" content="summary_large_image">` for the large preview."*
6. They copy the code generator output, which includes the missing twitter:card tag pre-filled, and hand it to the content team.

**Key MetaPeek value:** Immediate visual confirmation that the deploy worked, plus a catch on a tag they didn't know they needed. The loading indicators make the 1.5-second fetch feel intentional rather than broken.

### Story 3: "Someone shared a link on Slack and the preview looked wrong."

**Who:** Anyone — developer, manager, comms person.

**What happens:**

1. They open MetaPeek, paste the problematic URL into the "Fetch URL" field.
2. The fetch takes about 3 seconds (slow server). During the wait, the status line shows *"Fetching... 1s... 2s... 3s"* with a progress indicator. The user knows the tool is working.
3. The Slack preview card renders in MetaPeek. It immediately explains the problem: the og:image is set to a 400×200 pixel image, but Slack requires at least 500×500 for the image to appear. MetaPeek's diagnostics panel shows the image with a red overlay: *"Image too small for Slack unfurl (400×200). Minimum: 500×500."*
4. The Facebook preview card shows the same image cropped awkwardly because it's not 1.91:1. The crop overlay makes the problem obvious.
5. They screenshot the MetaPeek results and drop them in a Slack thread: "Here's why the preview looked wrong — the image is too small."

**Key MetaPeek value:** Non-developers can diagnose the problem themselves without asking a developer to "check the meta tags." The visual previews speak for themselves.

### Story 4: "I'm working on a Vue SPA and my share previews are blank."

**Who:** A developer whose site is client-rendered.

**What happens:**

1. They paste their production URL into MetaPeek's "Fetch URL" field.
2. The fetch returns. MetaPeek detects a near-empty `<body>` — just `<div id="app"></div>` — and zero OG tags.
3. A prominent warning banner appears above the preview cards: *"⚠ This page appears to be a single-page application. The HTML returned by the server contains no meaningful content or meta tags. Social platforms and search engines fetch HTML without executing JavaScript — they will see an empty page. Consider server-side rendering (SSR), static site generation (SSG), or injecting meta tags via server middleware."*
4. The preview cards render blank/default states, confirming the problem visually.
5. The developer pastes their page source from View Source (which includes the client-rendered meta tags that exist after JavaScript runs) into MetaPeek's "Paste HTML" field. Now the previews look correct — confirming that the tags exist in the JS-rendered DOM but not in the server-delivered HTML.
6. The side-by-side contrast between "what the server sends" and "what the browser renders" makes the SSR case to their team lead without further explanation.

**Key MetaPeek value:** The SPA detection warning is specific and actionable, not just "something's wrong." The two-input comparison (fetch vs. paste) demonstrates the problem concretely.

### Story 5: "I want to check a page but the site is slow / unreachable."

**Who:** Anyone fetching a URL that doesn't cooperate.

**What happens:**

1. They paste a URL into the "Fetch URL" field.
2. The status line shows *"Fetching..."* with the elapsed-time counter ticking up: 3s... 5s... 7s...
3. At 8 seconds, the status line color shifts from neutral to a cautionary amber: *"Still waiting... (8s). Target site may be slow."*
4. At 10 seconds, the fetch times out. The status line turns red and displays: *"Request timed out after 10 seconds. The target site did not respond in time. This could mean the site is down, very slow, or blocking automated requests. You can try again, or paste the HTML source directly."*
5. No blank screen. No cryptic error. The user knows exactly what happened and what to try next.

**Key MetaPeek value:** The progressive status feedback — neutral → amber → red, with plain-language messages — means the user never wonders "is it broken or just slow?"

### Story 6: "I hit the rate limit."

**Who:** A power user testing many URLs in a session, or someone who stumbles into the limit.

**What happens:**

1. They've been fetching URLs rapidly — testing a batch of pages after a deploy.
2. On their 31st fetch in a minute, the proxy returns a 429. MetaPeek displays: *"Rate limit reached. You've made too many requests in a short period. Wait a moment and try again. You can still paste HTML directly while waiting."*
3. The paste-HTML input remains fully functional. No lockout. No modal. Just a clear message that the URL-fetch path is temporarily paused.
4. After 60 seconds, the next fetch works normally.

**Key MetaPeek value:** The rate limit message is friendly, not punitive. It explains the situation, gives a timeframe, and offers an alternative (paste mode). The user never feels like the tool is broken — just temporarily throttled.

---

## 5. Loading, Status & Error UX

MetaPeek has exactly two modes: instant local parsing (no network, no waiting) and live URL fetching (network-dependent, potentially slow). The UX must make the boundary between these two modes crystal clear, and must never leave the user staring at an unresponsive screen.

### Design Principle

**The user should always know three things: (1) what MetaPeek is doing right now, (2) how long it's been doing it, and (3) what to do if something goes wrong.** This applies at every stage — input, fetch, parse, render, and error.

### State Machine

Every URL fetch goes through a predictable sequence of states. The UI reflects each one distinctly:

```
IDLE → VALIDATING → FETCHING → PARSING → COMPLETE
                 ↘              ↘            ↘
               INVALID_URL   FETCH_ERROR   PARSE_ERROR
```

Implementation — a composable that manages the fetch lifecycle:

```typescript
// composables/useFetchStatus.ts
type FetchState =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'fetching'; startedAt: number; url: string }
  | { status: 'parsing' }
  | { status: 'complete'; timing: number }
  | { status: 'error'; code: string; message: string; suggestion: string }

// Error codes map to human-readable messages:
const ERROR_MESSAGES: Record<string, { message: string; suggestion: string }> = {
  TIMEOUT: {
    message: 'Request timed out after 10 seconds.',
    suggestion: 'The target site did not respond in time. It may be down, slow, or blocking automated requests. Try again, or paste the page source directly.'
  },
  RATE_LIMITED: {
    message: 'Rate limit reached.',
    suggestion: 'You\'ve made too many requests in a short period. Wait a moment and try again. You can still paste HTML directly while waiting.'
  },
  INVALID_URL: {
    message: 'That doesn\'t look like a valid URL.',
    suggestion: 'Enter a full URL starting with https:// — or switch to the Paste HTML tab to analyze HTML directly.'
  },
  SSRF_BLOCKED: {
    message: 'That URL can\'t be fetched.',
    suggestion: 'MetaPeek can only fetch public URLs. Internal addresses, localhost, and private IP ranges are blocked for security.'
  },
  FETCH_FAILED: {
    message: 'Could not fetch that URL.',
    suggestion: 'The target site returned an error or refused the connection. Check that the URL is correct and the site is publicly accessible.'
  },
  DNS_FAILED: {
    message: 'Could not resolve that hostname.',
    suggestion: 'The domain doesn\'t appear to exist. Check for typos in the URL.'
  },
  RESPONSE_TOO_LARGE: {
    message: 'Response was too large to process.',
    suggestion: 'The target page exceeds 1MB. This is unusual for an HTML page — it may be serving a file download rather than a web page.'
  },
  PARSE_ERROR: {
    message: 'Couldn\'t parse the response as HTML.',
    suggestion: 'The target URL returned content that isn\'t HTML (possibly JSON, XML, or a redirect page). Check that the URL points to a web page.'
  },
  SERVER_ERROR: {
    message: 'MetaPeek encountered an internal error.',
    suggestion: 'This is a problem on our end, not with the target URL. Try again in a moment.'
  },
  NETWORK_ERROR: {
    message: 'Network request failed.',
    suggestion: 'Check your internet connection. If you\'re online, the MetaPeek server may be temporarily unavailable.'
  }
}
```

### Visual Indicators by State

**IDLE.** Input field is ready. No status indicators. Preview area shows either nothing (first visit) or previous results (if a prior analysis was done).

**VALIDATING.** Brief — typically under 50ms. No visible indicator (too fast to see). If validation fails, jump directly to the error state with the `INVALID_URL` or `SSRF_BLOCKED` message.

**FETCHING.** This is the state the user will spend the most time in, so it gets the most attention:

- The input field receives a subtle animated border (a slow pulse or gradient sweep — not a spinner *on* the input, which would obscure the URL).
- A status bar appears directly below the input field:
  - *"Fetching https://example.com..."* — left-aligned, with the URL truncated at 60 characters if needed.
  - An elapsed-time counter on the right: *"1.2s"* — updates every 100ms. This is the single most important UX element during a fetch. Without it, a 3-second wait feels like 10 seconds. With it, the user sees progress.
  - At 5 seconds, the status bar text shifts to amber: *"Still fetching... target site may be slow."*
  - At 8 seconds, the text becomes more explicit: *"Waiting for response... (8s). The request will time out at 10 seconds."*
- The preview area shows skeleton placeholders — gray rounded rectangles in the shape of the preview cards. Not animated loading bars (those imply known progress), just static shapes that say "content will go here."

**PARSING.** Typically under 100ms for HTML parsing and tag extraction. No visible indicator in most cases. If parsing is slow (malformed HTML, very large document), show a brief *"Analyzing HTML..."* message in the status bar.

**COMPLETE.** Skeletons dissolve into real preview cards (a quick fade transition, ~200ms). The status bar shows: *"Fetched in 1,482ms"* in green, then fades out after 3 seconds. The elapsed-time counter stops. Diagnostics and code generator populate simultaneously.

**ERROR.** The status bar turns red and displays the error message. Below it, a suggestion line in normal (non-red) text explains what to do next. The preview area shows no skeletons — just an empty state with the error context. The input field remains editable so the user can correct the URL and try again immediately. **Errors never lock the UI.** The paste-HTML tab always remains functional regardless of fetch errors.

### Toast Notifications

Toasts (via Nuxt UI's `useToast`) are used sparingly and only for events that aren't visible in the main content area:

- **Clipboard copy confirmation:** *"HTML snippet copied to clipboard."* (success toast, auto-dismisses in 2 seconds)
- **Rate limit warning approaching:** Not used. The rate limit is enforced server-side; the client only sees the 429 response, which is handled by the error state above.

Toasts are **not** used for fetch status, errors, or loading states — those belong in the status bar, in context, not in a floating notification that fights for attention.

### Error Mapping from Proxy to UI

The proxy server returns structured errors that the client maps to the error codes above:

```typescript
// In useFetchProxy.ts — map proxy responses to error codes
function mapProxyError(statusCode: number, body: any): string {
  if (statusCode === 429) return 'RATE_LIMITED'
  if (statusCode === 400) {
    const msg = body?.message || ''
    if (msg.includes('Invalid URL')) return 'INVALID_URL'
    if (msg.includes('private IP') || msg.includes('Internal address')) return 'SSRF_BLOCKED'
    if (msg.includes('resolve hostname')) return 'DNS_FAILED'
    if (msg.includes('URL too long')) return 'INVALID_URL'
    return 'FETCH_FAILED'
  }
  if (statusCode === 504 || body?.message?.includes('timeout')) return 'TIMEOUT'
  if (statusCode === 502) return 'FETCH_FAILED'
  if (statusCode >= 500) return 'SERVER_ERROR'
  return 'FETCH_FAILED'
}

// Network-level failures (never reached the proxy)
function mapNetworkError(error: Error): string {
  if (error.name === 'AbortError') return 'TIMEOUT'
  if (error.message?.includes('Failed to fetch')) return 'NETWORK_ERROR'
  return 'SERVER_ERROR'
}
```

### Accessibility Requirements for Status Indicators

All loading and error states must be accessible:

- The status bar uses `role="status"` and `aria-live="polite"` so screen readers announce state changes without interrupting the user.
- Error states use `role="alert"` for immediate announcement.
- Color is never the only indicator: green/amber/red status is always accompanied by text and, where appropriate, an icon (✓, ⚠, ✕).
- The elapsed-time counter does *not* use `aria-live` (it would flood the screen reader with updates every 100ms). Instead, the screen reader hears only the state transitions: *"Fetching..."* → *"Fetched in 1.5 seconds"* or *"Error: Request timed out."*
- Skeleton placeholders use `aria-hidden="true"` — they are visual-only affordances and convey no information that the status bar doesn't already provide.
- On transition from `FETCHING` to `COMPLETE`, the status text includes a summary announcement: *"Loaded 4 preview cards and diagnostics."* This confirms success for screen reader users without requiring them to navigate through each component.

---

## 6. Overall Structure

```
metapeek/
├── metapeek.config.ts             # All tunable settings — single source of truth
├── app/
│   ├── pages/
│   │   └── index.vue              # Single-page app — everything lives here
│   ├── components/
│   │   ├── InputPanel.vue         # URL/HTML input with mode toggle
│   │   ├── StatusBar.vue          # Fetch status, elapsed time, error messages
│   │   ├── SkeletonPreviews.vue   # Placeholder shapes during fetch
│   │   ├── PreviewGoogle.vue      # Google SERP mock
│   │   ├── PreviewFacebook.vue    # Facebook/LinkedIn share card mock
│   │   ├── PreviewTwitter.vue     # Twitter/X card mock
│   │   ├── PreviewSlack.vue       # Slack unfurl mock
│   │   ├── DiagnosticsPanel.vue   # Tag checklist with status indicators
│   │   ├── CodeGenerator.vue      # Editable + copyable HTML output
│   │   ├── ImageAnalysis.vue      # OG image crop preview (Phase 3)
│   │   ├── StructuredData.vue     # JSON-LD viewer (Phase 3)
│   │   └── DiffView.vue           # Side-by-side comparison (Phase 3)
│   ├── composables/
│   │   ├── useMetaParser.ts       # Core HTML-to-tags extraction logic (client-side, uses DOMParser)
│   │   ├── useFetchProxy.ts       # URL fetching via proxy (Phase 2)
│   │   ├── useFetchStatus.ts      # Fetch state machine + error mapping (see section 5)
│   │   ├── useDiagnostics.ts      # Tag validation and scoring
│   │   └── useSpaDetection.ts     # SPA heuristics (Phase 2)
│   └── utils/
│       ├── constants.ts           # Character limits, required tags, platform specs
│       ├── errorMessages.ts       # Error code → message + suggestion mapping
│       └── tagDefaults.ts         # Sensible defaults for missing tags
├── server/
│   ├── api/
│   │   └── fetch.post.ts          # Nitro server route — URL proxy (Phase 2)
│   └── utils/
│       └── proxy.ts               # Shared security utilities (validateUrl, extractHead, etc.)
├── nuxt.config.ts
├── package.json
└── netlify.toml
```

### metapeek.config.ts — Central Configuration

All tunable settings live in a single TypeScript file at the project root. This file is checked into version control, so every change is tracked and deployed automatically via `git push` to Netlify. No `.env` files, no Netlify dashboard environment variable management, no drift between local and production.

The only exception is `METAPEEK_API_KEY`, which remains a Netlify environment variable because it is a secret and must not be committed to source control.

```typescript
// metapeek.config.ts

const metapeekConfig = {
  // ── Identity ──────────────────────────────────────────────
  site: {
    name: 'MetaPeek',
    url: 'https://metapeek.icjia.app',         // canonical URL — used in CORS, User-Agent, og:url
    description: 'Inspect, preview, and fix HTML meta tags and Open Graph markup.',
  },

  // ── Proxy ─────────────────────────────────────────────────
  proxy: {
    // When set, the client calls this URL instead of the built-in /api/fetch route.
    // Leave null to use the Nitro server route (Netlify default).
    // Set to a DigitalOcean URL (e.g. 'https://proxy.example.com/api/fetch') to use the DO proxy.
    externalUrl: null as string | null,

    userAgent: 'MetaPeek/1.0 (+https://metapeek.icjia.app)',
    fetchTimeoutMs: 10_000,                     // abort fetch after this long
    maxResponseBytes: 1_048_576,                // 1MB — abort if response exceeds this
    maxRedirects: 5,                            // follow up to N redirects
    maxUrlLength: 2048,                         // reject URLs longer than this
    allowHttpInDev: true,                       // allow http:// URLs in development mode
  },

  // ── Rate Limiting ─────────────────────────────────────────
  rateLimit: {
    windowLimit: 30,                            // max requests per window per IP
    windowSize: 60,                             // window duration in seconds
    aggregateBy: ['ip', 'domain'] as const,     // Netlify rate limit aggregation
  },

  // ── CORS ──────────────────────────────────────────────────
  cors: {
    // Origins allowed to call /api/fetch. The site URL is always included.
    // Add localhost origins for development.
    allowedOrigins: [
      'https://metapeek.icjia.app',
      'http://localhost:3000',
    ],
    allowedMethods: ['POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },

  // ── Favicon ───────────────────────────────────────────────
  favicon: {
    // Client-side fallback: if no <link rel="icon"> is found in the HTML,
    // construct {origin}/favicon.ico and attempt to load it in the browser.
    // This avoids a second server-side invocation.
    clientSideFallback: true,
  },

  // ── Diagnostics ───────────────────────────────────────────
  diagnostics: {
    flagNoindex: true,                          // warn if <meta name="robots" content="noindex"> is present
    flagNoFollow: true,                         // warn if nofollow is present
  },
} as const

export default metapeekConfig
export type MetaPeekConfig = typeof metapeekConfig
```

**How it's consumed:**

On the client side, import directly:

```typescript
import metapeekConfig from '~/metapeek.config'
// metapeekConfig.site.url, metapeekConfig.proxy.fetchTimeoutMs, etc.
```

On the server side (Nitro routes), import the same file. See section 9 for the full `fetch.post.ts` implementation, which also demonstrates the Netlify rate limit config export.

For CORS in `nuxt.config.ts`, you can use dynamic reflection if multiple origins are needed, or static header for single origin:

```typescript
// nuxt.config.ts
import metapeekConfig from './metapeek.config'

export default defineNuxtConfig({
  routeRules: {
    '/api/**': {
      cors: true,
      // For single origin (launch default):
      headers: {
        'Access-Control-Allow-Origin': metapeekConfig.cors.allowedOrigins[0],
        'Access-Control-Allow-Methods': metapeekConfig.cors.allowedMethods.join(', '),
        'Access-Control-Allow-Headers': metapeekConfig.cors.allowedHeaders.join(', '),
      }
      // For multiple origins, use server middleware with dynamic reflection:
      // Check request Origin header against allowedOrigins array and reflect it back
    }
  }
})
```

**What stays in `.env` / Netlify environment variables:**

Only secrets that must never be committed to source control:

| Variable | Where set | Purpose |
|----------|-----------|---------|
| `METAPEEK_API_KEY` | Netlify dashboard only | Bearer token for proxy auth (dormant at launch) |
| `NODE_ENV` | Set automatically by Netlify | Controls `allowHttpInDev` and error verbosity |

Everything else — URLs, timeouts, rate limits, feature flags — lives in `metapeek.config.ts` and deploys with the code.

**Key architectural decisions:**

- **Nuxt 4 with SSR mode.** The app itself benefits from SSR for its own meta tags (practice what you preach), but the core parsing logic runs client-side for speed. The server route handles only the URL proxy.
- **Nuxt UI for components.** Buttons, inputs, tabs, code blocks, toast notifications. No custom design system — use the defaults and move on.
- **Single-page layout.** No routing. Input at top, results below. Vertically scrollable sections. Mobile-responsive but desktop-optimized (this is a developer tool).
- **TypeScript throughout.** The meta parser needs well-defined types for extracted tags, diagnostics, and preview data.
- **Config in code, not environment.** All non-secret configuration lives in `metapeek.config.ts`. Change a value, push to git, Netlify deploys it. No dashboard clicking, no `.env` file synchronization, no drift.

---

## 7. Must-Haves

1. **Instant client-side parsing.** Pasting HTML and seeing results must feel instantaneous. No round-trip to a server for analysis.

2. **Accurate preview mockups.** The Google, Facebook, Twitter, and Slack previews must closely match actual platform rendering — correct fonts, truncation behavior, image cropping, and layout. If a preview looks wrong in MetaPeek but fine on the actual platform (or vice versa), the tool is lying and that's worse than not having it.

3. **Copy-paste code output.** The generated HTML snippet must be valid, complete, and ready to drop into a `<head>` block. No "TODO" placeholders.

4. **SPA detection that's helpful, not judgmental.** The warning should explain the problem and suggest solutions (SSR, prerendering, meta tag injection via server middleware) rather than just saying "this is broken."

5. **Works without JavaScript for the tool's own SEO.** The landing page (input field, description of what the tool does) should render server-side. The interactive analysis obviously requires JS.

6. **WCAG 2.1 AA Accessibility Compliance (Mandatory).** This is a non-negotiable requirement that must be built into every component from the start, not retrofitted later. Specific requirements:
   - **Keyboard Navigation:** All interactive elements must be fully keyboard accessible. Logical tab order. Visible focus indicators on all focusable elements.
   - **Screen Reader Support:** Proper ARIA labels, roles, and live regions. Status changes must be announced. Loading states and errors must be communicated clearly.
   - **Color Independence:** Color is never the sole indicator of status. All status indicators use icon + text + color together.
   - **Contrast:** Minimum 4.5:1 contrast ratio for normal text, 3:1 for large text and UI components. Test with a contrast checker.
   - **Focus Management:** Focus moves logically through the page. When content loads dynamically, focus is managed appropriately.
   - **Form Labels:** All inputs have associated labels. Error messages are programmatically associated with their fields.
   - **Alternative Text:** All images have appropriate alt text or are marked decorative.
   - **Responsive Text:** Text can be resized to 200% without loss of functionality.
   - **Testing Required:** Test with keyboard-only navigation, NVDA/JAWS/VoiceOver, and automated tools (axe DevTools, Lighthouse) before considering any component complete.

7. **Fast proxy with sensible limits.** The URL fetch proxy must timeout at 10 seconds, limit response size (strip body beyond what's needed), and not follow redirects into infinite loops. Netlify-native rate limiting (30 requests/IP/minute) is active from launch — see section 9 for details.

8. **HTTPS only.** The proxy should refuse to fetch non-HTTPS URLs in production. In development, allow HTTP for localhost testing.

9. **Visible loading and error states.** The user must never stare at an unresponsive screen. Every URL fetch shows an elapsed-time counter, progressive status messages, and skeleton placeholders. Every error shows a plain-language message with a specific suggestion for what to try next. See section 5 for the full state machine and error catalog. All states must be accessible (see #6).

---

## 8. Must-Avoids

1. **No headless browser rendering.** Don't use Puppeteer or Playwright to generate "real" screenshots of how platforms render the page. It's expensive, slow, fragile, and the mock previews are more useful anyway because they highlight the raw tag data rather than hiding it behind a screenshot.

2. **No user accounts, no database, no persistence.** This is a stateless tool. Enter input, get output, done. Shareable URLs are supported via query parameters (see section 11, resolved decision #2), but the tool itself stores nothing.

3. **No bulk URL scanning.** One URL at a time. Bulk scanning is a different product with different infrastructure needs. Don't let it creep in.

4. **No real-time monitoring or alerts.** "Track your meta tags over time" is a SaaS play. This is a utility.

5. **No third-party analytics or tracking scripts.** No Google Analytics, no Hotjar, no Intercom. If you want usage data later, add a simple server-side counter via the proxy endpoint logs.

6. **No client-side caching of fetched URLs.** Each fetch should be fresh. Stale meta tag data is worse than no data.

7. **No attempt to execute JavaScript from fetched pages.** The proxy returns raw HTML only. Never eval, never render, never sandbox. The fetched content is untrusted.

8. **No scope creep into SEO auditing.** MetaPeek checks meta tags and Open Graph data. It does not check page speed, broken links, heading hierarchy, alt text, or keyword density. There are excellent tools for those things. Stay in your lane.

---

## 9. Proxy Architecture — Detailed Comparison

The URL fetch proxy is the only server-side component in MetaPeek. Both deployment options serve the same purpose — accept a URL from the client, fetch the target page's HTML server-side (bypassing CORS), extract the relevant portions, and return them. The client doesn't care which backend it's talking to; the request/response contract is identical.

### Shared Request/Response Contract

Both proxy implementations expose the same interface:

**Request:** `POST /api/fetch`

```json
{
  "url": "https://example.com/some-page"
}
```

**Response:**

```json
{
  "ok": true,
  "url": "https://example.com/some-page",
  "finalUrl": "https://example.com/some-page/",
  "redirectChain": [
    { "status": 301, "from": "https://example.com/some-page", "to": "https://example.com/some-page/" }
  ],
  "statusCode": 200,
  "contentType": "text/html; charset=utf-8",
  "head": "<!DOCTYPE html><html>...<head>...</head>",
  "bodySnippet": "<body><div id=\"app\"></div></body>",
  "fetchedAt": "2026-02-01T12:00:00Z",
  "timing": 342
}
```

The `head` field contains the full `<head>` block. The `bodySnippet` field contains the first ~1KB of `<body>` content (enough for SPA detection heuristics). No full body is ever returned to the client.

The Nuxt app selects which proxy to call based on `metapeekConfig.proxy.externalUrl`. When `null` (the default), the client calls the Nuxt app's own `/api/fetch` endpoint, which Netlify deploys as a serverless function automatically. To switch to the DigitalOcean proxy, set the URL in `metapeek.config.ts`, push, and Netlify redeploys.

---

### Option A: Netlify Serverless Function (via Nitro Server Route)

**How it works:** Nuxt 4's Nitro server engine compiles files in `server/api/` into serverless functions automatically when deployed to Netlify. The file `server/api/fetch.post.ts` becomes a Netlify Function without any additional configuration beyond what's already in `netlify.toml`. There is no separate function directory, no separate deploy step, and no separate runtime to manage. You write a Nitro event handler, push to git, and Netlify builds and deploys it as a function alongside the rest of the Nuxt app.

**What the code looks like:**

```typescript
// server/api/fetch.post.ts
import { defineEventHandler, readBody, createError } from 'h3'
import { ofetch } from 'ofetch'
import { validateUrl, extractHead, extractBodySnippet } from '~/server/utils/proxy'
import metapeekConfig from '~/metapeek.config'

export default defineEventHandler(async (event) => {
  // ── Request shape validation ──────────────────────────────
  const body = await readBody(event)

  if (!body || typeof body !== 'object' || typeof body.url !== 'string') {
    throw createError({ statusCode: 400, message: 'Invalid request body' })
  }
  if (body.url.length > metapeekConfig.proxy.maxUrlLength) {
    throw createError({ statusCode: 400, message: 'URL too long' })
  }
  const allowedKeys = new Set(['url'])
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      throw createError({ statusCode: 400, message: 'Unexpected field in request' })
    }
  }

  // ── SSRF validation ───────────────────────────────────────
  const validation = await validateUrl(body.url)
  if (!validation.ok) {
    throw createError({ statusCode: 400, message: validation.reason })
  }

  // ── Fetch target URL ──────────────────────────────────────
  const startTime = Date.now()
  const redirectChain: Array<{ status: number; from: string; to: string }> = []
  let previousUrl = body.url

  const html = await ofetch(body.url, {
    headers: { 'User-Agent': metapeekConfig.proxy.userAgent },
    timeout: metapeekConfig.proxy.fetchTimeoutMs,
    redirect: 'follow',
    maxRedirects: metapeekConfig.proxy.maxRedirects,
    responseType: 'text',
    onResponse({ response }) {
      // Capture redirect chain
      if (response.redirected && response.url !== previousUrl) {
        redirectChain.push({
          status: response.status,
          from: previousUrl,
          to: response.url
        })
        previousUrl = response.url
      }
    }
  })

  return {
    ok: true,
    url: body.url,
    finalUrl: previousUrl, // updated via onResponse hook if redirected
    redirectChain,
    statusCode: 200,
    contentType: 'text/html',
    head: extractHead(html),
    bodySnippet: extractBodySnippet(html),
    fetchedAt: new Date().toISOString(),
    timing: Date.now() - startTime
  }
})

// ── Netlify-native rate limiting ────────────────────────────
// Enforced at the edge, before function invocation.
// Values come from metapeek.config.ts — change them there, not here.
//
// IMPORTANT: Netlify reads this export at deploy time and expects the name
// "config". Since our import is named "metapeekConfig", there's no collision.
// If the deploy log doesn't mention rate limiting, the export format may be wrong.
export const config = {
  path: '/api/fetch',
  rateLimit: {
    windowLimit: metapeekConfig.rateLimit.windowLimit,
    windowSize: metapeekConfig.rateLimit.windowSize,
    aggregateBy: [...metapeekConfig.rateLimit.aggregateBy],
  },
}
```

**Characteristics (Netlify Pro — Legacy Plan):**

- **Cold starts:** Netlify Functions spin up on demand. First request after a period of inactivity typically adds 200–500ms. Subsequent requests within the warm window (~5–15 minutes) are fast. For a tool you're using intermittently throughout the day, you'll hit cold starts regularly. This is noticeable but not a dealbreaker.
- **Execution limits:** Netlify Functions default to a 10-second timeout. On Pro, you can request an increase to 26 seconds by contacting Netlify support — this is routine and they do it quickly. **Action item: request the 26-second timeout bump before starting Phase 2 development.** With a 26-second ceiling, the fetch timeout can stay at a comfortable 10 seconds with 16 seconds of headroom for function overhead, DNS resolution in the SSRF check, and response parsing.
- **Concurrency:** Netlify handles concurrent invocations automatically. No configuration needed. Each invocation is isolated.
- **Native rate limiting (Pro).** Netlify Pro supports up to 5 code-based rate limiting rules per project, enforced at the edge *before* the function is invoked. Rate-limited requests return a 429 and do not count against your invocation quota. This is the primary defense against abuse and overage charges.
- **Cost and overage exposure:** The Legacy Pro plan includes 125,000 serverless function invocations per site per month. Exceeding this triggers a $25 overage package. As the sole user, you will not approach this limit — even fetching 100 URLs per day is only ~3,000/month. The risk is external abuse: someone discovering the endpoint and hammering it. The layered security approach (rate limiting at the edge + SSRF validation + CORS) is designed to prevent this without requiring a URL allowlist or bearer token at launch.
- **Logging:** Netlify provides function logs in the dashboard. Basic but functional. Includes invocation count, duration, and errors. Monitor the invocation count weekly during the first month after launch to establish a baseline.
- **No process management.** No PM2, no systemd, no SSH. Push to git and it deploys. This is the primary advantage.

**When to use this option:** Production default. Zero ops overhead. The Pro plan's native rate limiting and extended timeout make it the right choice for launch.

---

### Option B: DigitalOcean Persistent Server

**How it works:** A standalone Express (or Fastify) server running on one of your existing DigitalOcean droplets, kept alive by PM2. It runs continuously, listens on a port, and responds to POST requests. You reverse-proxy it through Nginx (which you likely already have on the droplet) to get HTTPS termination and a clean URL.

**What the code looks like:**

```typescript
// proxy-server/src/index.ts
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { validateUrl, extractHead, extractBodySnippet } from './utils/proxy'

const app = express()
const PORT = process.env.PORT || 3847  // pick something non-obvious

// Middleware
app.use(helmet())
app.use(express.json({ limit: '1kb' }))  // tiny payloads only

// CORS — restrict to your known frontends
app.use(cors({
  origin: [
    'https://metapeek.icjia.app',
    'http://localhost:3000',    // Nuxt dev server
  ],
  methods: ['POST'],
}))

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 60,                     // 60 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Rate limit exceeded' }
})
app.use('/api/fetch', limiter)

// Health check (useful for uptime monitoring)
app.get('/health', (req, res) => res.json({ status: 'ok' }))

// Main endpoint
app.post('/api/fetch', async (req, res) => {
  const { url } = req.body
  const validation = validateUrl(url)
  if (!validation.ok) {
    return res.status(400).json({ ok: false, error: validation.reason })
  }

  try {
    const startTime = Date.now()
    const redirectChain: Array<{ status: number; from: string; to: string }> = []
    let previousUrl = url
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MetaPeek/1.0 (+https://metapeek.icjia.app)' },
      signal: AbortSignal.timeout(10_000),
      redirect: 'manual',  // handle redirects manually to capture chain
    })

    // Track redirect chain
    let currentResponse = response
    while ([301, 302, 303, 307, 308].includes(currentResponse.status)) {
      const nextUrl = currentResponse.headers.get('location')
      if (!nextUrl) break
      
      redirectChain.push({
        status: currentResponse.status,
        from: previousUrl,
        to: nextUrl
      })
      
      previousUrl = nextUrl
      currentResponse = await fetch(nextUrl, {
        headers: { 'User-Agent': 'MetaPeek/1.0 (+https://metapeek.icjia.app)' },
        signal: AbortSignal.timeout(10_000),
        redirect: 'manual',
      })
      
      if (redirectChain.length >= 5) break // max redirects
    }

    const html = await currentResponse.text()

    res.json({
      ok: true,
      url,
      finalUrl: previousUrl,
      redirectChain,
      statusCode: currentResponse.status,
      contentType: currentResponse.headers.get('content-type'),
      head: extractHead(html),
      bodySnippet: extractBodySnippet(html),
      fetchedAt: new Date().toISOString(),
      timing: Date.now() - startTime,
    })
  } catch (err) {
    res.status(502).json({ ok: false, error: 'Failed to fetch target URL' })
  }
})

app.listen(PORT, () => console.log(`MetaPeek proxy listening on ${PORT}`))
```

**PM2 setup:**

```bash
# Install PM2 globally (once)
npm install -g pm2

# Start the proxy
pm2 start dist/index.js --name metapeek-proxy

# Auto-restart on crash, auto-start on server reboot
pm2 save
pm2 startup  # generates the systemd command to run

# Monitor
pm2 status
pm2 logs metapeek-proxy
```

**Nginx reverse proxy config (on the droplet):**

```nginx
server {
    listen 443 ssl http2;
    server_name proxy.metapeek.icjia.app;  # or a subdomain of an existing domain

    ssl_certificate     /etc/letsencrypt/live/proxy.metapeek.icjia.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/proxy.metapeek.icjia.app/privkey.pem;

    # Restrict request size
    client_max_body_size 1k;

    location /api/fetch {
        proxy_pass http://127.0.0.1:3847;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeout the proxy pass itself
        proxy_read_timeout 15s;
        proxy_connect_timeout 5s;
    }

    location /health {
        proxy_pass http://127.0.0.1:3847;
    }

    # Block everything else
    location / {
        return 404;
    }
}
```

**Characteristics:**

- **No cold starts.** The server is always running. First request is as fast as any other. Response times are limited only by the target URL's speed.
- **Full control over runtime.** You can tune Node.js flags, increase memory, adjust ulimits, run multiple worker processes via PM2 cluster mode if needed (you won't need this for MetaPeek, but it's available).
- **Requires maintenance.** You need to SSH in occasionally to update Node.js, update dependencies, check PM2 status, renew SSL certs (Certbot handles this automatically, but you should verify it's running). If the droplet reboots, PM2 startup should restart the process automatically — but you should verify this works after initial setup.
- **Cost:** If the droplet is already running and not resource-constrained, the marginal cost is zero. The MetaPeek proxy will use negligible CPU and memory. If you're running this on a $6/month droplet that's already hosting other non-critical services, there's no additional cost.
- **Logging:** PM2 logs are local files. You can tail them, rotate them, or pipe them to whatever you want. More flexible than Netlify's dashboard but requires you to manage it.

**When to use this option:** When you want instant response times, when you're developing locally and want a persistent proxy to test against, or when Netlify function limits become an issue (they won't, but it's nice to have the escape hatch).

---

### Side-by-Side Comparison

| Concern | Netlify Function (Pro) | DigitalOcean + PM2 |
|---------|------------------------|-------------------|
| Cold start latency | 200–500ms on first hit | None — always warm |
| Function timeout | 26 seconds (request bump from support) | No limit (your server, your rules) |
| Deployment | `git push` | `ssh` → `git pull` → `pm2 restart` |
| SSL/HTTPS | Automatic via Netlify | Certbot + Nginx (manual setup, auto-renew) |
| Rate limiting | Native edge-level, 5 rules/project (Pro) | Full control via express-rate-limit |
| Invocation cap | 125K/site/month, $25 overage per package | Unlimited (your server, your cost) |
| Logging | Netlify dashboard (limited retention) | PM2 logs on disk (unlimited, your responsibility) |
| Cost (solo use) | $19/month (Pro plan, already paying) | Free (on existing droplet) |
| Cost (public use) | $19/month + potential $25 overage packages | Free (on existing droplet) |
| Process management | None needed | PM2 + systemd startup hook |
| Scaling | Automatic | Manual (PM2 cluster mode if needed) |
| Ops burden | Near zero | Low but nonzero — updates, monitoring, cert checks |
| Best for | Production default, zero-ops, launch | Dev environment, latency-sensitive use, fallback |

---

### Security Concerns and Mitigations

The fetch proxy is fundamentally an HTTP relay — it accepts a URL from a client and makes an outbound request on the client's behalf. This is an inherently risky pattern. The following threats apply to both Netlify and DigitalOcean deployments unless noted otherwise.

#### Threat 1: Server-Side Request Forgery (SSRF)

**The risk:** An attacker submits a URL like `http://169.254.169.254/latest/meta-data/` (cloud instance metadata), `http://localhost:6379/` (local Redis), or `file:///etc/passwd`. The proxy fetches it and returns internal data that should never be exposed.

**Mitigation — URL validation layer (shared by both deployments):**

```typescript
// server/utils/proxy.ts (or proxy-server/src/utils/proxy.ts)
import { URL } from 'node:url'
import dns from 'node:dns/promises'
import metapeekConfig from '~/metapeek.config'

interface ValidationResult {
  ok: boolean
  reason?: string
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
])

export async function validateUrl(input: string): Promise<ValidationResult> {
  // Must be a string
  if (typeof input !== 'string' || input.trim().length === 0) {
    return { ok: false, reason: 'URL is required' }
  }

  // Must parse as a valid URL
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return { ok: false, reason: 'Invalid URL format' }
  }

  // Protocol whitelist — HTTPS only in production, allow HTTP in dev
  const allowedProtocols = process.env.NODE_ENV === 'production'
    ? ['https:']
    : metapeekConfig.proxy.allowHttpInDev ? ['https:', 'http:'] : ['https:']

  if (!allowedProtocols.includes(parsed.protocol)) {
    return { ok: false, reason: `Protocol not allowed: ${parsed.protocol}` }
  }

  // Block known internal hostnames
  if (BLOCKED_HOSTNAMES.has(parsed.hostname)) {
    return { ok: false, reason: 'Internal addresses are not allowed' }
  }

  // Resolve DNS and check for private/reserved IP ranges
  try {
    const addresses = await dns.resolve4(parsed.hostname)
    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        return { ok: false, reason: 'URL resolves to a private IP address' }
      }
    }
  } catch {
    return { ok: false, reason: 'Could not resolve hostname' }
  }

  return { ok: true }
}

function isPrivateIp(ip: string): boolean {
  // Check RFC 1918, loopback, link-local, and cloud metadata ranges
  const parts = ip.split('.').map(Number)
  if (parts[0] === 10) return true                                    // 10.0.0.0/8
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true  // 172.16.0.0/12
  if (parts[0] === 192 && parts[1] === 168) return true              // 192.168.0.0/16
  if (parts[0] === 127) return true                                    // 127.0.0.0/8
  if (parts[0] === 169 && parts[1] === 254) return true              // 169.254.0.0/16 (link-local + cloud metadata)
  if (parts[0] === 0) return true                                      // 0.0.0.0/8
  return false
}
```

This validation runs before any fetch is made. It's the single most important security control in the application.

**DigitalOcean-specific note:** On a droplet, the proxy process can reach other services on the same machine (databases, other apps on localhost ports). The DNS resolution + private IP check above handles the `localhost` case, but also consider running the proxy as a non-root user with no access to sensitive local services. If the droplet runs other things on non-standard ports, the proxy can't reach them by IP — but be aware that the hostname could theoretically resolve to `127.0.0.1` if someone controls a DNS record. The DNS resolution check above catches this.

**Netlify-specific note:** Netlify Functions run in isolated AWS Lambda containers. There's less attack surface for local service discovery, but the cloud metadata endpoint (`169.254.169.254`) is a real concern — the IP check above blocks it.

#### Threat 2: Open Relay / Abuse

**The risk:** Someone discovers your proxy endpoint and uses it to make arbitrary HTTP requests from your infrastructure — scraping sites, hitting APIs, participating in DDoS, or bypassing IP-based access controls. On the Pro plan, this also threatens to push you past the 125K invocation cap and trigger overage charges.

**Mitigation — Layered defense (no URL allowlist required):**

The strategy is to stack multiple cheap, low-friction defenses so that no single layer has to be perfect. The design explicitly avoids maintaining a list of allowed target URLs, which would be onerous to maintain and would defeat the purpose of a general-purpose diagnostic tool.

**Layer 1: Netlify-native rate limiting.** Enforced at the CDN edge, *before* the function is even invoked. Requests that exceed the limit receive a 429 and do not count against your invocation quota. The `aggregateBy: ['ip', 'domain']` setting means each visitor IP gets its own counter scoped to your domain. Implementation is in the `config` export of `fetch.post.ts` (shown in the Option A code above). Check the deploy log after each deploy to verify the rule was detected.

**Layer 2: CORS restriction.** Configured in `nuxt.config.ts` (shown in section 6). Blocks casual browser-based abuse from other origins. Note: CORS only blocks browser-based requests. Someone using curl or a script bypasses CORS entirely. It's a speed bump, not a wall — but it's free and eliminates the most common accidental abuse vector.

**Layer 3: Request shape validation.** Included in the `fetch.post.ts` handler (shown in Option A code above). Validates that the body is a JSON object with a single `url` string field, no other fields, and a reasonable maximum length. Cheap insurance against malformed requests and probing.

**Layer 4 (dormant): Bearer token.**

Not enabled at launch. The code is present but skipped when `METAPEEK_API_KEY` is unset:

```typescript
// server/middleware/auth.ts (or inline in the handler)
const API_KEY = process.env.METAPEEK_API_KEY

// If a key is configured, enforce it. If not, skip auth entirely.
if (API_KEY) {
  const authHeader = getHeader(event, 'authorization')
  if (authHeader !== `Bearer ${API_KEY}`) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
}
```

To activate: set `METAPEEK_API_KEY` in the Netlify environment variables dashboard. The next deploy picks it up. No code change required. Since MetaPeek's proxy call originates from the Nuxt server route (same deployment), the Nuxt app can read the same env var and attach the header to its own internal fetch — the token never reaches the browser.

**When to activate the bearer token:**

- You see unexpected invocation volume in the Netlify dashboard
- You deploy the DigitalOcean proxy as a public-facing endpoint
- You add any capability beyond fetching public HTML (authenticated fetches, image processing, etc.)
- You move to a pricing plan where function invocations have higher per-unit cost

**What is deliberately NOT in this stack:**

- **No URL allowlist.** You should be able to inspect any public URL without maintaining a list. The SSRF validation (Threat 1) blocks internal/private URLs; everything else is fair game.
- **No CAPTCHA or human verification.** This is a developer tool, not a consumer product. CAPTCHAs would wreck the workflow.
- **No API key requirement at launch.** The rate limit + CORS + request validation stack is sufficient for a tool with no public audience yet. Adding auth friction before it's needed slows down development and testing.
- **No robots.txt checking.** MetaPeek is a diagnostic tool, not a crawler. It doesn't index, store, or revisit pages. A single GET request initiated by a human user is closer to "View Source" than to Googlebot. The complexity of fetching, parsing, and caching robots.txt on every request is not justified.

**Escalation path if abuse occurs:**

1. *First sign of unusual traffic:* Check Netlify function logs and invocation counts. If a single IP is responsible, the rate limit is already handling it.
2. *Distributed abuse (many IPs):* Activate the bearer token by setting `METAPEEK_API_KEY` in the Netlify environment variables dashboard. This immediately blocks all unauthenticated requests.
3. *Sustained abuse after token activation:* Switch the proxy to the DigitalOcean deployment (set `proxy.externalUrl` in `metapeek.config.ts` and push), which gives you full control over firewall rules, IP banning, and rate limiting configuration.
4. *Nuclear option:* Temporarily disable the `/api/fetch` route entirely by returning a 503. The client-side paste-and-parse functionality continues to work.

**DigitalOcean-specific abuse mitigation:** On the DO proxy, express-rate-limit (shown in the Option B code above) provides the same per-IP throttling. Additionally, Nginx's `limit_req` module can add a second rate limiting layer at the reverse proxy level, and iptables/ufw rules can block specific IPs at the OS level. The DO proxy also supports CORS restrictions via the Express middleware shown above.

#### Threat 3: Response Smuggling / XSS via Fetched Content

**The risk:** The proxy fetches a page that contains malicious HTML or JavaScript. If that content is returned to the client and rendered unsafely, it could execute in the context of the MetaPeek domain.

**Mitigations:**

**Never render fetched HTML as HTML.** The client receives the extracted tags as structured data and renders its own preview components. The raw HTML string from the proxy is parsed by DOMParser or cheerio and then discarded. At no point should fetched HTML be injected into the DOM via `v-html` or `innerHTML`.

**Strip `<script>` tags on the server.** Before returning the `head` and `bodySnippet` fields, the proxy removes all `<script>` tags except `<script type="application/ld+json">` (which is data, not executable code). This is defense in depth — even if the client accidentally renders something, there's no executable script in the payload.

```typescript
export function extractHead(html: string): string {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
  if (!headMatch) return ''

  let head = headMatch[1]
  // Remove all script tags except JSON-LD
  head = head.replace(/<script(?![^>]*type\s*=\s*["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi, '')
  return head
}
```

**Set Content-Type headers explicitly.** The proxy response should always be `application/json`, never `text/html`. This prevents the browser from interpreting the response as a navigable page.

#### Threat 4: Denial of Service via Slow or Large Responses

**The risk:** An attacker submits a URL that either responds very slowly (tying up the proxy) or returns a massive response body (consuming memory).

**Mitigations:**

**Timeout.** Both deployments enforce a 10-second fetch timeout. On Netlify Pro with the 26-second function ceiling, this leaves 16 seconds of headroom for DNS resolution, response parsing, and function overhead. On DigitalOcean, there's no function-level timeout — only the fetch timeout matters.

**Response size limit.** Read the response body in chunks and abort if it exceeds 1MB. Most HTML pages with reasonable `<head>` blocks are well under 200KB. A 1MB ceiling is generous:

```typescript
const response = await fetch(url, {
  signal: AbortSignal.timeout(10_000),
  headers: { 'User-Agent': 'MetaPeek/1.0 (+https://metapeek.icjia.app)' },
})

const reader = response.body?.getReader()
let totalSize = 0
const maxSize = 1_048_576  // 1MB
const chunks: Uint8Array[] = []

while (reader) {
  const { done, value } = await reader.read()
  if (done) break
  totalSize += value.length
  if (totalSize > maxSize) {
    reader.cancel()
    throw new Error('Response too large')
  }
  chunks.push(value)
}
```

**Request body limit.** The proxy accepts a JSON body containing only a URL string. Set the body parser limit to 1KB (as shown in the Express example). This prevents someone from sending a 100MB POST body to eat memory.

#### Threat 5: Information Leakage

**The risk:** The proxy reveals information about your infrastructure — internal headers, error stack traces, server versions, or the fact that it's running on a specific droplet.

**Mitigations:**

**Generic error messages.** Never return the upstream error details to the client. "Failed to fetch target URL" is sufficient. Log the full error server-side.

**Strip response headers.** The proxy returns only `contentType` from the upstream response. No `Server`, `X-Powered-By`, `Set-Cookie`, or other headers are forwarded.

**Helmet middleware (DigitalOcean).** The Express example includes `helmet()`, which sets security-related HTTP headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, etc.) on the proxy's own responses.

**Non-obvious port (DigitalOcean).** The Express server listens on port 3847 (or whatever you choose), not 80 or 443. Nginx handles the public-facing port. This means port scanners hitting the droplet's IP won't discover the proxy unless they scan all 65K ports.

---

### Recommendation

**Launch on Netlify Pro. Keep DigitalOcean as a future fallback.**

Netlify is the production deployment from day one. The Pro plan's native edge-level rate limiting, 26-second timeout ceiling, and zero-ops deployment model make it the right default. The layered security stack at launch is:

1. **Netlify-native rate limiting** — 30 requests/IP/minute (configurable in `metapeek.config.ts`), enforced at the edge, rate-limited requests don't count as invocations
2. **SSRF validation** — DNS resolution + private IP blocking, prevents internal network probing
3. **CORS restriction** — blocks casual browser-based abuse from other origins
4. **Request shape validation** — rejects malformed or unexpected payloads
5. **Response size + timeout limits** — prevents slow-loris and memory exhaustion attacks
6. **Script stripping** — defense in depth against XSS via fetched content
7. **Bearer token (dormant)** — activatable via Netlify environment variable, no code change needed

No URL allowlist. No CAPTCHA. No robots.txt checking. No bearer token at launch. These can be added later without code changes if the threat model changes.

The DigitalOcean option remains documented and available. If Netlify cold starts become annoying, if you need to exceed the invocation cap, or if you want a development proxy that's always warm, set `proxy.externalUrl` in `metapeek.config.ts` and push. The shared security utilities (`validateUrl`, `extractHead`, `extractBodySnippet`) should live in `server/utils/proxy.ts` and can be copied or imported by the standalone Express server.

**Pre-launch checklist (Netlify-specific):**

- [ ] Request 26-second function timeout bump from Netlify support
- [ ] Verify rate limit rule appears in deploy log after first deploy
- [ ] Confirm CORS headers are set correctly (test with a cross-origin fetch from a different domain)
- [ ] Verify `metapeek.config.ts` values are read correctly in both client and server contexts
- [ ] Note baseline invocation count after one week of solo use
- [ ] Set a calendar reminder to check invocation count monthly for the first quarter

---

## 10. Reference Tables

### Character Limits

These are approximate and shift occasionally, but good enough for diagnostics:

| Platform | Field | Limit |
|----------|-------|-------|
| Google | Title | ~55–60 characters (pixel-based, varies by character width) |
| Google | Description | ~155–160 characters |
| Facebook | og:title | ~60–90 characters before truncation |
| Facebook | og:description | ~200 characters in feed |
| Twitter | twitter:title | ~70 characters |
| Twitter | twitter:description | ~200 characters |
| LinkedIn | og:title | ~120 characters |
| LinkedIn | og:description | ~150 characters |

### OG Image Specs

| Platform | Recommended Size | Min Size | Aspect Ratio |
|----------|-----------------|----------|--------------|
| Facebook | 1200×630 | 200×200 | 1.91:1 |
| Twitter (large) | 1200×628 | 300×157 | 2:1 |
| Twitter (summary) | 240×240 | 144×144 | 1:1 |
| LinkedIn | 1200×627 | 200×200 | 1.91:1 |

### Diagnostic Status Levels

The diagnostics panel uses a three-tier status system with specific conditions:

| Condition | Status | Icon | Message |
|-----------|--------|------|---------|
| All required tags present and valid | Green | ✓ | All required tags present |
| OG tags present, Twitter Card tags missing | Yellow | ⚠ | Consider adding Twitter Card tags for better X/Twitter previews |
| OG tags present, some values suboptimal | Yellow | ⚠ | Some tags need attention (with specific details) |
| No OG tags | Red | ✕ | Open Graph tags missing |
| Title/description too long | Yellow | ⚠ | Title/description exceeds recommended length |
| Title/description missing | Red | ✕ | Required tag missing |
| OG image URL is relative | Yellow | ⚠ | Image URL must be absolute for social platforms |
| OG image too small/large | Red | ✕ | Image dimensions outside acceptable range |
| Canonical URL missing | Yellow | ⚠ | Consider adding canonical URL |
| robots noindex detected | Yellow | ⚠ | Page is set to noindex — won't appear in search results |

**Implementation note:** The scoring logic in `useDiagnostics.ts` should return structured data with status level, icon, message, and any specific suggestions for each tag category.

### Dependencies (Anticipated)

**Core Framework:**
- **Nuxt** `^4.3.0` — Latest stable Nuxt 4
- **Vue** `^3.5.27` — Latest Vue 3
- **Nuxt UI** `^4.4.0` — Latest stable Nuxt UI v4

**Server-side Parsing:**
- **cheerio** `^1.0.0` — Lightweight HTML parsing for server route
- **ofetch** (included with Nuxt) — HTTP client for proxy requests

**Development:**
- **TypeScript** `^5.6.0` — Latest TypeScript
- **@nuxt/test-utils** `^3.14.0` — Testing utilities
- **vitest** `^2.1.0` — Test runner

**Note:** Client-side uses native browser DOMParser (no additional dependencies). All versions should be verified at project initialization and locked in package-lock.json.

**Important:** MetaPeek uses Nuxt 4 (stable as of July 2025) and Nuxt UI v4 (latest stable release). These are the current production-ready versions.

---

## 11. Resolved Decisions

Questions that were open during initial design, now answered:

1. **Domain name.** `metapeek.icjia.app`. Configured in `metapeek.config.ts` under `site.url` — if the domain changes later, update the config and push. All references (CORS origins, User-Agent string, og:url for MetaPeek's own meta tags) derive from this single value.

2. **Shareable URLs.** Supported, but with a manual "Fetch" button — never auto-fetch on page load. A shareable URL like `metapeek.icjia.app/?url=https://example.com` pre-populates the input field but does not trigger the proxy. The user must click "Fetch" to initiate the request. This prevents bots, link previews, and crawlers from generating invocations by visiting shared MetaPeek URLs. The paste-HTML workflow has no shareable URL equivalent (there's no reasonable way to encode an entire HTML document in a query parameter).

3. **Rate limit tuning.** 30 requests/IP/minute at launch. Configurable in `metapeek.config.ts` under `rateLimit.windowLimit`. Monitor actual usage patterns and adjust — if the tool gets shared publicly, consider lowering to 10–15. The change is a single number in the config file, deployed via `git push`.

4. **Favicon extraction.** Client-side fallback. If no `<link rel="icon">` or `<link rel="shortcut icon">` is found in the parsed HTML, the client constructs `{origin}/favicon.ico` and attempts to load it via an `<img>` tag. If the image loads, it's used in the Slack preview card. If it 404s, the preview shows a generic globe icon. This avoids a second server-side invocation. Controlled by `favicon.clientSideFallback` in `metapeek.config.ts`.

5. **robots.txt.** Not checked. MetaPeek is a diagnostic tool, not a crawler. It makes a single GET request on behalf of a human user — comparable to View Source or curl. The complexity of fetching, parsing, and caching robots.txt on every request adds latency, requires a second HTTP request per domain, and introduces stale-cache decisions, all for marginal ethical benefit. The diagnostics panel still flags `<meta name="robots" content="noindex">` and `nofollow` directives when present in parsed HTML (controlled by `diagnostics.flagNoindex` / `diagnostics.flagNoFollow` in `metapeek.config.ts`).

---

## 12. Remaining Open Questions

1. **Multiple CORS origins in production.** The current CORS config uses `allowedOrigins[0]` as the `Access-Control-Allow-Origin` header value. If you ever need to support multiple production origins (e.g., both `metapeek.icjia.app` and a custom domain), you'll need dynamic CORS — checking the request `Origin` header against the allowed list and reflecting it back. Not needed at launch but the config structure supports it.

2. **Netlify rate limit config export naming.** The Nitro server route exports both a `default` handler and a named `config` export for the rate limit. The `metapeek.config.ts` import is aliased as `metapeekConfig` to avoid collision with the `config` export name that Netlify expects. Verify this works on the first deploy — if the deploy log doesn't mention rate limiting, the export format may need adjustment.
