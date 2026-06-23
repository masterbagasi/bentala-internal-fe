-- CRM Lead -> Client conversion: client origin tracking + lead back-link.
alter table public.clients   add column if not exists source text not null default 'manual';
alter table public.clients   add column if not exists lead_id uuid;
alter table public.bsi_leads add column if not exists converted_client_id uuid;
