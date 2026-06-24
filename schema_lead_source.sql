-- Contact acquisition channel (Instagram / WhatsApp / Facebook / ...).
alter table public.bsi_leads add column if not exists source text;
