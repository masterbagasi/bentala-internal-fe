# CRM — Client 360 Profile (Sub-project 1)

**Date:** 2026-06-23
**Status:** Approved design, pending spec review
**Scope:** First of four CRM sub-projects. Builds the per-client 360 profile page and the interaction/follow-up tracking that the later sub-projects (Leads, Pipeline polish, Reporting) all depend on.

## Context

The admin app already has a working CRM foundation:

- **Kanban board** — `components/CRM/index.tsx`: stages Lead → Pitching → Closed → Invoice (+ `inactive`), card CRUD, `ClientModal`, realtime via `clients` table, activity logging.
- **Data** — `clients` table + `Client` type (`lib/types.ts`), fetched in `hooks/useData.ts`, kept live in `hooks/useRealtime.ts`, stored in Zustand (`hooks/useStore.ts`).
- **Sibling modules** — Invoices (`components/Invoices/index.tsx`) and Projects (`components/Projects/index.tsx`) are built; both link to a client by the **text name** in their `client` column.
- **Menu** — `client` section in `components/Sidebar.tsx`; access key `client.crm` → `/clients` (`lib/access.ts`).

What is missing: a per-client detail view, any record of interactions/follow-ups, and a reliable (non-name-based) link from projects/invoices to a client.

The full CRM was scoped as four sub-projects, each with its own spec → plan → implementation cycle:

1. **Client 360 profile** (this doc) — the foundation.
2. Leads capture & follow-up (fills the empty `/website/leads`).
3. Pipeline polish (drag between stages, filters on the existing kanban).
4. Reporting & forecast.

This spec covers **only #1**.

## Goals

- A deep-linkable per-client page at `/clients/[id]` showing: contact/PIC header, financial summary, the client's projects, the client's invoices, and an interaction timeline.
- An interaction/follow-up model: log touchpoints (call/meeting/WhatsApp/email/note), attach files/links, set a next-follow-up date, and auto-record stage changes.
- Follow-up reminders surfaced in three places: a badge on CRM cards, a "Perlu Follow-up" panel on the CRM page, and the existing NotificationBell.
- A proper `client_id` foreign key on `projects` and `invoices` so the 360 joins are accurate and survive renames.

## Non-goals (deferred to later sub-projects)

- Leads capture page, pipeline drag-and-drop polish, reporting/forecast views.
- Multiple contacts per client, client health score, outbound email.

## Data model

### New table: `client_interactions`

| column | type | notes |
|---|---|---|
| `id` | uuid PK default gen_random_uuid() | |
| `client_id` | uuid NOT NULL references `clients(id)` on delete cascade | owner client |
| `type` | text NOT NULL | `call` / `meeting` / `whatsapp` / `email` / `note` / `stage_change` / `followup` |
| `summary` | text NOT NULL default '' | free-text touchpoint summary |
| `occurred_at` | timestamptz NOT NULL default now() | when the touchpoint happened |
| `next_follow_up` | date NULL | reminder date for the next touch |
| `follow_up_done` | boolean NOT NULL default false | clears the reminder |
| `files` | text[] NOT NULL default '{}' | attachments (links + uploaded URLs), same convention as `posts.files` |
| `author_email` | text NULL | who logged it |
| `author_name` | text NULL | who logged it (display) |
| `created_at` | timestamptz NOT NULL default now() | |

- **RLS:** authenticated read/insert/update/delete (mirror the policies on `clients`).
- **Realtime:** add to the `supabase_realtime` publication; replica identity default (PK) is sufficient — soft delete is not used here, hard `DELETE` only needs the PK.
- **Index:** `(client_id, occurred_at desc)` for the timeline; partial index `(next_follow_up) where follow_up_done = false and next_follow_up is not null` for the open-follow-up query.

### FK additions on `projects` and `invoices`

- Add `client_id uuid NULL references clients(id)` to **both** tables (nullable — legacy rows may not match a client).
- **Backfill migration:** `update projects p set client_id = c.id from clients c where p.client_id is null and lower(trim(p.client)) = lower(trim(c.name))` (same for invoices). Rows with no name match stay `client_id = null` and are reported (count logged in the migration).
- The text `client` column is **kept** for back-compat and display; `client_id` is the source of truth for 360 joins.
- **Forms updated:** Projects create/edit and Invoices create/edit gain a **client dropdown** (lists `clients` by name) that writes `client_id`, and also writes the chosen client's name into the existing `client` text column to keep current views working.

### Financial summary

Computed from `invoices` where `client_id = :id`. Invoice `status` values are `pending`, `dp`, `paid`, `overdue` (per `components/Invoices/index.tsx`):

- **Total deal** = Σ `value` (all of the client's invoices)
- **Dibayar** = Σ `value` where `status = 'paid'`
- **Outstanding** = Total − Dibayar (i.e. `pending` + `dp` + `overdue`)

This mirrors the existing Invoices module's aggregation so the numbers agree across the app.

## Routes, components & layout

### Route

`app/(dashboard)/clients/[id]/page.tsx` — gated by `client.crm` (same as the list). Renders `<ClientProfile id={params.id} />`. Page header: client name + back-to-CRM link.

### Entry point

In `components/CRM/index.tsx`, clicking the **card body** navigates to `/clients/[id]`. Existing per-card buttons (Edit / Delete / move-stage) keep working and must `stopPropagation` so they don't also navigate.

### New components (under `components/CRM/`)

- **`ClientProfile.tsx`** — page shell + data wiring (loads the client from the store; loads projects/invoices filtered by `client_id`; loads + subscribes the interaction timeline).
- **`ClientHeader.tsx`** — name, stage badge, value, contact, external PIC, internal owner, service, notes, **Edit** button (reuses the existing `ClientModal`).
- **`ClientFinancials.tsx`** — the 3 KPI strip.
- **`ClientProjects.tsx`** / **`ClientInvoices.tsx`** — compact tables; row click routes to the Projects / Invoices module.
- **`InteractionTimeline.tsx`** — reverse-chronological list + the composer.
- **`InteractionComposer.tsx`** — form: type, summary, `occurred_at` (default today), optional `next_follow_up`, attachments.

Layout: two columns on desktop (left: header + financials + projects + invoices; right/main: timeline), stacked on mobile. Follow the existing page pattern (`PageHeader` + section cards).

## Interaction & follow-up mechanics

- **Log interaction:** insert a `client_interactions` row; optimistic upsert into the store; realtime echo confirms.
- **Attachments:** reuse the link-chip + uploader pattern from `PostModal` (any-link links rendered as openable chips with the http(s)-only `linkHref` guard; uploaded files via `MultiFileUploader`, prefix `clients/files`).
- **Auto stage-change log:** when a client's `stage` changes — in the CRM move handler and in `ClientModal` save — after the `clients` update succeeds, insert a `type='stage_change'` interaction (`summary` = "Stage: <from> → <to>", author = current user). Guard against duplicate entries when stage is unchanged.
- **Follow-up state:** an interaction is an **open follow-up** when `next_follow_up is not null and follow_up_done = false`. A **Selesai** button on the follow-up chip sets `follow_up_done = true`. **Overdue** = `next_follow_up < today`; **due** = `next_follow_up` within today..+2 days.
- A client's reminder status (for badges/panel/bell) = its earliest open follow-up.

## Follow-up surfacing (3 places)

A lightweight Zustand slice `followUps` holds open follow-ups (`{ id, client_id, next_follow_up }`), seeded once and kept live by a global subscription (below). All three surfaces derive from it:

1. **CRM card badge** — a dot on the client card: red if overdue, amber if due. Derived by `client_id`.
2. **"Perlu Follow-up" panel** — above the CRM board: open follow-ups sorted by `next_follow_up` asc, with a count; row click → `/clients/[id]`.
3. **NotificationBell** — due/overdue follow-ups for clients whose **internal owner = current user**; click → `/clients/[id]`. Integrates with the existing `components/shared/NotificationBell.tsx` derivation pattern.

## Realtime, access, activity log

- **Timeline:** `ClientProfile` opens a focused channel `client-interactions:<id>` filtered by `client_id` (pattern from `hooks/usePostHistory.ts`), with `setAuth`-before-subscribe, gated on a real token (matching the cold-load-race fix already applied to `useRealtime`).
- **Global follow-up slice:** one subscription on `client_interactions` (in a new `hooks/useFollowUps.ts`, mounted in `DataProvider`) that keeps the `followUps` slice live — also `setAuth`-before-subscribe and token-gated.
- **Access:** the `client.crm` gate already covers the `/clients` subtree (sidebar + middleware + RLS); the `[id]` route inherits it.
- **Activity log:** existing CRM `activity_log` entries stay as-is. Interactions are their own richer record and are not duplicated into `activity_log`.

## Testing / verification

No automated test framework in the repo (verification is `tsc --noEmit` + manual). Manual checklist:

1. Click a CRM card → profile opens at `/clients/[id]`; back link returns to CRM.
2. Header/financials/projects/invoices show the correct client's data via `client_id` (verify a renamed client still resolves).
3. Log each interaction type; attach a link (opens) and an uploaded file (previews); entries appear without refresh (realtime).
4. Set a `next_follow_up` → badge appears on the CRM card, row appears in the "Perlu Follow-up" panel, and (when you're the internal owner) in the NotificationBell. Mark **Selesai** → all three clear without refresh.
5. Move a client between stages → a `stage_change` entry auto-appears in the timeline.
6. Migration: backfilled `client_id` counts match expectations; unmatched rows reported.

## Build order (for the implementation plan)

1. DB migration: `client_interactions` table (+RLS, publication, indexes); `client_id` on projects/invoices (+backfill).
2. Types + store slice (`Interaction` type, `followUps` slice, actions); fetch + global follow-up subscription.
3. `ClientProfile` route + components (header, financials, projects, invoices) reading by `client_id`.
4. Interaction timeline + composer (with attachments) + focused realtime.
5. Auto stage-change logging (CRM move + ClientModal).
6. Follow-up surfacing: CRM card badge, "Perlu Follow-up" panel, NotificationBell.
7. Update Projects/Invoices create-edit forms with the client dropdown (writes `client_id` + name).
