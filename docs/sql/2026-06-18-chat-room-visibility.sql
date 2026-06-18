-- Per-account "visible since" for chat rooms.
--
-- Goal: when an account is added to a room's chat (granted smm.<slug>.chat),
-- the room must look EMPTY for them — they only see messages sent AFTER they
-- were added. Removing then re-granting access resets it to empty again.
--
-- Mechanism: chat_room_visibility(email, room) holds the timestamp from which
-- that account may see messages. The access API stamps it = now() every time a
-- chat grant is (re)added, and deletes it when the grant is removed. The
-- chat_messages SELECT policy then hides anything older than that timestamp.
--
-- Super admins are exempt (always see full history) — chat_visible_since()
-- short-circuits them to -infinity regardless of any stored row.
--
-- Because every chat read path (load, overview preview, unread, realtime) runs
-- through the user-scoped client under RLS, this single policy is the only
-- enforcement point needed.
--
-- Safe to re-run.

create table if not exists public.chat_room_visibility (
  email         text not null,
  room          text not null,
  visible_since timestamptz not null default now(),
  primary key (email, room)
);

alter table public.chat_room_visibility enable row level security;

-- An account may read its own visibility rows; writes happen only via the
-- service role (the /api/access route), so there is no write policy.
drop policy if exists chat_room_visibility_select_own on public.chat_room_visibility;
create policy chat_room_visibility_select_own on public.chat_room_visibility
  for select using ( lower(email) = lower(coalesce(auth.jwt()->>'email','')) );

-- Earliest message timestamp this account may see in `p_room`.
-- Super admins → -infinity (full history). No row → -infinity (e.g. legacy
-- members never stamped). Otherwise the stored stamp.
create or replace function public.chat_visible_since(p_room text)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select case
    when lower(coalesce(auth.jwt()->>'email','')) = 'dandirivaldi@masterbagasi.com'
      or coalesce(auth.jwt()->'app_metadata'->>'role','') = 'super_admin'
    then '-infinity'::timestamptz
    else coalesce(
      (select v.visible_since
         from public.chat_room_visibility v
        where lower(v.email) = lower(coalesce(auth.jwt()->>'email',''))
          and v.room = p_room),
      '-infinity'::timestamptz
    )
  end;
$$;

-- Add the visibility cut-off to the existing room-access SELECT policy.
drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select using (
    public.can_access_chat_room(room)
    and created_at >= public.chat_visible_since(room)
  );

-- Reset everyone now: stamp every account that currently holds an smm.<slug>.chat
-- grant so existing members also start from an empty room as of this migration.
-- Super admins are stamped too but chat_visible_since() ignores it for them.
insert into public.chat_room_visibility (email, room, visible_since)
select lower(ma.email),
       substring(s from '^smm\.(.*)\.chat$') as room,
       now()
from public.menu_access ma,
     unnest(ma.sections) as s
where s like 'smm.%.chat'
  and substring(s from '^smm\.(.*)\.chat$') is not null
on conflict (email, room) do nothing;
