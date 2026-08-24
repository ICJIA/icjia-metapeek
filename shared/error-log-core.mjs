/**
 * @fileoverview Durable error sink shared by the Nitro server (via
 * server/utils/logger.ts) and the standalone fetch-spa Netlify function.
 * Plain JS with zero dependencies so esbuild can bundle it into either
 * context unchanged, exactly like rate-limit-core.mjs.
 *
 * Why it exists: structured error entries go to Netlify's function logs,
 * which are retained for at most days — too short to diagnose a slow-burning
 * production fault after the fact. persistError writes the same entry to the
 * Supabase `error_log` table (RLS, service-role only, 90-day pg_cron purge)
 * so `./logs.sh errors` can read it weeks later.
 *
 * The sink must never hurt the request it is reporting on: every path out of
 * persistError resolves — false on missing credentials, HTTP errors, network
 * failures, and timeouts. Callers await it (a dropped promise may be frozen
 * with the serverless instance before the insert lands), but a failed insert
 * only ever costs its own timeout.
 *
 * @module shared/error-log-core
 */

/**
 * The error_log columns a caller may set. Anything else a caller passes is
 * dropped before the row leaves the process — the table must never receive a
 * raw IP or a stray secret through an over-wide object spread. `ip_hash`
 * arrives pre-hashed (hashIp in rate-limit-core.mjs); raw addresses are
 * never stored.
 *
 * @typedef {{
 *   level: "error" | "security",
 *   event: string,
 *   scope?: "api" | "spa",
 *   path?: string,
 *   target_host?: string,
 *   target_url?: string,
 *   status_code?: number,
 *   error?: string,
 *   stack?: string,
 *   timing_ms?: number,
 *   ip_hash?: string,
 *   user_agent?: string,
 *   request_id?: string,
 * }} ErrorLogEntry
 */

/**
 * Query-param names whose values are redacted from target_url before a row
 * leaves the process. Mirrors sanitizeUrlForLogging in server/utils/logger.ts;
 * kept here too because fetch-spa passes raw target URLs and the sink is the
 * last line of defense — a token for the TARGET site must never be stored.
 */
const SENSITIVE_PARAMS = new Set([
  "token", "key", "apikey", "api_key", "secret", "password", "pass", "pwd",
  "auth", "authorization", "session", "sid", "jwt", "bearer", "oauth",
]);

/**
 * Redacts sensitive query-param values in a URL. Unparseable input is
 * returned truncated rather than dropped — a malformed URL is still signal.
 *
 * @param {string} url
 * @returns {string}
 */
export function redactUrlSecrets(url) {
  try {
    const parsed = new URL(url);
    // Basic-auth userinfo is a credential for the TARGET site — never store
    // any of it, not even the username.
    parsed.username = "";
    parsed.password = "";
    for (const [key] of parsed.searchParams) {
      if (SENSITIVE_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, "[REDACTED]");
      }
    }
    return parsed.toString();
  } catch {
    return url.length > 100 ? url.slice(0, 100) + "..." : url;
  }
}

/**
 * Redacts every URL embedded in free text. Puppeteer/undici error messages
 * and stacks quote the full target URL ("net::ERR_CONNECTION_REFUSED at
 * https://…?token=…"), which would defeat target_url redaction if stored
 * verbatim — the sink scrubs the text fields too, covering every writer.
 *
 * @param {string} text
 * @returns {string}
 */
export function redactUrlsInText(text) {
  return text.replace(/https?:\/\/[^\s"'<>()[\]]+/g, (u) => redactUrlSecrets(u));
}

/**
 * Level for a blocked request, by its block reason. A hostname that simply
 * does not resolve is a typo, not an attack — persisting it as "security"
 * would drown the real SSRF signal (private-address probes, blocked internal
 * hostnames) in fat-fingered domains. Anything unrecognized stays "security":
 * under-alarming is the failure mode to avoid.
 *
 * @param {string | undefined} reason
 * @returns {"error" | "security"}
 */
export function classifyBlockReason(reason) {
  if (typeof reason === "string" && /^could not resolve hostname/i.test(reason)) {
    return "error";
  }
  return "security";
}

/** Caps mirror the left() truncation check_rate_limits applies to request_log. */
const TEXT_CAPS = {
  event: 100,
  path: 200,
  target_host: 255,
  target_url: 2048,
  error: 500,
  stack: 2000,
  ip_hash: 64,
  user_agent: 300,
  request_id: 64,
};

/**
 * Builds the insert row: allowed columns only, text fields truncated.
 *
 * @param {ErrorLogEntry} entry
 * @returns {Record<string, string | number>}
 */
function toRow(entry) {
  /** @type {Record<string, string | number>} */
  const row = {};
  row.level = entry.level;
  if (entry.scope) row.scope = entry.scope;
  if (typeof entry.status_code === "number") row.status_code = entry.status_code;
  if (typeof entry.timing_ms === "number") row.timing_ms = Math.round(entry.timing_ms);
  for (const [key, cap] of Object.entries(TEXT_CAPS)) {
    let value = /** @type {Record<string, unknown>} */ (entry)[key];
    if (typeof value === "string" && value.length > 0) {
      if (key === "target_url") value = redactUrlSecrets(value);
      if (key === "error" || key === "stack") value = redactUrlsInText(value);
      row[key] = value.length > cap ? value.slice(0, cap) : value;
    }
  }
  return row;
}

/**
 * Inserts one error_log row over PostgREST. Resolves true when the row
 * landed, false otherwise; never throws and never rejects.
 *
 * @param {ErrorLogEntry} entry
 * @param {{
 *   env: Record<string, string | undefined>,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 *   log?: (entry: Record<string, unknown>) => void,
 * }} deps
 * @returns {Promise<boolean>}
 */
export async function persistError(entry, { env, fetchImpl = globalThis.fetch, timeoutMs = 1500, log }) {
  const url = env?.SUPABASE_URL;
  const secretKey = env?.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) return false;

  const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/error_log`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(toRow(entry)),
      signal: controller.signal,
    });
    if (!res.ok) {
      log?.({
        level: "error",
        event: "error_log_store_error",
        error: `error_log insert returned HTTP ${res.status}`,
      });
      return false;
    }
    return true;
  } catch (error) {
    log?.({
      level: "error",
      event: "error_log_store_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  } finally {
    clearTimeout(timer);
  }
}
