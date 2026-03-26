/**
 * @fileoverview Shared URL fetching logic with redirect tracking and security controls.
 * Uses DNS pinning via undici dispatcher to prevent TOCTOU/DNS rebinding SSRF attacks:
 * resolved IPs from validation are reused for the actual HTTP request.
 *
 * @module server/utils/fetcher
 */

import { createError } from "h3";
import { Agent, request } from "undici";
import {
  validateUrl,
  sanitizeErrorMessage,
  type ResolvedAddresses,
} from "./proxy";
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
 * Response shape returned by pinnedFetch.
 */
export interface PinnedResponse {
  status: number;
  headers: { get(name: string): string | null };
  data: string;
}

/**
 * Creates a DNS lookup function that returns pre-resolved addresses
 * instead of performing a new DNS query. This prevents DNS rebinding attacks
 * where an attacker's DNS flips from a public IP to a private IP between
 * validation and fetch.
 *
 * Handles both `{ all: true }` (returns array) and single-result (returns address + family)
 * call signatures used by Node's http.Agent and undici.
 */
function createPinnedLookup(addresses: ResolvedAddresses) {
  return (
    _hostname: string,
    options: { all?: boolean } | ((...args: unknown[]) => void),
    callback?: (...args: unknown[]) => void,
  ) => {
    const cb = typeof options === "function" ? options : callback!;
    const opts = typeof options === "object" ? options : {};

    const entries: Array<{ address: string; family: number }> = [];
    for (const ip of addresses.ipv4) entries.push({ address: ip, family: 4 });
    for (const ip of addresses.ipv6) entries.push({ address: ip, family: 6 });

    if (entries.length === 0) {
      cb(new Error("No resolved addresses available"));
      return;
    }

    if (opts.all) {
      cb(null, entries);
    } else {
      cb(null, entries[0]!.address, entries[0]!.family);
    }
  };
}

/**
 * Creates an undici Agent that pins DNS resolution to pre-validated addresses.
 * This ensures the HTTP request connects to the same IP that was validated,
 * preventing TOCTOU/DNS rebinding attacks.
 */
function createPinnedDispatcher(addresses: ResolvedAddresses): Agent {
  return new Agent({
    connect: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lookup: createPinnedLookup(addresses) as any,
    },
  });
}

/**
 * Fetches a URL using pre-resolved DNS addresses to prevent TOCTOU/DNS rebinding.
 * Uses undici.request() with streaming body consumption to enforce size limits
 * during download — aborts immediately when maxBytes is exceeded, preventing
 * memory exhaustion from chunked-encoding responses that lack Content-Length.
 *
 * @param url - The URL to fetch
 * @param options - Fetch options including pinned DNS addresses
 * @returns PinnedResponse with status, headers, and body text
 */
export async function pinnedFetch(
  url: string,
  options: {
    headers: Record<string, string>;
    timeout: number;
    maxBytes: number;
    resolvedAddresses: ResolvedAddresses;
  },
): Promise<PinnedResponse> {
  const dispatcher = createPinnedDispatcher(options.resolvedAddresses);

  try {
    const { statusCode, headers, body } = await request(url, {
      method: "GET",
      headers: options.headers,
      dispatcher,
      maxRedirections: 0, // We handle redirects manually
      headersTimeout: options.timeout,
      bodyTimeout: options.timeout,
    });

    // Early reject if Content-Length exceeds limit (before reading body)
    const contentLength = headers["content-length"];
    if (contentLength && parseInt(String(contentLength)) > options.maxBytes) {
      // Drain and discard the body to avoid resource leak
      body.destroy();
      throw Object.assign(
        new Error(`Response exceeds ${options.maxBytes} bytes`),
        { code: "ERR_RESPONSE_TOO_LARGE" },
      );
    }

    // Stream the body with byte counting — abort if limit exceeded mid-download
    // This prevents memory exhaustion from chunked-encoding responses
    const chunks: Buffer[] = [];
    let receivedBytes = 0;

    for await (const chunk of body) {
      receivedBytes += chunk.length;
      if (receivedBytes > options.maxBytes) {
        body.destroy();
        throw Object.assign(
          new Error("Response too large to process"),
          { code: "ERR_RESPONSE_TOO_LARGE" },
        );
      }
      chunks.push(Buffer.from(chunk));
    }

    const data = Buffer.concat(chunks).toString("utf-8");

    // Wrap headers in a Map-like interface for compatibility
    const headerMap = {
      get(name: string): string | null {
        const val = headers[name.toLowerCase()];
        if (val === undefined) return null;
        return Array.isArray(val) ? val[0] ?? null : String(val);
      },
    };

    return {
      status: statusCode,
      headers: headerMap,
      data,
    };
  } finally {
    await dispatcher.close();
  }
}

/**
 * Fetches a URL with security controls: manual redirect tracking,
 * SSRF validation on each redirect, size limits, timeout, and DNS pinning.
 *
 * @param url - The validated URL to fetch
 * @param resolvedAddresses - Pre-resolved public IPs from validateUrl (for DNS pinning)
 * @returns FetchResult with HTML content and metadata
 * @throws H3Error with appropriate status codes on failure
 */
export async function fetchWithRedirects(
  url: string,
  resolvedAddresses: ResolvedAddresses,
): Promise<FetchResult> {
  const startTime = Date.now();
  const redirectChain: Array<{ status: number; from: string; to: string }> = [];

  try {
    // Initial fetch with security controls
    let currentUrl = url;
    let currentAddresses = resolvedAddresses;
    let currentResponse = await pinnedFetch(currentUrl, {
      headers: {
        "User-Agent": metapeekConfig.proxy.userAgent,
      },
      timeout: metapeekConfig.proxy.fetchTimeoutMs,
      maxBytes: metapeekConfig.proxy.maxResponseBytes,
      resolvedAddresses: currentAddresses,
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
      // Also captures resolved addresses for DNS pinning on the next fetch
      const redirectValidation = await validateUrl(nextUrl);
      if (!redirectValidation.ok) {
        throw createError({
          statusCode: 400,
          message: `Redirect blocked: ${redirectValidation.reason}`,
        });
      }

      // Fetch redirect target using its own pinned addresses
      currentUrl = nextUrl;
      currentAddresses = redirectValidation.resolvedAddresses!;
      currentResponse = await pinnedFetch(nextUrl, {
        headers: {
          "User-Agent": metapeekConfig.proxy.userAgent,
        },
        timeout: metapeekConfig.proxy.fetchTimeoutMs,
        maxBytes: metapeekConfig.proxy.maxResponseBytes,
        resolvedAddresses: currentAddresses,
      });

      redirectCount++;
    }

    const finalUrl = currentUrl;
    const statusCode = currentResponse.status;
    const contentType =
      currentResponse.headers.get("content-type") || "";

    // RT-05: Validate Content-Type is HTML before processing.
    // Reject binary files (PDF, ZIP, images) and non-HTML text formats
    // to avoid wasting resources parsing non-HTML responses.
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml")
    ) {
      const shortType = contentType.split(";")[0]?.trim() || "unknown";
      throw createError({
        statusCode: 422,
        message: `URL returned "${shortType}" instead of HTML. MetaPeek can only analyze HTML pages.`,
      });
    }

    const html = currentResponse.data;

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

    // Handle response too large
    if (
      "code" in err &&
      (err as { code?: string }).code === "ERR_RESPONSE_TOO_LARGE"
    ) {
      throw createError({
        statusCode: 413,
        message: "Response too large to process",
      });
    }

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
    if (
      errMessage.includes("ECONNRESET") ||
      errMessage.includes("ETIMEDOUT")
    ) {
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
