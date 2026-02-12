/**
 * @fileoverview Shared URL fetching logic with redirect tracking and security controls.
 * Used by both /api/fetch (raw HTML) and /api/analyze (full analysis).
 *
 * @module server/utils/fetcher
 */

import { createError } from "h3";
import { ofetch } from "ofetch";
import { validateUrl, sanitizeErrorMessage } from "./proxy";
import metapeekConfig from "../../metapeek.config";

/**
 * Result of a successful URL fetch with redirect tracking.
 */
export interface FetchResult {
  html: string;
  finalUrl: string;
  statusCode: number;
  contentType: string;
  redirectChain: Array<{ status: number; from: string; to: string }>;
  timing: number;
}

/**
 * Fetches a URL with security controls: manual redirect tracking,
 * SSRF validation on each redirect, size limits, and timeout.
 *
 * @param url - The validated URL to fetch
 * @returns FetchResult with HTML content and metadata
 * @throws H3Error with appropriate status codes on failure
 */
export async function fetchWithRedirects(url: string): Promise<FetchResult> {
  const startTime = Date.now();
  const redirectChain: Array<{ status: number; from: string; to: string }> = [];

  try {
    // Initial fetch with security controls
    let currentUrl = url;
    let currentResponse = await ofetch.raw(url, {
      headers: {
        "User-Agent": metapeekConfig.proxy.userAgent,
        Cookie: "",
      },
      timeout: metapeekConfig.proxy.fetchTimeoutMs,
      redirect: "manual",
      responseType: "text",
      onRequest({ options }) {
        options.credentials = "omit";
      },
    });

    let redirectCount = 0;

    // Handle redirects manually (up to maxRedirects)
    while (
      currentResponse.status >= 300 &&
      currentResponse.status < 400 &&
      redirectCount < metapeekConfig.proxy.maxRedirects
    ) {
      const location = currentResponse.headers.get("location");

      if (!location) {
        break;
      }

      // Resolve relative URLs
      const nextUrl = new URL(location, currentUrl).href;

      // Record redirect
      redirectChain.push({
        status: currentResponse.status,
        from: currentUrl,
        to: nextUrl,
      });

      // Validate redirect target (prevent redirect to internal IPs)
      const redirectValidation = await validateUrl(nextUrl);
      if (!redirectValidation.ok) {
        throw createError({
          statusCode: 400,
          message: `Redirect blocked: ${redirectValidation.reason}`,
        });
      }

      // Fetch redirect target
      currentUrl = nextUrl;
      currentResponse = await ofetch.raw(nextUrl, {
        headers: {
          "User-Agent": metapeekConfig.proxy.userAgent,
          Cookie: "",
        },
        timeout: metapeekConfig.proxy.fetchTimeoutMs,
        redirect: "manual",
        responseType: "text",
      });

      redirectCount++;
    }

    const finalUrl = currentUrl;
    const statusCode = currentResponse.status;
    const contentType = currentResponse.headers.get("content-type") || "text/html";

    // Check response size (prevent memory exhaustion)
    const contentLength = currentResponse.headers.get("content-length");
    if (
      contentLength &&
      parseInt(contentLength) > metapeekConfig.proxy.maxResponseBytes
    ) {
      throw createError({
        statusCode: 413,
        message: `Response too large (${contentLength} bytes). Maximum: ${metapeekConfig.proxy.maxResponseBytes} bytes (1MB)`,
      });
    }

    const html = currentResponse._data as string;

    // Additional size check on actual data
    if (html.length > metapeekConfig.proxy.maxResponseBytes) {
      throw createError({
        statusCode: 413,
        message: "Response too large to process",
      });
    }

    return {
      html,
      finalUrl,
      statusCode,
      contentType,
      redirectChain,
      timing: Date.now() - startTime,
    };
  } catch (error: unknown) {
    // Re-throw H3 errors (already formatted)
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error
    ) {
      throw error;
    }

    const err = error instanceof Error ? error : new Error(String(error));
    const errMessage = err.message ?? "Unknown error";

    // Handle fetch timeout
    if (err.name === "AbortError" || errMessage.includes("timeout")) {
      throw createError({
        statusCode: 504,
        message: `Request timed out after ${metapeekConfig.proxy.fetchTimeoutMs / 1000} seconds. The target site did not respond in time.`,
      });
    }

    // Handle DNS failures
    if (errMessage.includes("ENOTFOUND") || errMessage.includes("resolve")) {
      throw createError({
        statusCode: 400,
        message:
          "Could not resolve hostname. Check that the domain exists and is spelled correctly.",
      });
    }

    // Handle connection refused
    if (errMessage.includes("ECONNREFUSED")) {
      throw createError({
        statusCode: 502,
        message:
          "Connection refused by target server. The site may be down or blocking requests.",
      });
    }

    // Handle other network errors
    if (errMessage.includes("ECONNRESET") || errMessage.includes("ETIMEDOUT")) {
      throw createError({
        statusCode: 502,
        message: sanitizeErrorMessage(err),
      });
    }

    // Generic error (don't leak internal details)
    throw createError({
      statusCode: 502,
      message:
        "Failed to fetch target URL. The site may be down or inaccessible.",
    });
  }
}
