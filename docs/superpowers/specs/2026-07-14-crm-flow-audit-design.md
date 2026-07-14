# CRM Flow Audit & Hardening — Design

Date: 2026-07-14
Branch: feature/light-theme (local, not pushed)
Scope: CRM v2 (`components/CRM2/`, tables `contacts`/`deals`/`crm_projects`/`crm_invoices`).
Menu: CLIENT → Dashboard · Contacts · Pipeline · Contracts (route `/crm/projects`) · Invoices.

## Verdict
Happy path works end-to-end (verified live this session: deal → won → project → invoice →
payment → board). Functional for a trusted internal team; **not yet production-hardened.**

## Findings (by severity)

### Area 1 — Visible bugs — DONE (2026-07-14)
- **Contact detail "Invoices" panel always empty.** Read legacy `invoices` store (no
  `contact_id`/`project_id`). Fixed to read `crmInvoices` + derive total from
  `crmInvoiceItems`, link to `/crm/invoices/[id]`. Files: `ContactDetailPanel.tsx`,
  `ContactDetail.tsx`.
- **Contract value inconsistent (List stored vs Board/Detail derived).** List now uses the
  same `valueOf` (invoice total → deal value → stored). File: `CrmProjectsList.tsx`.
- **Board status loss — NOT a bug on inspection.** `moveTo` early-returns when
  `colOf(p) === col`, so REVIEW/ON_HOLD (both map to ONPROGRESS) are not overwritten.
  Waiting↔To Do are auto-derived from payment by design. No change made.

### Area 2 — Access & security — DONE (route gating; 2026-07-14)
- DECISION: full gate + super bypass. Added `crm.dashboard/contacts/pipeline/contracts/invoices`
  sections to `STATIC_SECTIONS` (group Client) → sidebar + middleware now gate them.
- Backward-compat: `CO_GRANTS` + expanded `client` legacy alias so existing `client.crm`/
  `client.invoices` holders keep CRM access without a DB reseed.
- NOT done (out of chosen scope): extra super-only lock on individual financial mutations —
  route-level `crm.invoices` grant governs who can use invoices. Follow-up if finer control wanted.
- OPERATIONAL: unconfigured super (no menu_access row) still full-bypasses. Configured non-super
  accounts need the new grants (covered by CO_GRANTS for legacy holders; otherwise grant in
  Manage Access). Verify before/at push.

--- original Area 2 (for reference) ---
- Whole CRM v2 is ungated: `/crm/*`, `/contacts`, `/pipeline` absent from `lib/access.ts`;
  `sectionForPath` returns null → middleware + sidebar treat null as "allow". RLS fully open.
- Financial mutations (record/edit/delete payment, change invoice status, delete invoice)
  have zero role checks — contrast task editing which checks `isSuper`/creator.
- DECISION NEEDED: access model (gate whole CRM via `menu_access` sections `crm.*`? or only
  gate financial actions to super-admin?).

### Area 3 — Data integrity — DONE (2026-07-14)
- DECISION: block deletes. `DealsPipeline` blocks deleting a deal that has a Contract/Invoice
  (single + bulk); `ContactsList` blocks deleting a contact that still owns a project/invoice.
- DECISION: JATUH_TEMPO auto. Added `isInvoiceOverdue`/`effectiveInvoiceStatus`/
  `INVOICE_STATUSES_MANUAL` in schema. Dropdowns (detail + list filter) drop the manual
  JATUH_TEMPO option; overdue surfaces as a derived red pill/badge in `InvoiceDetail` + list.
- BONUS: leaving LUNAS no longer wipes `paid_amount`/`payment_proofs` — it restores the amount
  actually recorded from proofs. Payment history preserved.
- NOT done: concurrent partial-payment last-write-wins (needs server-side merge / optimistic
  concurrency) — deferred.

--- original Area 3 (for reference) ---
- Deleting a won deal orphans its `crm_projects` + `socmed_projects` brand + menu grants.
- Deleting a contact leaves projects/invoices with `contact_id = null` (drop out of views).
- Leaving `LUNAS` status resets `paid_amount = 0` and discards `payment_proofs` history.
- Concurrent partial payments: `payment_proofs` written as whole-array replace → last write wins.
- `JATUH_TEMPO` status is dead (never auto-set; overdue computed ad-hoc).
- DECISION NEEDED: delete behavior (block vs cascade-cleanup); JATUH_TEMPO (auto-set vs remove).

### Area 4 — DB reproducibility — PENDING (do when Supabase MCP reconnects)
- No repo migrations for `crm_invoices`, `crm_invoice_items`, `invoice_settings`, nor contact
  columns (`client_tier`, `industry`, `city`, `province`, `country`), nor the Won trigger
  re-pointed to lowercase `won` (repo trigger keys on legacy `MENANG`). Prod DB has diverged
  (uncommitted migrations). Write idempotent migrations reflecting live schema. Also verify
  `crm_invoices`/`crm_invoice_items` are in `supabase_realtime` publication.

## Data-layer notes
- Live & correct: contacts, deals, crm_projects, crm_tasks, follow_ups, client_tasks.
- `crm_invoice_items`: store actions only called from realtime; `InvoiceFormModal` doesn't push
  items to store on save → line-item edits rely on realtime echo (publication unverified).
- `invoice_settings`: not in store, not realtime → stale across sessions.
