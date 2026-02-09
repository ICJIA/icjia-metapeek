/**
 * @fileoverview SSRF protection and security utilities for the MetaPeek proxy.
 * Validates URLs before fetching, blocks private/internal addresses, and extracts
 * safe HTML snippets from fetched responses.
 *
 * @module server/utils/proxy
 */

import { URL } from "node:url";
import dns from "node:dns/promises";
import metapeekConfig from "../../metapeek.config";

/**
 * Result of URL validation. Contains success flag and optional failure reason.
 */
export interface ValidationResult {
  /** Whether the URL passed all security checks */
  ok: boolean;
  /** Human-readable reason when validation fails */
  reason?: string;
}

/**
 * Hostnames blocked for security. Prevents access to internal/cloud metadata services.
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal", // Google Cloud metadata
  "169.254.169.254", // AWS/Azure metadata endpoint
]);

/**
 * Validates a URL for security before fetching. Protects against SSRF attacks.
 *
 * @param input - The URL string to validate
 * @returns Promise resolving to ValidationResult with ok/reason
 *
 * Checks performed:
 * 1. URL format and structure (must parse as valid URL)
 * 2. Protocol whitelist (HTTPS only in production, HTTP allowed in dev)
 * 3. Blocked hostnames (localhost, metadata endpoints, etc.)
 * 4. DNS resolution to detect private IPs (RFC 1918, loopback, link-local)
 */
export async function validateUrl(input: string): Promise<ValidationResult> {
  // Must be a non-empty string
  if (typeof input !== "string" || input.trim().length === 0) {
    return { ok: false, reason: "URL is required" };
  }

  // Reject excessively long URLs (potential DoS)
  if (input.length > metapeekConfig.proxy.maxUrlLength) {
    return {
      ok: false,
      reason: `URL exceeds maximum length of ${metapeekConfig.proxy.maxUrlLength} characters`,
    };
  }

  // Must parse as valid URL
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, reason: "Invalid URL format" };
  }

  // Protocol whitelist - HTTPS only in production, allow HTTP in dev
  const allowedProtocols =
    process.env.NODE_ENV === "production"
      ? ["https:"]
      : metapeekConfig.proxy.allowHttpInDev
        ? ["https:", "http:"]
        : ["https:"];

  if (!allowedProtocols.includes(parsed.protocol)) {
    return {
      ok: false,
      reason: `Protocol not allowed: ${parsed.protocol}. ${process.env.NODE_ENV === "production" ? "Only HTTPS is permitted in production." : "Only HTTP and HTTPS are permitted."}`,
    };
  }

  // Block known internal/metadata hostnames
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: "Internal addresses are not allowed" };
  }

  // DNS resolution with private IP check (both IPv4 and IPv6)
  // This prevents DNS rebinding attacks and access to internal services
  let hasValidAddress = false;

  // Check IPv4 addresses
  try {
    const addresses4 = await dns.resolve4(parsed.hostname);
    hasValidAddress = true;

    for (const addr of addresses4) {
      if (isPrivateIp(addr)) {
        return {
          ok: false,
          reason: `URL resolves to a private IP address (${addr}). MetaPeek can only fetch public URLs.`,
        };
      }
    }
  } catch (_err) {
    // IPv4 resolution failed - might be IPv6-only, continue checking
  }

  // Check IPv6 addresses
  try {
    const addresses6 = await dns.resolve6(parsed.hostname);
    hasValidAddress = true;

    for (const addr of addresses6) {
      if (isPrivateIpv6(addr)) {
        return {
          ok: false,
          reason: `URL resolves to a private IPv6 address (${addr}). MetaPeek can only fetch public URLs.`,
        };
      }
    }
  } catch (_err) {
    // IPv6 resolution failed - might be IPv4-only
  }

  // If both IPv4 and IPv6 resolution failed, hostname doesn't exist
  if (!hasValidAddress) {
    return {
      ok: false,
      reason: `Could not resolve hostname '${parsed.hostname}'. Check that the domain exists and is spelled correctly.`,
    };
  }

  // All checks passed
  return { ok: true };
}

/**
 * Checks if an IPv4 address is in a private or reserved range.
 *
 * @param ip - IPv4 address string (e.g., "192.168.1.1")
 * @returns true if the IP should be blocked (private/reserved/invalid)
 *
 * Blocks: RFC 1918 private, loopback, link-local (cloud metadata), multicast, reserved.
 */
export function isPrivateIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);

  // Validate IP format
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Treat invalid IPs as private (block them)
  }

  const a = parts[0]!;
  const b = parts[1]!;

  // 10.0.0.0/8 - Private network
  if (a === 10) return true;

  // 172.16.0.0/12 - Private network
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 - Private network
  if (a === 192 && b === 168) return true;

  // 127.0.0.0/8 - Loopback
  if (a === 127) return true;

  // 169.254.0.0/16 - Link-local (includes AWS/Azure metadata at 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 0.0.0.0/8 - Invalid/reserved
  if (a === 0) return true;

  // 224.0.0.0/4 - Multicast
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 - Reserved
  if (a >= 240) return true;

  return false;
}

/**
 * Checks if an IPv6 address is in a private or reserved range.
 *
 * @param ip - IPv6 address string (e.g., "::1" or "fe80::1")
 * @returns true if the IP should be blocked (private/reserved)
 *
 * Blocks: loopback (::1), ULA (fc00::/7), link-local (fe80::/10),
 * multicast (ff00::/8), IPv4-mapped, and unspecified (::).
 */
export function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();

  // ::1 - Loopback
  if (normalized === "::1" || normalized === "::1/128") {
    return true;
  }

  // Remove zone identifier if present (e.g., fe80::1%eth0 -> fe80::1)
  const withoutZone = normalized.split("%")[0] ?? normalized;

  // Expand IPv6 address for easier checking
  // This is a simplified check - we'll check prefixes

  // fc00::/7 - Unique Local Addresses (ULA) - private IPv6
  // This includes fc00::/8 and fd00::/8
  if (withoutZone.startsWith("fc") || withoutZone.startsWith("fd")) {
    return true;
  }

  // fe80::/10 - Link-local addresses
  if (
    withoutZone.startsWith("fe8") ||
    withoutZone.startsWith("fe9") ||
    withoutZone.startsWith("fea") ||
    withoutZone.startsWith("feb")
  ) {
    return true;
  }

  // ff00::/8 - Multicast
  if (withoutZone.startsWith("ff")) {
    return true;
  }

  // ::ffff:0:0/96 - IPv4-mapped IPv6 addresses
  // Format: ::ffff:192.168.1.1 or ::ffff:c0a8:0101
  if (withoutZone.includes("::ffff:")) {
    // Extract the IPv4 part and check if it's private
    const ipv4Part = withoutZone.split("::ffff:")[1];

    // Check if it's in dotted notation (192.168.1.1)
    if (ipv4Part && ipv4Part.includes(".")) {
      return isPrivateIp(ipv4Part);
    }

    // Check if it's in hex notation (c0a8:0101 = 192.168.1.1)
    // For simplicity, we'll block all IPv4-mapped addresses
    // since they're often used in SSRF attacks
    return true;
  }

  // ::/128 - Unspecified address (like 0.0.0.0)
  if (normalized === "::" || normalized === "::/128") {
    return true;
  }

  return false;
}

/**
 * Extracts the &lt;head&gt; section from HTML and strips executable scripts.
 *
 * @param html - Full HTML document string
 * @returns The head content with script tags removed (except JSON-LD)
 *
 * Preserves application/ld+json structured data. Removes all other script tags
 * to prevent execution of any JavaScript from fetched pages.
 */
export function extractHead(html: string): string {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) return "";

  let head = headMatch[1] ?? "";

  // Remove all script tags EXCEPT application/ld+json (structured data)
  // This prevents execution of any JavaScript from fetched pages
  head = head.replace(
    /<script(?![^>]*type\s*=\s*["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi,
    "",
  );

  return head;
}

/**
 * Extracts the first portion of &lt;body&gt; content from HTML.
 *
 * @param html - Full HTML document string
 * @param maxLength - Maximum characters to return (default 1024)
 * @returns Body content truncated to maxLength, or empty string if no body
 *
 * Used to return a compact body snippet to the client without transferring
 * potentially large HTML payloads.
 */
export function extractBodySnippet(
  html: string,
  maxLength: number = 1024,
): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return "";

  const body = bodyMatch[1] ?? "";
  return body.substring(0, maxLength);
}

/**
 * Sanitizes error messages before sending to the client.
 *
 * @param error - Caught error (Error instance or unknown)
 * @returns Safe, generic message suitable for client display
 *
 * Maps internal error codes (ENOTFOUND, ECONNREFUSED, etc.) to user-friendly
 * messages. Prevents leakage of stack traces, file paths, or internal details.
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Don't expose internal stack traces or file paths
    const message = error.message;

    // Generic network errors
    if (message.includes("ENOTFOUND")) return "Could not resolve hostname";
    if (message.includes("ECONNREFUSED"))
      return "Connection refused by target server";
    if (message.includes("ETIMEDOUT")) return "Request timed out";
    if (message.includes("ECONNRESET"))
      return "Connection reset by target server";

    // Return generic message for anything else
    return "Failed to fetch target URL";
  }

  return "An unexpected error occurred";
}
