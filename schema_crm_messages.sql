create table if not exists public.client_messages (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  channel      text not null,
  direction    text not null default 'out',
  subject      text,
  body         text not null default '',
  to_address   text,
  status       text not null default 'logged',
  author_email text,
  author_name  text,
  created_at   timestamptz not null default now()
);
create index if not exists client_messages_client_idx on public.client_messages (client_id, created_at desc);
alter table public.client_messages enable row level security;
create policy "client_messages auth read"   on public.client_messages for select using (auth.role() = 'authenticated');
create policy "client_messages auth insert" on public.client_messages for insert with check (auth.role() = 'authenticated');
create policy "client_messages auth update" on public.client_messages for update using (auth.role() = 'authenticated');
create policy "client_messages auth delete" on public.client_messages for delete using (auth.role() = 'authenticated');
alter publication supabase_realtime add table public.client_messages;
