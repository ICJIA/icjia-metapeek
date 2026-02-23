/**
 * @fileoverview Secure proxy endpoint for fetching live URLs. Validates requests,
 * enforces SSRF protection, fetches target HTML, and returns sanitized head/body snippets.
 *
 * POST /api/fetch with body: { url: string }
 * Rate limited via Netlify (see config export at bottom).
 *
 * @module server/api/fetch.post
 */

import { defineEventHandler, readBody, createError, getHeader } from "h3";
import {
  validateUrl,
  extractHead,
  extractBodySnippet,
} from "../utils/proxy";
import {
  generateRequestId,
  logSuccess,
  logError,
  logBlocked,
  getClientIp,
  getUserAgent,
} from "../utils/logger";
import { fetchWithRedirects } from "../utils/fetcher";
import { safeEqual } from "../utils/auth";
import metapeekConfig from "../../metapeek.config";

export default defineEventHandler(async (event) => {
  // Generate unique request ID for log correlation
  const requestId = generateRequestId();
  const clientIp = getClientIp(event);
  const userAgent = getUserAgent(event);
  // ═══════════════════════════════════════════════════════════
  // 1. REQUEST VALIDATION
  // ═══════════════════════════════════════════════════════════

  // Parse request body
  let body: { url?: unknown };
  try {
    body = await readBody(event);
  } catch {
    throw createError({
      statusCode: 400,
      message: 'Invalid request body. Expected JSON with "url" field.',
    });
  }

  // Validate body structure
  if (!body || typeof body !== "object") {
    throw createError({
      statusCode: 400,
      message: "Invalid request body. Expected JSON object.",
    });
  }

  // Validate URL field exists and is a string
  if (typeof body.url !== "string") {
    throw createError({
      statusCode: 400,
      message: 'Missing or invalid "url" field. Must be a string.',
    });
  }

  // Reject unexpected fields (security: prevent parameter pollution)
  const allowedKeys = new Set(["url"]);
  const extraKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
  if (extraKeys.length > 0) {
    throw createError({
      statusCode: 400,
      message: `Unexpected fields in request: ${extraKeys.join(", ")}`,
    });
  }

  // URL length check
  if (body.url.length > metapeekConfig.proxy.maxUrlLength) {
    throw createError({
      statusCode: 400,
      message: `URL exceeds maximum length of ${metapeekConfig.proxy.maxUrlLength} characters`,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 2. OPTIONAL: BEARER TOKEN AUTHENTICATION (dormant at launch)
  // ═══════════════════════════════════════════════════════════
  // Activate by setting METAPEEK_API_KEY in Netlify environment variables

  const API_KEY = process.env.METAPEEK_API_KEY;

  if (API_KEY) {
    const authHeader = getHeader(event, "authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!token || !safeEqual(token, API_KEY)) {
      throw createError({
        statusCode: 401,
        message: "Unauthorized. Invalid or missing API key.",
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 3. SSRF PROTECTION
  // ═══════════════════════════════════════════════════════════

  const validation = await validateUrl(body.url);

  if (!validation.ok) {
    // Log blocked request for security monitoring
    logBlocked({
      requestId,
      url: body.url,
      reason: validation.reason || "Invalid URL",
      ip: clientIp,
      userAgent,
    });

    throw createError({
      statusCode: 400,
      message: validation.reason || "Invalid URL",
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 4. FETCH TARGET URL WITH SECURITY CONTROLS
  // ═══════════════════════════════════════════════════════════

  try {
    const result = await fetchWithRedirects(body.url);

    // ═══════════════════════════════════════════════════════════
    // 5. EXTRACT AND SANITIZE HTML
    // ═══════════════════════════════════════════════════════════

    const head = extractHead(result.html);
    const bodySnippet = extractBodySnippet(result.html);

    // ═══════════════════════════════════════════════════════════
    // 6. LOG SUCCESS AND RETURN SANITIZED RESPONSE
    // ═══════════════════════════════════════════════════════════

    const responseSize = head.length + bodySnippet.length;

    // Log successful fetch for monitoring
    logSuccess({
      requestId,
      url: body.url,
      finalUrl: result.finalUrl,
      statusCode: result.statusCode,
      timing: result.timing,
      redirectCount: result.redirectChain.length,
      responseSize,
      ip: clientIp,
      userAgent,
    });

    return {
      ok: true,
      url: body.url,
      finalUrl: result.finalUrl,
      redirectChain: result.redirectChain,
      statusCode: result.statusCode,
      contentType: result.contentType,
      head,
      bodySnippet,
      fetchedAt: new Date().toISOString(),
      timing: result.timing,
    };
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));

    // Log error for debugging
    logError({
      requestId,
      url: body.url,
      error: err.message ?? "Unknown error",
      timing: Date.now(),
      ip: clientIp,
      userAgent,
    });

    // Re-throw (already formatted by fetchWithRedirects)
    throw error;
  }
});

// ═══════════════════════════════════════════════════════════
// NETLIFY RATE LIMITING (enforced at edge, before function invocation)
// ═══════════════════════════════════════════════════════════
// Rate-limited requests return 429 and don't count as invocations.
// Values come from metapeek.config.ts — change them there, not here.

export const config = {
  path: "/api/fetch",
  rateLimit: {
    windowLimit: metapeekConfig.rateLimit.windowLimit,
    windowSize: metapeekConfig.rateLimit.windowSize,
    aggregateBy: [...metapeekConfig.rateLimit.aggregateBy],
  },
};
