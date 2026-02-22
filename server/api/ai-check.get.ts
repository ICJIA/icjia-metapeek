/**
 * @fileoverview Endpoint to fetch robots.txt and llms.txt for AI readiness checks.
 *
 * GET /api/ai-check?url=https://example.com/page
 *
 * Derives origin from the URL, fetches {origin}/robots.txt and {origin}/llms.txt
 * in parallel. Returns null for either if they 404 or fail.
 *
 * @module server/api/ai-check.get
 */

import { defineEventHandler, getQuery, createError } from "h3";
import { ofetch } from "ofetch";
import { validateUrl } from "../utils/proxy";
import metapeekConfig from "../../metapeek.config";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const url = query.url;

  if (typeof url !== "string" || !url.trim()) {
    throw createError({
      statusCode: 400,
      message: 'Missing or invalid "url" query parameter.',
    });
  }

  if (url.length > metapeekConfig.proxy.maxUrlLength) {
    throw createError({
      statusCode: 400,
      message: `URL exceeds maximum length of ${metapeekConfig.proxy.maxUrlLength} characters`,
    });
  }

  // Validate URL and SSRF protection
  const validation = await validateUrl(url);
  if (!validation.ok) {
    throw createError({
      statusCode: 400,
      message: validation.reason || "Invalid URL",
    });
  }

  // Derive origin
  let origin: string;
  try {
    const parsed = new URL(url);
    origin = parsed.origin;
  } catch {
    throw createError({
      statusCode: 400,
      message: "Invalid URL format",
    });
  }

  // Fetch robots.txt and llms.txt in parallel, soft-fail on errors
  const fetchText = async (targetUrl: string): Promise<string | null> => {
    try {
      const response = await ofetch(targetUrl, {
        headers: {
          "User-Agent": metapeekConfig.proxy.userAgent,
        },
        timeout: 5000,
        responseType: "text",
      });
      return typeof response === "string" ? response : null;
    } catch {
      return null;
    }
  };

  const [robotsTxt, llmsTxt] = await Promise.all([
    fetchText(`${origin}/robots.txt`),
    fetchText(`${origin}/llms.txt`),
  ]);

  return {
    ok: true,
    robotsTxt,
    llmsTxt,
  };
});

// Netlify rate limiting
export const config = {
  path: "/api/ai-check",
  rateLimit: {
    windowLimit: metapeekConfig.rateLimit.windowLimit,
    windowSize: metapeekConfig.rateLimit.windowSize,
    aggregateBy: [...metapeekConfig.rateLimit.aggregateBy],
  },
};
