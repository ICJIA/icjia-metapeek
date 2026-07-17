#!/usr/bin/env node
/**
 * Post-deploy smoke test: proves rate limiting is actually enforced.
 *
 *   node scripts/smoke-rate-limit.mjs <base-url> [--spa]
 *
 *   node scripts/smoke-rate-limit.mjs https://deploy-preview-42--clinquant-lily-1beabe.netlify.app
 *   node scripts/smoke-rate-limit.mjs https://metapeek.icjia.app --spa
 *
 * Bursts default-tier requests until a 429 (with Retry-After) appears.
 * Exits 0 on the first 429, 1 if the burst completes without one — the
 * exact failure mode that shipped silently before: configs that looked
 * like rate limiting but enforced nothing.
 *
 * Each analyze request uses a unique `url` value so the CDN cache
 * (Netlify-Vary: query=url) can't mask the limiter. A 503 means the
 * site-wide daily budget is exhausted — treated as enforcement working,
 * with a warning.
 */

const base = process.argv[2]?.replace(/\/+$/, "");
const spa = process.argv.includes("--spa");

if (!base) {
  console.error("usage: node scripts/smoke-rate-limit.mjs <base-url> [--spa]");
  process.exit(2);
}

// Default-tier per-minute limits from metapeek.config.ts (+3 margin)
const limit = spa ? 1 : 5;
const attempts = limit + 3;

const requestOnce = async (i) => {
  if (spa) {
    return fetch(`${base}/api/fetch-spa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });
  }
  const target = encodeURIComponent(`https://example.com/?smoke=${i}`);
  return fetch(`${base}/api/analyze?url=${target}`);
};

console.log(`Bursting ${attempts} default-tier requests at ${base} (${spa ? "spa" : "api"} scope)…`);

for (let i = 1; i <= attempts; i++) {
  const res = await requestOnce(i);
  const retryAfter = res.headers.get("retry-after");
  console.log(`  #${i}: HTTP ${res.status}${retryAfter ? ` (Retry-After: ${retryAfter}s)` : ""}`);

  if (res.status === 429) {
    if (!retryAfter) {
      console.error("FAIL: 429 without a Retry-After header");
      process.exit(1);
    }
    console.log(`PASS: rate limit enforced after ${i - 1} allowed requests`);
    process.exit(0);
  }

  if (res.status === 503) {
    console.warn("WARN: hit the site-wide daily budget (503) — enforcement works, but the budget is exhausted");
    process.exit(0);
  }
}

console.error(`FAIL: ${attempts} requests, no 429 — rate limiting is NOT enforced`);
process.exit(1);
