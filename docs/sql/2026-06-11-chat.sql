-- Group chat: one room per socmed project (room = project slug).
create table if not exists public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  room         text not null,
  author_email text not null,
  author_name  text not null,
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists chat_messages_room_created_idx
  on public.chat_messages (room, created_at);

create table if not exists public.chat_reads (
  email        text not null,
  room         text not null,
  last_read_at timestamptz not null default now(),
  primary key (email, room)
);

-- Membership check used by RLS. SECURITY DEFINER so it can read menu_access
-- regardless of that table's own policies. Mirrors lib/access.ts:
--   super admin (hardcoded email OR role) OR menu_access grants
--   smm.<room>.social / smm.<room>.projects (or legacy 'smm' / bare slug).
create or replace function public.can_access_chat_room(p_room text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(coalesce(auth.jwt()->>'email','')) = 'dandirivaldi@masterbagasi.com'
    or coalesce(auth.jwt()->'app_metadata'->>'role','') = 'super_admin'
    or exists (
      select 1 from public.menu_access ma
      where lower(ma.email) = lower(coalesce(auth.jwt()->>'email',''))
        and (
          ma.sections @> array['smm.'||p_room||'.social']
          or ma.sections @> array['smm.'||p_room||'.projects']
          or ma.sections @> array['smm']
          or ma.sections @> array[p_room]
        )
    );
$$;

alter table public.chat_messages enable row level security;
alter table public.chat_reads    enable row level security;

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select using ( public.can_access_chat_room(room) );

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
  for insert with check (
    public.can_access_chat_room(room)
    and author_email = auth.jwt()->>'email'
  );

drop policy if exists chat_reads_rw on public.chat_reads;
create policy chat_reads_rw on public.chat_reads
  for all
  using ( email = auth.jwt()->>'email' )
  with check ( email = auth.jwt()->>'email' );

-- Live updates for both tables.
do $$ begin alter publication supabase_realtime add table public.chat_messages;
  exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.chat_reads;
  exception when duplicate_object then null; end $$;
