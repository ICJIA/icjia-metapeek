/**
 * @fileoverview State machine for the URL fetch lifecycle. Manages status display
 * and progressive feedback (neutral → amber → red) as fetch time increases.
 *
 * @module composables/useFetchStatus
 */

export type FetchState =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'fetching'; startedAt: number; url: string }
  | { status: 'parsing' }
  | { status: 'complete'; timing: number }
  | { status: 'error'; code: string; message: string; suggestion: string }

/**
 * User-friendly error message with suggested action.
 */
export interface ErrorMessage {
  message: string
  suggestion: string
}

/**
 * Maps error codes to user-friendly messages and suggestions.
 * Covers timeout, rate limit, SSRF, DNS, network, and server errors.
 */
const ERROR_MESSAGES: Record<string, ErrorMessage> = {
  TIMEOUT: {
    message: 'Request timed out after 10 seconds.',
    suggestion: 'The target site did not respond in time. It may be down, slow, or blocking automated requests. Try again, or paste the page source directly.',
  },
  RATE_LIMITED: {
    message: 'Rate limit reached.',
    suggestion: "You've made too many requests in a short period. Wait a moment and try again. You can still paste HTML directly while waiting.",
  },
  INVALID_URL: {
    message: "That doesn't look like a valid URL.",
    suggestion: 'Enter a full URL starting with https:// — or switch to the Paste HTML tab to analyze HTML directly.',
  },
  SSRF_BLOCKED: {
    message: "That URL can't be fetched.",
    suggestion: "MetaPeek can only fetch public URLs. Internal addresses, localhost, and private IP ranges are blocked for security.",
  },
  FETCH_FAILED: {
    message: 'Could not fetch that URL.',
    suggestion: 'The target site returned an error or refused the connection. Check that the URL is correct and the site is publicly accessible.',
  },
  DNS_FAILED: {
    message: 'Could not resolve that hostname.',
    suggestion: "The domain doesn't appear to exist. Check for typos in the URL.",
  },
  RESPONSE_TOO_LARGE: {
    message: 'Response was too large to process.',
    suggestion: 'The target page exceeds 1MB. This is unusual for an HTML page — it may be serving a file download rather than a web page.',
  },
  PARSE_ERROR: {
    message: "Couldn't parse the response as HTML.",
    suggestion: "The target URL returned content that isn't HTML (possibly JSON, XML, or a redirect page). Check that the URL points to a web page.",
  },
  SERVER_ERROR: {
    message: 'MetaPeek encountered an internal error.',
    suggestion: "This is a problem on our end, not with the target URL. Try again in a moment.",
  },
  NETWORK_ERROR: {
    message: 'Network request failed.',
    suggestion: "Check your internet connection. If you're online, the MetaPeek server may be temporarily unavailable.",
  },
}

/**
 * Maps HTTP status codes and error message text to internal error codes.
 *
 * @param statusCode - HTTP status from the proxy response (0 if network error)
 * @param message - Error message text (used for 400 responses to distinguish SSRF, DNS, etc.)
 * @returns Error code key for ERROR_MESSAGES lookup
 */
function mapErrorToCode(statusCode: number, message: string): string {
  if (statusCode === 429) return 'RATE_LIMITED'
  if (statusCode === 504) return 'TIMEOUT'
  if (statusCode === 413) return 'RESPONSE_TOO_LARGE'

  if (statusCode === 400) {
    const lowerMsg = message.toLowerCase()
    if (lowerMsg.includes('invalid url') || lowerMsg.includes('url format')) return 'INVALID_URL'
    if (lowerMsg.includes('private ip') || lowerMsg.includes('internal address')) return 'SSRF_BLOCKED'
    if (lowerMsg.includes('resolve hostname')) return 'DNS_FAILED'
    if (lowerMsg.includes('parse') || lowerMsg.includes('html')) return 'PARSE_ERROR'
    return 'INVALID_URL'
  }

  if (statusCode === 0) {
    // Network-level error (no response)
    if (message.toLowerCase().includes('network')) return 'NETWORK_ERROR'
    return 'FETCH_FAILED'
  }

  if (statusCode === 502 || statusCode === 503) return 'FETCH_FAILED'
  if (statusCode >= 500) return 'SERVER_ERROR'

  return 'FETCH_FAILED'
}

/**
 * Composable for managing the URL fetch lifecycle and user feedback.
 *
 * @returns State ref, elapsed time, status message computed, and state setters
 *
 * States: idle → validating → fetching → parsing → complete | error
 * Progressive feedback: tone changes at 5s (amber) and 8s (red) during fetch.
 */
export function useFetchStatus() {
  const state = ref<FetchState>({ status: 'idle' })
  const elapsedTime = ref(0)
  let intervalId: ReturnType<typeof setInterval> | null = null

  /**
   * Computed progressive status message. Tone escalates as fetch time increases:
   * 0–5s: neutral, 5–8s: amber, 8s+: red with timeout warning.
   */
  const getStatusMessage = computed(() => {
    if (state.value.status !== 'fetching') return null

    const url = state.value.url
    const truncatedUrl = url.length > 60 ? url.substring(0, 60) + '...' : url

    if (elapsedTime.value < 5000) {
      return {
        message: `Fetching ${truncatedUrl}...`,
        tone: 'neutral' as const,
      }
    } else if (elapsedTime.value < 8000) {
      return {
        message: `Still fetching... target site may be slow (${Math.floor(elapsedTime.value / 1000)}s)`,
        tone: 'amber' as const,
      }
    } else {
      return {
        message: `Waiting for response... (${Math.floor(elapsedTime.value / 1000)}s). Request will time out at 10 seconds.`,
        tone: 'red' as const,
      }
    }
  })

  /**
   * Start the elapsed time counter
   */
  const startTimer = () => {
    elapsedTime.value = 0
    intervalId = setInterval(() => {
      elapsedTime.value += 100
    }, 100)
  }

  /**
   * Stop the elapsed time counter
   */
  const stopTimer = () => {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  /**
   * Set state to validating
   */
  const setValidating = () => {
    state.value = { status: 'validating' }
  }

  /**
   * Set state to fetching and start timer
   */
  const setFetching = (url: string) => {
    const startedAt = Date.now()
    state.value = { status: 'fetching', startedAt, url }
    startTimer()
  }

  /**
   * Set state to parsing
   */
  const setParsing = () => {
    stopTimer()
    state.value = { status: 'parsing' }
  }

  /**
   * Set state to complete
   */
  const setComplete = (timing: number) => {
    stopTimer()
    state.value = { status: 'complete', timing }
  }

  /**
   * Sets state to error with a user-friendly message mapping.
   *
   * @param statusCode - HTTP status or 0 for network errors
   * @param message - Raw error message from the proxy/network
   */
  const setError = (statusCode: number, message: string) => {
    stopTimer()
    const code = mapErrorToCode(statusCode, message)
    const errorMsg =
      ERROR_MESSAGES[code] ?? (ERROR_MESSAGES.FETCH_FAILED as ErrorMessage)

    state.value = {
      status: 'error',
      code,
      message: errorMsg.message,
      suggestion: errorMsg.suggestion,
    }
  }

  /**
   * Reset to idle state
   */
  const reset = () => {
    stopTimer()
    state.value = { status: 'idle' }
    elapsedTime.value = 0
  }

  // Cleanup on unmount
  onUnmounted(() => {
    stopTimer()
  })

  return {
    state,
    elapsedTime,
    statusMessage: getStatusMessage,
    setValidating,
    setFetching,
    setParsing,
    setComplete,
    setError,
    reset,
  }
}
