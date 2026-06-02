-- ============================================================
-- Hero Section — Lead destination (WhatsApp / Email)
-- Run AFTER schema_hero_styling.sql
-- These are the team contacts shown on the "Start Collaboration"
-- success step and used to build the wa.me link.
-- The form data itself is saved to bsi_leads — these columns
-- only control the on-screen contact buttons.
-- ============================================================

alter table bsi_hero
  add column if not exists lead_whatsapp_number text not null default '+6281284731599',
  add column if not exists lead_email text not null default 'hello@bentalastudio.id';
