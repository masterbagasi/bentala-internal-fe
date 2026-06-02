-- ============================================================
-- BENTALA STUDIO WEBSITE — Analytics Schema
-- Visitor tracking, sessions, pageviews, events.
-- Run this in the SAME Supabase project as schema_website.sql.
-- ============================================================

create extension if not exists "uuid-ossp";

-- A unique visitor (one row per device/browser, identified by cookie)
create table if not exists bsi_visitors (
  id uuid primary key default uuid_generate_v4(),
  visitor_id text not null unique,        -- random UUID from client cookie
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  user_agent text,
  device_type text,                        -- 'mobile' | 'tablet' | 'desktop'
  os text,
  browser text,
  country text,
  city text,
  total_sessions int not null default 0,
  total_pageviews int not null default 0,
  total_events int not null default 0,
  is_lead boolean not null default false,  -- true once they submit a form
  lead_id uuid references bsi_leads(id) on delete set null,
  created_at timestamptz not null default now()
);

-- A session = one continuous browsing visit (resets after 30min idle)
create table if not exists bsi_sessions (
  id uuid primary key default uuid_generate_v4(),
  session_id text not null unique,         -- random UUID per session
  visitor_id text not null references bsi_visitors(visitor_id) on delete cascade,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at timestamptz,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  landing_path text not null,
  exit_path text,
  pageview_count int not null default 0,
  event_count int not null default 0,
  duration_seconds int,
  created_at timestamptz not null default now()
);

-- Each page view
create table if not exists bsi_pageviews (
  id uuid primary key default uuid_generate_v4(),
  visitor_id text not null,
  session_id text not null,
  path text not null,
  title text,
  referrer text,
  viewed_at timestamptz not null default now(),
  time_on_page_seconds int,                -- updated when user navigates away
  created_at timestamptz not null default now()
);

-- Activity events (click, scroll, form_open, form_submit, etc)
create table if not exists bsi_events (
  id uuid primary key default uuid_generate_v4(),
  visitor_id text not null,
  session_id text not null,
  event_type text not null,                -- 'cta_click' | 'form_open' | 'form_submit' | 'scroll' | 'video_play' | 'external_click' | 'custom'
  target text,                              -- e.g. button label, element id
  path text,                                -- path where event occurred
  metadata jsonb default '{}',              -- arbitrary extra data
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Indexes for dashboard queries
create index if not exists idx_visitors_last_seen on bsi_visitors (last_seen_at desc);
create index if not exists idx_visitors_is_lead on bsi_visitors (is_lead) where is_lead = true;
create index if not exists idx_sessions_visitor on bsi_sessions (visitor_id, started_at desc);
create index if not exists idx_sessions_started on bsi_sessions (started_at desc);
create index if not exists idx_pageviews_session on bsi_pageviews (session_id, viewed_at);
create index if not exists idx_pageviews_visitor on bsi_pageviews (visitor_id, viewed_at desc);
create index if not exists idx_pageviews_viewed on bsi_pageviews (viewed_at desc);
create index if not exists idx_events_session on bsi_events (session_id, occurred_at);
create index if not exists idx_events_visitor on bsi_events (visitor_id, occurred_at desc);
create index if not exists idx_events_type on bsi_events (event_type, occurred_at desc);

-- Row Level Security: anon can INSERT (tracking), authenticated can read + manage
alter table bsi_visitors enable row level security;
alter table bsi_sessions enable row level security;
alter table bsi_pageviews enable row level security;
alter table bsi_events enable row level security;

-- Anon: allow upserts/inserts only (no read, no update of arbitrary rows beyond their own visitor_id chain)
-- Visitors: anon needs INSERT (new visitor) and UPDATE (last_seen, counts) by visitor_id
create policy bsi_visitors_anon_insert on bsi_visitors for insert with check (true);
create policy bsi_visitors_anon_update on bsi_visitors for update using (true) with check (true);
create policy bsi_sessions_anon_insert on bsi_sessions for insert with check (true);
create policy bsi_sessions_anon_update on bsi_sessions for update using (true) with check (true);
create policy bsi_pageviews_anon_insert on bsi_pageviews for insert with check (true);
create policy bsi_pageviews_anon_update on bsi_pageviews for update using (true) with check (true);
create policy bsi_events_anon_insert on bsi_events for insert with check (true);

-- Authenticated (admin) full read + update + delete
create policy bsi_visitors_admin_all on bsi_visitors for all using (auth.role() = 'authenticated');
create policy bsi_sessions_admin_all on bsi_sessions for all using (auth.role() = 'authenticated');
create policy bsi_pageviews_admin_all on bsi_pageviews for all using (auth.role() = 'authenticated');
create policy bsi_events_admin_all on bsi_events for all using (auth.role() = 'authenticated');

-- RPC: upsert visitor (atomic increment of counters)
create or replace function bsi_track_visitor(
  p_visitor_id text,
  p_user_agent text,
  p_device_type text,
  p_os text,
  p_browser text
) returns void
language plpgsql
security definer
as $$
begin
  insert into bsi_visitors (visitor_id, user_agent, device_type, os, browser)
  values (p_visitor_id, p_user_agent, p_device_type, p_os, p_browser)
  on conflict (visitor_id) do update
    set last_seen_at = now(),
        user_agent = coalesce(bsi_visitors.user_agent, excluded.user_agent),
        device_type = coalesce(bsi_visitors.device_type, excluded.device_type),
        os = coalesce(bsi_visitors.os, excluded.os),
        browser = coalesce(bsi_visitors.browser, excluded.browser);
end $$;

grant execute on function bsi_track_visitor(text, text, text, text, text) to anon, authenticated;

-- RPC: log a pageview (also bumps session + visitor counters)
create or replace function bsi_track_pageview(
  p_visitor_id text,
  p_session_id text,
  p_path text,
  p_title text,
  p_referrer text,
  p_landing_path text,
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text
) returns void
language plpgsql
security definer
as $$
begin
  -- ensure session exists
  insert into bsi_sessions (session_id, visitor_id, landing_path, referrer, utm_source, utm_medium, utm_campaign)
  values (p_session_id, p_visitor_id, p_landing_path, p_referrer, p_utm_source, p_utm_medium, p_utm_campaign)
  on conflict (session_id) do update
    set last_activity_at = now(),
        pageview_count = bsi_sessions.pageview_count + 1,
        exit_path = p_path;

  -- log pageview
  insert into bsi_pageviews (visitor_id, session_id, path, title, referrer)
  values (p_visitor_id, p_session_id, p_path, p_title, p_referrer);

  -- bump visitor counters
  update bsi_visitors
  set last_seen_at = now(),
      total_pageviews = total_pageviews + 1
  where visitor_id = p_visitor_id;
end $$;

grant execute on function bsi_track_pageview(text, text, text, text, text, text, text, text, text) to anon, authenticated;

-- RPC: log an event
create or replace function bsi_track_event(
  p_visitor_id text,
  p_session_id text,
  p_event_type text,
  p_target text,
  p_path text,
  p_metadata jsonb
) returns void
language plpgsql
security definer
as $$
begin
  insert into bsi_events (visitor_id, session_id, event_type, target, path, metadata)
  values (p_visitor_id, p_session_id, p_event_type, p_target, p_path, coalesce(p_metadata, '{}'::jsonb));

  update bsi_sessions
  set event_count = event_count + 1, last_activity_at = now()
  where session_id = p_session_id;

  update bsi_visitors
  set total_events = total_events + 1, last_seen_at = now()
  where visitor_id = p_visitor_id;
end $$;

grant execute on function bsi_track_event(text, text, text, text, text, jsonb) to anon, authenticated;
