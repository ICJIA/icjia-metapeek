/**
 * @fileoverview Tests that server/utils/logger.ts persists failures durably.
 *
 * Netlify retains function logs for at most days, so console output alone
 * cannot answer "what failed last week?". logError and logBlocked must also
 * write one row to the Supabase error_log table (through
 * shared/error-log-core.mjs); logSuccess and logWarning must not — success
 * volume belongs in request_log, and warnings are console-only noise.
 * A sink failure must never break the logging call itself.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  logSuccess,
  logError,
  logBlocked,
  logWarning,
} from "../../server/utils/logger";
import { hashIp } from "#shared/rate-limit-core.mjs";

const RAW_IP = "203.0.113.9";

let fetchMock: ReturnType<typeof vi.fn>;
let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://stub.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_stub");
  fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
  consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  consoleSpy.mockRestore();
});

/** The JSON body of the single error_log insert. */
function insertedRow(): Record<string, unknown> {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://stub.supabase.co/rest/v1/error_log");
  return JSON.parse(String(init.body));
}

describe("logger durable persistence", () => {
  it("logError writes one error_log row: level error, hashed IP, sanitized URL", async () => {
    await logError({
      requestId: "r1",
      url: "https://example.com/page?token=secret123",
      path: "/api/analyze",
      error: "upstream returned 502",
      stack: "Error: upstream returned 502\n  at fetchWithRedirects",
      timing: 840,
      ip: RAW_IP,
      userAgent: "test-agent",
    });

    const row = insertedRow();
    expect(row.level).toBe("error");
    expect(row.event).toBe("fetch_error");
    expect(row.scope).toBe("api");
    expect(row.path).toBe("/api/analyze");
    expect(row.target_host).toBe("example.com");
    expect(row.target_url).toContain("token=%5BREDACTED%5D");
    expect(row.error).toBe("upstream returned 502");
    expect(String(row.stack)).toContain("fetchWithRedirects");
    expect(row.ip_hash).toBe(hashIp(RAW_IP));
    expect(row.request_id).toBe("r1");
    expect(JSON.stringify(row)).not.toContain(RAW_IP);
    expect(JSON.stringify(row)).not.toContain("secret123");
  });

  it("logBlocked writes a security row — blocked traffic is the abuse signal", async () => {
    await logBlocked({
      requestId: "r2",
      url: "http://169.254.169.254/latest/meta-data",
      path: "/api/fetch",
      reason: "Internal addresses are not allowed",
      ip: RAW_IP,
      userAgent: "curl/8.0",
    });

    const row = insertedRow();
    expect(row.level).toBe("security");
    expect(row.event).toBe("request_blocked");
    expect(row.error).toBe("Internal addresses are not allowed");
    expect(row.ip_hash).toBe(hashIp(RAW_IP));
  });

  it("persists a hostname-resolution failure as level error — typos are not attacks", async () => {
    await logBlocked({
      requestId: "r7",
      url: "https://exmaple.com/page",
      path: "/api/analyze",
      reason:
        "Could not resolve hostname 'exmaple.com'. Check that the domain exists and is spelled correctly.",
      ip: RAW_IP,
    });
    const row = insertedRow();
    expect(row.level).toBe("error");
    expect(row.event).toBe("request_blocked");
  });

  it("persists the outbound status code so api rows match the spa writer's shape", async () => {
    await logError({
      requestId: "r8",
      url: "https://example.com",
      path: "/api/analyze",
      error: "upstream returned 502",
      statusCode: 502,
      ip: RAW_IP,
    });
    expect(insertedRow().status_code).toBe(502);
  });

  it("logSuccess and logWarning stay console-only", async () => {
    logSuccess({
      requestId: "r3",
      url: "https://example.com",
      finalUrl: "https://example.com",
      statusCode: 200,
      timing: 10,
      redirectCount: 0,
      responseSize: 100,
      ip: RAW_IP,
      userAgent: "a",
    });
    logWarning({ requestId: "r4", reason: "odd input", ip: RAW_IP });
    // Give any stray (incorrect) persistence a tick to fire.
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("without Supabase credentials, logError still logs to console and resolves", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    await expect(
      logError({ requestId: "r5", url: "https://example.com", error: "boom" }),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("a failing sink never breaks the logging call", async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(
      logError({ requestId: "r6", url: "https://example.com", error: "boom", ip: RAW_IP }),
    ).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
  });
});
