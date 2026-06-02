-- ai_settings: per-provider integration config (API keys + per-feature overrides).
-- Run this in Supabase SQL editor (Database → SQL → New query).
--
-- Approach: one row per provider. The Settings UI writes to this table; AI routes
-- read via lib/ai-config.ts (DB first, env fallback). Authenticated dashboard
-- users (RLS) can read/write — internal tool, no public access.

create table if not exists public.ai_settings (
  provider text primary key,
  -- API key (plain text — internal team tool. For prod hardening, encrypt with pgsodium or Vault).
  api_key text,
  -- Optional: model override per provider (e.g., 'claude-opus-4-7', 'gpt-4o').
  model text,
  -- If false, route falls back to env (or returns "not configured").
  enabled boolean not null default true,
  notes text,
  -- Last connection-test result (for UI status badge).
  last_tested_at timestamptz,
  last_test_status text check (last_test_status in ('ok', 'failed', null)),
  last_test_message text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- Auto-update updated_at on every UPDATE.
create or replace function public.ai_settings_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_settings_updated_at on public.ai_settings;
create trigger ai_settings_updated_at
  before update on public.ai_settings
  for each row execute function public.ai_settings_set_updated_at();

-- RLS: any authenticated user (logged in to the dashboard) can read+write.
alter table public.ai_settings enable row level security;

drop policy if exists "ai_settings: authenticated read" on public.ai_settings;
create policy "ai_settings: authenticated read"
  on public.ai_settings for select
  to authenticated using (true);

drop policy if exists "ai_settings: authenticated write" on public.ai_settings;
create policy "ai_settings: authenticated write"
  on public.ai_settings for all
  to authenticated using (true) with check (true);

-- Seed rows for the providers the app currently uses (so the Settings UI lists them
-- even before any key is entered). api_key stays NULL → falls back to env.
insert into public.ai_settings (provider, enabled, notes) values
  ('anthropic',  true,  'Claude API — used for all text generation (BPI content, carousel, brief, ideas, chat, audio script, etc.)'),
  ('openai',     true,  'OpenAI / DALL-E — image generation fallback'),
  ('youtube',    true,  'YouTube Data API — fetch video metadata + transcripts for BPI Intelligence'),
  ('leonardo',   false, 'Leonardo.ai — alternative image generation provider'),
  ('stability',  false, 'Stability AI — alternative image generation provider'),
  ('higgsfield', false, 'Higgsfield AI — cinematic video generation (text-to-video, image-to-video) + Soul image model')
on conflict (provider) do nothing;

-- ─── feature_settings ────────────────────────────────────────────────────────
-- Maps each app feature/menu to a provider choice + optional model override.
-- The Settings → Fitur AI view writes here. Routes call getFeatureConfig()
-- which combines this row with the corresponding ai_settings provider key.

create table if not exists public.feature_settings (
  feature_id text primary key,
  provider text not null,
  model text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

drop trigger if exists feature_settings_updated_at on public.feature_settings;
create trigger feature_settings_updated_at
  before update on public.feature_settings
  for each row execute function public.ai_settings_set_updated_at();

alter table public.feature_settings enable row level security;

drop policy if exists "feature_settings: authenticated read" on public.feature_settings;
create policy "feature_settings: authenticated read"
  on public.feature_settings for select
  to authenticated using (true);

drop policy if exists "feature_settings: authenticated write" on public.feature_settings;
create policy "feature_settings: authenticated write"
  on public.feature_settings for all
  to authenticated using (true) with check (true);
