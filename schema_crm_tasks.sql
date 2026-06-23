create table if not exists public.client_tasks (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  title       text not null default '',
  due_date    date,
  done        boolean not null default false,
  assignee    text,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists client_tasks_client_idx on public.client_tasks (client_id, created_at desc);
create index if not exists client_tasks_open_idx on public.client_tasks (due_date) where done = false;
alter table public.client_tasks enable row level security;
create policy "client_tasks auth read"   on public.client_tasks for select using (auth.role() = 'authenticated');
create policy "client_tasks auth insert" on public.client_tasks for insert with check (auth.role() = 'authenticated');
create policy "client_tasks auth update" on public.client_tasks for update using (auth.role() = 'authenticated');
create policy "client_tasks auth delete" on public.client_tasks for delete using (auth.role() = 'authenticated');
alter publication supabase_realtime add table public.client_tasks;
