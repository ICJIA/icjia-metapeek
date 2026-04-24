// https://nuxt.com/docs/api/configuration/nuxt-config
import metapeekConfig from "./metapeek.config";

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

  compatibilityDate: "2026-02-01",

  typescript: {
    strict: true,
    // typeCheck: true, // Disabled - use `yarn typecheck` instead to avoid vite-plugin-checker issues
    shim: false,
  },

  colorMode: {
    preference: "dark", // Default to dark mode
    fallback: "dark",
  },

  // Nuxt SEO / Site Config — shared across sitemap, robots, og-image, schema.org
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
        { property: "article:modified_time", content: "2026-03-26T00:00:00Z" },
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
            "dateModified": "2026-03-26",
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
