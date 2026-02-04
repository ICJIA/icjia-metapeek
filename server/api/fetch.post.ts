// server/api/fetch.post.ts
// Secure proxy endpoint for fetching live URLs

import { defineEventHandler, readBody, createError, getHeader } from 'h3'
import { ofetch } from 'ofetch'
import { validateUrl, extractHead, extractBodySnippet, sanitizeErrorMessage } from '../utils/proxy'
import {
  generateRequestId,
  logSuccess,
  logError,
  logBlocked,
  getClientIp,
  getUserAgent
} from '../utils/logger'
import metapeekConfig from '../../metapeek.config'

export default defineEventHandler(async (event) => {
  // Generate unique request ID for log correlation
  const requestId = generateRequestId()
  const clientIp = getClientIp(event)
  const userAgent = getUserAgent(event)
  // ═══════════════════════════════════════════════════════════
  // 1. REQUEST VALIDATION
  // ═══════════════════════════════════════════════════════════

  // Parse request body
  let body: any
  try {
    body = await readBody(event)
  } catch {
    throw createError({
      statusCode: 400,
      message: 'Invalid request body. Expected JSON with "url" field.'
    })
  }

  // Validate body structure
  if (!body || typeof body !== 'object') {
    throw createError({
      statusCode: 400,
      message: 'Invalid request body. Expected JSON object.'
    })
  }

  // Validate URL field exists and is a string
  if (typeof body.url !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'Missing or invalid "url" field. Must be a string.'
    })
  }

  // Reject unexpected fields (security: prevent parameter pollution)
  const allowedKeys = new Set(['url'])
  const extraKeys = Object.keys(body).filter(key => !allowedKeys.has(key))
  if (extraKeys.length > 0) {
    throw createError({
      statusCode: 400,
      message: `Unexpected fields in request: ${extraKeys.join(', ')}`
    })
  }

  // URL length check
  if (body.url.length > metapeekConfig.proxy.maxUrlLength) {
    throw createError({
      statusCode: 400,
      message: `URL exceeds maximum length of ${metapeekConfig.proxy.maxUrlLength} characters`
    })
  }

  // ═══════════════════════════════════════════════════════════
  // 2. OPTIONAL: BEARER TOKEN AUTHENTICATION (dormant at launch)
  // ═══════════════════════════════════════════════════════════
  // Activate by setting METAPEEK_API_KEY in Netlify environment variables

  const API_KEY = process.env.METAPEEK_API_KEY

  if (API_KEY) {
    const authHeader = getHeader(event, 'authorization')

    if (!authHeader || authHeader !== `Bearer ${API_KEY}`) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized. Invalid or missing API key.'
      })
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 3. SSRF PROTECTION
  // ═══════════════════════════════════════════════════════════

  const validation = await validateUrl(body.url)

  if (!validation.ok) {
    // Log blocked request for security monitoring
    logBlocked({
      requestId,
      url: body.url,
      reason: validation.reason || 'Invalid URL',
      ip: clientIp,
      userAgent,
    })

    throw createError({
      statusCode: 400,
      message: validation.reason || 'Invalid URL'
    })
  }

  // ═══════════════════════════════════════════════════════════
  // 4. FETCH TARGET URL WITH SECURITY CONTROLS
  // ═══════════════════════════════════════════════════════════

  const startTime = Date.now()
  const redirectChain: Array<{ status: number; from: string; to: string }> = []
  let finalUrl = body.url
  let statusCode = 200
  let contentType = 'text/html'

  try {
    // Fetch with security controls
    const response = await ofetch.raw(body.url, {
      headers: {
        'User-Agent': metapeekConfig.proxy.userAgent,
        // Don't send cookies or auth headers to target
        'Cookie': '',
      },
      timeout: metapeekConfig.proxy.fetchTimeoutMs,
      redirect: 'manual', // Handle redirects manually to track chain
      responseType: 'text',
      // Don't follow redirects automatically - we'll do it manually
      onRequest({ options }) {
        // Ensure no credentials are sent
        options.credentials = 'omit'
      },
    })

    // Handle redirects manually (up to maxRedirects)
    let currentUrl = body.url
    let currentResponse = response
    let redirectCount = 0

    while (
      currentResponse.status >= 300 &&
      currentResponse.status < 400 &&
      redirectCount < metapeekConfig.proxy.maxRedirects
    ) {
      const location = currentResponse.headers.get('location')

      if (!location) {
        // Redirect without Location header - stop
        break
      }

      // Resolve relative URLs
      const nextUrl = new URL(location, currentUrl).href

      // Record redirect
      redirectChain.push({
        status: currentResponse.status,
        from: currentUrl,
        to: nextUrl,
      })

      // Validate redirect target (prevent redirect to internal IPs)
      const redirectValidation = await validateUrl(nextUrl)
      if (!redirectValidation.ok) {
        throw createError({
          statusCode: 400,
          message: `Redirect blocked: ${redirectValidation.reason}`
        })
      }

      // Fetch redirect target
      currentUrl = nextUrl
      currentResponse = await ofetch.raw(nextUrl, {
        headers: {
          'User-Agent': metapeekConfig.proxy.userAgent,
          'Cookie': '',
        },
        timeout: metapeekConfig.proxy.fetchTimeoutMs,
        redirect: 'manual',
        responseType: 'text',
      })

      redirectCount++
    }

    finalUrl = currentUrl
    statusCode = currentResponse.status
    contentType = currentResponse.headers.get('content-type') || 'text/html'

    // Check response size (prevent memory exhaustion)
    const contentLength = currentResponse.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > metapeekConfig.proxy.maxResponseBytes) {
      throw createError({
        statusCode: 413,
        message: `Response too large (${contentLength} bytes). Maximum: ${metapeekConfig.proxy.maxResponseBytes} bytes (1MB)`
      })
    }

    const html = currentResponse._data as string

    // Additional size check on actual data
    if (html.length > metapeekConfig.proxy.maxResponseBytes) {
      throw createError({
        statusCode: 413,
        message: 'Response too large to process'
      })
    }

    // ═══════════════════════════════════════════════════════════
    // 5. EXTRACT AND SANITIZE HTML
    // ═══════════════════════════════════════════════════════════

    const head = extractHead(html)
    const bodySnippet = extractBodySnippet(html)

    // ═══════════════════════════════════════════════════════════
    // 6. LOG SUCCESS AND RETURN SANITIZED RESPONSE
    // ═══════════════════════════════════════════════════════════

    const timing = Date.now() - startTime
    const responseSize = head.length + bodySnippet.length

    // Log successful fetch for monitoring
    logSuccess({
      requestId,
      url: body.url,
      finalUrl,
      statusCode,
      timing,
      redirectCount: redirectChain.length,
      responseSize,
      ip: clientIp,
      userAgent,
    })

    return {
      ok: true,
      url: body.url,
      finalUrl,
      redirectChain,
      statusCode,
      contentType,
      head,
      bodySnippet,
      fetchedAt: new Date().toISOString(),
      timing,
    }

  } catch (error: any) {
    // ═══════════════════════════════════════════════════════════
    // 7. ERROR HANDLING (sanitized, no info leakage)
    // ═══════════════════════════════════════════════════════════

    const timing = Date.now() - startTime

    // Log error for debugging
    logError({
      requestId,
      url: body.url,
      error: error.message || 'Unknown error',
      timing,
      ip: clientIp,
      userAgent,
    })

    // Handle fetch timeout
    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      throw createError({
        statusCode: 504,
        message: `Request timed out after ${metapeekConfig.proxy.fetchTimeoutMs / 1000} seconds. The target site did not respond in time.`
      })
    }

    // Handle DNS failures
    if (error.message?.includes('ENOTFOUND') || error.message?.includes('resolve')) {
      throw createError({
        statusCode: 400,
        message: 'Could not resolve hostname. Check that the domain exists and is spelled correctly.'
      })
    }

    // Handle connection refused
    if (error.message?.includes('ECONNREFUSED')) {
      throw createError({
        statusCode: 502,
        message: 'Connection refused by target server. The site may be down or blocking requests.'
      })
    }

    // Handle other network errors
    if (error.message?.includes('ECONNRESET') || error.message?.includes('ETIMEDOUT')) {
      throw createError({
        statusCode: 502,
        message: sanitizeErrorMessage(error)
      })
    }

    // Generic error (don't leak internal details)
    throw createError({
      statusCode: 502,
      message: 'Failed to fetch target URL. The site may be down or inaccessible.'
    })
  }
})

// ═══════════════════════════════════════════════════════════
// NETLIFY RATE LIMITING (enforced at edge, before function invocation)
// ═══════════════════════════════════════════════════════════
// Rate-limited requests return 429 and don't count as invocations.
// Values come from metapeek.config.ts — change them there, not here.

export const config = {
  path: '/api/fetch',
  rateLimit: {
    windowLimit: metapeekConfig.rateLimit.windowLimit,
    windowSize: metapeekConfig.rateLimit.windowSize,
    aggregateBy: [...metapeekConfig.rateLimit.aggregateBy],
  },
}
