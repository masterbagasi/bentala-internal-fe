-- Chat message reactions (WhatsApp-style emoji reactions).
-- One reaction per person per message: re-reacting with the same emoji removes
-- it, a different emoji replaces it (enforced client-side via the unique key).
-- RLS mirrors chat_messages: room members can read; you can only write your own
-- reaction; you (or a super admin) can delete it. Added to the realtime
-- publication with REPLICA IDENTITY FULL so DELETE events carry `room`.

create table if not exists public.chat_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  room text not null,
  user_email text not null,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_email)
);
create index if not exists chat_message_reactions_room_idx on public.chat_message_reactions(room);
create index if not exists chat_message_reactions_msg_idx on public.chat_message_reactions(message_id);

alter table public.chat_message_reactions enable row level security;
alter table public.chat_message_reactions replica identity full;

create policy chat_message_reactions_select on public.chat_message_reactions
  for select using (can_access_chat_room(room));
create policy chat_message_reactions_insert on public.chat_message_reactions
  for insert with check (can_access_chat_room(room) and user_email = (auth.jwt() ->> 'email'));
create policy chat_message_reactions_update on public.chat_message_reactions
  for update using (can_access_chat_room(room) and user_email = (auth.jwt() ->> 'email'))
  with check (can_access_chat_room(room) and user_email = (auth.jwt() ->> 'email'));
create policy chat_message_reactions_delete on public.chat_message_reactions
  for delete using (can_access_chat_room(room) and (user_email = (auth.jwt() ->> 'email') or is_chat_super_admin()));

alter publication supabase_realtime add table public.chat_message_reactions;
