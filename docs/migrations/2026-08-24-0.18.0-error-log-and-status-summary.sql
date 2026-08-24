-- ═══════════════════════════════════════════════════════════════════
-- 0.18.0 — durable error logging + /api/status (applied 2026-08-24)
--
-- The record of what was applied to the Supabase `metapeek` project
-- (ref yncuzxstzcnfhmfciwqz) as migrations `error_log_v1` and
-- `status_summary_v1`. A fresh or staging project with valid credentials
-- but without these objects behaves like this: every persistError()
-- resolves false (failures stop persisting, silently by design) and
-- /api/status reports checks.supabase.ok=false. Run this file to bring
-- such a project up to the contract server/api/status.get.ts and
-- shared/error-log-core.mjs depend on — including the camelCase
-- `windowStartedAt` / `lastAt` keys in status_summary()'s jsonb.
--
-- Prior schema (rate_limits, check_rate_limits, request_log, purge crons)
-- is documented in docs/plans/2026-07-17-rate-limiting-and-fixes-design.md.
-- ═══════════════════════════════════════════════════════════════════

-- ── Migration: error_log_v1 ─────────────────────────────────────────
-- Durable error/security events from the MetaPeek API and the fetch-spa
-- function. Written by shared/error-log-core.mjs over PostgREST (service
-- role only); read by ./logs.sh errors. Companion to request_log: request_log
-- records that a request arrived and its allow/deny verdict, error_log records
-- why an allowed request could not complete.
create table public.error_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  level text not null check (level in ('error', 'security')),
  event text not null,
  scope text,
  path text,
  target_host text,
  target_url text,
  status_code int,
  error text,
  stack text,
  timing_ms int,
  ip_hash text not null default 'anon',
  user_agent text,
  request_id text
);

comment on table public.error_log is
  'MetaPeek durable error log — level error = an allowed analysis failed, level security = a request was blocked (SSRF etc.). Raw IPs are never stored (ip_hash = truncated SHA-256). 90-day retention via pg_cron purge_error_log.';

-- Service-role only, same as request_log: RLS on, no policies, no grants.
alter table public.error_log enable row level security;
revoke all on public.error_log from anon, authenticated;

-- logs.sh queries are always time-bounded, newest first.
create index error_log_at_idx on public.error_log using btree (at);

-- 90-day retention, staggered after purge_rate_limits (4:10) and
-- purge_request_log (4:20).
select cron.schedule(
  'purge_error_log',
  '30 4 * * *',
  $$delete from public.error_log where at < now() - interval '90 days'$$
);

-- ── Migration: status_summary_v1 ────────────────────────────────────
-- One round-trip for everything /api/status needs: request totals over 24h
-- and 30d, the live global budget counters, and error_log counts. Called by
-- server/api/status.get.ts over PostgREST with the service-role key; the
-- result is aggregates only — no hosts, no URLs, no hashes.
--
-- Budget: mirrors check_rate_limits' reset-in-place window rule — a g:d /
-- sg:d counter is current only while window_start > now() - 86400s;
-- otherwise the next request would reset it, so it reports as 0.
create or replace function public.status_summary()
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'usage', jsonb_build_object(
      'last24h', (
        select jsonb_build_object(
          'total',   count(*),
          'allowed', count(*) filter (where allowed),
          'denied',  count(*) filter (where not allowed),
          'api',     count(*) filter (where scope = 'api'),
          'spa',     count(*) filter (where scope = 'spa')
        )
        from request_log where at > now() - interval '24 hours'
      ),
      'last30d', (
        select jsonb_build_object(
          'total',   count(*),
          'allowed', count(*) filter (where allowed),
          'denied',  count(*) filter (where not allowed),
          'api',     count(*) filter (where scope = 'api'),
          'spa',     count(*) filter (where scope = 'spa')
        )
        from request_log where at > now() - interval '30 days'
      )
    ),
    'budget', jsonb_build_object(
      'api', coalesce(
        (select jsonb_build_object('used', count, 'windowStartedAt', window_start)
         from rate_limits
         where key = 'g:d' and window_start > now() - make_interval(secs => 86400)),
        jsonb_build_object('used', 0)
      ),
      'spa', coalesce(
        (select jsonb_build_object('used', count, 'windowStartedAt', window_start)
         from rate_limits
         where key = 'sg:d' and window_start > now() - make_interval(secs => 86400)),
        jsonb_build_object('used', 0)
      )
    ),
    'errors', jsonb_build_object(
      'last24h', (select count(*) from error_log where at > now() - interval '24 hours'),
      'last30d', (select count(*) from error_log where at > now() - interval '30 days'),
      'lastAt',  (select max(at) from error_log)
    )
  )
$$;

-- Service-role only, like everything else here. New functions grant EXECUTE
-- to PUBLIC by default — take it away before anon inherits it.
revoke execute on function public.status_summary() from public, anon, authenticated;
grant execute on function public.status_summary() to service_role;
