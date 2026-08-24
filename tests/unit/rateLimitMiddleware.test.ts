/**
 * Behavior tests for the rate-limit middleware decision logic.
 * The h3 glue (header extraction, createError) stays thin; everything that
 * can reject a request is exercised here through decideRateLimit.
 */
import { describe, it, expect, vi } from "vitest";
import { decideRateLimit } from "../../server/middleware/rate-limit";
import { createMemoryStore } from "#shared/rate-limit-core.mjs";

const CONFIG = {
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

const baseInput = {
  path: "/api/analyze",
  method: "GET",
  authHeader: undefined as string | undefined,
  targetUrl: "https://example.com",
  ip: "203.0.113.7",
};

const makeDeps = (overrides: Record<string, unknown> = {}) => ({
  config: CONFIG,
  env: {} as Record<string, string | undefined>,
  memoryStore: createMemoryStore(),
  ...overrides,
});

describe("decideRateLimit", () => {
  it("passes non-API paths and OPTIONS without consuming buckets", async () => {
    const memoryStore = createMemoryStore();
    const spy = vi.spyOn(memoryStore, "check");
    const deps = makeDeps({ memoryStore });

    expect(
      (await decideRateLimit({ ...baseInput, path: "/about" }, deps)).action,
    ).toBe("pass");
    expect(
      (await decideRateLimit({ ...baseInput, method: "OPTIONS" }, deps)).action,
    ).toBe("pass");
    expect(spy).not.toHaveBeenCalled();
  });

  it("passes bare /api/status without consuming buckets or logging a request row", async () => {
    // The status endpoint is monitoring, not usage: a poller must never eat a
    // visitor's per-IP budget, drain the global one, or spam request_log —
    // and it must stay reachable even when the daily budget returns 503.
    const memoryStore = createMemoryStore();
    const spy = vi.spyOn(memoryStore, "check");
    const deps = makeDeps({ memoryStore });

    expect(
      (await decideRateLimit({ ...baseInput, path: "/api/status" }, deps)).action,
    ).toBe("pass");
    expect(spy).not.toHaveBeenCalled();
  });

  it("exempts trailing-slash /api/status/ — routers serve it with the same handler", async () => {
    // An uptime monitor configured with a trailing slash must not silently
    // eat the global daily budget the exemption exists to protect.
    const memoryStore = createMemoryStore();
    const spy = vi.spyOn(memoryStore, "check");
    const deps = makeDeps({ memoryStore });

    expect(
      (await decideRateLimit({ ...baseInput, path: "/api/status/" }, deps)).action,
    ).toBe("pass");
    expect(spy).not.toHaveBeenCalled();

    // …but a longer path that merely starts the same is ordinary traffic.
    await decideRateLimit({ ...baseInput, path: "/api/statusx" }, deps);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("still rate-limits /api/status query variants — cache-busting buys nothing", async () => {
    // Netlify keys the CDN cache on the query string, so `?x=<random>` always
    // misses the cache. If those variants were also exempt here, a hostile
    // poller could drive unlimited function invocations and Supabase RPCs.
    // Only the bare path (what the page, monitors, and CDN revalidation use)
    // rides free; every variant pays the normal per-IP price.
    const memoryStore = createMemoryStore();
    const spy = vi.spyOn(memoryStore, "check");
    const deps = makeDeps({ memoryStore });

    expect(
      (await decideRateLimit({ ...baseInput, path: "/api/status?x=123" }, deps))
        .action,
    ).toBe("pass"); // under the limit it still passes…
    expect(spy).toHaveBeenCalledTimes(1); // …but it consumed a bucket check
  });

  it("rejects the 6th default-tier request in a minute with 429 + Retry-After", async () => {
    const deps = makeDeps();
    for (let i = 0; i < 5; i++) {
      expect((await decideRateLimit(baseInput, deps)).action).toBe("pass");
    }
    const decision = await decideRateLimit(baseInput, deps);
    expect(decision.action).toBe("reject");
    if (decision.action === "reject") {
      expect(decision.statusCode).toBe(429);
      expect(decision.retryAfter).toBeGreaterThanOrEqual(1);
      expect(decision.message).toContain(`${decision.retryAfter}`);
    }
  });

  it("gives trusted illinois.gov targets the lenient tier", async () => {
    const deps = makeDeps();
    const trusted = { ...baseInput, targetUrl: "https://r3.illinois.gov/page" };
    for (let i = 0; i < 10; i++) {
      expect((await decideRateLimit(trusted, deps)).action).toBe("pass");
    }
  });

  it("maps global-bucket violations to 503", async () => {
    const deps = makeDeps({
      config: { ...CONFIG, global: { perDay: 1, spaPerDay: 100 } },
    });
    expect((await decideRateLimit(baseInput, deps)).action).toBe("pass");
    const decision = await decideRateLimit({ ...baseInput, ip: "198.51.100.9" }, deps);
    expect(decision.action).toBe("reject");
    if (decision.action === "reject") {
      expect(decision.statusCode).toBe(503);
    }
  });

  it("applies spa limits on the fetch-spa path", async () => {
    const deps = makeDeps();
    const spa = { ...baseInput, path: "/api/fetch-spa", method: "POST" };
    expect((await decideRateLimit(spa, deps)).action).toBe("pass");
    const decision = await decideRateLimit(spa, deps);
    expect(decision.action).toBe("reject");
    if (decision.action === "reject") expect(decision.statusCode).toBe(429);
  });

  it("bypasses limiting for a valid METAPEEK_API_KEY bearer token only", async () => {
    const memoryStore = createMemoryStore();
    const spy = vi.spyOn(memoryStore, "check");
    const deps = makeDeps({ memoryStore, env: { METAPEEK_API_KEY: "sekret" } });

    const good = await decideRateLimit(
      { ...baseInput, authHeader: "Bearer sekret" },
      deps,
    );
    expect(good.action).toBe("pass");
    expect(spy).not.toHaveBeenCalled();

    const bad = await decideRateLimit(
      { ...baseInput, authHeader: "Bearer wrong" },
      deps,
    );
    expect(bad.action).toBe("pass"); // wrong token is still rate-limited traffic…
    expect(spy).toHaveBeenCalledTimes(1); // …so the store IS consulted
  });
});
