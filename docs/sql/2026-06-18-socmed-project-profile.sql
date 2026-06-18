-- Profile fields for socmed projects, edited in Settings → Project Socmed.
-- All optional (default '') so existing projects are unaffected.
alter table public.socmed_projects
  add column if not exists address     text not null default '',
  add column if not exists phone       text not null default '',
  add column if not exists email       text not null default '',
  add column if not exists pic         text not null default '',
  add column if not exists description text not null default '',
  add column if not exists instagram   text not null default '',
  add column if not exists tiktok      text not null default '',
  add column if not exists website     text not null default '';
