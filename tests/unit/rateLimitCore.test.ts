/**
 * Behavior tests for the shared rate-limit core.
 *
 * These replace the old tests/unit/rateLimit.test.ts, which asserted the
 * shape of `export const config` objects that Netlify never read (Nitro
 * bundles all routes into one function — nuxt/nuxt#33721). These tests
 * exercise the enforcement logic itself.
 */
import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  resolveTier,
  hashIp,
  buildChecks,
  createMemoryStore,
  createSupabaseStore,
  checkRateLimit,
} from "#shared/rate-limit-core.mjs";

const LIMITS = {
  trustedSuffixes: ["illinois.gov", "icjia.app"],
  tiers: {
    trusted: { perMinute: 30, perDay: 500 },
    default: { perMinute: 5, perDay: 50 },
  },
  spa: {
    trusted: { perMinute: 3, perDay: 60 },
    default: { perMinute: 1, perDay: 10 },
  },
  global: { perDay: 2000, spaPerDay: 100 },
};

describe("hashIp IPv6 /64 aggregation", () => {
  it("buckets every address in one /64 together — a single allocation is 2^64 hosts", () => {
    // Without this, an attacker source-rotating within one /64 gets a fresh
    // per-IP allowance per address, defeating the per-IP tier entirely.
    const a = hashIp("2001:db8:abcd:0012::1");
    const b = hashIp("2001:db8:abcd:0012:ffff:ffff:ffff:ffff");
    const c = hashIp("2001:db8:abcd:0012:dead:beef:cafe:0001");
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it("keeps distinct /64s in distinct buckets", () => {
    expect(hashIp("2001:db8:abcd:0012::1")).not.toBe(hashIp("2001:db8:abcd:0099::1"));
  });

  it("treats the same /64 written compressed or expanded as one bucket", () => {
    const compressed = hashIp("2001:db8::1");
    const expanded = hashIp("2001:0db8:0000:0000:1111:2222:3333:4444");
    expect(compressed).toBe(expanded);
  });

  it("leaves IPv4 per-host — no aggregation, and the key is unchanged from before", () => {
    expect(hashIp("203.0.113.9")).not.toBe(hashIp("203.0.113.10"));
    // Backward compatibility: an IPv4 address still hashes its raw string, so
    // existing IPv4 buckets and logged hashes are untouched.
    expect(hashIp("203.0.113.9")).toBe(
      createHash("sha256").update("203.0.113.9").digest("hex").slice(0, 16),
    );
  });

  it("treats IPv4-mapped IPv6 as its embedded IPv4 host — not one giant bucket", () => {
    // ::ffff:a.b.c.d is a single IPv4 host; it must NOT collapse to the
    // all-zero /64 that would pool every mapped client together.
    expect(hashIp("::ffff:203.0.113.9")).not.toBe(hashIp("::ffff:203.0.113.10"));
    expect(hashIp("::ffff:203.0.113.9")).toBe(hashIp("203.0.113.9"));
  });

  it("still returns the anon marker for a missing IP", () => {
    expect(hashIp(undefined)).toBe("anon");
    expect(hashIp("")).toBe("anon");
  });

  it("never throws on a malformed address — hashes it as-is", () => {
    expect(typeof hashIp("2001:db8:::zzzz")).toBe("string");
    expect(hashIp("2001:db8:::zzzz")).toBe(hashIp("2001:db8:::zzzz"));
  });
});

describe("resolveTier", () => {
  it("trusts *.illinois.gov subdomains", () => {
    expect(resolveTier("https://r3.illinois.gov/page", LIMITS.trustedSuffixes)).toBe("trusted");
    expect(resolveTier("https://www.illinois.gov", LIMITS.trustedSuffixes)).toBe("trusted");
  });

  it("trusts the apex domain itself", () => {
    expect(resolveTier("https://illinois.gov/", LIMITS.trustedSuffixes)).toBe("trusted");
  });

  it("is case-insensitive on the host", () => {
    expect(resolveTier("https://R3.Illinois.GOV/x", LIMITS.trustedSuffixes)).toBe("trusted");
  });

  it("does NOT trust suffix look-alikes", () => {
    expect(resolveTier("https://evil-illinois.gov", LIMITS.trustedSuffixes)).toBe("default");
    expect(resolveTier("https://illinois.gov.evil.com", LIMITS.trustedSuffixes)).toBe("default");
  });

  it("trusts icjia.app properties", () => {
    expect(resolveTier("https://metapeek.icjia.app", LIMITS.trustedSuffixes)).toBe("trusted");
  });

  it("defaults for arbitrary and unparseable targets", () => {
    expect(resolveTier("https://example.com", LIMITS.trustedSuffixes)).toBe("default");
    expect(resolveTier("not a url", LIMITS.trustedSuffixes)).toBe("default");
    expect(resolveTier(undefined, LIMITS.trustedSuffixes)).toBe("default");
  });
});

describe("hashIp", () => {
  it("returns a stable 16-char hex digest and never the raw IP", () => {
    const h = hashIp("203.0.113.7");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(h).toBe(hashIp("203.0.113.7"));
    expect(h).not.toContain("203");
  });

  it("differs across IPs and maps missing IPs to 'anon'", () => {
    expect(hashIp("203.0.113.7")).not.toBe(hashIp("203.0.113.8"));
    expect(hashIp(undefined)).toBe("anon");
  });
});

describe("buildChecks", () => {
  it("builds minute → day → global for the api scope", () => {
    const h = hashIp("203.0.113.7");
    const checks = buildChecks({ ip: "203.0.113.7", tier: "trusted", limits: LIMITS, scope: "api" });
    expect(checks).toEqual([
      { key: `m:trusted:${h}`, window_seconds: 60, max: 30 },
      { key: `d:${h}`, window_seconds: 86400, max: 500 },
      { key: "g:d", window_seconds: 86400, max: 2000 },
    ]);
  });

  it("uses spa keys and limits for the spa scope", () => {
    const h = hashIp("203.0.113.7");
    const checks = buildChecks({ ip: "203.0.113.7", tier: "default", limits: LIMITS, scope: "spa" });
    expect(checks).toEqual([
      { key: `sm:default:${h}`, window_seconds: 60, max: 1 },
      { key: `sd:${h}`, window_seconds: 86400, max: 10 },
      { key: "sg:d", window_seconds: 86400, max: 100 },
    ]);
  });

  it("keys the day bucket by IP only, so tiers share the daily allowance", () => {
    const trusted = buildChecks({ ip: "1.2.3.4", tier: "trusted", limits: LIMITS, scope: "api" });
    const dflt = buildChecks({ ip: "1.2.3.4", tier: "default", limits: LIMITS, scope: "api" });
    expect(trusted[1]!.key).toBe(dflt[1]!.key);
  });
});

describe("createMemoryStore", () => {
  const CHECKS = [
    { key: "m:default:aa", window_seconds: 60, max: 2 },
    { key: "d:aa", window_seconds: 86400, max: 3 },
  ];

  it("allows under the cap and denies over it with retryAfter", () => {
    const store = createMemoryStore();
    const t0 = 1_000_000;
    expect(store.check(CHECKS, t0).allowed).toBe(true);
    expect(store.check(CHECKS, t0 + 1000).allowed).toBe(true);
    const denied = store.check(CHECKS, t0 + 2000);
    expect(denied.allowed).toBe(false);
    expect(denied.violatedKey).toBe("m:default:aa");
    expect(denied.retryAfter).toBeGreaterThanOrEqual(1);
    expect(denied.retryAfter).toBeLessThanOrEqual(60);
  });

  it("resets counts after the window elapses", () => {
    const store = createMemoryStore();
    const t0 = 1_000_000;
    store.check(CHECKS, t0);
    store.check(CHECKS, t0);
    expect(store.check(CHECKS, t0).allowed).toBe(false);
    expect(store.check(CHECKS, t0 + 61_000).allowed).toBe(true);
  });

  it("short-circuits: a denied request does not consume later buckets", () => {
    const store = createMemoryStore();
    const t0 = 1_000_000;
    // minute max 2, day max 3
    store.check(CHECKS, t0); // day=1
    store.check(CHECKS, t0); // day=2
    expect(store.check(CHECKS, t0).allowed).toBe(false); // minute-denied; day must stay 2
    // Advance past the minute window: day should be at 3 (not 4) and still allowed
    expect(store.check(CHECKS, t0 + 61_000).allowed).toBe(true); // day=3
    // And one more minute-window later the day cap (3) finally trips
    const denied = store.check(CHECKS, t0 + 122_000);
    expect(denied.allowed).toBe(false);
    expect(denied.violatedKey).toBe("d:aa");
  });
});

describe("createSupabaseStore", () => {
  const CHECKS = [{ key: "m:default:aa", window_seconds: 60, max: 5 }];

  it("POSTs the checks to the PostgREST RPC with service credentials", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ allowed: true, violated_key: null, retry_after: 0 }), {
        status: 200,
      }),
    );
    const store = createSupabaseStore({
      url: "https://proj.supabase.co",
      secretKey: "sb_secret_test",
      fetchImpl,
    });

    const verdict = await store.check(CHECKS);

    expect(verdict).toEqual({ allowed: true, violatedKey: null, retryAfter: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://proj.supabase.co/rest/v1/rpc/check_rate_limits");
    expect(init.method).toBe("POST");
    expect(init.headers["apikey"]).toBe("sb_secret_test");
    expect(init.headers["Authorization"]).toBe("Bearer sb_secret_test");
    expect(JSON.parse(init.body)).toEqual({ p_checks: CHECKS, p_log: null });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends the log payload on the same round-trip when provided", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ allowed: true, violated_key: null, retry_after: 0 }), {
        status: 200,
      }),
    );
    const store = createSupabaseStore({ url: "https://p.supabase.co", secretKey: "k", fetchImpl });
    const logPayload = {
      scope: "api",
      path: "/api/analyze",
      target_host: "example.com",
      target_url: "https://example.com",
      tier: "default",
      ip_hash: "deadbeefdeadbeef",
      user_agent: "curl/8",
    };
    await store.check(CHECKS, logPayload);
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body).p_log).toEqual(logPayload);
  });

  it("maps a denial response to camelCase", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ allowed: false, violated_key: "g:d", retry_after: 7 }), {
        status: 200,
      }),
    );
    const store = createSupabaseStore({ url: "https://p.supabase.co", secretKey: "k", fetchImpl });
    expect(await store.check(CHECKS)).toEqual({ allowed: false, violatedKey: "g:d", retryAfter: 7 });
  });

  it("throws on non-2xx and on network failure", async () => {
    const bad = createSupabaseStore({
      url: "https://p.supabase.co",
      secretKey: "k",
      fetchImpl: vi.fn().mockResolvedValue(new Response("boom", { status: 500 })),
    });
    await expect(bad.check(CHECKS)).rejects.toThrow();

    const down = createSupabaseStore({
      url: "https://p.supabase.co",
      secretKey: "k",
      fetchImpl: vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    });
    await expect(down.check(CHECKS)).rejects.toThrow();
  });
});

describe("checkRateLimit (orchestrator)", () => {
  const env = { SUPABASE_URL: "https://p.supabase.co", SUPABASE_SECRET_KEY: "k" };

  it("uses Supabase when credentials are present", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ allowed: true, violated_key: null, retry_after: 0 }), {
        status: 200,
      }),
    );
    const verdict = await checkRateLimit({
      ip: "203.0.113.7",
      targetUrl: "https://r3.illinois.gov",
      config: LIMITS,
      scope: "api",
      env,
      fetchImpl,
      memoryStore: createMemoryStore(),
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.source).toBe("supabase");
    // trusted tier limits must be on the wire
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body);
    expect(body.p_checks[0].max).toBe(30);
  });

  it("builds the request-log payload with tier, host, and hashed IP", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ allowed: true, violated_key: null, retry_after: 0 }), {
        status: 200,
      }),
    );
    await checkRateLimit({
      ip: "203.0.113.7",
      targetUrl: "https://R3.Illinois.GOV/page",
      config: LIMITS,
      scope: "api",
      env,
      fetchImpl,
      memoryStore: createMemoryStore(),
      logMeta: { path: "/api/analyze", userAgent: "curl/8" },
    });
    const log = JSON.parse(fetchImpl.mock.calls[0]![1].body).p_log;
    expect(log.tier).toBe("trusted");
    expect(log.target_host).toBe("r3.illinois.gov");
    expect(log.target_url).toBe("https://R3.Illinois.GOV/page");
    expect(log.path).toBe("/api/analyze");
    expect(log.user_agent).toBe("curl/8");
    expect(log.ip_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(log.ip_hash).not.toContain("203");
  });

  it("falls back to the memory store when Supabase errors (fail-open)", async () => {
    const log = vi.fn();
    const verdict = await checkRateLimit({
      ip: "203.0.113.7",
      targetUrl: "https://example.com",
      config: LIMITS,
      scope: "api",
      env,
      fetchImpl: vi.fn().mockRejectedValue(new TypeError("fetch failed")),
      memoryStore: createMemoryStore(),
      log,
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.source).toBe("memory");
    expect(log).toHaveBeenCalled();
  });

  it("uses the memory store directly when credentials are absent", async () => {
    const memoryStore = createMemoryStore();
    const base = {
      ip: "203.0.113.7",
      config: LIMITS,
      scope: "api" as const,
      env: {},
      memoryStore,
    };
    // default tier: perMinute 5 → 6th call denied
    for (let i = 0; i < 5; i++) {
      const v = await checkRateLimit({ ...base, targetUrl: "https://example.com" });
      expect(v.allowed).toBe(true);
      expect(v.source).toBe("memory");
    }
    const denied = await checkRateLimit({ ...base, targetUrl: "https://example.com" });
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfter).toBeGreaterThanOrEqual(1);
    // trusted targets ride a different minute bucket (but same daily bucket)
    const trusted = await checkRateLimit({ ...base, targetUrl: "https://r3.illinois.gov" });
    expect(trusted.allowed).toBe(true);
  });
});
