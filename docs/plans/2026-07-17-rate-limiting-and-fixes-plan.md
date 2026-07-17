# Rate Limiting, fetch-spa Repair & Image Scoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce tiered, Supabase-backed rate limiting on all API endpoints; repair the broken `/api/fetch-spa` function; make missing/unreachable `og:image` fail the grade consistently across web, API, and CLI.

**Architecture:** A dependency-free `shared/rate-limit-core.mjs` implements tier resolution, hashed keys, an atomic Supabase RPC client (plain fetch to PostgREST), and an in-memory fallback. A Nitro middleware applies it to `/api/*`; the standalone `fetch-spa` function imports the same core. Image scoring gains a hard grade gate plus a server-side reachability probe.

**Tech Stack:** Nuxt 4 / Nitro / h3, Supabase Postgres 17 (project ref `yncuzxstzcnfhmfciwqz`), Netlify Functions (esbuild), Vitest.

## Global Constraints

- Zero new npm dependencies (plain `fetch` to PostgREST; no `@supabase/supabase-js`).
- Env vars: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`; both absent → in-memory fallback, no crash, single warn.
- Raw IPs never stored: `sha256(ip).slice(0,16)`.
- Trusted suffix match: `host === suffix || host.endsWith("." + suffix)`.
- All 429/503 responses carry `Retry-After` (seconds, integer ≥ 1).
- Fail-open on store errors (log `level: "error"`), never block legit traffic on infra hiccups.
- No commits until the user asks; single-author commits, no AI co-author trailers (user rule).

---

### Task 1: Supabase schema + RPC (via Supabase MCP `apply_migration`)

**Files:** none in repo (DB migration named `rate_limiting_v1`); SQL recorded here is canonical.

**Interfaces produced:** RPC `public.check_rate_limits(p_checks jsonb) → jsonb` where `p_checks` = ordered `[{"key": text, "window_seconds": int, "max": int}, …]`; returns `{"allowed": bool, "violated_key": text|null, "retry_after": int}`.

- [ ] Apply migration:

```sql
create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        integer not null default 1
);

alter table public.rate_limits enable row level security;

create or replace function public.check_rate_limits(p_checks jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_check jsonb;
  v_key text;
  v_window int;
  v_max int;
  v_row rate_limits;
  v_retry int;
begin
  for v_check in select * from jsonb_array_elements(p_checks) loop
    v_key    := v_check->>'key';
    v_window := (v_check->>'window_seconds')::int;
    v_max    := (v_check->>'max')::int;

    insert into rate_limits as r (key, window_start, count)
    values (v_key, v_now, 1)
    on conflict (key) do update
      set count = case when r.window_start <= v_now - make_interval(secs => v_window)
                       then 1 else r.count + 1 end,
          window_start = case when r.window_start <= v_now - make_interval(secs => v_window)
                              then v_now else r.window_start end
    returning * into v_row;

    if v_row.count > v_max then
      v_retry := greatest(1, ceil(extract(epoch from
        (v_row.window_start + make_interval(secs => v_window) - v_now)))::int);
      return jsonb_build_object('allowed', false, 'violated_key', v_key, 'retry_after', v_retry);
    end if;
  end loop;

  return jsonb_build_object('allowed', true, 'violated_key', null, 'retry_after', 0);
end;
$$;

revoke all on table public.rate_limits from anon, authenticated;
revoke execute on function public.check_rate_limits(jsonb) from anon, authenticated, public;
grant execute on function public.check_rate_limits(jsonb) to service_role;
```

- [ ] Apply second migration `rate_limits_purge_cron`: `create extension if not exists pg_cron;` then schedule `delete from public.rate_limits where window_start < now() - interval '2 days';` daily at 04:10 UTC as job `purge_rate_limits`.
- [ ] Verify with `execute_sql`: call RPC 3× with `max: 2, window_seconds: 60` for a scratch key → third call returns `allowed: false, retry_after ≥ 1`; call with elapsed-window row (manually `update window_start = now() - interval '2 minutes'`) → resets to `count = 1, allowed: true`. Delete scratch key.
- [ ] Verify anon is locked out: PostgREST call with the **publishable** key only → expect 401/403/404 (no execute).

### Task 2: `shared/rate-limit-core.mjs` + unit tests

**Files:** Create `shared/rate-limit-core.mjs`; Create `tests/unit/rateLimitCore.test.ts`; Delete `tests/unit/rateLimit.test.ts` (config-shape test superseded by behavior tests).

**Interfaces produced (exact):**

```js
export function resolveTier(targetUrl, trustedSuffixes) // → "trusted" | "default"
export function hashIp(ip) // → 16-hex-char string; hashIp(undefined) → "anon"
export function buildChecks({ ip, tier, limits, scope }) // scope: "api" | "spa" → ordered [{key, window_seconds, max}, …] minute→day→global
export function createMemoryStore() // → { check(checks, nowMs?) → {allowed, violatedKey, retryAfter} } same semantics as RPC, Map-backed
export function createSupabaseStore({ url, secretKey, timeoutMs = 2000, fetchImpl = fetch }) // → { check(checks) → Promise<verdict> } — throws on HTTP/timeout errors (caller decides fallback)
export async function checkRateLimit({ ip, targetUrl, config, scope, env, memoryStore, log }) // orchestrator: bypass-free verdict {allowed, violatedKey, retryAfter, source: "supabase"|"memory"}
```

`limits` shape (consumed from config): `{ trustedSuffixes: string[], tiers: { trusted: {perMinute, perDay}, default: {perMinute, perDay} }, spa: { trusted: {perMinute, perDay}, default: {perMinute, perDay} }, global: { perDay, spaPerDay } }`.

Key formats (scope api / spa): minute `m:{tier}:{h}` / `sm:{tier}:{h}`, day `d:{h}` / `sd:{h}`, global `g:d` / `sg:d`.

- [ ] Write failing tests: tier resolution (`https://r3.illinois.gov/x` → trusted; `https://evil-illinois.gov` → default; `illinois.gov` apex → trusted; unparseable → default), hashIp stable/16-char/anon, buildChecks ordering + key shapes + windows (60 / 86400), memory store: increments, denies at max+1 with retryAfter ≥ 1, window reset via `nowMs` injection, short-circuit (later buckets not consumed on earlier violation), supabase store: posts to `{url}/rest/v1/rpc/check_rate_limits` with `apikey` + bearer headers (mock fetchImpl), maps snake_case response, throws on 500/timeout; orchestrator: uses supabase when env present, falls back to memory + `source: "memory"` when store throws.
- [ ] Run `pnpm vitest run tests/unit/rateLimitCore.test.ts` → FAIL (module missing).
- [ ] Implement `shared/rate-limit-core.mjs` (plain JS + JSDoc, `node:crypto` sha256).
- [ ] Run again → PASS.

### Task 3: Config tiers in `metapeek.config.ts`

**Files:** Modify `metapeek.config.ts` (replace `rateLimit` block; keep old keys out — grep references first: route `config` exports consume `windowLimit/windowSize/aggregateBy` and are being deleted in Task 4).

```ts
rateLimit: {
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
},
```

### Task 4: Nitro middleware + route cleanup

**Files:** Create `server/middleware/rate-limit.ts`; Modify `server/api/{fetch.post,analyze.get,ai-check.get}.ts` (delete dead `export const config` blocks); Create `tests/unit/rateLimitMiddleware.test.ts`.

Middleware behavior (TDD via exported `handleRateLimit(event, deps)` helper so tests inject store/env):

- Skip unless `event.path.startsWith("/api/")`; skip `OPTIONS`.
- Bypass when `METAPEEK_API_KEY` is set and bearer token matches (`safeEqual`).
- Target URL: GET/HEAD → `getQuery(event).url`; POST → `await readBody(event)` `.url` (h3 caches parsed body; route handlers re-read safely). Non-string → undefined → default tier.
- Scope: `event.path.startsWith("/api/fetch-spa")` → spa (dev parity; prod spa traffic hits the standalone function), else api.
- Verdict violated key `g:`/`sg:` prefix → **503** `{ ok:false, error:"MetaPeek is at its daily capacity. Please try again tomorrow." }`; other keys → **429** `{ ok:false, error:"Rate limit exceeded. Try again in {n}s.", retryAfter }`. Both set `Retry-After` via `setResponseHeader` and use `createError` with `data` — follow h3 idiom: `throw createError({ statusCode, statusMessage, data })` after setting header.
- Store errors already handled inside core (fail-open, `source:"memory"`).

- [ ] Failing tests: trusted target under per-minute cap passes; 6th default-tier request 429s with Retry-After; global violation → 503; bearer bypass; OPTIONS + non-API paths untouched.
- [ ] Implement; run `pnpm vitest run tests/unit/rateLimitMiddleware.test.ts` → PASS.
- [ ] Add CDN cache headers to successful `/api/analyze` responses (in `analyze.get.ts` success path): `Netlify-CDN-Cache-Control: public, s-maxage=60` + `Netlify-Vary: query=url`.

### Task 5: fetch-spa diagnosis + repair + limiting

**Files:** Modify `netlify.toml` ([functions.fetch-spa] block); Modify `netlify/functions/fetch-spa.mjs`.

- [ ] Diagnose: `netlify logs:function fetch-spa` (or dashboard) — confirm module-load failure (`@sparticuz/chromium` binary missing under pnpm layout).
- [ ] Fix `included_files` for pnpm store layout (glob `node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**`) — keep the plain path too for npm-layout portability.
- [ ] Wire limiting at top of handler after method check: `import { checkRateLimit } from "../../shared/rate-limit-core.mjs"` (esbuild bundles it), module-scope `const memoryStore = createMemoryStore()`, spa limits constants in the function's CONFIG block mirroring Task 3 values, IP from `req.headers.get("x-nf-client-connection-ip")`. 429/503 `Response` with `Retry-After`.
- [ ] Verify after deploy: burst 5 → expect ≤3 × 200/handled + ≥1 × 429 (trusted target), and non-gov target 429s on 2nd request.

### Task 6: Image scoring — gate + broken-image + probe

**Files:** Modify `shared/types.ts` (`ImageAnalysisResult` + `MetaScore`), `shared/diagnostics.ts` (`checkOGImage`), `shared/score.ts` (gate), `app/components/ImageAnalysis.vue` (emit `loadFailed`), `server/api/analyze.get.ts` (probe), `server/utils/fetcher.ts` (export a `probeImageUrl(imageUrl)` helper using `validateUrl` + pinned HEAD→ranged-GET fallback, 5s timeout, returns `{reachable: boolean|undefined, contentType?: string}`); Modify `tests/unit/useDiagnostics.test.ts` (extend); Create `tests/unit/score.test.ts`.

**Interfaces:** `ImageAnalysisResult` gains `loadFailed?: boolean; reachable?: boolean; contentType?: string`. `MetaScore` gains `gated: boolean; gateReason?: string`.

Rules (exact):
- `checkOGImage`: no image → red (unchanged). `reachable === false` → red `"og:image URL is not reachable"`. `loadFailed === true` (and `reachable` not `false`) → yellow `"og:image could not be verified (image failed to load in browser)"`. `contentType` present and not `image/*` → red `"og:image does not serve an image content-type"`. Else existing dimension logic.
- `computeScore`: after weighted overall, if `diagnostics.ogImage.status === "red"` → `overall = Math.min(overall, 55)`, `gated = true`, `gateReason = "A working og:image is required for social previews — score capped."` Grade from capped overall (≤55 → F).
- `ImageAnalysis.vue` error path emits `{ width: 0, height: 0, overallStatus: null, loadFailed: true }`.
- Probe in `analyze.get.ts`: only absolute http(s) `meta.og.image`; failure of the probe itself (network/timeout) → `reachable: undefined` (no penalty); HTTP ≥ 400 → `reachable: false`; 2xx/3xx → `reachable: true` + contentType.

- [ ] Failing tests first: no-image → grade F + `gated`; image + `reachable:false` → red + F; image + `loadFailed` → yellow, not gated (score ≥ 60 case asserts grade unchanged); image fine → green, `gated: false`; content-type `text/html` → red.
- [ ] Implement shared changes → tests PASS.
- [ ] Implement Vue emit + probe; `pnpm vitest run` stays green.

### Task 7: Parity + smoke + docs

**Files:** Create `tests/integration/cli-parity.test.ts`; Create `scripts/smoke-rate-limit.mjs`; Modify `README.md`, `CHANGELOG.md`; Append addendum to `SECURITY-AUDIT.md`.

- [ ] Parity test: read `packages/cli/test/fixtures/{no-ogimage,broken-ogimage}.html`, run shared `parseMetaTags → generateDiagnostics → computeScore`; assert `no-ogimage` → ogImage red + grade F + gated. If `python3` on PATH: run `packages/cli/metapeek --json` against fixtures (offline mode per CLI README) and assert its ogImage score is 0 for both fixtures (skip-with-log otherwise).
- [ ] Smoke script: `node scripts/smoke-rate-limit.mjs https://deploy-preview-x--site.netlify.app [--spa]` — bursts `/api/analyze?url=https://example.com` (default-tier limits + 2 attempts), exits 0 on first 429-with-Retry-After, exits 1 if none.
- [ ] README: tier table, 429/503 + Retry-After docs, CDN-cache note, remove "10/min" claims (lines ~60, 139, 508, 349, 698 area), document `SUPABASE_URL`/`SUPABASE_SECRET_KEY` env vars + dormant `METAPEEK_API_KEY` bypass. SECURITY-AUDIT: dated addendum — RT-10 realized (edge config was never enforced on Nitro routes), resolved by app-level enforcement. CHANGELOG: 0.15.0 entry.

### Task 8: Full verification

- [ ] `pnpm vitest run` all green; `pnpm typecheck` clean; `pnpm lint` clean.
- [ ] `pnpm dev` (or `netlify dev`) manual pass: 6 rapid default-tier `/api/analyze` curls locally → 429 from in-memory fallback (no env) and from Supabase (with `.env`).
- [ ] Report evidence; commits only on user request.

## Self-review

Spec coverage: tiers/global/bypass (T2–T4), storage+RPC (T1), fetch-spa (T5), image gate/probe/parity (T6–T7), smoke+docs (T7), fail-open (T2/T4). Types consistent: `checkRateLimit` verdict `{allowed, violatedKey, retryAfter, source}` used by middleware + fetch-spa; `ImageAnalysisResult` extensions consumed by diagnostics + Vue + probe. No placeholders remain.
