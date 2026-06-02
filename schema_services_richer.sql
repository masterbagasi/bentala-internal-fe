-- ============================================================
-- Services Section — Richer per-service fields for the homepage
-- "Services" tab. Adds description / CTA / learn-more / media so
-- each service row in the public site can render full copy + an
-- accompanying image or video instead of just a name.
-- Run AFTER schema_website.sql.
-- ============================================================

alter table bsi_services
  add column if not exists description text,
  add column if not exists cta_text text,
  add column if not exists cta_url text,
  add column if not exists learn_more_text text,
  add column if not exists learn_more_url text,
  add column if not exists media_url text,
  add column if not exists media_type text default 'image'
    check (media_type in ('image', 'video'));
