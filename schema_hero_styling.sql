-- ============================================================
-- Hero Section — Background type + per-text styling controls
-- Run AFTER schema_website.sql
-- ============================================================

alter table bsi_hero
  add column if not exists background_type text not null default 'video'
    check (background_type in ('image', 'video')),
  add column if not exists background_image_url text,

  -- Headline styling
  add column if not exists headline_color text not null default '#ffffff',
  add column if not exists headline_font_size_px int not null default 96,
  add column if not exists headline_font_weight int not null default 700,
  add column if not exists headline_font_style text not null default 'normal'
    check (headline_font_style in ('normal', 'italic')),
  add column if not exists headline_text_transform text not null default 'uppercase'
    check (headline_text_transform in ('none', 'uppercase', 'lowercase', 'capitalize')),
  add column if not exists headline_letter_spacing_em numeric not null default -0.01,

  -- Subtitle styling
  add column if not exists subtitle_color text not null default '#f0f4ff',
  add column if not exists subtitle_font_size_px int not null default 18,
  add column if not exists subtitle_font_weight int not null default 400,
  add column if not exists subtitle_font_style text not null default 'normal'
    check (subtitle_font_style in ('normal', 'italic')),
  add column if not exists subtitle_text_transform text not null default 'none'
    check (subtitle_text_transform in ('none', 'uppercase', 'lowercase', 'capitalize'));
