// server/utils/logger.ts
// Structured logging for proxy requests

import { randomUUID } from "node:crypto";
import { hashIp } from "#shared/rate-limit-core.mjs";
import {
  persistError,
  classifyBlockReason,
  redactUrlSecrets,
} from "#shared/error-log-core.mjs";

/**
 * Log levels for different types of events
 */
export type LogLevel = "info" | "warn" | "error" | "security";

/**
 * Structured log entry for proxy requests
 */
export interface ProxyLogEntry {
  timestamp: string;
  level: LogLevel;
  requestId: string;
  event: string;
  url?: string;
  finalUrl?: string;
  statusCode?: number;
  timing?: number;
  /**
   * Truncated SHA-256 of the client IP — the same hash the rate limiter keys
   * its buckets on. Raw addresses must never reach log output: these entries
   * land in Netlify's retained function logs, and "raw IPs are never stored"
   * has to hold there, not just in the request_log table.
   */
  ipHash?: string;
  userAgent?: string;
  error?: string;
  blocked?: boolean;
  reason?: string;
  redirectCount?: number;
  responseSize?: number;
}

/**
 * Generate a unique request ID for correlation
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Sanitize URL for logging - remove sensitive query parameters
 *
 * Example: https://example.com/api?token=secret&user=john
 * Becomes: https://example.com/api?token=[REDACTED]&user=john
 */
export function sanitizeUrlForLogging(url: string): string {
  // One redaction implementation for the whole app: the sensitive-param
  // list, userinfo stripping, and the unparseable-URL fallback live in
  // shared/error-log-core.mjs, so the console line and the durable row can
  // never drift apart again (the basic-auth gap happened exactly that way).
  return redactUrlSecrets(url);
}

/**
 * Truncate long strings for logging
 */
export function truncate(
  str: string | undefined,
  maxLength: number = 200,
): string | undefined {
  if (!str) return undefined;
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + "...";
}

/**
 * Log a structured entry
 *
 * In production (Netlify), this outputs JSON for machine parsing.
 * In development, it outputs readable text.
 */
export function log(entry: ProxyLogEntry): void {
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    // Human-readable format for development
    const emoji =
      entry.level === "error"
        ? "❌"
        : entry.level === "warn"
          ? "⚠️"
          : entry.level === "security"
            ? "🛡️"
            : "✅";

    console.log(
      `${emoji} [${entry.level.toUpperCase()}] ${entry.event}`,
      entry.url ? `\n  URL: ${entry.url}` : "",
      entry.timing ? `\n  Timing: ${entry.timing}ms` : "",
      entry.error ? `\n  Error: ${entry.error}` : "",
      entry.reason ? `\n  Reason: ${entry.reason}` : "",
    );
  } else {
    // JSON format for production (machine-parseable)
    console.log(JSON.stringify(entry));
  }
}

/**
 * Log a successful fetch
 */
export function logSuccess(data: {
  requestId: string;
  url: string;
  finalUrl: string;
  statusCode: number;
  timing: number;
  redirectCount: number;
  responseSize: number;
  ip?: string;
  userAgent?: string;
}): void {
  log({
    timestamp: new Date().toISOString(),
    level: "info",
    requestId: data.requestId,
    event: "fetch_success",
    url: sanitizeUrlForLogging(data.url),
    finalUrl:
      data.finalUrl !== data.url
        ? sanitizeUrlForLogging(data.finalUrl)
        : undefined,
    statusCode: data.statusCode,
    timing: data.timing,
    redirectCount: data.redirectCount,
    responseSize: data.responseSize,
    ipHash: hashIp(data.ip),
    userAgent: truncate(data.userAgent, 100),
  });
}

/** Lowercase hostname of a URL, or undefined when unparseable. */
function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Writes the entry to the durable Supabase error_log through the shared sink.
 * Console output alone lives only as long as Netlify's function-log retention
 * (days); this row is what `./logs.sh errors` reads weeks later. Callers await
 * it — a dropped promise may be frozen with the serverless instance — but a
 * sink failure never breaks the logging call, only costs its own timeout.
 */
function persist(data: {
  level: "error" | "security";
  event: string;
  requestId: string;
  url: string;
  path?: string;
  error: string;
  stack?: string;
  timing?: number;
  statusCode?: number;
  ip?: string;
  userAgent?: string;
}): Promise<boolean> {
  return persistError(
    {
      level: data.level,
      event: data.event,
      scope: "api",
      path: data.path,
      target_host: hostOf(data.url),
      target_url: sanitizeUrlForLogging(data.url),
      status_code: data.statusCode,
      error: data.error,
      stack: data.stack,
      timing_ms: data.timing,
      ip_hash: hashIp(data.ip),
      user_agent: data.userAgent,
      request_id: data.requestId,
    },
    {
      env: process.env as Record<string, string | undefined>,
      log: (entry) => console.error(JSON.stringify(entry)),
    },
  );
}

/**
 * Log a fetch error
 */
export async function logError(data: {
  requestId: string;
  url: string;
  path?: string;
  error: string;
  stack?: string;
  timing?: number;
  statusCode?: number;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  log({
    timestamp: new Date().toISOString(),
    level: "error",
    requestId: data.requestId,
    event: "fetch_error",
    url: sanitizeUrlForLogging(data.url),
    error: truncate(data.error, 500),
    timing: data.timing,
    ipHash: hashIp(data.ip),
    userAgent: truncate(data.userAgent, 100),
  });
  await persist({ ...data, level: "error", event: "fetch_error" });
}

/**
 * Log a blocked request (SSRF, rate limit, etc.)
 */
export async function logBlocked(data: {
  requestId: string;
  url: string;
  path?: string;
  reason: string;
  statusCode?: number;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  // A hostname that doesn't resolve is a user typo, not an attack — logged
  // as an error so `./logs.sh errors` keeps real SSRF signal readable.
  const level = classifyBlockReason(data.reason);
  log({
    timestamp: new Date().toISOString(),
    level,
    requestId: data.requestId,
    event: "request_blocked",
    url: sanitizeUrlForLogging(data.url),
    blocked: true,
    reason: truncate(data.reason, 500),
    ipHash: hashIp(data.ip),
    userAgent: truncate(data.userAgent, 100),
  });
  await persist({ ...data, level, event: "request_blocked", error: data.reason });
}

/**
 * Log a validation warning (suspicious but not blocked)
 */
export function logWarning(data: {
  requestId: string;
  url?: string;
  reason: string;
  ip?: string;
}): void {
  log({
    timestamp: new Date().toISOString(),
    level: "warn",
    requestId: data.requestId,
    event: "validation_warning",
    url: data.url ? sanitizeUrlForLogging(data.url) : undefined,
    reason: truncate(data.reason, 500),
    ipHash: hashIp(data.ip),
  });
}

/**
 * Extract the client IP the rate limiter keys on.
 *
 * ONLY a platform-set header is trusted. Netlify writes
 * `x-nf-client-connection-ip` from the real TCP peer and strips any inbound
 * copy, so it cannot be forged. The old fallback to the leftmost
 * `X-Forwarded-For` trusted whatever the client typed — an attacker could
 * rotate it to fragment their bucket or set a victim's IP — so it is gone.
 * With no trusted header present the IP is simply unknown (→ the shared
 * `anon` bucket): fail toward over-limiting, never toward an attacker-chosen
 * key.
 *
 * A non-Netlify deploy sets `TRUSTED_IP_HEADER` to that platform's own
 * trusted header (e.g. DigitalOcean's `x-do-connecting-ip`) — never a
 * client-supplied one — so moving off Netlify can't silently re-open the
 * spoof.
 */
export function getClientIp(event: {
  headers: { get: (key: string) => string | null };
}): string | undefined {
  const header = process.env.TRUSTED_IP_HEADER || "x-nf-client-connection-ip";
  return event.headers.get(header)?.trim() || undefined;
}

/**
 * Get user agent from request
 */
export function getUserAgent(event: {
  headers: { get: (key: string) => string | null };
}): string | undefined {
  return event.headers.get("user-agent") || undefined;
}
