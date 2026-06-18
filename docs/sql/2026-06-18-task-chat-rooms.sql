-- Per-task chat rooms reuse the general chat (chat_messages) so a task thread
-- has the SAME features as a project room (reply, react, unsend, edit, delete,
-- attachments, read receipts). A task room is keyed "task.<projectSlug>.<postId>".
--
-- Access derives from the OWNING PROJECT: anyone who can access the project's
-- chat room can access its task rooms. The slug is embedded in the room key, so
-- can_access_chat_room can extract it WITHOUT a posts lookup. Normal rooms
-- (no "task." prefix) behave exactly as before.
--
-- Safe to re-run.

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
      select 1
      from public.menu_access ma,
           lateral (select case when p_room like 'task.%'
                                then split_part(p_room, '.', 2)
                                else p_room end as slug) eff
      where lower(ma.email) = lower(coalesce(auth.jwt()->>'email',''))
        and (
          ma.sections @> array['smm.'||eff.slug||'.social']
          or ma.sections @> array['smm.'||eff.slug||'.projects']
          or ma.sections @> array['smm']
          or ma.sections @> array[eff.slug]
        )
    );
$$;
