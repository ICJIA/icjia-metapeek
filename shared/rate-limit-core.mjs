/**
 * @fileoverview Tiered rate-limiting core shared by the Nitro middleware and
 * the standalone fetch-spa Netlify function. Plain JS with zero dependencies
 * so esbuild can bundle it into either context unchanged.
 *
 * Enforcement is application-level by design: Netlify's per-route `rateLimit`
 * config is never read for Nitro routes (the whole app deploys as one function
 * with `path: "/*"` — see nuxt/nuxt#33721), so platform config cannot be
 * relied on. Counters live in Supabase Postgres (atomic RPC) with a
 * per-instance in-memory fallback when credentials are absent or the RPC
 * errors (fail-open).
 *
 * @module shared/rate-limit-core
 */

import { createHash } from "node:crypto";

/**
 * @typedef {{ perMinute: number, perDay: number }} TierLimits
 * @typedef {{
 *   trustedSuffixes: readonly string[],
 *   tiers: { trusted: TierLimits, default: TierLimits },
 *   spa: { trusted: TierLimits, default: TierLimits },
 *   global: { perDay: number, spaPerDay: number },
 * }} RateLimitConfig
 * @typedef {{ key: string, window_seconds: number, max: number }} RateCheck
 * @typedef {{ allowed: boolean, violatedKey: string | null, retryAfter: number }} Verdict
 * @typedef {Verdict & { source: "supabase" | "memory" }} SourcedVerdict
 */

/**
 * Resolves the limit tier for a target URL. A host is trusted when it equals
 * a trusted suffix or ends with "." + suffix — `evil-illinois.gov` and
 * `illinois.gov.evil.com` both stay on the default tier.
 *
 * @param {string | undefined} targetUrl - The URL the caller wants analyzed
 * @param {readonly string[]} trustedSuffixes - e.g. ["illinois.gov"]
 * @returns {"trusted" | "default"}
 */
export function resolveTier(targetUrl, trustedSuffixes) {
  if (typeof targetUrl !== "string") return "default";
  let host;
  try {
    host = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    return "default";
  }
  for (const suffix of trustedSuffixes) {
    const s = suffix.toLowerCase();
    if (host === s || host.endsWith("." + s)) return "trusted";
  }
  return "default";
}

/**
 * Extracts a lowercase hostname for logging, or undefined when unparseable.
 *
 * @param {string | undefined} targetUrl
 * @returns {string | undefined}
 */
function safeHost(targetUrl) {
  if (typeof targetUrl !== "string") return undefined;
  try {
    return new URL(targetUrl).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * The canonical /64 prefix of an IPv6 address (e.g. "2001:db8:0:1::/64"),
 * or null if it does not parse. Expands one "::" and rewrites the first four
 * hextets with leading zeros stripped, so the same /64 written any way — full,
 * compressed, zero-padded — collapses to one string.
 *
 * @param {string} s - lowercased IPv6, no zone id or brackets
 * @returns {string | null}
 */
function ipv6Prefix64(s) {
  const halves = s.split("::");
  if (halves.length > 2) return null; // more than one "::" is malformed
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups;
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return null;
    groups = [...head, ...Array(fill).fill("0"), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const prefix = groups.slice(0, 4);
  for (const g of prefix) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
  }
  return prefix.map((g) => parseInt(g, 16).toString(16)).join(":") + "::/64";
}

/**
 * Collapses an IP to the identity the limiter buckets on. IPv4 is one host =
 * itself (unchanged from before, so existing IPv4 buckets keep working). IPv6
 * buckets by /64: a single allocation is 2^64 addresses, so without this an
 * attacker source-rotating within one /64 would get a fresh per-IP allowance
 * per address, defeating the per-IP tier. IPv4-mapped IPv6 (::ffff:a.b.c.d) is
 * its embedded IPv4 host, not truncated. Unparseable input is used as-is.
 *
 * @param {string} ip
 * @returns {string}
 */
function ipIdentity(ip) {
  const s = ip
    .trim()
    .toLowerCase()
    .replace(/%.*$/, "") // drop a zone id (fe80::1%eth0)
    .replace(/^\[|\]$/g, ""); // drop brackets ([2001:db8::1])
  if (!s.includes(":")) return s; // IPv4 or opaque — one host
  const mappedV4 = s.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedV4) return mappedV4[1]; // ::ffff:a.b.c.d — the IPv4 host
  return ipv6Prefix64(s) ?? s; // real IPv6 → /64; else the raw string
}

/**
 * Hashes an IP so raw addresses never reach the counter store. IPv6 is keyed
 * by /64 (see ipIdentity) so a whole allocation shares one bucket.
 *
 * @param {string | undefined} ip
 * @returns {string} 16 hex chars, or "anon" when the IP is unknown
 */
export function hashIp(ip) {
  if (!ip) return "anon";
  return createHash("sha256").update(ipIdentity(ip)).digest("hex").slice(0, 16);
}

/**
 * Builds the ordered bucket checks for one request: minute → day → global.
 * Later buckets are only consumed when earlier ones allow, so abusers cannot
 * drain the shared daily budget faster than their own per-minute cap.
 *
 * @param {{ ip: string | undefined, tier: "trusted" | "default", limits: RateLimitConfig, scope: "api" | "spa" }} args
 * @returns {RateCheck[]}
 */
export function buildChecks({ ip, tier, limits, scope }) {
  const h = hashIp(ip);
  const spa = scope === "spa";
  const tierLimits = spa ? limits.spa[tier] : limits.tiers[tier];
  const globalMax = spa ? limits.global.spaPerDay : limits.global.perDay;
  const p = spa ? "s" : "";
  return [
    { key: `${p}m:${tier}:${h}`, window_seconds: 60, max: tierLimits.perMinute },
    { key: `${p}d:${h}`, window_seconds: 86400, max: tierLimits.perDay },
    { key: `${p}g:d`, window_seconds: 86400, max: globalMax },
  ];
}

/**
 * Per-instance fallback store with the same fixed-window, short-circuit
 * semantics as the Supabase RPC. Bounds abuse on a warm serverless instance;
 * counts reset on cold starts, which is the accepted fail-open trade-off.
 *
 * @returns {{ check(checks: RateCheck[], nowMs?: number): Verdict }}
 */
export function createMemoryStore() {
  /** @type {Map<string, { windowStart: number, count: number }>} */
  const buckets = new Map();

  return {
    check(checks, nowMs = Date.now()) {
      for (const { key, window_seconds, max } of checks) {
        const windowMs = window_seconds * 1000;
        const bucket = buckets.get(key);

        if (!bucket || nowMs - bucket.windowStart >= windowMs) {
          buckets.set(key, { windowStart: nowMs, count: 1 });
          if (1 > max) {
            return { allowed: false, violatedKey: key, retryAfter: window_seconds };
          }
          continue;
        }

        bucket.count += 1;
        if (bucket.count > max) {
          const retryAfter = Math.max(
            1,
            Math.ceil((bucket.windowStart + windowMs - nowMs) / 1000),
          );
          return { allowed: false, violatedKey: key, retryAfter };
        }
      }

      if (buckets.size > 10_000) {
        for (const [key, bucket] of buckets) {
          if (nowMs - bucket.windowStart >= 86_400_000) buckets.delete(key);
        }
      }

      return { allowed: true, violatedKey: null, retryAfter: 0 };
    },
  };
}

/**
 * Store backed by the Supabase `check_rate_limits` RPC (PostgREST). Throws on
 * HTTP errors and timeouts — the orchestrator decides the fallback.
 *
 * The optional log payload rides the same round-trip: the RPC inserts one
 * `request_log` row (with the final allow/deny verdict) at zero extra
 * latency. IPs arrive pre-hashed; rows are purged after 90 days by pg_cron.
 *
 * @typedef {{ scope: string, path?: string, target_host?: string, target_url?: string, tier: string, ip_hash: string, user_agent?: string }} LogPayload
 * @param {{ url: string, secretKey: string, timeoutMs?: number, fetchImpl?: typeof fetch }} args
 * @returns {{ check(checks: RateCheck[], logPayload?: LogPayload): Promise<Verdict> }}
 */
export function createSupabaseStore({ url, secretKey, timeoutMs = 2000, fetchImpl = globalThis.fetch }) {
  const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/rpc/check_rate_limits`;

  return {
    async check(checks, logPayload) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: secretKey,
            Authorization: `Bearer ${secretKey}`,
          },
          body: JSON.stringify({ p_checks: checks, p_log: logPayload ?? null }),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`rate-limit RPC returned HTTP ${res.status}`);
        }
        const data = await res.json();
        return {
          allowed: data.allowed === true,
          violatedKey: data.violated_key ?? null,
          retryAfter: data.retry_after ?? 0,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Orchestrates one rate-limit decision: resolve tier from the target URL,
 * build the bucket checks, ask Supabase, fall back to memory on any store
 * error or when credentials are absent.
 *
 * When `logMeta` is provided (request path + user agent), a request_log row
 * is written through the same RPC. Memory-fallback requests are not logged —
 * durable logging is only meaningful when the durable store is up.
 *
 * @param {{
 *   ip: string | undefined,
 *   targetUrl: string | undefined,
 *   config: RateLimitConfig,
 *   scope: "api" | "spa",
 *   env: Record<string, string | undefined>,
 *   memoryStore: ReturnType<typeof createMemoryStore>,
 *   fetchImpl?: typeof fetch,
 *   log?: (entry: Record<string, unknown>) => void,
 *   logMeta?: { path?: string, userAgent?: string },
 * }} args
 * @returns {Promise<SourcedVerdict>}
 */
export async function checkRateLimit({ ip, targetUrl, config, scope, env, memoryStore, fetchImpl, log, logMeta }) {
  const tier = resolveTier(targetUrl, config.trustedSuffixes);
  const checks = buildChecks({ ip, tier, limits: config, scope });

  const url = env?.SUPABASE_URL;
  const secretKey = env?.SUPABASE_SECRET_KEY;

  if (url && secretKey) {
    try {
      const store = createSupabaseStore({ url, secretKey, fetchImpl });
      const logPayload = logMeta
        ? {
            scope,
            path: logMeta.path,
            target_url: targetUrl,
            target_host: safeHost(targetUrl),
            tier,
            ip_hash: hashIp(ip),
            user_agent: logMeta.userAgent,
          }
        : undefined;
      const verdict = await store.check(checks, logPayload);
      return { ...verdict, source: "supabase" };
    } catch (error) {
      log?.({
        level: "error",
        event: "rate_limit_store_error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { ...memoryStore.check(checks), source: "memory" };
}
