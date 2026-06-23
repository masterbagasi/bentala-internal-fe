# CRM — Lead → Client Conversion (Sub-project 2)

**Date:** 2026-06-23
**Status:** Approved design, pending spec review
**Scope:** Second of the remaining CRM sub-projects. Connects the website-leads inbox to the CRM pipeline so the sales funnel runs end-to-end (lead → client → projects/invoices). Adds the `source` / `lead_id` origin fields the later Reporting sub-project (#5) needs.

## Context

The full sales CRM is being built on top of the completed **Client 360** (sub-project 1: `/clients/[id]` profile, `client_interactions`, `client_id` FK on projects/invoices, follow-up surfacing). The remaining work was decomposed into four sub-projects, in order: **#2 Lead → Client (this doc)**, #3 Pipeline upgrade, #4 Tasks & reminders per deal, #5 Dashboard & reports. Each gets its own spec → plan → implementation cycle. The agreed deal model is **1 client = 1 deal** (the `clients` row is the deal), and sales targets are **per internal PIC per month** (relevant to #5, not here).

What already exists and is relevant:
- **Website leads inbox** — `app/(dashboard)/website/leads/page.tsx` lists `bsi_leads` (type `BsiLead` in `lib/website-types.ts`): `full_name`, `brand_name`, `contact_type` ('whatsapp'|'email'), `contact_value`, `project_type`, `notes`, `utm_*`, `status` ('new'|'contacted'|'qualified'|'closed'|'spam'), `submitted_at`. Each row renders as a `LeadCard` with a status dropdown. `bsi_leads` is a `GenericTable` in `lib/database.types.ts` (loosely typed).
- **CRM** — `components/CRM/index.tsx`: the kanban + the `ClientModal` (currently NOT exported) that inserts/updates a `clients` row. `Client` type in `lib/types.ts` has `name`, `pic`, `contact`, `stage`, `value`, `service`, `internal`, `notes`. `clients` is realtime (`useRealtime.ts`).
- **Client 360** — `components/CRM/ClientProfile.tsx` renders the per-client page.

What's missing: nothing connects a website lead to a CRM client. A converted lead is retyped by hand, and there's no record of where a client came from.

## Goals

- A **"Jadikan Client"** action on each website lead that creates a CRM client pre-filled from the lead, and links the two so a lead can't be converted twice.
- Origin tracking on every client: a **`source`** (manual/website/referral) and, for converted leads, a **`lead_id`** back-pointer.
- The Client 360 header shows the client's source (and links back to the originating lead when applicable).

## Non-goals (later sub-projects)

- Pipeline drag/forecast/win-loss and `expected_close`/`close_reason` fields → #3.
- Tasks & reminders → #4. Dashboard, funnel report, targets → #5.
- Changing how `bsi_leads` are ingested from the website (the public form is out of scope).

## Data model

### `clients` — add two columns
- `source text not null default 'manual'` — one of `manual` | `website` | `referral`.
- `lead_id uuid null` — the originating `bsi_leads.id` when converted from a website lead (no FK constraint added, to avoid coupling the CRM migration to the website table's lifecycle; it is a soft reference).

App-level `Client` interface (`lib/types.ts`) gains `source?: string` and `lead_id?: string | null`. DB types (`lib/database.types.ts`) `clients` Row gains `source: string` + `lead_id: string | null`, both optional in `Insert` (defaults / nullable), mirroring how `client_id` was added in sub-project 1.

### `bsi_leads` — add one column
- `converted_client_id uuid null` — the `clients.id` this lead became. Drives the "already converted" badge and blocks double-conversion. `bsi_leads` stays a `GenericTable` (no typed-Row change needed).

### Migration
A `schema_crm_lead_conversion.sql` file (committed) + applied to Supabase (`project_id gbmqudkkuzpqykmyrkqc`) via `apply_migration`. Additive only:
```sql
alter table public.clients   add column if not exists source text not null default 'manual';
alter table public.clients   add column if not exists lead_id uuid;
alter table public.bsi_leads add column if not exists converted_client_id uuid;
```
No backfill needed (existing clients default to `source='manual'`, `lead_id` null).

## Components & flow

### Reuse `ClientModal` (extend, don't duplicate)
`ClientModal` in `components/CRM/index.tsx` is the single source of truth for the client form. Changes:
1. **Export** it from `components/CRM/index.tsx`.
2. Add optional props: `prefill?: Partial<ClientFormState>`, `source?: string`, `leadId?: string`, `onCreated?: (clientId: string) => void`.
3. Add `source` to the form state + a **"Sumber"** `<select>` (Manual / Website / Referral), default `manual` for a new client; seeded from `client.source` on edit; preset to the `source` prop (e.g. `website`) when converting.
4. On **insert**, include `source` and (if provided) `lead_id` in the payload, capture the created row's id via `.select().single()`, optimistically `upsertClient`, and call `onCreated(id)`.
5. On **edit**, persist `source` like the other fields (the existing CRM edit path).

This keeps every client field — and its validation — in one place; the leads page drives it through props.

### Conversion on the Leads page (`app/(dashboard)/website/leads/page.tsx` + `LeadCard`)
- `LeadCard` gains a **"Jadikan Client"** button when `lead.converted_client_id` is empty; otherwise a **"✓ Jadi Client"** link to `/clients/${lead.converted_client_id}`.
- Clicking "Jadikan Client" opens `ClientModal` with:
  - `prefill`: `{ name: lead.brand_name, pic: lead.full_name, contact: lead.contact_value, notes: [lead.project_type, lead.notes].filter(Boolean).join(' · '), stage: 'lead' }`
  - `source="website"`, `leadId={lead.id}`
  - `onCreated(clientId)`: update `bsi_leads` (`converted_client_id = clientId`, `status = 'closed'`), and update the page's local `items` state so the card flips to the converted badge immediately (no reload). The new client appears in the CRM board via `clients` realtime.
- The lead's `name←brand_name` / `pic←full_name` mapping is the chosen default (brand = the account, the contact person = the PIC).

### Client 360 header (`components/CRM/ClientProfile.tsx`)
- Show the source as a small label in the header (e.g. "Sumber: Website"). When `client.lead_id` is set, render it as a link to `/website/leads` (the leads inbox) so the origin is traceable.

## Realtime, access, verification

- **Realtime:** `clients` is already live, so a converted client shows on the CRM board immediately. The leads page is load-on-demand (not in the global store); it updates its local `items` after conversion. No new subscriptions.
- **Access:** the leads page keeps its existing gate; conversion writes a `clients` row (authenticated RLS, same as the CRM "+ Tambah Client").
- **Double-conversion guard:** the button is hidden once `converted_client_id` is set; even if two tabs race, the second write just overwrites `converted_client_id` with an equivalent link — at worst two clients are created, which the user can delete. (A DB unique constraint is intentionally NOT added to keep the migration additive and reversible; the UI guard is sufficient for this low-frequency action.)
- **Verification (no test runner; `tsc --noEmit` + manual):**
  1. Convert a website lead → `ClientModal` opens pre-filled → assign PIC + value → Save → the new client appears on the CRM board and its 360 profile; header shows "Sumber: Website" with a link back to leads.
  2. The lead card flips to "✓ Jadi Client" linking to the new client, without reload; the button is gone.
  3. Create a manual client from the CRM "+ Tambah Client" → "Sumber" defaults to Manual and persists.
  4. Re-open a converted lead → no convert button (guard holds).

## Build order (for the implementation plan)

1. DB migration (`clients.source`, `clients.lead_id`, `bsi_leads.converted_client_id`) + types.
2. Extend + export `ClientModal` (source field, `prefill`/`source`/`leadId`/`onCreated` props, insert writes source/lead_id + returns id).
3. Leads page: "Jadikan Client" button + converted badge + `onCreated` wiring (mark lead, update local state).
4. Client 360 header: show source + link back to lead.
