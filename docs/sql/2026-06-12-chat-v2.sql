-- Chat v2: edit/retract, attachments, moderation deletes.
alter table public.chat_messages
  add column if not exists edited_at        timestamptz,
  add column if not exists deleted_at       timestamptz,
  add column if not exists attachment_path  text,
  add column if not exists attachment_name  text,
  add column if not exists attachment_type  text,
  add column if not exists attachment_size  integer;

-- Super-admin check mirroring can_access_chat_room's super branch.
create or replace function public.is_chat_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt()->>'email','')) = 'dandirivaldi@masterbagasi.com'
      or coalesce(auth.jwt()->'app_metadata'->>'role','') = 'super_admin';
$$;

-- Author (or super admin) may edit/retract.
drop policy if exists chat_messages_update on public.chat_messages;
create policy chat_messages_update on public.chat_messages
  for update
  using ( public.can_access_chat_room(room)
          and ( author_email = auth.jwt()->>'email' or public.is_chat_super_admin() ) )
  with check ( public.can_access_chat_room(room)
          and ( author_email = auth.jwt()->>'email' or public.is_chat_super_admin() ) );

-- Author (or super admin) may hard-delete. A non-super "empty room" only nukes
-- their own rows; the UI restricts the button to super admin, RLS backs it up.
drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_delete on public.chat_messages
  for delete
  using ( public.can_access_chat_room(room)
          and ( author_email = auth.jwt()->>'email' or public.is_chat_super_admin() ) );

-- Private attachments bucket (also created via REST in case SQL storage schema
-- access is restricted; on conflict do nothing keeps this idempotent).
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;
