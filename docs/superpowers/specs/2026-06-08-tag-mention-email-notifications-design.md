# Tag & Comment-Mention Email + In-App Notifications — Design

Date: 2026-06-08
Status: Approved (pending implementation plan)

## Goal

When a teammate is associated with work, notify them automatically — by email
and by the in-app notification bell — with **no manual "send" step**. Two
triggers:

1. **Post tag** — an account is added to a post's `tagged` list (already wired;
   currently no-ops because email isn't configured).
2. **Comment @mention** — an account is `@`-mentioned in a post comment (new).

Approved decisions:
- Mentions are stored in a dedicated column (Approach A).
- @mention UX is **inline autocomplete** (type `@` → pick from dropdown).
- Mentioned people get **both** an email **and** an in-app bell notification.
- Email sends **automatically** on the triggering save — no manual action.

## Current state (what already exists)

- `posts.tagged` holds account emails. `components/BPI/PostModal.tsx` already
  computes newly-tagged accounts on save and calls `POST /api/notify-tag`
  (fire-and-forget) for each.
- `app/api/notify-tag/route.ts` sends via **Resend**. It resolves the recipient
  server-side (must be a registered Supabase account — no open relay), escapes
  HTML, strips CRLF from the subject. It **no-ops** when `RESEND_API_KEY` is
  unset, so saving never breaks.
- `components/shared/NotificationBell.tsx` surfaces posts where the current user
  is tagged + "you were tagged" events + change activity.
- Comments live in `post_comments` (`post_id, author_email, author_name, body,
  created_at`). The composer in `components/BPI/PostComments.tsx` is a plain
  `<textarea>`; `submit()` inserts a row. Realtime is per-post inside the modal.

So post-tag email is **built but switched off**. The new work is: turn it on
(config) + add comment @mentions end-to-end.

## Prerequisite (ops — required for delivery)

Email only actually reaches teammates once Resend is configured:
- `RESEND_API_KEY` set (dev: `.env.local`; prod: hosting env).
- A **verified sending domain** in Resend (e.g. `notif@masterbagasi.com`) set as
  `RESEND_FROM`. The default `onboarding@resend.dev` only delivers to the Resend
  account owner's own address (test mode) — not to arbitrary teammates.
- `NEXT_PUBLIC_APP_URL` = the deployed admin URL (used for the email's deep link).

This is configuration, not code; the code degrades gracefully without it.

## Design

### 1. Automatic email delivery

Email is triggered from the app at the moment of the save (client → API,
fire-and-forget), consistent with the existing post-tag flow. From the user's
perspective it is fully automatic: tagging/mentioning and saving is the only
action.

(Considered but rejected for now: a pure server-side trigger — Postgres trigger
+ pg_net or a Supabase Edge Function listening to inserts. More failure-tolerant
but materially more complex for an internal tool. Can be revisited later without
changing the data model.)

### 2. Comment @mention (inline autocomplete)

- `usePostComments` fetches the account list from `/api/accounts`
  (`{ email, name, avatarUrl }`), mirroring `PostModal`.
- Composer behavior:
  - Detect when the caret is in an `@token` (an `@` followed by word chars with
    no preceding word char). Show an autocomplete dropdown of accounts filtered
    by the typed text.
  - On selection: replace the `@token` with `@<Name> ` in the textarea and add
    the account's email to a `mentions` Set in hook state.
  - Keyboard: ↑/↓ to move, Enter/Tab to select, Esc to dismiss. While the
    dropdown is open, Enter selects (does not submit).
- On submit, reconcile: keep only mentions whose `@<Name>` substring is still
  present in the final body (handles the user deleting a mention). Persist the
  resulting emails in the new `mentions` column.
- Rendering: in the feed, highlight `@<Name>` for known mentioned accounts in the
  accent color.

### 3. Notifications

- **Email** — extend `POST /api/notify-tag` to accept:
  - `kind: 'tag' | 'comment'` (default `'tag'`)
  - `snippet?: string` (comment excerpt, for `kind: 'comment'`)
  - Subject/body vary by kind: tag → "Kamu di-tag pada post …"; comment →
    "<By> me-mention kamu di komentar" + the snippet + post title.
  - Recipient resolution, HTML-escaping, CRLF-stripping, and graceful no-op all
    unchanged. On comment submit, loop the reconciled `mentions` and POST once
    per recipient (skip the comment author).
- **In-app bell** — `NotificationBell` additionally:
  - On mount, query `post_comments` where `mentions @> [myEmail]` (most recent
    50, newest first), map to "<author> mentioned you in a comment on <post
    title>" entries (link opens the post).
  - Subscribe to `post_comments` INSERT; when a new row's `mentions` includes my
    email, add a notification. (Array membership can't be filtered in the
    realtime channel, so subscribe broadly and filter client-side.)
  - Merge into the existing notification list; existing tag/activity entries
    unchanged.

### 4. Data model & API changes

- **Migration:** `alter table public.post_comments add column if not exists
  mentions text[] not null default '{}';`
  - Confirm `post_comments` is already in the `supabase_realtime` publication
    (it is — the per-post composer subscribes to it today).
  - RLS: `post_comments` is already client-readable; the new column needs no
    extra policy.
- **API:** extend `app/api/notify-tag/route.ts` only (no new route).
- **Comment insert:** include `mentions` in the `post_comments` insert payload.
  Client (`post_comments` isn't in generated DB types) already uses an untyped
  `sb()` client, so the new column needs no type regeneration.

### 5. Security & edge cases

- Recipients always resolved server-side from registered accounts; raw `to` is
  never accepted (existing anti-relay guarantee preserved).
- HTML escaped; subject CRLF-stripped (existing).
- Never email the actor themselves (skip self in tag and mention loops).
- Same person tagged on a post and mentioned in a comment → separate emails
  (different events) — acceptable.
- No `RESEND_API_KEY` → endpoint no-ops; posts/comments still save; bell
  notifications still work (they don't depend on email).
- Mention reconciliation prevents stale mentions if the user edits the text
  before sending.

## Out of scope

- Email digests / batching / per-user email preferences.
- Editing or deleting mentions after a comment is posted.
- Pure server-side (DB-trigger) email delivery.
- Mentions anywhere other than post comments (e.g. captions, briefs).

## Affected files

- `app/api/notify-tag/route.ts` — add `kind`/`snippet`, comment email template.
- `components/BPI/PostComments.tsx` — autocomplete composer, `mentions` state,
  insert payload, highlight rendering, mention email dispatch on submit.
- `components/shared/NotificationBell.tsx` — comment-mention source + realtime.
- New migration — `post_comments.mentions text[]`.
- Env/config (ops): `RESEND_API_KEY`, `RESEND_FROM`, `NEXT_PUBLIC_APP_URL`.
