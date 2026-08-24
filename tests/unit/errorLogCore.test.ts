/**
 * @fileoverview Tests for shared/error-log-core.mjs — the durable error sink.
 *
 * One job: insert one row into the Supabase `error_log` table over PostgREST,
 * and never let that insert hurt the request it is reporting on. Every path
 * out of persistError resolves (true = the row landed, false = it did not);
 * nothing throws, nothing hangs past its timeout, and only the allowed
 * columns ever leave the process — a caller passing a raw `ip` by mistake
 * must find it dropped, not stored.
 */

import { describe, it, expect, vi } from "vitest";
import { persistError, classifyBlockReason } from "#shared/error-log-core.mjs";

const ENV = {
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_stub",
};

const ENTRY = {
  level: "error",
  event: "fetch_error",
  scope: "api",
  path: "/api/analyze",
  target_host: "example.com",
  target_url: "https://example.com/page",
  status_code: 502,
  error: "upstream returned 502",
  timing_ms: 1234,
  ip_hash: "abcd1234abcd1234",
  user_agent: "test-agent",
  request_id: "r-1",
};

function okFetch() {
  return vi.fn(async () => new Response(null, { status: 201 }));
}

describe("persistError", () => {
  it("posts the row to error_log with service-role headers and no return payload", async () => {
    const fetchImpl = okFetch();
    const ok = await persistError(ENTRY, { env: ENV, fetchImpl });

    expect(ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://stub.supabase.co/rest/v1/error_log");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe(ENV.SUPABASE_SECRET_KEY);
    expect(headers.Authorization).toBe(`Bearer ${ENV.SUPABASE_SECRET_KEY}`);
    expect(headers.Prefer).toBe("return=minimal");
    expect(JSON.parse(String(init.body))).toMatchObject({
      level: "error",
      event: "fetch_error",
      scope: "api",
      error: "upstream returned 502",
      ip_hash: "abcd1234abcd1234",
    });
  });

  it("resolves false without a network call when credentials are absent", async () => {
    const fetchImpl = okFetch();
    const ok = await persistError(ENTRY, { env: {}, fetchImpl });
    expect(ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves false when the network call rejects — never throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(persistError(ENTRY, { env: ENV, fetchImpl })).resolves.toBe(false);
  });

  it("resolves false on a non-2xx response and reports it through the log callback", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
    const log = vi.fn();
    const ok = await persistError(ENTRY, { env: ENV, fetchImpl, log });
    expect(ok).toBe(false);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ event: "error_log_store_error" }),
    );
  });

  it("aborts a hung insert after timeoutMs and resolves false", async () => {
    // A fetch that only settles when its signal aborts — the timeout is the
    // sole way out, so a resolved false proves the abort fired.
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const ok = await persistError(ENTRY, {
      env: ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 20,
    });
    expect(ok).toBe(false);
  });

  it("truncates oversized text fields so one giant stack cannot bloat the table", async () => {
    const fetchImpl = okFetch();
    await persistError(
      {
        ...ENTRY,
        error: "e".repeat(2000),
        stack: "s".repeat(10_000),
        user_agent: "u".repeat(1000),
        target_url: "https://example.com/" + "p".repeat(5000),
      },
      { env: ENV, fetchImpl },
    );
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.error.length).toBeLessThanOrEqual(500);
    expect(body.stack.length).toBeLessThanOrEqual(2000);
    expect(body.user_agent.length).toBeLessThanOrEqual(300);
    expect(body.target_url.length).toBeLessThanOrEqual(2048);
  });

  it("redacts sensitive query params in target_url before the row leaves the process", async () => {
    // The Nitro logger sanitizes before calling; fetch-spa passes the raw
    // target URL. The sink is the last line of defense, so a token in the
    // target's query string must never be stored.
    const fetchImpl = okFetch();
    await persistError(
      { ...ENTRY, target_url: "https://example.com/page?token=hunter2&x=1" },
      { env: ENV, fetchImpl },
    );
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.target_url).not.toContain("hunter2");
    expect(body.target_url).toContain("x=1");
    expect(body.target_url).toContain("REDACTED");
  });

  it("redacts URLs embedded in error and stack text — puppeteer messages carry the full target URL", async () => {
    const fetchImpl = okFetch();
    await persistError(
      {
        ...ENTRY,
        error: "net::ERR_CONNECTION_REFUSED at https://example.com/cb?token=hunter2",
        stack:
          "Error: net::ERR_CONNECTION_REFUSED at https://user:pw@example.com/cb?token=hunter2\n    at navigate",
      },
      { env: ENV, fetchImpl },
    );
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.error).not.toContain("hunter2");
    expect(body.error).toContain("REDACTED");
    expect(body.stack).not.toContain("hunter2");
    expect(body.stack).not.toContain("pw@");
    expect(body.stack).toContain("at navigate");
  });

  it("strips basic-auth credentials from target_url — userinfo is not a query param", async () => {
    const fetchImpl = okFetch();
    await persistError(
      { ...ENTRY, target_url: "https://admin:hunter2@staging.example.com/page?x=1" },
      { env: ENV, fetchImpl },
    );
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.target_url).not.toContain("hunter2");
    expect(body.target_url).not.toContain("admin");
    expect(body.target_url).toContain("staging.example.com/page");
  });

  it("drops keys that are not error_log columns — a stray raw ip never leaves the process", async () => {
    const fetchImpl = okFetch();
    await persistError(
      { ...ENTRY, ip: "203.0.113.9", secret: "x" } as never,
      { env: ENV, fetchImpl },
    );
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.ip).toBeUndefined();
    expect(body.secret).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("203.0.113.9");
  });
});

describe("classifyBlockReason", () => {
  it("treats a hostname-resolution failure as an error — a typo is not an attack", () => {
    expect(
      classifyBlockReason(
        "Could not resolve hostname 'exmaple.com'. Check that the domain exists and is spelled correctly.",
      ),
    ).toBe("error");
  });

  it("keeps genuine blocks as security events", () => {
    expect(classifyBlockReason("Internal addresses are not allowed")).toBe("security");
    expect(classifyBlockReason("URL resolves to a private address")).toBe("security");
    expect(classifyBlockReason(undefined)).toBe("security");
  });
});
