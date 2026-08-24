/**
 * @fileoverview Public service status. GET /api/status
 *
 * Answers "is MetaPeek healthy, and how hard is it working?" in one payload:
 * version/build identity, a live Supabase reachability check, request totals
 * (24h/30d), the global daily budget counters — the credit-burn number the
 * rate limiter exists to protect — and durable error counts. Rendered by
 * /status; also consumable raw by uptime monitors.
 *
 * Cost containment, because this endpoint is made to be polled:
 * - CDN-cached 60s with a 5-minute stale window, so pollers rarely reach
 *   the function (and never stampede Supabase);
 * - exempt from the rate limiter (server/middleware/rate-limit.ts), so a
 *   poller cannot eat a visitor's budget and the page still answers while
 *   the daily budget is returning 503;
 * - one RPC round-trip total (status_summary), never a Chromium invocation —
 *   a health check must not cost a cold start and a binary-pack download.
 *
 * The payload is public: aggregates only, assembled field by field so nothing
 * the RPC returns can leak through unlisted. No hosts, no URLs, no hashes.
 *
 * @module server/api/status.get
 */

import { defineEventHandler, setResponseHeader } from "h3";
import { RATE_LIMIT } from "#shared/rate-limit-config.mjs";

/** Window totals from request_log. */
interface UsageWindow {
  total: number;
  allowed: number;
  denied: number;
  api: number;
  spa: number;
}

/** One global budget counter, as check_rate_limits maintains it. */
interface BudgetBucket {
  used: number;
  limit: number;
  /**
   * Start of the live window, absent when no counter is running. The day
   * window is reset-in-place (86,400s from the first request after expiry),
   * not calendar-aligned — the timestamp is what makes `used` interpretable.
   */
  windowStartedAt?: string;
}

export interface StatusPayload {
  /** False only when a configured Supabase check failed. */
  ok: boolean;
  service: "MetaPeek";
  version: string;
  commit?: string;
  builtAt?: string;
  now: string;
  checks: {
    supabase: { configured: boolean; ok?: boolean; latencyMs?: number };
  };
  usage: { last24h: UsageWindow; last30d: UsageWindow } | null;
  budget: { api: BudgetBucket; spa: BudgetBucket } | null;
  errors: { last24h: number; last30d: number; lastAt: string | null } | null;
  retentionDays: { requestLog: number; errorLog: number };
}

/** Dependencies injected by the handler (and by tests). */
export interface StatusDeps {
  env: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  version: string;
  commit?: string;
  builtAt?: string;
  /** Receives the cause when the Supabase check fails — never silent. */
  log?: (entry: Record<string, unknown>) => void;
}

/** Coerces an RPC number that may arrive as string/undefined. */
function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toWindow(value: unknown): UsageWindow {
  const w = (value ?? {}) as Record<string, unknown>;
  return {
    total: toCount(w.total),
    allowed: toCount(w.allowed),
    denied: toCount(w.denied),
    api: toCount(w.api),
    spa: toCount(w.spa),
  };
}

function toBucket(value: unknown, limit: number): BudgetBucket {
  const b = (value ?? {}) as Record<string, unknown>;
  const bucket: BudgetBucket = { used: toCount(b.used), limit };
  if (typeof b.windowStartedAt === "string") bucket.windowStartedAt = b.windowStartedAt;
  return bucket;
}

/**
 * Builds the status payload: one status_summary RPC, timed as the Supabase
 * reachability check. Consumes no h3 APIs so tests can drive it with plain
 * objects. Never throws — an unreachable Supabase is a payload with
 * ok:false, not an error page.
 */
export async function buildStatus(deps: StatusDeps): Promise<StatusPayload> {
  const { env, fetchImpl = globalThis.fetch, timeoutMs = 2000 } = deps;

  const payload: StatusPayload = {
    ok: true,
    service: "MetaPeek",
    version: deps.version,
    commit: deps.commit,
    builtAt: deps.builtAt,
    now: new Date().toISOString(),
    checks: { supabase: { configured: false } },
    usage: null,
    budget: null,
    errors: null,
    retentionDays: { requestLog: 90, errorLog: 90 },
  };

  const url = env?.SUPABASE_URL;
  const secretKey = env?.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) return payload;

  payload.checks.supabase.configured = true;
  const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/rpc/status_summary`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
      },
      body: "{}",
      signal: controller.signal,
    });
    payload.checks.supabase.latencyMs = Date.now() - startedAt;
    if (!res.ok) throw new Error(`status_summary returned HTTP ${res.status}`);
    // `?? {}`: a 200 whose body is JSON null (how PostgREST renders a
    // NULL-returning function) is empty data, not an outage.
    const summary = ((await res.json()) ?? {}) as Record<string, unknown>;
    payload.checks.supabase.ok = true;

    const usage = (summary.usage ?? {}) as Record<string, unknown>;
    payload.usage = {
      last24h: toWindow(usage.last24h),
      last30d: toWindow(usage.last30d),
    };

    const budget = (summary.budget ?? {}) as Record<string, unknown>;
    payload.budget = {
      api: toBucket(budget.api, RATE_LIMIT.global.perDay),
      spa: toBucket(budget.spa, RATE_LIMIT.global.spaPerDay),
    };

    const errors = (summary.errors ?? {}) as Record<string, unknown>;
    payload.errors = {
      last24h: toCount(errors.last24h),
      last30d: toCount(errors.last30d),
      lastAt: typeof errors.lastAt === "string" ? errors.lastAt : null,
    };
  } catch (error) {
    payload.ok = false;
    payload.checks.supabase.ok = false;
    payload.checks.supabase.latencyMs ??= Date.now() - startedAt;
    // The cause (timeout vs HTTP status vs network) stays out of the public
    // payload but must reach the function log — an operator diagnosing the
    // status feature's own outage needs more than ok:false.
    deps.log?.({
      level: "error",
      event: "status_check_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timer);
  }
  return payload;
}

export default defineEventHandler(async (event) => {
  const publicConfig = useRuntimeConfig(event).public;

  const payload = await buildStatus({
    env: process.env as Record<string, string | undefined>,
    version: String(publicConfig.version || "0.0.0"),
    commit: publicConfig.commit ? String(publicConfig.commit) : undefined,
    builtAt: publicConfig.builtAt ? String(publicConfig.builtAt) : undefined,
    log: (entry) => console.error(JSON.stringify(entry)),
  });

  // Pollers hit the CDN, not the function: fresh for 60s, then a stale copy
  // may be served for up to 5 minutes while one request revalidates.
  setResponseHeader(
    event,
    "Netlify-CDN-Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=300",
  );
  setResponseHeader(event, "Cache-Control", "public, max-age=60");
  // Collapse every query variant onto one cached object (only the listed
  // param varies the key, and nothing sends it) — with the middleware's
  // exact-path exemption, cache-busting query strings can neither skip the
  // CDN nor skip the rate limiter.
  setResponseHeader(event, "Netlify-Vary", "query=v");
  // Public read-only aggregates: let browser-based dashboards on other
  // origins read it too (overrides the same-origin ACAO the /api/** route
  // rule pins for the analysis endpoints).
  setResponseHeader(event, "Access-Control-Allow-Origin", "*");

  return payload;
});
