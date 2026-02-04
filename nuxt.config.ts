// https://nuxt.com/docs/api/configuration/nuxt-config
import metapeekConfig from "./metapeek.config";

export default defineNuxtConfig({
  modules: ["@nuxt/ui", "@vueuse/nuxt", "@nuxtjs/seo", "@nuxt/eslint"],

  css: ["~/assets/css/main.css"],

  devtools: { enabled: false },

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
      "Inspect, preview, and fix HTML meta tags and Open Graph markup.",
    defaultLocale: "en",
  },

  app: {
    head: {
      htmlAttrs: {
        lang: "en",
      },
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1" },
      ],
      link: [
        { rel: "icon", type: "image/png", href: "/favicon.png" },
        { rel: "apple-touch-icon", href: "/favicon.png" },
      ],
    },
  },

  // CORS configuration for Phase 2 proxy endpoint
  routeRules: {
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
