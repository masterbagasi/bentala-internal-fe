-- ============================================================
-- BENTALA STUDIO WEBSITE — Content Schema
-- Tables for managing public website content (bentala-studio).
-- Run this in the SAME Supabase project as the internal system.
-- ============================================================

create extension if not exists "uuid-ossp";

-- Hero (singleton — only one active row at a time)
create table if not exists bsi_hero (
  id uuid primary key default uuid_generate_v4(),
  headline text not null,
  subtitle text not null,
  cta_text text not null default 'Start Collaboration',
  cta_url text not null,
  video_urls text[] not null default '{}',
  poster_url text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Portfolio
create table if not exists bsi_portfolio (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  category text not null check (category in ('video','photo','design','intl')),
  tag text not null,
  media_url text not null,
  media_type text not null default 'image' check (media_type in ('image','video')),
  thumbnail_url text,
  aspect_ratio text not null default '16:9',
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Collaborations (brand partner logos)
create table if not exists bsi_collaborations (
  id uuid primary key default uuid_generate_v4(),
  brand_name text not null,
  logo_svg text not null,
  tint_color text not null default '#00d4ff',
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Services
create table if not exists bsi_services (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Social links
create table if not exists bsi_social_links (
  id uuid primary key default uuid_generate_v4(),
  platform text not null check (platform in ('ig','tiktok','whatsapp')),
  handle text not null,
  url text not null,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

-- About (singleton)
create table if not exists bsi_about (
  id uuid primary key default uuid_generate_v4(),
  story_title text not null,
  story_body text not null,
  story_cta_url text not null,
  vision_text text not null,
  mission_text text not null,
  edge_text text not null,
  stats jsonb not null default '[]',
  "values" jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- Team
create table if not exists bsi_team (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  title text not null,
  role_description text not null default '',
  initials text not null,
  avatar_color text not null default '#1757c2',
  tags text[] not null default '{}',
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- News feed (BPI Instagram & TikTok mirror)
create table if not exists bsi_news_feed (
  id uuid primary key default uuid_generate_v4(),
  account text not null check (account in ('bpi_ig','bpi_tt')),
  media_url text not null,
  media_type text not null default 'image' check (media_type in ('image','video')),
  thumbnail_url text,
  caption text not null default '',
  permalink text not null,
  like_count int not null default 0,
  comments_count int not null default 0,
  posted_at timestamptz not null default now(),
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- SEO metadata per page
create table if not exists bsi_seo (
  id uuid primary key default uuid_generate_v4(),
  page text not null unique,
  meta_title text not null,
  meta_description text not null,
  og_image_url text,
  updated_at timestamptz not null default now()
);

-- Leads (form submissions from public site)
create table if not exists bsi_leads (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  brand_name text not null,
  contact_type text not null check (contact_type in ('whatsapp','email')),
  contact_value text not null,
  project_type text not null,
  notes text default '',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  user_agent text,
  submitted_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new','contacted','qualified','closed','spam')),
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_bsi_portfolio_published on bsi_portfolio (is_published, sort_order);
create index if not exists idx_bsi_portfolio_category on bsi_portfolio (category) where is_published = true;
create index if not exists idx_bsi_collabs_published on bsi_collaborations (is_published, sort_order);
create index if not exists idx_bsi_news_account on bsi_news_feed (account, is_published, sort_order);
create index if not exists idx_bsi_seo_page on bsi_seo (page);
create index if not exists idx_bsi_leads_status on bsi_leads (status, submitted_at desc);

-- Row Level Security: lock all tables to authenticated users only.
-- The public website uses the anon key for read-only access via specific policies.
alter table bsi_hero enable row level security;
alter table bsi_portfolio enable row level security;
alter table bsi_collaborations enable row level security;
alter table bsi_services enable row level security;
alter table bsi_social_links enable row level security;
alter table bsi_about enable row level security;
alter table bsi_team enable row level security;
alter table bsi_news_feed enable row level security;
alter table bsi_seo enable row level security;
alter table bsi_leads enable row level security;

-- Public (anon) read access — only published rows
create policy bsi_hero_anon_read on bsi_hero for select using (is_active = true);
create policy bsi_portfolio_anon_read on bsi_portfolio for select using (is_published = true);
create policy bsi_collabs_anon_read on bsi_collaborations for select using (is_published = true);
create policy bsi_services_anon_read on bsi_services for select using (is_published = true);
create policy bsi_social_anon_read on bsi_social_links for select using (is_published = true);
create policy bsi_about_anon_read on bsi_about for select using (true);
create policy bsi_team_anon_read on bsi_team for select using (is_published = true);
create policy bsi_news_anon_read on bsi_news_feed for select using (is_published = true);
create policy bsi_seo_anon_read on bsi_seo for select using (true);

-- Lead inserts from the public form (anon allowed to insert only)
create policy bsi_leads_anon_insert on bsi_leads for insert with check (true);

-- Authenticated (admin) full access
create policy bsi_hero_admin_all on bsi_hero for all using (auth.role() = 'authenticated');
create policy bsi_portfolio_admin_all on bsi_portfolio for all using (auth.role() = 'authenticated');
create policy bsi_collabs_admin_all on bsi_collaborations for all using (auth.role() = 'authenticated');
create policy bsi_services_admin_all on bsi_services for all using (auth.role() = 'authenticated');
create policy bsi_social_admin_all on bsi_social_links for all using (auth.role() = 'authenticated');
create policy bsi_about_admin_all on bsi_about for all using (auth.role() = 'authenticated');
create policy bsi_team_admin_all on bsi_team for all using (auth.role() = 'authenticated');
create policy bsi_news_admin_all on bsi_news_feed for all using (auth.role() = 'authenticated');
create policy bsi_seo_admin_all on bsi_seo for all using (auth.role() = 'authenticated');
create policy bsi_leads_admin_all on bsi_leads for all using (auth.role() = 'authenticated');
