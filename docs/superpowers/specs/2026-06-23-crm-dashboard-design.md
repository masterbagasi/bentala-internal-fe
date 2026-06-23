# CRM — Sales Dashboard & Reports (Sub-project 5)

**Date:** 2026-06-23
**Status:** Approved design, pending implementation
**Scope:** A sales analytics page over the CRM data built in #1–#4: conversion funnel, pipeline + weighted forecast, win/loss per PIC, monthly revenue, and target-vs-actual per internal PIC. Adds a `sales_targets` table (per PIC, per month). Final CRM sub-project.

## Context

The CRM now has: `clients` (deal with `stage`, `value`, `internal` PIC, `close_reason`, `expected_close`), `invoices` (`value`, `status` ∈ {pending,dp,paid,overdue}, `client_id`), both realtime in the store. Stage probabilities `STAGE_PROBABILITY` and `CRM_STAGES` live in `lib/constants.ts`. The "client" sidebar group (`components/Sidebar.tsx`) has Leads, CRM Pipeline, Invoice, gated by `client.crm`.

Missing: any aggregate reporting, and any notion of a sales target.

## Goals

- A `/sales-report` page (new "Laporan Sales" sidebar item under the client group, gated by `client.crm`) showing: conversion funnel, total pipeline + weighted forecast, win/loss + win-rate per PIC, monthly revenue (last 6 months), and target-vs-actual (this month, per PIC + team).
- A `sales_targets` table + an inline form to set a PIC's monthly target.

## Non-goals

- Exportable reports/CSV, custom date ranges (fixed: last 6 months + current month), charts beyond simple bars, per-deal drilldowns.

## Data model

New table (additive migration `schema_crm_targets.sql` + applied to Supabase):
```sql
create table if not exists public.sales_targets (
  id            uuid primary key default gen_random_uuid(),
  internal      text not null,
  month         date not null,                 -- first day of the month
  target_amount numeric not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (internal, month)
);
alter table public.sales_targets enable row level security;
create policy "sales_targets auth read"   on public.sales_targets for select using (auth.role() = 'authenticated');
create policy "sales_targets auth insert" on public.sales_targets for insert with check (auth.role() = 'authenticated');
create policy "sales_targets auth update" on public.sales_targets for update using (auth.role() = 'authenticated');
create policy "sales_targets auth delete" on public.sales_targets for delete using (auth.role() = 'authenticated');
alter publication supabase_realtime add table public.sales_targets;
```
Type: `SalesTarget { id, internal, month: string, target_amount: number, created_at, updated_at }` in `lib/types.ts`.

## Components & data

### Route + sidebar
- `app/(dashboard)/sales-report/page.tsx` renders `<SalesReport />`.
- Add `{ href: '/sales-report', label: 'Laporan Sales', icon: <ChartIcon/>, color: COLOR.purple }` to the `client` group in `components/Sidebar.tsx`. Add an access entry `client.report` → `/sales-report` in `lib/access.ts` mirroring the existing `client.crm` entry (so it's gated/configurable like its siblings).

### Targets hook — `hooks/useSalesTargets.ts`
- Loads `sales_targets` and keeps them live (focused realtime, setAuth-before-subscribe + token-gated `ensure()`, like `hooks/useFollowUps.ts`), returning `SalesTarget[]`. The page upserts targets directly via supabase (`onConflict: 'internal,month'`).

### `components/CRM/SalesReport.tsx`
Reads `clients` + `invoices` from the store and `useSalesTargets()`. Internal PICs: `['Dandi','Naufal','Reinaldi','Faizal']` (same hardcoded list used elsewhere). Current month key `ym` = `YYYY-MM`. All figures via `useMemo` over the store data so they update live. Sections:

1. **Funnel** — count of clients per stage `lead/pitch/close/invoice` (exclude `inactive`), shown as a descending bar list, plus an overall conversion = `won / total-entered` where won = stage ∈ {close,invoice}.
2. **Pipeline** — Total Pipeline = Σ `value` of open deals (stage ≠ inactive); Weighted Forecast = Σ `value × STAGE_PROBABILITY[stage]`.
3. **Win/Loss per PIC** — for each internal: won = count(stage ∈ {close,invoice}), lost = count(stage = inactive), win-rate = `won/(won+lost)`. Table.
4. **Revenue (6 months)** — for each of the last 6 month buckets, Σ `invoices.value` where `status='paid'` and `created_at`'s month = bucket. Bar list. (Attribution: paid invoice by its `created_at` month — the agreed proxy, since invoices have no separate paid date.)
5. **Target vs Realisasi (this month)** — per PIC: target = `sales_targets` row for (PIC, current month) `target_amount` (0 if none); actual = Σ `invoices.value` where `status='paid'`, `created_at` month = `ym`, and the invoice's client (`invoices.client_id → clients.internal`) = PIC. Team row = totals. Each PIC row has an inline "Set target" input (number) that upserts `sales_targets` (internal, first-of-this-month, amount) via `onConflict`.

Helper `formatRupiah` from `lib/utils`. Keep `SalesReport` split into small sub-components (`FunnelCard`, `WinLossTable`, `RevenueBars`, `TargetTable`) within the file for readability.

## Realtime, access, verification

- **Realtime:** `clients`/`invoices` already live; `sales_targets` added to the publication + the targets hook. Dashboard recomputes on any change.
- **Access:** new `client.report` gate (defaults open like other client entries until configured).
- **Verification (tsc + manual):**
  1. `/sales-report` loads; funnel counts, pipeline/forecast, win/loss per PIC match the `clients` data.
  2. Revenue bars reflect paid invoices by month; adding/paying an invoice updates the current bar live.
  3. Set a PIC's monthly target → the target-vs-actual row updates immediately; actual reflects that PIC's paid invoices this month.

## Build order (for the plan)

1. DB migration (`sales_targets`) + `SalesTarget` type.
2. `useSalesTargets` hook.
3. `SalesReport` component (funnel + pipeline + win/loss + revenue + target-vs-actual + set-target) reading store + hook.
4. Route `app/(dashboard)/sales-report/page.tsx` + sidebar item + `client.report` access entry.
