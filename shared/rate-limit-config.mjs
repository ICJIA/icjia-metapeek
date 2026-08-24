/**
 * @fileoverview The rate-limit tier table — single source of truth, imported
 * by metapeek.config.ts (Nitro middleware) AND netlify/functions/fetch-spa.mjs
 * (standalone function). Plain JS with zero dependencies so esbuild can bundle
 * it into either context unchanged, exactly like rate-limit-core.mjs.
 *
 * Enforced application-level (server/middleware/rate-limit.ts + Supabase;
 * in-memory fallback without credentials). Netlify's per-route rateLimit
 * config is never read for Nitro routes (nuxt/nuxt#33721), so these are
 * the values that actually bind.
 *
 * @module shared/rate-limit-config
 */

/** @typedef {import("./rate-limit-core.mjs").RateLimitConfig} RateLimitConfig */

/** @type {RateLimitConfig} */
export const RATE_LIMIT = {
  // Targets whose host equals a suffix or ends with ".{suffix}" get the
  // lenient "trusted" tier. Everything else is "default" (strict).
  trustedSuffixes: ["illinois.gov", "icjia.app"],
  tiers: {
    trusted: { perMinute: 30, perDay: 500 },
    default: { perMinute: 5, perDay: 50 },
  },
  // Chromium renders are ~100× the cost of a plain fetch — much tighter.
  spa: {
    trusted: { perMinute: 3, perDay: 60 },
    default: { perMinute: 1, perDay: 10 },
  },
  // Site-wide daily ceilings across ALL clients — the Netlify-credit
  // backstop that per-IP limits can't provide. Hitting these returns 503.
  // Both halved in 0.18.1 (perDay 2000 → 1000, spaPerDay 100 → 50) as an
  // extra safety margin.
  global: { perDay: 1000, spaPerDay: 50 },
};
