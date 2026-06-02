-- ============================================================
-- Hero Section — Mobile-specific background image
-- Run AFTER schema_hero_styling.sql
-- ============================================================
-- Adds an optional mobile-only background image. When set, the
-- public site uses this image at viewport widths below 768px
-- (Tailwind `md` breakpoint) and falls back to the existing
-- video / desktop image at md and above.

alter table bsi_hero
  add column if not exists background_image_url_mobile text;
