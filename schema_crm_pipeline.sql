-- CRM pipeline: expected close date + win/loss reason on the deal (client).
alter table public.clients add column if not exists expected_close date;
alter table public.clients add column if not exists close_reason text;
