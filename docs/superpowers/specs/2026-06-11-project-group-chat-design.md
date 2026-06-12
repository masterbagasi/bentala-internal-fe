# Project Group Chat — Design

**Date:** 2026-06-11
**Status:** Approved (pending spec review)

## Summary

A real-time group chat room per socmed project. Each project in the
`socmed_projects` table (Bentala Project / `bpi`, Bentala Studio / `bsi`,
Master Bagasi / `master-bagasi`, and any future dynamic project) gets its own
room. Members of a room are exactly the users who already have access to that
project — no separate permission. A new **"Chat"** item appears in the sidebar
under each project, alongside *Social Media* and *Projects*.

## Goals

- One persistent group chat room per socmed project.
- Membership auto-derived from existing project access (no new toggle).
- Live updates (new messages appear without reload) via Supabase realtime.
- Unread indicator on the sidebar "Chat" item.

## Non-goals (explicitly deferred)

@mentions, image/file attachments, edit/delete messages, emoji reactions,
typing indicators, 1-1 DMs, message search. Rooms for non-socmed menus
("All Project", Website, etc.) — only `socmed_projects` get rooms.

## Architecture

Mirror the existing `PostComments` pattern (the codebase's proven chat-like
feature): messages persist in Postgres, live updates arrive via **Supabase
Postgres Changes** (`postgres_changes` on a `.subscribe()` channel), not
ephemeral broadcast. Rationale: messages are durable, history survives, and the
pattern + realtime publication already exist — fastest and most reliable path.

### Components

- **DB tables** `chat_messages`, `chat_reads` (+ realtime publication + RLS).
- **API routes** under `app/api/chat/` — list/post messages, mark-read,
  unread-counts — all gated by project access.
- **Page** `app/(dashboard)/smm/[project]/chat/page.tsx` — the room UI.
- **Sidebar** — a derived "Chat" nav item per project (no stored section).
- **Access** — `lib/access.ts` + middleware recognise `/smm/<slug>/chat` and
  gate it by "has any `smm.<slug>.*` access OR super admin".

## Data model

```sql
create table if not exists chat_messages (
  id           uuid primary key default gen_random_uuid(),
  room         text not null,            -- project slug, e.g. 'bpi'
  author_email text not null,
  author_name  text not null,            -- name snapshot at send time
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists chat_messages_room_created_idx
  on chat_messages (room, created_at);

create table if not exists chat_reads (
  email        text not null,
  room         text not null,
  last_read_at timestamptz not null default now(),
  primary key (email, room)
);
```

Both tables are added to the `supabase_realtime` publication.

### Access control (RLS + server)

Membership = "user has access to the project, or is a super admin". Access is
derived from `menu_access.sections` containing `smm.<room>.social` or
`smm.<room>.projects` (legacy aliases expand the same way `lib/access.ts`
already handles). Enforced in two layers:

1. **Server (authoritative):** every chat API route re-derives the caller's
   access and rejects rooms they can't see (same shape as the Instagram
   analytics route's `canReadBrand`).
2. **RLS:** a Postgres policy restricts `chat_messages`/`chat_reads` rows to the
   caller's permitted rooms, so realtime subscriptions can't leak other rooms.
   The policy reads the caller's `menu_access.sections` (or super-admin role)
   and checks the row's `room`.

`author_email` on insert must equal the authenticated user's email (no
spoofing).

## UI

New page `/smm/[project]/chat`:

- **Header:** "Group Chat — <Project Name>".
- **Message list:** bubbles with avatar + name + relative time + body. Own
  messages right-aligned; others left-aligned. Avatar from
  `user_metadata.avatar_url`, fallback to initials (same resolution as
  `/api/accounts`). Loads the latest 50, with a "Muat lebih lama" (load older)
  button that pages backwards by `created_at`.
- **Composer:** text input pinned to the bottom; Enter sends, Shift+Enter
  newline. **Optimistic**: the message renders immediately, then persists; on
  failure it's marked failed with a retry.
- **Auto-scroll:** stick to bottom on new messages when already at the bottom;
  don't yank the view if the user scrolled up reading history.

Visual language matches the existing dark theme and `PostComments`.

## Unread badge

- On opening a room (and on each new message while the room is focused),
  upsert `chat_reads(email, room, last_read_at = now())`.
- The sidebar "Chat" item shows a badge = count of `chat_messages` in that room
  with `created_at > last_read_at` (capped display, e.g. "9+"). Counts load for
  all rooms the user can see and update live via the realtime subscription.
- Messages authored by the user themselves never count as unread.

## Realtime

A single Supabase channel subscribes to `postgres_changes` (INSERT) on
`chat_messages`. The open room appends matching inserts to its list; the
sidebar recomputes unread counts from inserts across all the user's rooms. This
mirrors `PostComments`' single-subscription approach.

## Error handling

- API routes return real errors (403 for non-members, 401 unauthenticated),
  not silent failures — consistent with the recent socmed route hardening.
- Optimistic sends that fail show a retry affordance; they are not silently
  dropped.
- Realtime subscription is best-effort; on reconnect the list re-fetches the
  latest page so no messages are permanently missed.

## Testing

- Access: a user with `smm.bpi.social` can read/post in `bpi` chat; a user
  without any `smm.bpi.*` gets 403 and the room is not in their sidebar; super
  admin sees all rooms. RLS blocks cross-room reads even via direct query.
- Messaging: optimistic render → persisted; a second client receives the
  message live.
- Unread: badge increments on others' messages, clears on open, ignores own
  messages.

## Open questions / decisions made

- **Avatar source:** `user_metadata.avatar_url`, fallback initials. (Decided.)
- **Membership:** inherited from project access, no separate toggle. (Decided.)
- **Placement:** per-project sidebar "Chat" item. (Decided.)
- **v1 extras:** unread badge only. (Decided.)
