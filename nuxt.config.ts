// https://nuxt.com/docs/api/configuration/nuxt-config
import metapeekConfig from "./metapeek.config";
import pkg from "./package.json";

export default defineNuxtConfig({
  modules: ["@nuxt/ui", "@vueuse/nuxt", "@nuxtjs/seo", "@nuxt/eslint"],

  css: ["~/assets/css/main.css"],

  devtools: { enabled: false },

  // Suppress @tailwindcss/vite sourcemap warnings during generate
  sourcemap: {
    server: false,
    client: false,
  },

  ssr: true, // MetaPeek practices what it preaches

  // Inline used CSS into SSR'd HTML so the landing page doesn't wait on the
  // 200 KB entry.css to render. Tradeoff: slightly larger prerendered HTML
  // in exchange for eliminating render-blocking CSS — a clear win because
  // `/` is prerendered at build time and served from the Netlify CDN.
  features: {
    inlineStyles: true,
  },

  compatibilityDate: "2026-02-01",

  // Build identity, baked at build time — the single source the footer and
  // /api/status both read, so the shown version can never drift from
  // package.json again (the footer was hardcoded at v0.12.0 until 0.18.0).
  // COMMIT_REF is Netlify's build-time env; empty in local dev.
  runtimeConfig: {
    public: {
      version: pkg.version,
      commit: (process.env.COMMIT_REF || "").slice(0, 7),
      builtAt: new Date().toISOString(),
    },
  },

  typescript: {
    strict: true,
    // typeCheck: true, // Disabled - use `yarn typecheck` instead to avoid vite-plugin-checker issues
    shim: false,
  },

  colorMode: {
    preference: "dark", // Default to dark mode
    fallback: "dark",
  },

  // Bundle every statically-used icon into the client at build time so the app
  // never calls api.iconify.design at runtime. The strict CSP
  // (connect-src 'self', netlify.toml) deliberately blocks that external
  // fetch, and offline bundling is faster anyway. Icon collections
  // (@iconify-json/heroicons + @iconify-json/simple-icons) are already installed.
  icon: {
    clientBundle: {
      scan: true,
      sizeLimitKb: 512,
    },
    // The browser must never reach out to api.iconify.design — the strict CSP
    // (connect-src 'self') blocks it by design. All statically-used icons are
    // bundled into the client above; the API fallback is restricted to the
    // server, which resolves from the local @iconify-json collections anyway.
    fallbackToApi: "server-only",
  },

  // MetaPeek serves a static OG image (public/og-image-v2.png) and never
  // renders one per request, so @nuxtjs/seo's og-image module is disabled.
  // It shipped SSRF, reflected-XSS, and DoS advisories (RT-21) for a feature
  // this app does not use, and its v6 runtime is what broke `defineOgImage`.
  // The og:image tags are declared directly in app/pages/index.vue.
  ogImage: {
    enabled: false,
  },

  // Nuxt SEO / Site Config — shared across sitemap, robots, schema.org
  site: {
    url: "https://metapeek.icjia.app",
    name: "MetaPeek",
    description:
      "Inspect, preview, and fix HTML meta tags and Open Graph markup for 7 social platforms. Free, open-source, no login required.",
    defaultLocale: "en",
  },

  app: {
    head: {
      htmlAttrs: {
        lang: "en",
      },
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "author", content: "Illinois Criminal Justice Information Authority (ICJIA)" },
        { property: "article:published_time", content: "2026-02-01T00:00:00Z" },
        { property: "article:modified_time", content: "2026-05-26T00:00:00Z" },
      ],
      script: [
        {
          type: "application/ld+json",
          innerHTML: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            "name": "MetaPeek",
            "url": "https://metapeek.icjia.app",
            "description": "Inspect, preview, and fix HTML meta tags and Open Graph markup for 7 social platforms. Free, open-source, no login required.",
            "applicationCategory": "DeveloperApplication",
            "operatingSystem": "Any",
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "USD",
            },
            "author": {
              "@type": "Organization",
              "name": "Illinois Criminal Justice Information Authority",
              "url": "https://icjia.illinois.gov",
            },
            "datePublished": "2026-02-01",
            "dateModified": "2026-05-26",
            "license": "https://opensource.org/licenses/MIT",
            "isAccessibleForFree": true,
          }),
        },
      ],
      link: [
        { rel: "icon", type: "image/png", href: "/favicon.png" },
        { rel: "apple-touch-icon", href: "/favicon.png" },
      ],
    },
  },

  // Prerender the landing page at build time — served as static HTML from
  // Netlify's CDN, no Netlify Function cold start on first visit.
  // CORS configuration for the /api/* proxy endpoints (SSR/serverless).
  routeRules: {
    "/": { prerender: true },
    // Static shell from the CDN; the data is fetched client-side from
    // /api/status (itself CDN-cached 60s), so a page view costs no
    // function invocation and the numbers stay live.
    "/status": { prerender: true },
    "/api/**": {
      cors: true,
      headers: {
        "Access-Control-Allow-Origin": metapeekConfig.cors.allowedOrigins[0],
        "Access-Control-Allow-Methods":
          metapeekConfig.cors.allowedMethods.join(", "),
        "Access-Control-Allow-Headers":
          metapeekConfig.cors.allowedHeaders.join(", "),
      },
    },
  },
});
