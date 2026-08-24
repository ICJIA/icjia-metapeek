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
    const value = /** @type {Record<string, unknown>} */ (entry)[key];
    if (typeof value === "string" && value.length > 0) {
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
