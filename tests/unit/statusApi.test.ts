/**
 * @fileoverview Tests for buildStatus — the /api/status payload builder.
 *
 * One Supabase RPC (status_summary) supplies usage totals, live budget
 * counters, and error counts; buildStatus wraps them with version/build
 * identity and a reachability verdict. The payload is public: it must be
 * assembled field by field so nothing the RPC returns can leak through
 * unlisted (no hosts, no URLs, no hashes), and a Supabase outage must
 * degrade it to ok:false — never to a thrown error.
 */

import { describe, it, expect, vi } from "vitest";
import { buildStatus } from "../../server/api/status.get";
import { RATE_LIMIT } from "#shared/rate-limit-config.mjs";

const ENV = {
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_stub",
};

const IDENTITY = {
  version: "0.18.0",
  commit: "abc1234",
  builtAt: "2026-08-24T12:00:00.000Z",
};

const SUMMARY = {
  usage: {
    last24h: { total: 40, allowed: 38, denied: 2, api: 35, spa: 5 },
    last30d: { total: 900, allowed: 850, denied: 50, api: 800, spa: 100 },
  },
  budget: {
    api: { used: 123, windowStartedAt: "2026-08-24T03:00:00+00:00" },
    spa: { used: 7, windowStartedAt: "2026-08-24T05:00:00+00:00" },
  },
  errors: { last24h: 1, last30d: 12, lastAt: "2026-08-24T09:30:00+00:00" },
};

function rpcFetch(summary: unknown = SUMMARY) {
  return vi.fn(async (url: string | URL) => {
    expect(String(url)).toBe("https://stub.supabase.co/rest/v1/rpc/status_summary");
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

describe("buildStatus", () => {
  it("assembles identity, checks, usage, budget, and errors from one RPC", async () => {
    const fetchImpl = rpcFetch();
    const status = await buildStatus({ env: ENV, fetchImpl, ...IDENTITY });

    expect(status.ok).toBe(true);
    expect(status.service).toBe("MetaPeek");
    expect(status.version).toBe("0.18.0");
    expect(status.commit).toBe("abc1234");
    expect(status.builtAt).toBe(IDENTITY.builtAt);
    expect(typeof status.now).toBe("string");

    expect(status.checks.supabase.configured).toBe(true);
    expect(status.checks.supabase.ok).toBe(true);
    expect(status.checks.supabase.latencyMs).toBeGreaterThanOrEqual(0);

    expect(status.usage?.last24h).toEqual(SUMMARY.usage.last24h);
    expect(status.usage?.last30d).toEqual(SUMMARY.usage.last30d);

    expect(status.budget?.api.used).toBe(123);
    expect(status.budget?.api.limit).toBe(RATE_LIMIT.global.perDay);
    expect(status.budget?.spa.used).toBe(7);
    expect(status.budget?.spa.limit).toBe(RATE_LIMIT.global.spaPerDay);
    expect(status.budget?.api.windowStartedAt).toBe("2026-08-24T03:00:00+00:00");

    expect(status.errors).toEqual({
      last24h: 1,
      last30d: 12,
      lastAt: "2026-08-24T09:30:00+00:00",
    });

    expect(status.retentionDays).toEqual({ requestLog: 90, errorLog: 90 });
  });

  it("reports unconfigured (but still ok) when Supabase credentials are absent", async () => {
    const fetchImpl = rpcFetch();
    const status = await buildStatus({ env: {}, fetchImpl, ...IDENTITY });

    expect(status.ok).toBe(true);
    expect(status.checks.supabase.configured).toBe(false);
    expect(status.usage).toBeNull();
    expect(status.budget).toBeNull();
    expect(status.errors).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("degrades to ok:false when the RPC answers with an error — never throws", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 }));
    const status = await buildStatus({ env: ENV, fetchImpl, ...IDENTITY });

    expect(status.ok).toBe(false);
    expect(status.checks.supabase.configured).toBe(true);
    expect(status.checks.supabase.ok).toBe(false);
    expect(status.usage).toBeNull();
    expect(status.budget).toBeNull();
  });

  it("degrades to ok:false when the network call rejects", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(
      buildStatus({ env: ENV, fetchImpl, ...IDENTITY }),
    ).resolves.toMatchObject({ ok: false });
  });

  it("rebuilds the payload field by field — unexpected RPC keys never leak through", async () => {
    const fetchImpl = rpcFetch({
      ...SUMMARY,
      ip_hash: "deadbeef",
      target_url: "https://secret.example.com",
      usage: {
        ...SUMMARY.usage,
        last24h: { ...SUMMARY.usage.last24h, top_host: "secret.example.com" },
      },
    });
    const status = await buildStatus({ env: ENV, fetchImpl, ...IDENTITY });

    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain("deadbeef");
    expect(serialized).not.toContain("secret.example.com");
    expect(serialized).not.toContain("ip_hash");
  });
});
