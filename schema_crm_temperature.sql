-- CRM deal temperature (lead qualification): cold / warm / hot.
alter table public.clients add column if not exists temperature text;
