# CRM — Tasks & Reminders per Deal (Sub-project 4)

**Date:** 2026-06-23
**Status:** Approved design, pending implementation
**Scope:** Standalone to-do tasks per client (deal), with a due date, an assignee, and a done state — distinct from the interaction follow-ups (#1, which attach to a logged touchpoint). Tasks surface in the NotificationBell for their assignee, and the open-task slice is reused by the #5 dashboard's "today".

## Context

Client 360 (#1) already has an interaction timeline with follow-up reminders (a `next_follow_up` date on a logged interaction, surfaced via a `followUps` store slice + `useFollowUps` global realtime hook + NotificationBell). That pattern is the template. Tasks are different: a **forward-looking to-do** ("prepare proposal", "send quote") with its own title, due date, assignee, and completion — not tied to a past interaction.

`components/CRM/ClientProfile.tsx` renders the per-client page (header, financials, projects, invoices, timeline). `components/shared/NotificationBell.tsx` builds a unified `notifs` list (mentions, tags, chat, follow-ups). `components/shared/DataProvider.tsx` mounts the global hooks (`useData`, `useRealtime`, `useChatUnread`, `useFollowUps`).

## Goals

- A `client_tasks` table: per-client to-dos with `title`, `due_date`, `assignee`, `done`.
- A **"Tugas"** panel on Client 360: list, add, complete, with an overdue marker.
- A global open-task slice kept live by realtime; the NotificationBell shows the current user's due/overdue tasks; the slice is reused by #5.

## Non-goals

- Recurring tasks, subtasks, task comments. Dashboard/"today" view itself (#5 consumes the slice).

## Data model

New table (additive migration `schema_crm_tasks.sql` + applied to Supabase):
```sql
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
```

Types: `ClientTask { id, client_id, title, due_date: string|null, done: boolean, assignee: string|null, created_by: string|null, created_at }` and a light `OpenTask { id, client_id, title, due_date: string|null, assignee: string|null }` in `lib/types.ts`.

Store (`hooks/useStore.ts`): a `clientTasks: OpenTask[]` slice (open tasks, `done=false`) + actions `setClientTasks`, `upsertClientTask(t: ClientTask)` (add/replace when `!done`, remove when `done`), `removeClientTask(id)`. Mirrors the `followUps` slice exactly.

## Components & flow

### Global open-task hook — `hooks/useClientTasks.ts`
Mirror `hooks/useFollowUps.ts`: seed `select('id,client_id,title,due_date,assignee').eq('done', false)` into `setClientTasks`, then a `client-tasks` realtime channel (setAuth-before-subscribe, token-gated `ensure()`) routing INSERT/UPDATE→`upsertClientTask`, DELETE→`removeClientTask`. Mount `useClientTasks()` in `DataProvider`.

### Per-client tasks — `hooks/useClientTaskList.ts` + `components/CRM/ClientTasks.tsx`
- `useClientTaskList(clientId): ClientTask[]` — focused realtime on `client_tasks` filtered by `client_id` (mirror `hooks/useClientInteractions.ts`), newest-first.
- `ClientTasks` panel (rendered in `ClientProfile`): an add row (title input + due date + assignee `<select>` defaulting to the current user's internal name) and a list of tasks each with a checkbox (toggles `done`), title, due date (red when past & not done). Adding inserts a row (`client_id`, `title`, `due_date||null`, `assignee`, `created_by`=current user); toggling updates `done`; a small ✕ deletes. Optimistic UI not required — realtime echo updates the list.

### NotificationBell — `components/shared/NotificationBell.tsx`
Inside the existing `notifs` `useMemo`, after the follow-up entries, push task entries from the `clientTasks` slice: for each open task where `assignee` matches the current user (first word of `me.name`, same heuristic as follow-ups, with the same all-if-none fallback) and `due_date` is set and due/overdue (`followUpTone(due_date, today)` ≠ 'none'), push `{ id: 'task-<id>', at: due_date, author: <client name>, text: 'Tugas: <title>', href: '/clients/<client_id>' }`. Add `clientTasks` to the memo deps. Resolve the client name from the `clients` store (already selected for follow-ups).

## Realtime, access, verification

- **Realtime:** `client_tasks` in the publication; global slice + per-client list both live. Access: `client.crm` gate.
- **Verification (tsc + manual):**
  1. On a client profile, add a task (title + due date + assignee) → appears live; check the box → marked done (and drops from the bell); ✕ deletes it.
  2. A past due date on an open task shows the red overdue marker.
  3. As the assignee, a due/overdue task appears in the NotificationBell linking to the client; completing it clears it without reload.

## Build order (for the plan)

1. DB migration (`client_tasks`) + types (`ClientTask`, `OpenTask`) + store slice.
2. Global `useClientTasks` hook + mount in DataProvider.
3. Per-client `useClientTaskList` hook + `ClientTasks` panel + render in `ClientProfile`.
4. NotificationBell task entries.
