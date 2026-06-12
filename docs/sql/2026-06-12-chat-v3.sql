-- Chat v3: read receipts + reliable delete realtime.

-- Store the reader's display name alongside their read marker so the UI can
-- show "Dibaca oleh <name>" without a separate lookup.
alter table public.chat_reads add column if not exists name text;

-- Read receipts need every room member to SEE everyone's read marker (the
-- existing chat_reads_rw policy restricts SELECT to the caller's own row).
-- Add a room-scoped SELECT policy (OR'd with the existing one). Writes stay
-- own-row-only via chat_reads_rw.
drop policy if exists chat_reads_select on public.chat_reads;
create policy chat_reads_select on public.chat_reads
  for select using ( public.can_access_chat_room(room) );

-- So realtime DELETE events carry the full old row (needed for RLS evaluation
-- on subscribers, otherwise hard-delete / clear-room don't propagate live).
alter table public.chat_messages replica identity full;
alter table public.chat_reads    replica identity full;
