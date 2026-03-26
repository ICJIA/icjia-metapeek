/**
 * @fileoverview Standalone Netlify function for SPA rendering via headless Chromium.
 * Separate from the Nitro server bundle to isolate the ~50MB @sparticuz/chromium binary.
 *
 * POST /.netlify/functions/fetch-spa  { url: string }
 *
 * Security:
 * - Full SSRF validation before Chromium launches (private IP, hostname, protocol)
 * - Chromium DNS restricted to target hostname only (--host-resolver-rules)
 * - No credentials, no cookies, no local storage
 * - Page timeout (10s) + function timeout (26s on Netlify Pro)
 * - Rate limited via Netlify edge (3/min)
 *
 * @module netlify/functions/fetch-spa
 */

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import dns from "node:dns/promises";
import { timingSafeEqual } from "node:crypto";

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

const MAX_URL_LENGTH = 2048;
const PAGE_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 5_242_880; // 5MB
const RATE_LIMIT_WINDOW = 60;
const RATE_LIMIT_MAX = 3;

// ═══════════════════════════════════════════════════════════
// SSRF PROTECTION (self-contained — no Nitro imports)
// Mirrors server/utils/proxy.ts logic for private IP blocking
// ═══════════════════════════════════════════════════════════

const BLOCKED_HOSTNAMES = new Set([
  "localhost", "127.0.0.1", "0.0.0.0", "::1",
  "metadata.google.internal", "169.254.169.254",
]);

function isPrivateIp(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;                          // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16
  if (a === 127) return true;                          // 127.0.0.0/8
  if (a === 169 && b === 254) return true;             // 169.254.0.0/16 (cloud metadata)
  if (a === 0) return true;                            // 0.0.0.0/8
  if (a >= 224 && a <= 239) return true;               // 224.0.0.0/4 multicast
  if (a >= 240) return true;                           // 240.0.0.0/4 reserved
  return false;
}

function isPrivateIpv6(ip) {
  const normalized = ip.toLowerCase().trim();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;   // ULA
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
      normalized.startsWith("fea") || normalized.startsWith("feb")) return true; // link-local
  if (normalized.startsWith("ff")) return true;                                  // multicast
  // IPv4-mapped: ::ffff:x.x.x.x
  const v4match = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4match) return isPrivateIp(v4match[1]);
  return false;
}

async function validateUrlForSpa(input) {
  if (typeof input !== "string" || input.trim().length === 0) {
    return { ok: false, reason: "URL is required" };
  }
  if (input.length > MAX_URL_LENGTH) {
    return { ok: false, reason: `URL exceeds ${MAX_URL_LENGTH} characters` };
  }

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, reason: "Invalid URL format" };
  }

  // HTTPS only in production
  const allowedProtocols = process.env.NODE_ENV === "production"
    ? ["https:"]
    : ["https:", "http:"];
  if (!allowedProtocols.includes(parsed.protocol)) {
    return { ok: false, reason: `Protocol not allowed: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: "Internal addresses are not allowed" };
  }

  // Block IP literals
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) && isPrivateIp(hostname)) {
    return { ok: false, reason: "Internal addresses are not allowed" };
  }
  if (hostname.startsWith("[") || hostname.includes(":")) {
    return { ok: false, reason: "IP literal addresses are not allowed" };
  }

  // DNS resolution — block private IPs
  let hasValid = false;
  try {
    const addrs4 = await dns.resolve4(parsed.hostname);
    hasValid = true;
    for (const addr of addrs4) {
      if (isPrivateIp(addr)) {
        return { ok: false, reason: "URL resolves to a private address" };
      }
    }
  } catch { /* may be IPv6-only */ }

  try {
    const addrs6 = await dns.resolve6(parsed.hostname);
    hasValid = true;
    for (const addr of addrs6) {
      if (isPrivateIpv6(addr)) {
        return { ok: false, reason: "URL resolves to a private address" };
      }
    }
  } catch { /* may be IPv4-only */ }

  if (!hasValid) {
    return { ok: false, reason: `Could not resolve hostname '${parsed.hostname}'` };
  }

  return { ok: true, hostname: parsed.hostname };
}

// ═══════════════════════════════════════════════════════════
// AUTHENTICATION HELPER
// ═══════════════════════════════════════════════════════════

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA); // Normalize timing
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

// ═══════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════

export default async (req) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const startTime = Date.now();

  // Parse body
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = body?.url;

  // ── Authentication ────────────────────────────────────
  const apiKey = process.env.METAPEEK_API_KEY;
  if (apiKey) {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token || !safeEqual(token, apiKey)) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // ── SSRF Validation ───────────────────────────────────
  const validation = await validateUrlForSpa(url);
  if (!validation.ok) {
    return new Response(JSON.stringify({ ok: false, error: validation.reason }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Headless Chromium Rendering ────────────────────────
  let browser = null;
  try {
    const executablePath = await chromium.executablePath();

    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        // RT: Block Chromium-level DNS for all hosts EXCEPT the target.
        // Prevents in-page JS from fetching internal IPs, cloud metadata, etc.
        `--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE ${validation.hostname}`,
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-sync",
        "--disable-translate",
        "--metrics-recording-only",
        "--no-first-run",
        "--mute-audio",
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Block unnecessary resource types to speed up render and reduce attack surface
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const type = request.resourceType();
      // Allow document, script, xhr/fetch, stylesheet (needed for rendering)
      // Block images, media, fonts, websockets (not needed for meta tags)
      if (["image", "media", "font", "websocket"].includes(type)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Set a reasonable user agent
    await page.setUserAgent("MetaPeek/1.0 (+https://metapeek.icjia.app) SPA-Renderer");

    // Navigate and wait for JS to render
    await page.goto(url, {
      waitUntil: "networkidle0", // Wait until no network requests for 500ms
      timeout: PAGE_TIMEOUT_MS,
    });

    // Extra wait for late-rendering frameworks (Vue router, React hydration)
    await page.waitForFunction(
      () => document.querySelector("title")?.textContent || document.querySelector('meta[property="og:title"]'),
      { timeout: 3000 },
    ).catch(() => {
      // Some pages may never have these — that's fine, we'll extract what we can
    });

    // Extract the rendered HTML
    const renderedHtml = await page.content();

    // Size check
    if (renderedHtml.length > MAX_RESPONSE_BYTES) {
      return new Response(JSON.stringify({ ok: false, error: "Rendered page too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Extract head section (same approach as server/utils/proxy.ts extractHead)
    const headMatch = renderedHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    let head = headMatch ? headMatch[1] || "" : "";

    // Strip scripts except JSON-LD
    head = head.replace(
      /<script(?![^>]*type\s*=\s*["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi,
      "",
    );

    // Preserve <html> tag for lang attribute
    const htmlTagMatch = renderedHtml.match(/<html[^>]*>/i);
    if (htmlTagMatch) {
      head = htmlTagMatch[0] + head;
    }

    // Extract body snippet (text-only, same as RT-03 fix)
    const bodyMatch = renderedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let bodySnippet = "";
    if (bodyMatch) {
      bodySnippet = (bodyMatch[1] || "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 1024);
    }

    const timing = Date.now() - startTime;

    return new Response(JSON.stringify({
      ok: true,
      url,
      finalUrl: page.url(),
      head,
      bodySnippet,
      renderedWith: "chromium",
      timing,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    // Map common errors to user-friendly messages
    let userMessage = "Failed to render page with JavaScript";
    let status = 502;

    if (message.includes("timeout") || message.includes("Timeout")) {
      userMessage = "Page took too long to render. The site's JavaScript may be too heavy.";
      status = 504;
    } else if (message.includes("net::ERR_NAME_NOT_RESOLVED")) {
      userMessage = "Could not resolve hostname";
      status = 400;
    } else if (message.includes("net::ERR_CONNECTION_REFUSED")) {
      userMessage = "Connection refused by target server";
      status = 502;
    }

    return new Response(JSON.stringify({ ok: false, error: userMessage }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
};

// ═══════════════════════════════════════════════════════════
// NETLIFY FUNCTION CONFIG
// ═══════════════════════════════════════════════════════════

export const config = {
  path: "/api/fetch-spa",
  rateLimit: {
    windowLimit: RATE_LIMIT_MAX,
    windowSize: RATE_LIMIT_WINDOW,
    aggregateBy: ["ip"],
  },
};
