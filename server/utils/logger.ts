// server/utils/logger.ts
// Structured logging for proxy requests

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
  ip?: string;
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
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Sanitize URL for logging - remove sensitive query parameters
 *
 * Example: https://example.com/api?token=secret&user=john
 * Becomes: https://example.com/api?token=[REDACTED]&user=john
 */
export function sanitizeUrlForLogging(url: string): string {
  try {
    const parsed = new URL(url);

    // Sensitive parameter names to redact
    const sensitiveParams = [
      "token",
      "key",
      "apikey",
      "api_key",
      "secret",
      "password",
      "pass",
      "pwd",
      "auth",
      "authorization",
      "session",
      "sid",
      "jwt",
      "bearer",
      "oauth",
    ];

    for (const param of sensitiveParams) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, "[REDACTED]");
      }
    }

    return parsed.toString();
  } catch {
    // If URL parsing fails, return truncated version
    return url.substring(0, 100) + (url.length > 100 ? "..." : "");
  }
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
    ip: data.ip,
    userAgent: truncate(data.userAgent, 100),
  });
}

/**
 * Log a fetch error
 */
export function logError(data: {
  requestId: string;
  url: string;
  error: string;
  timing?: number;
  ip?: string;
  userAgent?: string;
}): void {
  log({
    timestamp: new Date().toISOString(),
    level: "error",
    requestId: data.requestId,
    event: "fetch_error",
    url: sanitizeUrlForLogging(data.url),
    error: truncate(data.error, 500),
    timing: data.timing,
    ip: data.ip,
    userAgent: truncate(data.userAgent, 100),
  });
}

/**
 * Log a blocked request (SSRF, rate limit, etc.)
 */
export function logBlocked(data: {
  requestId: string;
  url: string;
  reason: string;
  ip?: string;
  userAgent?: string;
}): void {
  log({
    timestamp: new Date().toISOString(),
    level: "security",
    requestId: data.requestId,
    event: "request_blocked",
    url: sanitizeUrlForLogging(data.url),
    blocked: true,
    reason: truncate(data.reason, 500),
    ip: data.ip,
    userAgent: truncate(data.userAgent, 100),
  });
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
    ip: data.ip,
  });
}

/**
 * Extract client IP from request
 * Works with Netlify's proxy headers
 */
export function getClientIp(event: {
  headers: { get: (key: string) => string | null };
}): string | undefined {
  // Netlify sets these headers
  return (
    event.headers.get("x-nf-client-connection-ip") ||
    event.headers.get("x-forwarded-for")?.split(",")[0] ||
    event.headers.get("x-real-ip") ||
    undefined
  );
}

/**
 * Get user agent from request
 */
export function getUserAgent(event: {
  headers: { get: (key: string) => string | null };
}): string | undefined {
  return event.headers.get("user-agent") || undefined;
}
