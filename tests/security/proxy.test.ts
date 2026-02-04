// tests/security/proxy.test.ts
// Tests for proxy utility functions

import { describe, it, expect } from "vitest";
import {
  extractHead,
  extractBodySnippet,
  sanitizeErrorMessage,
} from "../../server/utils/proxy";

describe("Proxy Utilities", () => {
  describe("extractHead", () => {
    it("extracts head section from HTML", () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Test Page</title>
            <meta name="description" content="Test">
          </head>
          <body>Content</body>
        </html>
      `;
      const result = extractHead(html);
      expect(result).toContain("<title>Test Page</title>");
      expect(result).toContain('meta name="description"');
    });

    it("strips regular script tags for security", () => {
      const html = `
        <head>
          <script>alert("xss")</script>
          <script src="malicious.js"></script>
          <title>Test</title>
        </head>
      `;
      const result = extractHead(html);
      expect(result).not.toContain('alert("xss")');
      expect(result).not.toContain("malicious.js");
      expect(result).toContain("<title>Test</title>");
    });

    it("preserves JSON-LD scripts (structured data)", () => {
      const html = `
        <head>
          <script type="application/ld+json">
            {"@context": "https://schema.org", "@type": "Article"}
          </script>
          <script>alert("bad")</script>
          <title>Test</title>
        </head>
      `;
      const result = extractHead(html);
      expect(result).toContain("application/ld+json");
      expect(result).toContain("@context");
      expect(result).not.toContain('alert("bad")');
    });

    it("returns empty string when no head tag exists", () => {
      const html = "<body>No head tag</body>";
      const result = extractHead(html);
      expect(result).toBe("");
    });

    it("handles malformed HTML gracefully", () => {
      const html = "<head><title>Unclosed";
      const result = extractHead(html);
      // Should not throw, may return empty or partial content
      expect(typeof result).toBe("string");
    });
  });

  describe("extractBodySnippet", () => {
    it("extracts body content up to maxLength", () => {
      const html = `
        <body>
          <div id="app">Content here</div>
        </body>
      `;
      const result = extractBodySnippet(html, 1024);
      expect(result).toContain('id="app"');
      expect(result).toContain("Content here");
    });

    it("limits body content to specified maxLength", () => {
      const longContent = "x".repeat(2000);
      const html = `<body>${longContent}</body>`;
      const result = extractBodySnippet(html, 1024);
      expect(result.length).toBeLessThanOrEqual(1024);
    });

    it("returns empty string when no body tag exists", () => {
      const html = "<head><title>No body</title></head>";
      const result = extractBodySnippet(html);
      expect(result).toBe("");
    });

    it("uses default maxLength of 1024 when not specified", () => {
      const longContent = "x".repeat(2000);
      const html = `<body>${longContent}</body>`;
      const result = extractBodySnippet(html);
      expect(result.length).toBeLessThanOrEqual(1024);
    });
  });

  describe("sanitizeErrorMessage", () => {
    it("sanitizes ENOTFOUND errors", () => {
      const error = new Error("getaddrinfo ENOTFOUND internal.server.local");
      const result = sanitizeErrorMessage(error);
      expect(result).toBe("Could not resolve hostname");
      expect(result).not.toContain("internal.server.local");
    });

    it("sanitizes ECONNREFUSED errors", () => {
      const error = new Error("connect ECONNREFUSED 10.0.0.1:3000");
      const result = sanitizeErrorMessage(error);
      expect(result).toBe("Connection refused by target server");
      expect(result).not.toContain("10.0.0.1");
    });

    it("sanitizes ETIMEDOUT errors", () => {
      const error = new Error("request ETIMEDOUT");
      const result = sanitizeErrorMessage(error);
      expect(result).toBe("Request timed out");
    });

    it("sanitizes ECONNRESET errors", () => {
      const error = new Error("socket hang up ECONNRESET");
      const result = sanitizeErrorMessage(error);
      expect(result).toBe("Connection reset by target server");
    });

    it("returns generic message for unknown errors", () => {
      const error = new Error("Some internal error with /path/to/file.js");
      const result = sanitizeErrorMessage(error);
      expect(result).toBe("Failed to fetch target URL");
      expect(result).not.toContain("/path/to/file.js");
    });

    it("handles non-Error objects", () => {
      const result = sanitizeErrorMessage("string error");
      expect(result).toBe("An unexpected error occurred");
    });

    it("handles null/undefined", () => {
      expect(sanitizeErrorMessage(null)).toBe("An unexpected error occurred");
      expect(sanitizeErrorMessage(undefined)).toBe(
        "An unexpected error occurred",
      );
    });
  });
});
