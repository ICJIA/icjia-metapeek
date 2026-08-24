/**
 * @fileoverview Tests that server/utils/logger.ts never writes a raw IP.
 *
 * The Supabase request_log has only ever stored hashed IPs, but the structured
 * function logs (logSuccess/logError/logBlocked) were passing the raw address
 * straight through to Netlify's log retention — making the README's "raw IPs
 * are never stored" claim true for the database and false for the logs. Every
 * log entry must carry the same truncated hash the rate limiter uses, and
 * never the address itself.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logSuccess, logError, logBlocked, logWarning } from "../../server/utils/logger";
import { hashIp } from "#shared/rate-limit-core.mjs";

const RAW_IP_V4 = "203.0.113.9";
const RAW_IP_V6 = "2601:249:1a80:89e0:c9ef:5864:a715:ed52";

let spy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  spy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  spy.mockRestore();
});

/** The JSON entry from the most recent console.log call. */
function lastEntry(): Record<string, unknown> {
  const arg = spy.mock.calls.at(-1)?.[0];
  return JSON.parse(String(arg));
}

describe("logger IP handling", () => {
  it("logSuccess records the hash, never the raw IPv4", () => {
    logSuccess({
      requestId: "r1",
      url: "https://example.com",
      finalUrl: "https://example.com",
      statusCode: 200,
      timing: 12,
      redirectCount: 0,
      responseSize: 100,
      ip: RAW_IP_V4,
      userAgent: "test-agent",
    });
    const entry = lastEntry();
    expect(entry.ipHash).toBe(hashIp(RAW_IP_V4));
    expect(entry.ip).toBeUndefined();
    expect(JSON.stringify(entry)).not.toContain(RAW_IP_V4);
  });

  it("logError records the hash, never the raw IPv6", () => {
    logError({
      requestId: "r2",
      url: "https://example.com",
      error: "boom",
      ip: RAW_IP_V6,
    });
    const entry = lastEntry();
    expect(entry.ipHash).toBe(hashIp(RAW_IP_V6));
    expect(JSON.stringify(entry)).not.toContain(RAW_IP_V6);
  });

  it("logBlocked and logWarning hash too — blocked traffic is the abuse signal", () => {
    logBlocked({
      requestId: "r3",
      url: "http://169.254.169.254/",
      reason: "Internal addresses are not allowed",
      ip: RAW_IP_V4,
    });
    expect(lastEntry().ipHash).toBe(hashIp(RAW_IP_V4));

    logWarning({ requestId: "r4", reason: "odd input", ip: RAW_IP_V4 });
    expect(lastEntry().ipHash).toBe(hashIp(RAW_IP_V4));
    expect(JSON.stringify(lastEntry())).not.toContain(RAW_IP_V4);
  });

  it("an unknown IP logs as the limiter's 'anon' marker, matching request_log", () => {
    logError({ requestId: "r5", url: "https://example.com", error: "x" });
    expect(lastEntry().ipHash).toBe("anon");
  });
});
