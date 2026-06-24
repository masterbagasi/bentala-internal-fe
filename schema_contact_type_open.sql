-- Manually-added CRM contacts can use any contact channel as their primary
-- "Tipe kontak" (Instagram, TikTok, LinkedIn, ...), not just whatsapp/email.
-- Drop the legacy contact_type check; values still come from a controlled
-- dropdown in the app. (User-authorized, applied to project gbmqudkkuzpqykmyrkqc.)
alter table public.bsi_leads drop constraint if exists bsi_leads_contact_type_check;
