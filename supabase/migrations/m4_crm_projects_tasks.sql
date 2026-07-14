-- ============================================================
-- M4 — CRM Projects + Tasks (NEW module; existing `projects` menu untouched)
-- Deal(MENANG) now auto-creates a crm_projects row (+ socmed brand), not a
-- row in the legacy `projects` table.
-- ============================================================

create table if not exists public.crm_projects (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  contact_id     uuid references public.contacts(id) on delete set null,
  deal_id        uuid references public.deals(id)    on delete set null,
  services       text[] not null default '{}',
  contract_value numeric(14,2) not null default 0,
  start_date     date,
  deadline       date,
  manager_email  text,
  member_emails  text[] not null default '{}',
  scope          text not null default '',
  status         text not null default 'BELUM_MULAI'
                   check (status in ('BELUM_MULAI','BERJALAN','REVIEW','SELESAI','ON_HOLD','BATAL')),
  socmed_slug    text references public.socmed_projects(slug) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_crm_projects_contact on public.crm_projects(contact_id);
create index if not exists idx_crm_projects_deal    on public.crm_projects(deal_id);
create index if not exists idx_crm_projects_status  on public.crm_projects(status);

create table if not exists public.crm_tasks (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.crm_projects(id) on delete cascade,
  name           text not null,
  assignee_email text,
  due_date       date,
  status         text not null default 'TODO' check (status in ('TODO','IN_PROGRESS','DONE')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_crm_tasks_project on public.crm_tasks(project_id);

-- Deal back-link to its CRM project.
alter table public.deals add column if not exists crm_project_id uuid references public.crm_projects(id) on delete set null;

drop trigger if exists crm_projects_updated_at on public.crm_projects;
create trigger crm_projects_updated_at before update on public.crm_projects for each row execute function update_updated_at();
drop trigger if exists crm_tasks_updated_at on public.crm_tasks;
create trigger crm_tasks_updated_at before update on public.crm_tasks for each row execute function update_updated_at();

alter table public.crm_projects enable row level security;
alter table public.crm_tasks    enable row level security;
drop policy if exists crm_projects_all on public.crm_projects;
create policy crm_projects_all on public.crm_projects for all using (true) with check (true);
drop policy if exists crm_tasks_all on public.crm_tasks;
create policy crm_tasks_all on public.crm_tasks for all using (true) with check (true);

do $$ begin
  begin alter publication supabase_realtime add table public.crm_projects; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.crm_tasks;    exception when duplicate_object then null; end;
end $$;

-- Deal(MENANG) → crm_projects + socmed brand (grant). Legacy `projects` no longer touched.
create or replace function public.create_from_deal_won()
returns trigger language plpgsql security definer as $function$
declare
  v_contact public.contacts%rowtype;
  v_pname text; v_base text; v_slug text; v_i int := 1; v_sort int; v_pid uuid;
begin
  if NEW.stage = 'MENANG' and OLD.stage is distinct from 'MENANG' and NEW.crm_project_id is null then
    select * into v_contact from public.contacts where id = NEW.contact_id;
    v_pname := coalesce(nullif(btrim(NEW.name), ''), nullif(btrim(v_contact.name), ''), 'Project');

    insert into public.crm_projects (name, contact_id, deal_id, services, contract_value, scope, status)
    values (v_pname, NEW.contact_id, NEW.id, NEW.services, NEW.value, coalesce(NEW.description, ''), 'BELUM_MULAI')
    returning id into v_pid;

    -- Socmed brand + grant (unchanged behaviour).
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

    update public.crm_projects set socmed_slug = v_slug where id = v_pid;
    NEW.crm_project_id := v_pid;
  end if;
  return NEW;
end
$function$;
