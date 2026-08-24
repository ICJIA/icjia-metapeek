/**
 * @fileoverview Tests for normalizeUrlInput — what the URL box does with what
 * someone actually typed.
 *
 * The original check was `!/^https?:\/\//.test(input)` → prepend "https://".
 * That is right for a bare domain and wrong for a mistyped scheme:
 * "https:/example.com" (one slash) does not match, so it became
 * "https://https:/example.com" — nonsense, reported to the user as
 * "https:// prefix added" on a URL that plainly already said https.
 */

import { describe, it, expect } from "vitest";
import { normalizeUrlInput } from "~/utils/urlInput";

describe("normalizeUrlInput", () => {
  it("leaves a well-formed URL alone", () => {
    for (const url of [
      "https://example.com",
      "http://example.com",
      "https://example.com/path?q=1#hash",
    ]) {
      expect(normalizeUrlInput(url)).toEqual({ url, change: "none" });
    }
  });

  it("preserves an uppercase scheme without calling it a change", () => {
    expect(normalizeUrlInput("HTTPS://example.com")).toEqual({
      url: "HTTPS://example.com",
      change: "none",
    });
  });

  it("trims surrounding whitespace without reporting a change", () => {
    expect(normalizeUrlInput("  https://example.com  ")).toEqual({
      url: "https://example.com",
      change: "none",
    });
  });

  it("adds https:// to a bare domain", () => {
    expect(normalizeUrlInput("example.com")).toEqual({
      url: "https://example.com",
      change: "added",
    });
    expect(normalizeUrlInput("sub.example.co.uk/path")).toEqual({
      url: "https://sub.example.co.uk/path",
      change: "added",
    });
  });

  it("repairs a mistyped scheme instead of prepending to it", () => {
    // Each of these previously produced "https://" + the whole broken string.
    expect(normalizeUrlInput("https:/example.com")).toEqual({
      url: "https://example.com",
      change: "corrected",
    });
    expect(normalizeUrlInput("https//example.com")).toEqual({
      url: "https://example.com",
      change: "corrected",
    });
    expect(normalizeUrlInput("http:/example.com")).toEqual({
      url: "http://example.com",
      change: "corrected",
    });
    expect(normalizeUrlInput("https:///example.com")).toEqual({
      url: "https://example.com",
      change: "corrected",
    });
  });

  it("never produces a doubled scheme", () => {
    for (const typo of [
      "https:/example.com",
      "https//example.com",
      "https:///example.com",
      "http:/example.com",
    ]) {
      const { url } = normalizeUrlInput(typo);
      expect(url.match(/https?:/gi)).toHaveLength(1);
      expect(url).not.toContain("https://https");
    }
  });

  it("leaves a non-http scheme alone rather than mangling it", () => {
    // The server rejects these with a clear message; silently rewriting
    // "ftp://x" to "https://ftp://x" would produce a worse error.
    expect(normalizeUrlInput("ftp://example.com")).toEqual({
      url: "ftp://example.com",
      change: "none",
    });
  });

  it("returns empty input unchanged", () => {
    expect(normalizeUrlInput("   ")).toEqual({ url: "", change: "none" });
  });
});
