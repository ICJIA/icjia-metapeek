/**
 * @fileoverview Normalizes what someone typed into the URL box before it is
 * fetched.
 *
 * @module utils/urlInput
 */

/**
 * What normalizeUrlInput did to the input:
 * - `none`      — already usable (or empty); only whitespace was trimmed
 * - `added`     — a bare domain got an https:// scheme
 * - `corrected` — a mistyped scheme was repaired
 */
export type UrlInputChange = "none" | "added" | "corrected";

export interface NormalizedUrlInput {
  url: string;
  change: UrlInputChange;
}

/**
 * A correct http(s) prefix: exactly two slashes, and the next character is not
 * a third one. The lookahead is what catches `https:///example.com`, which a
 * plain `^https?:\/\//` would wave through.
 */
const VALID_HTTP_SCHEME = /^https?:\/\/(?!\/)/i;

/** Any other complete scheme (ftp:, mailto:, …) — not ours to rewrite. */
const VALID_OTHER_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * A mangled attempt at http(s)://. Covers the realistic typos:
 *   https:/example.com     one slash
 *   https:///example.com   three slashes
 *   https//example.com     colon missing
 *   https:example.com      slashes missing
 * Anchored to http/https only — a valid non-http scheme is left for the server
 * to reject with a clear message.
 */
const MALFORMED_HTTP_SCHEME = /^(https?)[:/]*/i;

/**
 * Prepares a typed URL for fetching.
 *
 * The naive version of this check — "if it doesn't start with http(s)://,
 * prepend https://" — mishandles a mistyped scheme: `https:/example.com`
 * fails the test and becomes `https://https:/example.com`, which then fails to
 * fetch while the UI reports that it merely "added" a prefix.
 *
 * @param raw - Exactly what is in the input box
 * @returns The URL to fetch, and what was changed to get there
 */
export function normalizeUrlInput(raw: string): NormalizedUrlInput {
  const trimmed = raw.trim();
  if (!trimmed) return { url: "", change: "none" };

  // A correct http(s) URL — hands off, original casing preserved.
  if (VALID_HTTP_SCHEME.test(trimmed)) {
    return { url: trimmed, change: "none" };
  }

  // Looks like http(s) but the punctuation is wrong — repair rather than stack
  // another scheme in front of it.
  const malformed = trimmed.match(MALFORMED_HTTP_SCHEME);
  if (malformed && malformed[0].length > malformed[1]!.length) {
    const scheme = malformed[1]!.toLowerCase();
    return {
      url: `${scheme}://${trimmed.slice(malformed[0].length)}`,
      change: "corrected",
    };
  }

  // Some other complete scheme (ftp:, mailto:, …) — leave it for the server to
  // reject clearly rather than rewriting it into something stranger.
  if (VALID_OTHER_SCHEME.test(trimmed)) {
    return { url: trimmed, change: "none" };
  }

  // A bare domain: the common, intended case.
  return { url: `https://${trimmed}`, change: "added" };
}
