-- Rich contact intake form fields on bsi_leads (additive).
alter table public.bsi_leads add column if not exists jabatan        text;
alter table public.bsi_leads add column if not exists tier_klien     text;
alter table public.bsi_leads add column if not exists industri       text;
alter table public.bsi_leads add column if not exists kontak_alt     text;
alter table public.bsi_leads add column if not exists detail_sumber  text;
alter table public.bsi_leads add column if not exists jenis_project  text[] default '{}';
alter table public.bsi_leads add column if not exists objektif       text;
alter table public.bsi_leads add column if not exists budget_range   text;
alter table public.bsi_leads add column if not exists timeline       text;
alter table public.bsi_leads add column if not exists brief_awal     text;
alter table public.bsi_leads add column if not exists prioritas      text;
alter table public.bsi_leads add column if not exists pic            text;
alter table public.bsi_leads add column if not exists next_action    text;
alter table public.bsi_leads add column if not exists follow_up_date date;
alter table public.bsi_leads add column if not exists tags           text[] default '{}';
alter table public.bsi_leads add column if not exists lampiran       text[] default '{}';
