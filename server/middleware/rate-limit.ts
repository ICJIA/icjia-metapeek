/**
 * @fileoverview Application-level rate limiting for all /api/* routes.
 *
 * This middleware is the enforcement point — Netlify's per-route `rateLimit`
 * config is never read for Nitro routes (the app deploys as one function with
 * `path: "/*"`, nuxt/nuxt#33721), so limits must run in-process. Counters
 * live in Supabase (atomic RPC); without credentials or on store errors we
 * fall back to a per-instance in-memory store (fail-open, logged).
 *
 * Tiering: targets under trusted suffixes (*.illinois.gov, *.icjia.app) get
 * lenient limits; everything else is strict. A site-wide daily budget caps
 * worst-case Netlify spend and returns 503 when exhausted.
 *
 * @module server/middleware/rate-limit
 */

import {
  defineEventHandler,
  getQuery,
  readBody,
  setResponseHeader,
  createError,
  getHeader,
} from "h3";
import type { H3Event } from "h3";
import {
  checkRateLimit,
  createMemoryStore,
} from "#shared/rate-limit-core.mjs";
import { safeEqual } from "../utils/auth";
import { getClientIp, getUserAgent } from "../utils/logger";
import metapeekConfig from "../../metapeek.config";

/** Input extracted from the request — kept primitive for testability. */
export interface RateLimitInput {
  path: string;
  method: string;
  authHeader?: string;
  targetUrl?: string;
  ip?: string;
  userAgent?: string;
}

/** Dependencies injected by the handler (and by tests). */
export interface RateLimitDeps {
  config: typeof metapeekConfig.rateLimit;
  env: Record<string, string | undefined>;
  memoryStore: ReturnType<typeof createMemoryStore>;
  fetchImpl?: typeof fetch;
  log?: (entry: Record<string, unknown>) => void;
}

export type RateLimitDecision =
  | { action: "pass" }
  | {
      action: "reject";
      statusCode: 429 | 503;
      retryAfter: number;
      message: string;
    };

/**
 * Pure decision: should this request pass, or be rejected with 429/503?
 * Consumes no h3 APIs so tests can drive it with plain objects.
 */
export async function decideRateLimit(
  input: RateLimitInput,
  deps: RateLimitDeps,
): Promise<RateLimitDecision> {
  if (!input.path.startsWith("/api/")) return { action: "pass" };
  if (input.method === "OPTIONS") return { action: "pass" };

  // A valid internal/partner bearer token skips limiting entirely. An
  // invalid one is ordinary anonymous traffic — it still gets limited here
  // and rejected by the route's own auth check afterwards.
  const apiKey = deps.env.METAPEEK_API_KEY;
  if (apiKey) {
    const token = input.authHeader?.startsWith("Bearer ")
      ? input.authHeader.slice(7)
      : "";
    if (token && safeEqual(token, apiKey)) return { action: "pass" };
  }

  const scope = input.path.startsWith("/api/fetch-spa") ? "spa" : "api";

  const verdict = await checkRateLimit({
    ip: input.ip,
    targetUrl: input.targetUrl,
    config: deps.config,
    scope,
    env: deps.env,
    memoryStore: deps.memoryStore,
    fetchImpl: deps.fetchImpl,
    log: deps.log,
    logMeta: { path: input.path, userAgent: input.userAgent },
  });

  if (verdict.allowed) return { action: "pass" };

  const isGlobal =
    verdict.violatedKey?.startsWith("g:") ||
    verdict.violatedKey?.startsWith("sg:");

  if (isGlobal) {
    return {
      action: "reject",
      statusCode: 503,
      retryAfter: verdict.retryAfter,
      message:
        "MetaPeek is at its daily capacity. Please try again tomorrow.",
    };
  }

  return {
    action: "reject",
    statusCode: 429,
    retryAfter: verdict.retryAfter,
    message: `Rate limit exceeded. Try again in ${verdict.retryAfter}s.`,
  };
}

/** One store per server instance so warm invocations share counters. */
const memoryStore = createMemoryStore();

/**
 * Extracts the analysis target from the request so the tier can be resolved.
 * GET/HEAD read the `url` query param; POST reads the JSON body (h3 caches
 * the parsed body, so route handlers re-read it safely). Anything
 * unparseable simply lands on the strict default tier.
 */
async function extractTargetUrl(event: H3Event): Promise<string | undefined> {
  if (event.method === "GET" || event.method === "HEAD") {
    const url = getQuery(event).url;
    return typeof url === "string" ? url : undefined;
  }
  try {
    const body = await readBody(event);
    const url = (body as { url?: unknown } | null)?.url;
    return typeof url === "string" ? url : undefined;
  } catch {
    return undefined;
  }
}

export default defineEventHandler(async (event) => {
  if (!event.path.startsWith("/api/")) return;

  const decision = await decideRateLimit(
    {
      path: event.path,
      method: event.method,
      authHeader: getHeader(event, "authorization"),
      targetUrl: await extractTargetUrl(event),
      ip: getClientIp(event),
      userAgent: getUserAgent(event),
    },
    {
      config: metapeekConfig.rateLimit,
      env: process.env as Record<string, string | undefined>,
      memoryStore,
      log: (entry) => console.error(JSON.stringify(entry)),
    },
  );

  if (decision.action === "reject") {
    setResponseHeader(event, "Retry-After", String(decision.retryAfter));
    throw createError({
      statusCode: decision.statusCode,
      statusMessage:
        decision.statusCode === 429 ? "Too Many Requests" : "Service Unavailable",
      message: decision.message,
      data: { ok: false, error: decision.message, retryAfter: decision.retryAfter },
    });
  }
});
