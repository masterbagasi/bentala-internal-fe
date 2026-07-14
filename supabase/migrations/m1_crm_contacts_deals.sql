-- ============================================================
-- M1 — CRM master-data: contacts + deals (Supabase-native)
-- One-way flow: Contact -> Deal -> Project(existing) -> Invoice(existing)
-- Enums -> text + CHECK. People identified by email (owner_email).
-- Projects table is NOT rebuilt; only linked via new columns.
-- ============================================================

-- ---------- CONTACTS (single master data) ----------
create table if not exists public.contacts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  type         text not null check (type in ('INDIVIDU','PERUSAHAAN')),
  company_name text,
  category     text not null default 'LEAD' check (category in ('LEAD','CLIENT','VENDOR','PARTNER')),
  job_title    text,
  email        text not null default '',
  phone        text not null default '',
  instagram    text,
  source       text not null default 'LAINNYA'
                 check (source in ('INSTAGRAM','WHATSAPP','WEBSITE','REFERRAL','EVENT','ADS','MARKETPLACE','LAINNYA')),
  owner_email  text,
  address      text,
  tags         text[] not null default '{}',
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- A PERUSAHAAN must carry a company name.
  constraint contacts_company_required
    check (type <> 'PERUSAHAAN' or coalesce(btrim(company_name), '') <> '')
);
create index if not exists idx_contacts_category on public.contacts(category);
create index if not exists idx_contacts_owner    on public.contacts(owner_email);

-- ---------- DEALS ----------
create table if not exists public.deals (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  contact_id         uuid not null references public.contacts(id) on delete restrict,
  services           text[] not null default '{}',
  value              numeric(14,2) not null default 0,
  stage              text not null default 'LEAD'
                       check (stage in ('LEAD','QUALIFIED','PROPOSAL','NEGOSIASI','MENANG','KALAH')),
  expected_close_date date,
  owner_email        text,
  source             text,
  description        text,
  lost_reason        text check (lost_reason in ('HARGA','TIMING','KOMPETITOR','NO_RESPONSE','LAINNYA')),
  lost_notes         text,
  -- Back-links to what a WON deal produced (set by the auto-create trigger).
  project_id         uuid references public.projects(id) on delete set null,
  socmed_slug        text references public.socmed_projects(slug) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_deals_contact on public.deals(contact_id);
create index if not exists idx_deals_stage   on public.deals(stage);
create index if not exists idx_deals_project on public.deals(project_id);

-- ---------- Link EXISTING projects into the new flow (no rebuild) ----------
alter table public.projects add column if not exists deal_id    uuid references public.deals(id)    on delete set null;
alter table public.projects add column if not exists contact_id uuid references public.contacts(id) on delete set null;
create index if not exists idx_projects_deal    on public.projects(deal_id);
create index if not exists idx_projects_contact on public.projects(contact_id);

-- ---------- updated_at (reuse existing helper) ----------
drop trigger if exists contacts_updated_at on public.contacts;
create trigger contacts_updated_at before update on public.contacts for each row execute function update_updated_at();
drop trigger if exists deals_updated_at on public.deals;
create trigger deals_updated_at before update on public.deals for each row execute function update_updated_at();

-- ---------- RLS (match existing "authenticated full access") ----------
alter table public.contacts enable row level security;
alter table public.deals    enable row level security;
drop policy if exists contacts_all on public.contacts;
create policy contacts_all on public.contacts for all using (true) with check (true);
drop policy if exists deals_all on public.deals;
create policy deals_all on public.deals for all using (true) with check (true);

-- ---------- realtime ----------
alter publication supabase_realtime add table public.contacts;
alter publication supabase_realtime add table public.deals;

-- ---------- Auto-create on WON: CRM project + socmed brand ----------
-- Retire the old clients-based trigger (the CRM now lives on deals).
drop trigger  if exists trg_socmed_project_on_won on public.clients;
drop function if exists public.create_socmed_project_on_won();

create or replace function public.create_from_deal_won()
returns trigger language plpgsql security definer as $function$
declare
  v_contact public.contacts%rowtype;
  v_pname text;
  v_base  text;
  v_slug  text;
  v_i     int := 1;
  v_sort  int;
  v_pid   uuid;
begin
  if NEW.stage = 'MENANG' and OLD.stage is distinct from 'MENANG' and NEW.project_id is null then
    select * into v_contact from public.contacts where id = NEW.contact_id;
    v_pname := coalesce(nullif(btrim(NEW.name), ''), nullif(btrim(v_contact.name), ''), 'Project');

    -- 1) CRM project (existing projects table; keep its existing columns).
    insert into public.projects (name, client, contact_id, deal_id, type, status, progress, team, description)
    values (v_pname, coalesce(v_contact.company_name, v_contact.name, ''), NEW.contact_id, NEW.id,
            'smm', 'active', 0, '{}'::text[], coalesce(NEW.description, ''))
    returning id into v_pid;

    -- 2) Socmed brand (unique slug) + auto-grant to smm.all managers.
    v_base := regexp_replace(lower(btrim(v_pname)), '[^a-z0-9]+', '-', 'g');
    v_base := regexp_replace(v_base, '(^-+|-+$)', '', 'g');
    if v_base = '' then v_base := 'project'; end if;
    v_base := left(v_base, 40);
    v_slug := v_base;
    while exists (select 1 from public.socmed_projects where slug = v_slug) loop
      v_i := v_i + 1; v_slug := v_base || '-' || v_i;
    end loop;
    select coalesce(max(sort_order), 0) + 1 into v_sort from public.socmed_projects;
    insert into public.socmed_projects (slug, name, sort_order, active) values (v_slug, v_pname, v_sort, true);
    update public.menu_access
      set sections = (select array(select distinct e from unnest(
            sections || array['smm.'||v_slug||'.social','smm.'||v_slug||'.projects','smm.'||v_slug||'.chat']) as e)),
          updated_at = now()
      where 'smm.all' = any(sections);

    -- 3) Back-link the deal to what it produced.
    NEW.project_id  := v_pid;
    NEW.socmed_slug := v_slug;
  end if;
  return NEW;
end
$function$;

drop trigger if exists trg_create_from_deal_won on public.deals;
create trigger trg_create_from_deal_won
before update on public.deals
for each row execute function public.create_from_deal_won();

-- ---------- SEED (a few linked rows; kept in early stages so setup
--            does NOT auto-create brands — test the WON flow manually) ----------
insert into public.contacts (name, type, company_name, category, job_title, email, phone, instagram, source, address, tags, notes)
values
  ('Andi Wijaya',   'INDIVIDU',   null,               'LEAD',   'Owner',            'andi@example.com',   '081200000001', '@andiw',   'INSTAGRAM', 'Jakarta',  '{"prioritas"}',       'Tertarik paket konten bulanan.'),
  ('PT Maju Jaya',  'PERUSAHAAN', 'PT Maju Jaya',     'CLIENT', 'Marketing Manager','mkt@majujaya.co.id', '081200000002', null,       'REFERRAL',  'Bandung',  '{"korporat"}',        'Referral dari klien lama.'),
  ('Sinta Dewi',    'INDIVIDU',   null,               'LEAD',   'Founder',          'sinta@example.com',  '081200000003', '@sintad',  'WEBSITE',   'Surabaya', '{}',                  'Isi form di website.')
on conflict do nothing;

insert into public.deals (name, contact_id, services, value, stage, expected_close_date, source, description)
select 'Konten Bulanan — Andi',   id, array['Social Media Management'],            3500000,  'QUALIFIED', current_date + 14, 'INSTAGRAM', 'Paket 12 konten/bulan.'    from public.contacts where email='andi@example.com'
union all
select 'Rebranding — Maju Jaya',  id, array['Branding','Social Media Management'], 25000000, 'PROPOSAL',  current_date + 30, 'REFERRAL',  'Rebrand + kelola socmed.'  from public.contacts where email='mkt@majujaya.co.id'
union all
select 'Web + Konten — Sinta',    id, array['Website','Content Production'],       12000000, 'LEAD',      current_date + 21, 'WEBSITE',   'Landing page + konten.'    from public.contacts where email='sinta@example.com'
on conflict do nothing;
