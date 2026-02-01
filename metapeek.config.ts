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
