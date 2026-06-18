-- Per-account read state for task discussion threads (chat room "Tasks" tab).
-- Unread = comments newer than last_read_at (excluding your own).
create table if not exists public.task_comment_reads (
  email        text not null,
  post_id      uuid not null,
  last_read_at timestamptz not null default now(),
  -- "Clear chat for me": thread hides comments up to here (detail keeps all).
  cleared_at   timestamptz,
  primary key (email, post_id)
);
alter table public.task_comment_reads add column if not exists cleared_at timestamptz;

alter table public.task_comment_reads enable row level security;

drop policy if exists task_comment_reads_rw on public.task_comment_reads;
create policy task_comment_reads_rw on public.task_comment_reads
  for all
  using ( lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) )
  with check ( lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) );
