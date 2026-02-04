// server/utils/proxy.ts
// SSRF Protection and Security Utilities

import { URL } from 'node:url'
import dns from 'node:dns/promises'
import metapeekConfig from '../../metapeek.config'

export interface ValidationResult {
  ok: boolean
  reason?: string
}

// Blocked hostnames - prevent access to internal services
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',  // Google Cloud metadata
  '169.254.169.254',            // AWS/Azure metadata endpoint
])

/**
 * Validates a URL for security before fetching.
 * Protects against SSRF by checking:
 * 1. URL format and structure
 * 2. Protocol whitelist (HTTPS only in production)
 * 3. Blocked hostnames
 * 4. DNS resolution to detect private IPs
 */
export async function validateUrl(input: string): Promise<ValidationResult> {
  // Must be a non-empty string
  if (typeof input !== 'string' || input.trim().length === 0) {
    return { ok: false, reason: 'URL is required' }
  }

  // Reject excessively long URLs (potential DoS)
  if (input.length > metapeekConfig.proxy.maxUrlLength) {
    return { ok: false, reason: `URL exceeds maximum length of ${metapeekConfig.proxy.maxUrlLength} characters` }
  }

  // Must parse as valid URL
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return { ok: false, reason: 'Invalid URL format' }
  }

  // Protocol whitelist - HTTPS only in production, allow HTTP in dev
  const allowedProtocols = process.env.NODE_ENV === 'production'
    ? ['https:']
    : metapeekConfig.proxy.allowHttpInDev ? ['https:', 'http:'] : ['https:']

  if (!allowedProtocols.includes(parsed.protocol)) {
    return {
      ok: false,
      reason: `Protocol not allowed: ${parsed.protocol}. ${process.env.NODE_ENV === 'production' ? 'Only HTTPS is permitted in production.' : 'Only HTTP and HTTPS are permitted.'}`
    }
  }

  // Block known internal/metadata hostnames
  const hostname = parsed.hostname.toLowerCase()
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: 'Internal addresses are not allowed' }
  }

  // DNS resolution with private IP check
  // This prevents DNS rebinding attacks and access to internal services
  try {
    const addresses = await dns.resolve4(parsed.hostname)

    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        return {
          ok: false,
          reason: `URL resolves to a private IP address (${addr}). MetaPeek can only fetch public URLs.`
        }
      }
    }
  } catch (err) {
    // DNS resolution failed
    return {
      ok: false,
      reason: `Could not resolve hostname '${parsed.hostname}'. Check that the domain exists and is spelled correctly.`
    }
  }

  // All checks passed
  return { ok: true }
}

/**
 * Checks if an IP address is in a private/reserved range.
 * Blocks access to:
 * - RFC 1918 private networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 * - Loopback (127.0.0.0/8)
 * - Link-local (169.254.0.0/16) - includes cloud metadata endpoints
 * - Invalid/reserved (0.0.0.0/8)
 */
export function isPrivateIp(ip: string): boolean {
  const parts = ip.split('.').map(Number)

  // Validate IP format
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true // Treat invalid IPs as private (block them)
  }

  const [a, b, c, d] = parts

  // 10.0.0.0/8 - Private network
  if (a === 10) return true

  // 172.16.0.0/12 - Private network
  if (a === 172 && b >= 16 && b <= 31) return true

  // 192.168.0.0/16 - Private network
  if (a === 192 && b === 168) return true

  // 127.0.0.0/8 - Loopback
  if (a === 127) return true

  // 169.254.0.0/16 - Link-local (includes AWS/Azure metadata at 169.254.169.254)
  if (a === 169 && b === 254) return true

  // 0.0.0.0/8 - Invalid/reserved
  if (a === 0) return true

  // 224.0.0.0/4 - Multicast
  if (a >= 224 && a <= 239) return true

  // 240.0.0.0/4 - Reserved
  if (a >= 240) return true

  return false
}

/**
 * Extracts the <head> section from HTML string.
 * Strips all <script> tags except JSON-LD for security.
 */
export function extractHead(html: string): string {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
  if (!headMatch) return ''

  let head = headMatch[1]

  // Remove all script tags EXCEPT application/ld+json (structured data)
  // This prevents execution of any JavaScript from fetched pages
  head = head.replace(
    /<script(?![^>]*type\s*=\s*["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi,
    ''
  )

  return head
}

/**
 * Extracts the first ~1KB of <body> content for SPA detection.
 * Enough to detect single mount divs but not entire body.
 */
export function extractBodySnippet(html: string, maxLength: number = 1024): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (!bodyMatch) return ''

  const body = bodyMatch[1]
  return body.substring(0, maxLength)
}

/**
 * Sanitizes error messages before sending to client.
 * Prevents information leakage about internal infrastructure.
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Don't expose internal stack traces or file paths
    const message = error.message

    // Generic network errors
    if (message.includes('ENOTFOUND')) return 'Could not resolve hostname'
    if (message.includes('ECONNREFUSED')) return 'Connection refused by target server'
    if (message.includes('ETIMEDOUT')) return 'Request timed out'
    if (message.includes('ECONNRESET')) return 'Connection reset by target server'

    // Return generic message for anything else
    return 'Failed to fetch target URL'
  }

  return 'An unexpected error occurred'
}
