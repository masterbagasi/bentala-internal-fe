-- Additional contact channels (Instagram, Facebook, X, TikTok, ...) per contact.
alter table public.bsi_leads add column if not exists kontak_lainnya jsonb default '[]'::jsonb;
