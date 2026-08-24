/**
 * @fileoverview Tests for server/utils/fetcher.ts streaming behavior:
 * non-HTML responses must be rejected from their headers alone (no 5MB
 * download of a PDF just to 422 it), redirect bodies must be discarded
 * (only the Location header matters), and oversized Content-Length is
 * rejected before the body is read. undici and DNS validation are mocked;
 * the body objects record whether they were streamed or destroyed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchWithRedirects } from "../../server/utils/fetcher";

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

// vi.mock calls are hoisted above the imports, so fetchWithRedirects
// receives these fakes despite the import appearing first.
vi.mock("undici", () => ({
  request: requestMock,
  Agent: class {
    async close() {}
  },
}));

vi.mock("../../server/utils/proxy", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../server/utils/proxy")
  >();
  return {
    ...actual,
    validateUrl: vi.fn(async () => ({
      ok: true,
      resolvedAddresses: { ipv4: ["93.184.216.34"], ipv6: [] },
    })),
  };
});

const ADDRESSES = { ipv4: ["93.184.216.34"], ipv6: [] };

/** A fake undici body that records whether it was streamed or destroyed. */
function makeBody(chunks: string[]) {
  const state = { read: false, destroyed: false };
  const body = {
    destroy() {
      state.destroyed = true;
    },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        state.read = true;
        yield Buffer.from(chunk);
      }
    },
  };
  return { body, state };
}

beforeEach(() => {
  requestMock.mockReset();
});

describe("fetchWithRedirects streaming discipline", () => {
  it("rejects non-HTML content types from headers alone, without reading the body", async () => {
    const { body, state } = makeBody(["%PDF-1.7 pretend this is 5MB"]);
    requestMock.mockResolvedValueOnce({
      statusCode: 200,
      headers: { "content-type": "application/pdf" },
      body,
    });

    await expect(
      fetchWithRedirects("https://example.com/report.pdf", ADDRESSES),
    ).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining("application/pdf"),
    });
    expect(state.read).toBe(false);
    expect(state.destroyed).toBe(true);
  });

  it("discards redirect bodies and follows Location to the final HTML", async () => {
    const hop = makeBody(["<html>301 Moved</html>"]);
    const final = makeBody(["<html><head><title>ok</title></head></html>"]);
    requestMock
      .mockResolvedValueOnce({
        statusCode: 301,
        headers: {
          location: "https://example.com/next",
          "content-type": "text/html",
        },
        body: hop.body,
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
        body: final.body,
      });

    const result = await fetchWithRedirects("https://example.com/", ADDRESSES);

    expect(result.html).toBe("<html><head><title>ok</title></head></html>");
    expect(result.finalUrl).toBe("https://example.com/next");
    expect(result.redirectChain).toHaveLength(1);
    expect(hop.state.read).toBe(false);
    expect(hop.state.destroyed).toBe(true);
    expect(final.state.read).toBe(true);
  });

  it("rejects oversized Content-Length before reading the body", async () => {
    const { body, state } = makeBody(["x"]);
    requestMock.mockResolvedValueOnce({
      statusCode: 200,
      headers: {
        "content-type": "text/html",
        "content-length": "99999999",
      },
      body,
    });

    await expect(
      fetchWithRedirects("https://example.com/huge", ADDRESSES),
    ).rejects.toMatchObject({ statusCode: 413 });
    expect(state.read).toBe(false);
    expect(state.destroyed).toBe(true);
  });
});
