# CRM — WhatsApp & Email Tabs (Communication, Level 1: send + log)

**Date:** 2026-06-23
**Status:** Approved design, pending implementation
**Scope:** Per-client communication in the Client 360 popup — two tabs (WhatsApp, Email) with a message thread + compose box. Email is sent for real via Resend (already configured); WhatsApp uses click-to-chat (`wa.me`) + logging. Inbound replies are logged manually. No 2-way API sync (that would be a separate, larger project).

## Context

- Resend is configured in env: `RESEND_API_KEY`, `RESEND_FROM`. No `resend` SDK dependency — use the Resend REST API via `fetch` (no new dependency).
- No WhatsApp Business API. The leads page already uses `wa.me/<digits>?text=…` click-to-chat and `mailto:` links (`app/(dashboard)/website/leads/page.tsx`).
- Server route auth: `lib/supabase-server.ts` exports `createServerSupabase()` (cookie-bound, current user); `lib/supabase-admin.ts` exports `createSupabaseAdmin()` (service role). API routes in `app/api/*` follow this pattern (see `app/api/accounts/route.ts`).
- The Client 360 detail now opens as a popup (`components/CRM/ClientProfile.tsx` rendered in a Modal from the CRM board). The comms panel lives inside `ClientProfile`. Per-client realtime follows `hooks/useClientInteractions.ts` (setAuth-before-subscribe + token-gated `ensure()`, unique channel name).

## Goals

- A "Komunikasi" panel in the client detail with **WhatsApp** and **Email** tabs, each showing a message thread (newest-first) + a compose box.
- **Email**: compose (to / subject / body) → send via Resend → stored as an outbound message; failures recorded with status `failed` + the error.
- **WhatsApp**: compose → "Buka WhatsApp" opens `wa.me/<number>?text=…` (sent manually) AND logs the outbound message.
- **Log inbound**: a control on both tabs to record a received reply (direction `in`).

## Non-goals

- Inbound auto-sync (email inbox / WhatsApp webhooks) — Level 2. No message templates, attachments, scheduling, or bulk send.

## Data model

New table (additive migration `schema_crm_messages.sql` + applied to Supabase):
```sql
create table if not exists public.client_messages (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  channel      text not null,                 -- 'whatsapp' | 'email'
  direction    text not null default 'out',   -- 'out' | 'in'
  subject      text,                           -- email only
  body         text not null default '',
  to_address   text,                           -- recipient email / phone
  status       text not null default 'logged', -- 'sent' | 'failed' | 'logged'
  author_email text,
  author_name  text,
  created_at   timestamptz not null default now()
);
create index if not exists client_messages_client_idx on public.client_messages (client_id, created_at desc);
alter table public.client_messages enable row level security;
create policy "client_messages auth read"   on public.client_messages for select using (auth.role() = 'authenticated');
create policy "client_messages auth insert" on public.client_messages for insert with check (auth.role() = 'authenticated');
create policy "client_messages auth update" on public.client_messages for update using (auth.role() = 'authenticated');
create policy "client_messages auth delete" on public.client_messages for delete using (auth.role() = 'authenticated');
alter publication supabase_realtime add table public.client_messages;
```
Type: `ClientMessage { id, client_id, channel: 'whatsapp'|'email', direction: 'out'|'in', subject: string|null, body, to_address: string|null, status: string, author_email: string|null, author_name: string|null, created_at }` in `lib/types.ts`.

## Email send route — `app/api/crm/email/route.ts`

`POST` with JSON `{ to: string, subject: string, body: string }`:
1. `createServerSupabase()` → `auth.getUser()`; if no user → `401`.
2. Read `RESEND_API_KEY` / `RESEND_FROM`; if missing → `500` with a clear message.
3. `fetch('https://api.resend.com/emails', { method:'POST', headers:{ Authorization:`Bearer ${key}`, 'Content-Type':'application/json' }, body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, text: body }) })`.
4. Return `{ ok: true, id }` on 2xx, else `{ ok: false, error: <message> }` with the upstream status.

The route only sends; it does NOT write to the DB. The client inserts the `client_messages` row based on the response (keeps the route minimal and the row tied to the authenticated browser session's RLS).

## Components

### `hooks/useClientMessages.ts`
Focused realtime on `client_messages` filtered by `client_id` (mirror `hooks/useClientInteractions.ts`), newest-first. Returns `ClientMessage[]`.

### `components/CRM/ClientComms.tsx`
Props `{ client: Client }`. A panel with two tabs (`WhatsApp` | `Email`) via local `useState`. Reads `useClientMessages(client.id)` and filters by the active channel. Each tab:
- **Thread**: the channel's messages, each showing direction (→ keluar / ← masuk), body, subject (email), status badge (sent/failed/logged), author + date.
- **Compose**:
  - **Email**: `to` (prefilled from `client.contact` when it contains `@`, editable), `subject`, `body` → **Kirim**. On click: `POST /api/crm/email`; then insert a `client_messages` row (`channel:'email'`, `direction:'out'`, `status: ok ? 'sent' : 'failed'`, `subject`, `body`, `to_address: to`, author from `getUser`). Show the error text when `!ok`.
  - **WhatsApp**: `to` (prefilled from `client.contact` digits, editable), `body` → **Buka WhatsApp**: `window.open('https://wa.me/' + digits + '?text=' + encodeURIComponent(body))` AND insert a row (`channel:'whatsapp'`, `direction:'out'`, `status:'logged'`, `body`, `to_address`).
- **Catat balasan masuk** (both tabs): a small toggle to insert an inbound row (`direction:'in'`, `status:'logged'`, body + for email an optional subject).
Author resolution: `supabase.auth.getUser()` → `full_name ?? name ?? email-prefix` (same pattern as `InteractionComposer`).

### `components/CRM/ClientProfile.tsx`
Render `<ClientComms client={client} />` in the left column (e.g. after the Tasks panel).

## Realtime, access, verification

- **Realtime:** `client_messages` in the publication + the per-client hook → threads update live.
- **Access:** `client.crm` gate (the detail popup is already gated).
- **Verification (tsc + manual):**
  1. Email tab → compose to a real address → **Kirim** → the email arrives (Resend), the message appears in the thread with `sent`; a bad address / Resend error shows `failed` + the error text.
  2. WhatsApp tab → compose → **Buka WhatsApp** opens `wa.me` with the prefilled text; the message is logged in the thread.
  3. **Catat balasan masuk** on either tab adds an inbound entry; threads update live (realtime).

## Build order (for the plan)

1. DB migration (`client_messages`) + `ClientMessage` type.
2. Email send route (`app/api/crm/email/route.ts`).
3. `useClientMessages` hook.
4. `ClientComms` component (tabs, thread, compose, log-inbound) + render in `ClientProfile`.
