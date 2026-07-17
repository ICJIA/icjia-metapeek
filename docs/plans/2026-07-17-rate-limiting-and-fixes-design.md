# Rate Limiting, fetch-spa Repair & Image Scoring — Design

**Date:** 2026-07-17
**Status:** Approved (conversation review 2026-07-17)

## Overview

Three problems, one release:

1. **No enforced rate limiting.** The `export const config` rate limits in `server/api/*.ts` are dead code — Nitro bundles all routes into a single Netlify function whose generated config (`path: "/*"`) carries no `rateLimit` (see nuxt/nuxt#33721, closed not-planned). Verified live: 14 requests to `/api/analyze` in ~30s → 14 × 200. The public, unauthenticated proxy endpoints are an open Netlify-credit burner.
2. **`/api/fetch-spa` returns 500 on every request in production.** The "Render with JavaScript" feature is down. Prime suspect: the 0.14.0 pnpm migration broke `included_files = ["node_modules/@sparticuz/chromium/bin/**"]` (pnpm symlink layout).
3. **Image scoring can't fail.** A page with no `og:image` still scores 70/C; a page whose `og:image` 404s shows **green** (client emits `overallStatus: null` on load error, and `checkOGImage` falls through to "present with absolute URL"). The CLI already scores unreachable images 0 — web/API/CLI disagree.

## 1. Tiered rate limiting

### Goals

- Public API stays keyless ("no login required" is a core product claim).
- Lenient for state-site checks (`*.illinois.gov`), strict for everything else.
- **Bound worst-case Netlify spend** — per-IP limits alone don't stop distributed abuse, so a global daily budget backstops everything.
- Enforcement must not depend on Netlify platform features we cannot observe working.

### Architecture

Application-level enforcement in a Nitro server middleware (`server/middleware/rate-limit.ts`), backed by Supabase Postgres (project `metapeek`, ref `yncuzxstzcnfhmfciwqz`, us-east-2) through a single atomic RPC per request. A per-instance in-memory limiter is the fallback whenever Supabase env vars are absent (local dev) or the RPC errors (fail-open, logged).

Core logic lives in **`shared/rate-limit-core.mjs`** (plain JS, zero deps) so both the Nitro middleware and the standalone `fetch-spa` function import the identical implementation: tier resolution, key building, RPC call, in-memory fallback. Limits/config are passed in as arguments; the Nitro side sources them from `metapeek.config.ts`, `fetch-spa` from its own constants block (kept, per its "self-contained" design note).

### Tiers and limits (defaults, tunable in `metapeek.config.ts`)

| Bucket | Trusted target (`*.illinois.gov`, `*.icjia.app`) | Any other target |
| --- | --- | --- |
| Standard API, per IP | 30/min, 500/day | 5/min, 50/day |
| `fetch-spa` (Chromium), per IP | 3/min, 60/day | 1/min, 10/day |
| Global (all IPs) | 2,000/day standard + 100/day spa | same pool |

- Tier = target host `=== suffix || endsWith("." + suffix)` — defeats `evil-illinois.gov`.
- Tier is resolved from the **requested target URL** (query `url` for GETs, body `url` for POSTs); unparseable target → default tier (validation will 400 it anyway).
- Check order per request: minute → day → global, short-circuiting on first violation. Denied requests consume the buckets already checked but never the later ones, so an abuser hammering 429s cannot drain the global budget faster than their own per-minute cap.
- A valid `METAPEEK_API_KEY` bearer token bypasses rate limiting entirely (existing dormant auth becomes the internal/partner fast lane).

### Storage

```sql
create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        integer not null default 1
);
-- RLS enabled, zero policies: only service-role connections can touch it.
```

One RPC, `public.check_rate_limits(p_checks jsonb)`, takes an ordered array of `{key, window_seconds, max}`; for each entry it upsert-increments atomically (`INSERT … ON CONFLICT … DO UPDATE`, window reset in place) and returns `{allowed, violated_key, retry_after}` on first violation. `SECURITY DEFINER`, `EXECUTE` revoked from `anon` and `authenticated`. Fixed windows (60s / 86,400s UTC); row count stays ≈ active IPs × buckets; a `pg_cron` job purges rows older than 2 days.

Keys never contain raw IPs: `m:{tier}:{h}`, `d:{h}`, `g:d`, spa variants `sm:/sd:/sg:` where `h = sha256(ip).slice(0, 16)`.

### Client to Supabase

Plain `fetch` to PostgREST (`{SUPABASE_URL}/rest/v1/rpc/check_rate_limits`, headers `apikey` + `Authorization: Bearer {SUPABASE_SECRET_KEY}`), 2s timeout. No `@supabase/supabase-js` dependency — one RPC does not justify supply-chain surface. Env: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (Netlify env vars + local `.env`).

### Responses

- Per-IP violation → **429** JSON `{ ok: false, error, retryAfter }` + `Retry-After` header.
- Global budget hit → **503** + `Retry-After` (site-wide protection, not the caller's fault).
- Successful `GET /api/analyze` also gets `Netlify-CDN-Cache-Control: public, s-maxage=60` + `Netlify-Vary: query=url` so repeat checks of the same URL are served from CDN without invoking the function.

### Failure policy

Supabase unreachable/erroring → log loudly, fall back to the in-memory per-instance limiter for that request (still bounds warm-instance abuse), never 500 a legitimate user because our limiter store hiccuped.

### Request logging (added mid-implementation, user-requested)

Every rate-limit decision writes one `request_log` row **through the same RPC round-trip** (`check_rate_limits(p_checks, p_log)`) — zero added latency, and denied requests are logged too (that's where the abuse signal lives). Columns: timestamp, scope, path, target host/URL, tier, allow/deny verdict + violated key, truncated-SHA-256 IP hash, user agent. RLS with no policies (service-role only), 90-day pg_cron retention, raw IPs never stored. Memory-fallback requests are not logged — durable logging only when the durable store is up.

## 2. fetch-spa repair

Diagnose from Netlify deploy/function logs (Netlify MCP / CLI). Expected fix: replace the pnpm-broken `included_files` glob (correct pattern for pnpm's `.pnpm` store, or mark `@sparticuz/chromium` external and resolve at runtime). Then wire the same rate limiting (spa buckets above) into the function via `shared/rate-limit-core.mjs`, and verify live with a burst test: expect 200/200/200 then 429 with `Retry-After`.

## 3. Image scoring

Three changes to make "no working image" fail, with web/API/CLI parity:

1. **Grade gate (`shared/score.ts`).** If the `ogImage` category is red (missing tag **or** confirmed-unreachable URL), overall score is capped at 55 → grade F, and `MetaScore` gains `gated: true` + a gate reason so the UI can say *"Automatic F: social previews cannot render without a working og:image."* Weighted math otherwise unchanged.
2. **Broken-image signal (client).** `ImageAnalysis.vue` emits `loadFailed: true` (with `overallStatus: null`) when the browser cannot load the image. `checkOGImage` maps: `reachable === false` (server-verified) → **red** "og:image URL is not reachable"; `loadFailed` (browser-only signal) → **yellow** "og:image could not be verified" — yellow, not red, because hotlink/referer protection can fail in-browser while platform crawlers still succeed.
3. **Server-side reachability probe (API parity).** `/api/analyze` probes an absolute `og:image` URL after parsing: full SSRF validation (`validateUrl`), then pinned HEAD (fallback `GET` + `Range: bytes=0-1` on 405/501), 5s timeout. Result feeds `imageAnalysis.reachable` + content-type check into `generateDiagnostics`. Probe errors other than a definitive 4xx/5xx are treated as unknown (no penalty) to avoid false fails. This matches the CLI's existing "og:image URL is not reachable → score 0" behavior.

`ImageAnalysisResult` (shared/types.ts) gains optional `loadFailed?: boolean`, `reachable?: boolean`, `contentType?: string`.

## 4. Tests

- **Behavior over shape:** `tests/unit/rateLimit.test.ts` is replaced — the old test asserted config values while production had zero enforcement. New unit tests cover tier resolution (incl. `evil-illinois.gov`), key hashing, window reset math, short-circuit ordering, fail-open, and the middleware returning 429/503 with `Retry-After` (mocked store).
- **Parity:** CLI fixtures (`no-ogimage.html`, `broken-ogimage.html`) run through the shared parser→diagnostics→score pipeline asserting the gated verdicts; when `python3` is present, the same fixtures run through `packages/cli/metapeek` and grades must agree.
- **Deployed smoke test:** `scripts/smoke-rate-limit.mjs <base-url>` bursts `/api/analyze` until it sees a 429 (fails if none by N+2) — run against previews/prod after deploys. This is the test class that would have caught the current gap.

## 5. Documentation

README: replace "10/min" claims with the tier table, document 429/`Retry-After`/503 and the CDN cache; SECURITY-AUDIT addendum correcting RT-10's severity assumption; CHANGELOG 0.15.0.

## Out of scope (deliberate)

- Per-client API keys / accounts (global bearer bypass suffices).
- `/api/v1` path versioning — revisit before wider publicity.
- Netlify platform `rateLimit` config — kept on `fetch-spa` as belt-and-suspenders but never relied upon.
