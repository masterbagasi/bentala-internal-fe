-- CRM Client 360: interaction timeline + reliable client links.

create table if not exists public.client_interactions (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,
  type           text not null default 'note',
  summary        text not null default '',
  occurred_at    timestamptz not null default now(),
  next_follow_up date,
  follow_up_done boolean not null default false,
  files          text[] not null default '{}',
  author_email   text,
  author_name    text,
  created_at     timestamptz not null default now()
);

create index if not exists client_interactions_client_time_idx
  on public.client_interactions (client_id, occurred_at desc);

create index if not exists client_interactions_open_followup_idx
  on public.client_interactions (next_follow_up)
  where follow_up_done = false and next_follow_up is not null;

alter table public.client_interactions enable row level security;

-- Authenticated users have full access (mirrors the clients table policies).
create policy "client_interactions auth read"   on public.client_interactions for select using (auth.role() = 'authenticated');
create policy "client_interactions auth insert" on public.client_interactions for insert with check (auth.role() = 'authenticated');
create policy "client_interactions auth update" on public.client_interactions for update using (auth.role() = 'authenticated');
create policy "client_interactions auth delete" on public.client_interactions for delete using (auth.role() = 'authenticated');

-- Reliable client link for the 360 joins (text `client` column is kept for back-compat).
alter table public.projects add column if not exists client_id uuid references public.clients(id);
alter table public.invoices add column if not exists client_id uuid references public.clients(id);

-- Backfill from the existing text name (case/space-insensitive). Unmatched rows stay null.
update public.projects p set client_id = c.id
  from public.clients c
  where p.client_id is null and lower(trim(p.client)) = lower(trim(c.name));
update public.invoices i set client_id = c.id
  from public.clients c
  where i.client_id is null and lower(trim(i.client)) = lower(trim(c.name));

-- Live updates for the timeline + follow-up slice.
alter publication supabase_realtime add table public.client_interactions;
