/**
 * @fileoverview Tests that the standalone fetch-spa function persists its
 * failures to the Supabase error_log.
 *
 * fetch-spa claims /api/fetch-spa directly (Netlify Functions v2 config.path),
 * so its failures never traverse the Nitro server or its logger — and the
 * Chromium render path is historically where MetaPeek's production-only
 * faults live. These tests drive the real handler through the SSRF-blocked
 * path with a stubbed network and assert one security row lands; the render
 * catch uses the same reporting helper. The sink must never change what the
 * caller receives: a blocked request stays a 400 even when Supabase is down.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import handler from "../../netlify/functions/fetch-spa.mjs";
import { hashIp } from "#shared/rate-limit-core.mjs";

const RAW_IP = "203.0.113.9";

/** Dispatching fetch stub: rate-limit RPC allows, error_log insert accepted. */
function stubNetwork() {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/rest/v1/rpc/check_rate_limits")) {
      return new Response(
        JSON.stringify({ allowed: true, violated_key: null, retry_after: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (u.includes("/rest/v1/error_log")) {
      calls.push({ url: u, body: JSON.parse(String(init?.body)) });
      return new Response(null, { status: 201 });
    }
    throw new Error(`unexpected fetch in test: ${u}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function spaRequest(targetUrl: string) {
  return new Request("http://localhost/api/fetch-spa", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nf-client-connection-ip": RAW_IP,
      "user-agent": "vitest-agent",
    },
    body: JSON.stringify({ url: targetUrl }),
  });
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://stub.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_stub");
  vi.stubEnv("METAPEEK_API_KEY", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetch-spa durable error logging", () => {
  it("persists a security row when SSRF validation blocks the request", async () => {
    const inserts = stubNetwork();

    const res = await handler(spaRequest("http://169.254.169.254/latest/meta-data"));

    expect(res.status).toBe(400);
    expect(inserts).toHaveLength(1);
    const row = inserts[0]!.body;
    expect(row.level).toBe("security");
    expect(row.event).toBe("request_blocked");
    expect(row.scope).toBe("spa");
    expect(row.path).toBe("/api/fetch-spa");
    expect(row.target_host).toBe("169.254.169.254");
    expect(row.error).toBe("Internal addresses are not allowed");
    expect(row.ip_hash).toBe(hashIp(RAW_IP));
    expect(row.user_agent).toBe("vitest-agent");
    expect(JSON.stringify(row)).not.toContain(RAW_IP);
  });

  it("still returns the 400 when the error_log insert itself fails", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/rest/v1/rpc/check_rate_limits")) {
        return new Response(
          JSON.stringify({ allowed: true, violated_key: null, retry_after: 0 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error("supabase is down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler(spaRequest("http://localhost/admin"));
    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.ok).toBe(false);
  });
});
