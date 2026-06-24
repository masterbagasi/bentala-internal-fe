-- Leads = website inbox (screening gate). Database = curated contacts.
-- in_database: a lead promoted into the contact database ("layak").
-- origin: 'website' (form submissions) vs 'manual' (added in the Database).
alter table public.bsi_leads add column if not exists in_database boolean not null default false;
alter table public.bsi_leads add column if not exists origin text not null default 'website';
