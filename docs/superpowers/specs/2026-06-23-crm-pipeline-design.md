# CRM — Pipeline Upgrade (Sub-project 3)

**Date:** 2026-06-23
**Status:** Approved design, pending implementation
**Scope:** Turn the CRM kanban into a working sales pipeline: drag deals between stages, capture an expected close date and win/loss reason, and show a weighted forecast. Builds on Client 360 (#1) and Lead→Client (#2). Deal model stays **1 client = 1 deal**.

## Context

`components/CRM/index.tsx` (`CRMPage`) renders a kanban from `CRM_STAGES` (`lib/constants.ts`): **Lead → Pitching → Closed → Invoice**. `STAGE_LABELS` also defines `inactive: 'Inactive'`, but `inactive` is not currently a column. Cards today move via "→ Stage" buttons (`moveStage`), and every stage change is auto-logged to the interaction timeline via `logStageChange` (#1). Clients are realtime (`useRealtime.ts`). The BPI/Socmed board (`components/BPI/index.tsx` `KanbanBoard`) already implements HTML5 + long-press-touch drag-and-drop — the proven pattern to mirror.

Missing: drag-and-drop on the CRM board, a way to mark a deal lost (with reason), an expected close date, and any forecast.

## Goals

- Drag a client card between stages on the CRM board (desktop HTML5 + mobile long-press), with the existing move-buttons kept as a fallback.
- An **Inactive / Kalah** column as a drop target so deals can be marked lost.
- Capture a **`close_reason`** when a deal is dragged to Inactive (required) or to Closed/Invoice (optional win note), via a small reason modal.
- An **`expected_close`** date per client, editable in `ClientModal`, shown on the card, with an overdue marker.
- A board header showing **Total Pipeline** (Σ open-deal value) and **Weighted Forecast** (Σ value × stage probability), plus a **"Closing bulan ini"** filter.

## Non-goals

- A separate deals/opportunities entity (multi-deal per client) — out of scope by the 1-client-1-deal decision.
- Tasks/reminders (#4), dashboard/targets (#5).

## Data model

`clients` — add two columns (additive migration `schema_crm_pipeline.sql` + applied to Supabase):
```sql
alter table public.clients add column if not exists expected_close date;
alter table public.clients add column if not exists close_reason text;
```
- App `Client` type gains `expected_close?: string | null`, `close_reason?: string | null`. DB types `clients` Row gains both (`string | null`), optional in `Insert`.

## Constants

`lib/constants.ts` — add:
- An `inactive` entry available to the board as a column (label "Inactive", a muted/red color, e.g. `#8b8fa8`). Implementation: a `CRM_BOARD_STAGES` array = `CRM_STAGES` + `{ key: 'inactive', label: 'Inactive', color: '#8b8fa8' }` so the board shows five columns while other consumers of `CRM_STAGES` (filters) are unchanged.
- `STAGE_PROBABILITY: Record<string, number>` = `{ lead: 0.2, pitch: 0.5, close: 0.9, invoice: 1, inactive: 0 }` (adjustable defaults).

## Components & behavior

### Drag-and-drop on the CRM board (`components/CRM/index.tsx`)
- Mirror the BPI `KanbanBoard` DnD: each card is `draggable` (desktop) and supports a long-press touch grab (mobile); each column is a drop zone. On drop onto a different stage, run the move (below). Keep the existing "→ Stage" buttons working unchanged.
- Render the board from `CRM_BOARD_STAGES` (adds the Inactive column).

### Move + win/loss reason
- A `moveToStage(client, toStage)` flow replaces the bare `moveStage` for drops/buttons:
  - If `toStage === 'inactive'`: open the **reason modal** (required reason). On submit, update `{ stage: 'inactive', close_reason }`, optimistic `upsertClient`, log the stage change (existing `logStageChange`), and append the reason to the interaction note.
  - If `toStage === 'close'` or `'invoice'`: open the reason modal with an **optional** win note. On submit (or skip), update `{ stage: toStage, close_reason? }`.
  - Otherwise (lead/pitch): update `{ stage: toStage }` directly (no modal).
- **Reason modal** = a small new component `StageReasonModal` (reuses the shared `Modal` + a `<textarea>`): props `{ open, toStageLabel, required, onSubmit(reason), onClose }`.

### Expected close date
- `ClientModal` gains an **"Perkiraan Closing"** date field writing `expected_close`.
- The CRM card shows `expected_close` when set; if it's in the past and the deal is still open (stage not `close`/`invoice`/`inactive`), show an **overdue** marker (red), reusing the follow-up tone idea.

### Forecast header (`CRMPage`)
- Above the board: **Total Pipeline** = Σ `value` of open deals (stage ∉ {inactive}); **Weighted Forecast** = Σ `value × STAGE_PROBABILITY[stage]` over all non-inactive deals. Both recompute live (memoized) from `clients`.
- A **"Closing bulan ini"** toggle filters cards to those whose `expected_close` falls in the current month.

## Realtime, access, verification

- **Realtime:** `clients` already live — drags, reasons, and dates propagate without reload.
- **Access:** existing `client.crm` gate.
- **Verification (tsc + manual):**
  1. Drag a card between Lead/Pitching/Closed/Invoice → persists + appears live; the move-buttons still work.
  2. Drag to **Inactive** → reason modal (required) → deal moves, reason saved, stage-change logged with the reason.
  3. Drag to **Closed** → optional win-note modal → moves with/without a note.
  4. Set **Perkiraan Closing** in the modal → shows on the card; a past date on an open deal shows the overdue marker.
  5. Header **Total Pipeline** + **Weighted Forecast** match the data and update on a move; "Closing bulan ini" filters correctly.

## Build order (for the plan)

1. DB migration (`expected_close`, `close_reason`) + types.
2. Constants (`CRM_BOARD_STAGES`, `STAGE_PROBABILITY`) + `expected_close` field in `ClientModal`.
3. `StageReasonModal` + the `moveToStage` win/loss flow (buttons first, no DnD yet).
4. Drag-and-drop on the CRM board (cards draggable + columns as drop zones + Inactive column) wired to `moveToStage`.
5. Forecast header (Total Pipeline, Weighted Forecast) + "Closing bulan ini" filter + card expected_close/overdue marker.
