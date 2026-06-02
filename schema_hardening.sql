-- ============================================================
-- HARDENING — Tighten RLS & lock down anon write access.
-- Run this AFTER schema_website.sql and schema_analytics.sql.
-- ============================================================

-- 1) Drop overly permissive direct INSERT/UPDATE policies on tracking tables.
--    The RPC functions (bsi_track_visitor, bsi_track_pageview, bsi_track_event)
--    are SECURITY DEFINER, so they don't need direct table access for anon.
--    Without these policies, attackers can't bypass our RPC validation.

drop policy if exists bsi_visitors_anon_insert on bsi_visitors;
drop policy if exists bsi_visitors_anon_update on bsi_visitors;
drop policy if exists bsi_sessions_anon_insert on bsi_sessions;
drop policy if exists bsi_sessions_anon_update on bsi_sessions;
drop policy if exists bsi_pageviews_anon_insert on bsi_pageviews;
drop policy if exists bsi_pageviews_anon_update on bsi_pageviews;
drop policy if exists bsi_events_anon_insert on bsi_events;

-- 2) Drop the public anon-insert policy on bsi_leads — we'll only accept
--    leads through the server-side /api/leads/submit endpoint, which
--    uses the service role key and validates rate-limit + honeypot.

drop policy if exists bsi_leads_anon_insert on bsi_leads;

-- 3) Rate limit table — used by /api/leads/submit and /api/track to throttle by IP.
--    We use a simple counter-per-window approach.

create table if not exists bsi_rate_limits (
  id uuid primary key default uuid_generate_v4(),
  bucket text not null,                  -- 'leads' | 'track' | 'event'
  identifier text not null,              -- typically a hashed IP
  window_start timestamptz not null,
  count int not null default 1,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_rate_limits_bucket_id_window
  on bsi_rate_limits (bucket, identifier, window_start);
create index if not exists idx_rate_limits_cleanup
  on bsi_rate_limits (window_start);

alter table bsi_rate_limits enable row level security;
-- Only service role accesses this table; no anon policy → fully blocked for anon.
create policy bsi_rate_limits_admin_all on bsi_rate_limits
  for all using (auth.role() = 'authenticated');

-- 4) RPC: atomically check + bump rate limit counter.
--    Returns true if request allowed, false if over limit.

create or replace function bsi_rate_limit_check(
  p_bucket text,
  p_identifier text,
  p_window_seconds int,
  p_max_count int
) returns boolean
language plpgsql
security definer
as $$
declare
  v_window_start timestamptz;
  v_current_count int;
begin
  v_window_start := date_trunc('second', now()) - (extract(epoch from now())::int % p_window_seconds) * interval '1 second';

  insert into bsi_rate_limits (bucket, identifier, window_start, count)
  values (p_bucket, p_identifier, v_window_start, 1)
  on conflict (bucket, identifier, window_start) do update
    set count = bsi_rate_limits.count + 1
  returning count into v_current_count;

  -- Cleanup old windows (older than 1 hour) opportunistically
  delete from bsi_rate_limits where window_start < now() - interval '1 hour';

  return v_current_count <= p_max_count;
end $$;

-- Service role calls this from API routes; anon should NOT call directly
grant execute on function bsi_rate_limit_check(text, text, int, int) to authenticated;
revoke execute on function bsi_rate_limit_check(text, text, int, int) from anon;

-- 5) Lock down tracking RPCs — revoke from anon, the tracker now uses
--    server-side /api/track endpoint instead.

revoke execute on function bsi_track_visitor(text, text, text, text, text) from anon;
revoke execute on function bsi_track_pageview(text, text, text, text, text, text, text, text, text) from anon;
revoke execute on function bsi_track_event(text, text, text, text, text, jsonb) from anon;
