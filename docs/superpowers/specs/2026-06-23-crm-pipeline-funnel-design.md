# CRM — Full Sales Funnel Pipeline (9 stages)

**Date:** 2026-06-23
**Status:** Approved design
**Scope:** Replace the 5-stage CRM pipeline (lead/pitch/close/invoice/inactive) with a 9-stage B2B funnel, flowing from the Database into the pipeline and ending at Client.

## Flow
`Database → Prospect → Contacted → Qualified → Discovery Meeting → Proposal Sent → Negotiation → Won → Lost → Client`

Database is the source page; promoting a contact ("Jadikan Client") creates a client at **Prospect**. Won, Lost, Client are separate columns.

## Stages (`lib/constants.ts`, `lib/types.ts`)

| key | label | color | probability |
|---|---|---|---|
| `prospect` | Prospect | #8b8fa8 | 0.10 |
| `contacted` | Contacted | #6c8fd5 | 0.20 |
| `qualified` | Qualified | #5b9bd5 | 0.35 |
| `discovery` | Discovery Meeting | #7e6bd5 | 0.50 |
| `proposal` | Proposal Sent | #a78bfa | 0.65 |
| `negotiation` | Negotiation | #ffc542 | 0.80 |
| `won` | Won | #43d9a2 | 1.00 |
| `lost` | Lost | #ff6b6b | 0.00 |
| `client` | Client | #2bb673 | 1.00 |

- `CRM_STAGES` = these 9 in order. `CRM_BOARD_STAGES` = `CRM_STAGES` (no separate `inactive`). `STAGE_LABELS` / `STAGE_PROBABILITY` updated. `ClientStage` union = the 9 keys.
- **Open pipeline** = stage ∉ {won, lost, client} (Won/Client = revenue; Lost = out).

## Behavior changes

- **Board** (`components/CRM/index.tsx`): renders 9 columns. Drag to **Lost** → required reason modal; drag to **Won** or **Client** → optional win-note modal; other stages move directly. Forecast header: Total Pipeline + Weighted Forecast over open deals (stage ∉ {won, lost, client}). Per-card overdue marker uses the same "open" predicate.
- **ClientModal stage dropdown**: map over `CRM_BOARD_STAGES` (9 options); default stage for a new client = `prospect`.
- **Lead → Client conversion** (Leads page + Database peek): prefill `stage: 'prospect'`.
- **Sales report** (`components/CRM/SalesReport.tsx`): funnel = the 9 stages in order (excluding lost), or the in-flight progression; **won** = stage ∈ {won, client}; **lost** = stage = `lost`; **open** = ∉ {won, lost, client}.
- **Database** (`components/CRM/ClientDatabase.tsx`): stage colour/label come from `CRM_STAGES`/`STAGE_LABELS` (remove the `inactive` special-case).

## Data migration (`schema_crm_funnel.sql` + applied)
```sql
update public.clients set stage = 'prospect'   where stage = 'lead';
update public.clients set stage = 'proposal'   where stage = 'pitch';
update public.clients set stage = 'won'        where stage = 'close';
update public.clients set stage = 'client'     where stage = 'invoice';
update public.clients set stage = 'lost'       where stage = 'inactive';
```
Additive (column unchanged; only values remapped). No data lost.

## Verification (tsc + manual)
1. CRM board shows the 9 columns in order; drag a card across stages persists.
2. Drag to Lost → reason required; drag to Won/Client → optional note.
3. New client (CRM "+" or lead convert) lands in Prospect.
4. Forecast header + Sales report numbers use the new stages (open excludes won/lost/client; win-rate counts won+client vs lost).
5. Existing clients migrated to the mapped stages.

## Files
- `schema_crm_funnel.sql` (migration); `lib/constants.ts`; `lib/types.ts` (`ClientStage`); `components/CRM/index.tsx` (board + moveToStage + ClientModal + forecast); `components/CRM/SalesReport.tsx`; `components/CRM/ClientDatabase.tsx`; `app/(dashboard)/website/leads/page.tsx` (prefill).
