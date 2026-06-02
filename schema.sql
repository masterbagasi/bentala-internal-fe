-- ============================================================
-- BENTALA INTERNAL SYSTEM — Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- POSTS (BPI & BSI content posts)
-- ============================================================
create table if not exists posts (
  id          uuid default uuid_generate_v4() primary key,
  entity      text not null check (entity in ('bpi', 'bsi')),
  title       text not null,
  platforms   text[] default '{}',   -- ['ig', 'tiktok']
  date        date,
  status      text default 'todo' check (status in (
    'todo','brief','produksi','revisi','review','ready','published','done'
  )),
  pics        text[] default '{}',   -- ['Faizal', 'Reinaldi']
  caption     text default '',
  hashtags    text default '',
  content_types text[] default '{}', -- ['video','design']
  video_link  text default '',
  design_link text default '',
  video_file_url  text default '',
  design_file_url text default '',
  notes       text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- CLIENTS (CRM Pipeline)
-- ============================================================
create table if not exists clients (
  id          uuid default uuid_generate_v4() primary key,
  name        text not null,
  pic         text default '',
  contact     text default '',
  stage       text default 'lead' check (stage in ('lead','pitch','close','invoice','inactive')),
  value       numeric default 0,
  service     text default 'smm',
  internal    text default '',
  notes       text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- INVOICES
-- ============================================================
create table if not exists invoices (
  id          uuid default uuid_generate_v4() primary key,
  num         text not null unique,
  client      text not null,
  project     text default '',
  value       numeric default 0,
  due         date,
  status      text default 'pending' check (status in ('pending','dp','paid','overdue')),
  notes       text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- PROJECTS
-- ============================================================
create table if not exists projects (
  id          uuid default uuid_generate_v4() primary key,
  name        text not null,
  client      text default '',
  type        text default 'smm' check (type in ('smm','content','ads','kol','internal')),
  deadline    date,
  status      text default 'active' check (status in ('active','hold','done','cancelled')),
  team        text[] default '{}',
  description text default '',
  progress    int default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- TASKS
-- ============================================================
create table if not exists tasks (
  id          uuid default uuid_generate_v4() primary key,
  title       text not null,
  project_id  uuid references projects(id) on delete set null,
  assignee    text default '',
  priority    text default 'medium' check (priority in ('low','medium','high','urgent')),
  status      text default 'todo' check (status in ('todo','progress','review','done')),
  due         date,
  notes       text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- ACTIVITY LOG
-- ============================================================
create table if not exists activity_log (
  id          uuid default uuid_generate_v4() primary key,
  message     text not null,
  user_name   text default '',
  created_at  timestamptz default now()
);

-- ============================================================
-- CONTENTS (BSI – Content Calendar entries)
-- ============================================================
create table if not exists contents (
  id          uuid default uuid_generate_v4() primary key,
  title       text not null,
  entity      text default 'bsi',
  platform    text default 'ig',
  date        date,
  status      text default 'draft',
  notes       text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- FILE ATTACHMENTS (replaces IndexedDB)
-- ============================================================
create table if not exists file_attachments (
  id          uuid default uuid_generate_v4() primary key,
  post_id     uuid references posts(id) on delete cascade,
  category    text not null check (category in ('video','design')),
  file_name   text not null,
  file_size   bigint,
  file_type   text,
  storage_path text not null,
  created_at  timestamptz default now()
);

-- ============================================================
-- TRIGGERS — auto-update updated_at
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger posts_updated_at    before update on posts    for each row execute function update_updated_at();
create trigger clients_updated_at  before update on clients  for each row execute function update_updated_at();
create trigger invoices_updated_at before update on invoices for each row execute function update_updated_at();
create trigger projects_updated_at before update on projects for each row execute function update_updated_at();
create trigger tasks_updated_at    before update on tasks    for each row execute function update_updated_at();
create trigger contents_updated_at before update on contents for each row execute function update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY — enable for all tables
-- ============================================================
alter table posts           enable row level security;
alter table clients         enable row level security;
alter table invoices        enable row level security;
alter table projects        enable row level security;
alter table tasks           enable row level security;
alter table activity_log    enable row level security;
alter table contents        enable row level security;
alter table file_attachments enable row level security;

-- Policy: authenticated users can do everything (internal tool)
create policy "Authenticated full access" on posts
  for all using (auth.role() = 'authenticated');

create policy "Authenticated full access" on clients
  for all using (auth.role() = 'authenticated');

create policy "Authenticated full access" on invoices
  for all using (auth.role() = 'authenticated');

create policy "Authenticated full access" on projects
  for all using (auth.role() = 'authenticated');

create policy "Authenticated full access" on tasks
  for all using (auth.role() = 'authenticated');

create policy "Authenticated full access" on activity_log
  for all using (auth.role() = 'authenticated');

create policy "Authenticated full access" on contents
  for all using (auth.role() = 'authenticated');

create policy "Authenticated full access" on file_attachments
  for all using (auth.role() = 'authenticated');

-- ============================================================
-- STORAGE BUCKET for file attachments
-- ============================================================
-- Run this separately in Supabase Storage settings:
-- Create bucket named: "bentala-files"
-- Set to private (authenticated access only)

-- ============================================================
-- REALTIME — enable for key tables
-- ============================================================
-- In Supabase Dashboard > Database > Replication
-- Enable realtime for: posts, tasks, clients, activity_log
