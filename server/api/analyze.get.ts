/**
 * @fileoverview API endpoint for full meta tag analysis. Fetches a URL,
 * parses meta tags, runs diagnostics, and computes a quality score.
 *
 * GET /api/analyze?url=<encoded-url>
 * Rate limited via Netlify (see config export at bottom).
 *
 * @module server/api/analyze.get
 */

import { defineEventHandler, getQuery, createError, getHeader } from "h3";
import { validateUrl } from "../utils/proxy";
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
import { parseMetaTags } from "../../shared/parser";
import { generateDiagnostics } from "../../shared/diagnostics";
import { computeScore } from "../../shared/score";
import metapeekConfig from "../../metapeek.config";

export default defineEventHandler(async (event) => {
  const requestId = generateRequestId();
  const clientIp = getClientIp(event);
  const userAgent = getUserAgent(event);

  // ═══════════════════════════════════════════════════════════
  // 1. QUERY PARAMETER VALIDATION
  // ═══════════════════════════════════════════════════════════

  const query = getQuery(event);
  const url = query.url;

  if (typeof url !== "string" || !url.trim()) {
    throw createError({
      statusCode: 400,
      message: 'Missing required "url" query parameter.',
    });
  }

  if (url.length > metapeekConfig.proxy.maxUrlLength) {
    throw createError({
      statusCode: 400,
      message: `URL exceeds maximum length of ${metapeekConfig.proxy.maxUrlLength} characters`,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 2. OPTIONAL: BEARER TOKEN AUTHENTICATION
  // ═══════════════════════════════════════════════════════════

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

  const validation = await validateUrl(url);

  if (!validation.ok) {
    logBlocked({
      requestId,
      url,
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
  // 4. FETCH + PARSE + DIAGNOSE + SCORE
  // ═══════════════════════════════════════════════════════════

  try {
    const result = await fetchWithRedirects(url);

    // Parse meta tags from full HTML
    const meta = parseMetaTags(result.html);

    // Run diagnostics (no image analysis on server)
    const diagnostics = generateDiagnostics(meta);

    // Compute quality score
    const score = computeScore(diagnostics);

    // Log success
    logSuccess({
      requestId,
      url,
      finalUrl: result.finalUrl,
      statusCode: result.statusCode,
      timing: result.timing,
      redirectCount: result.redirectChain.length,
      responseSize: result.html.length,
      ip: clientIp,
      userAgent,
    });

    return {
      ok: true,
      url,
      finalUrl: result.finalUrl,
      analyzedAt: new Date().toISOString(),
      timing: result.timing,
      meta,
      diagnostics,
      score,
    };
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));

    logError({
      requestId,
      url,
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

export const config = {
  path: "/api/analyze",
  rateLimit: {
    windowLimit: metapeekConfig.rateLimit.windowLimit,
    windowSize: metapeekConfig.rateLimit.windowSize,
    aggregateBy: [...metapeekConfig.rateLimit.aggregateBy],
  },
};
