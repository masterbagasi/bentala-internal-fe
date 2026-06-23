# CRM Pipeline Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CRM kanban a working pipeline — drag deals between stages, an Inactive/lost column, win/loss reason capture, an expected close date with overdue marker, and a weighted forecast header.

**Architecture:** Two additive `clients` columns (`expected_close`, `close_reason`). A `moveToStage` flow routes drops/buttons through a small reason modal for lost/won. Drag-and-drop mirrors the BPI board's HTML5 + long-press pattern. A memoized header computes Total Pipeline + Weighted Forecast from `clients`.

**Tech Stack:** Next.js + React + TypeScript, Zustand, Supabase. No test runner.

## Global Constraints

- **No automated test framework.** Per-task verification = `npx tsc --noEmit` clean + manual. **Never run `npm run build`** while `next dev` runs; use `tsc`.
- **DB changes** committed as `schema_*.sql` + applied to Supabase (`gbmqudkkuzpqykmyrkqc`) via MCP `apply_migration`. Additive only.
- **All work local (no `git push`).** Branch: `feat/crm-pipeline` (spec already committed there).
- Deal model: 1 client = 1 deal. Stage keys: `lead`, `pitch`, `close`, `invoice`, `inactive`.
- Stage probabilities: `{ lead: 0.2, pitch: 0.5, close: 0.9, invoice: 1, inactive: 0 }`.
- "Open deal" = stage ∉ {`inactive`}. "Won/committed" = stage ∈ {`close`,`invoice`}.
- Reuse `logStageChange` from `lib/log-interaction.ts` (extend it with an optional reason note — backward compatible).

---

### Task 1: DB migration + types

**Files:** Create `schema_crm_pipeline.sql`; modify `lib/database.types.ts`, `lib/types.ts`; apply via MCP.

**Interfaces:** Produces `clients.expected_close` (date null), `clients.close_reason` (text null); `Client.expected_close?`, `Client.close_reason?`.

- [ ] **Step 1: Write `schema_crm_pipeline.sql`**
```sql
-- CRM pipeline: expected close date + win/loss reason on the deal (client).
alter table public.clients add column if not exists expected_close date;
alter table public.clients add column if not exists close_reason text;
```

- [ ] **Step 2: Apply** — MCP `apply_migration` `project_id: gbmqudkkuzpqykmyrkqc`, `name: crm_pipeline`, `query:` file contents.

- [ ] **Step 3: Verify** — MCP `execute_sql`:
```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='clients' and column_name in ('expected_close','close_reason');
```
Expected: two rows.

- [ ] **Step 4: `lib/database.types.ts`** — in `clients` `Row`, after `lead_id: string | null` add:
```ts
          expected_close: string | null
          close_reason: string | null
```
and extend the `clients` `Insert` Omit list + optional block:
```ts
        Insert: Omit<Database['public']['Tables']['clients']['Row'], 'id' | 'created_at' | 'updated_at' | 'source' | 'lead_id' | 'expected_close' | 'close_reason'> & {
          id?: string
          created_at?: string
          updated_at?: string
          source?: string
          lead_id?: string | null
          expected_close?: string | null
          close_reason?: string | null
        }
```

- [ ] **Step 5: `lib/types.ts`** — in `Client`, after `lead_id?: string | null` add:
```ts
  expected_close?: string | null
  close_reason?: string | null
```

- [ ] **Step 6: Typecheck + commit**
```bash
npx tsc --noEmit
git add schema_crm_pipeline.sql lib/database.types.ts lib/types.ts
git commit -m "feat(crm): clients.expected_close + close_reason for pipeline"
```

---

### Task 2: Constants + `expected_close` field in ClientModal + extend `logStageChange`

**Files:** Modify `lib/constants.ts`, `components/CRM/index.tsx` (ClientModal), `lib/log-interaction.ts`.

**Interfaces:**
- Produces: `CRM_BOARD_STAGES` (readonly `{key,label,color}[]` = CRM_STAGES + inactive), `STAGE_PROBABILITY` (`Record<string,number>`). `logStageChange(clientId, from, to, note?)`.

- [ ] **Step 1: `lib/constants.ts`** — after the `CRM_STAGES` array add:
```ts
// The board shows an extra Inactive/lost column; CRM_STAGES (used by filters) stays 4.
export const CRM_BOARD_STAGES = [
  ...CRM_STAGES,
  { key: 'inactive', label: 'Inactive', color: '#8b8fa8' },
] as const

// Weighted-forecast probability per stage (open deals only; inactive = lost = 0).
export const STAGE_PROBABILITY: Record<string, number> = {
  lead: 0.2, pitch: 0.5, close: 0.9, invoice: 1, inactive: 0,
}
```

- [ ] **Step 2: Extend `lib/log-interaction.ts`** — change the signature + summary to accept an optional note:
```ts
export async function logStageChange(clientId: string, from: string, to: string, note?: string): Promise<void> {
  if (from === to) return
  const supabase = getSupabase()
  const { data: u } = await supabase.auth.getUser()
  const meta = u.user?.user_metadata ?? {}
  const base = `Stage: ${STAGE_LABELS[from] ?? from} → ${STAGE_LABELS[to] ?? to}`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('client_interactions').insert({
    client_id: clientId,
    type: 'stage_change',
    summary: note ? `${base} — ${note}` : base,
    occurred_at: new Date().toISOString(),
    author_email: u.user?.email ?? null,
    author_name: meta.full_name ?? meta.name ?? u.user?.email?.split('@')[0] ?? null,
  })
}
```
(Existing 3-arg callers stay valid — `note` is optional.)

- [ ] **Step 3: `components/CRM/index.tsx` ClientModal — add `expected_close` to the form**

In the `ClientModal` form `useState`, add `expected_close: client?.expected_close || ''`. In the saved `data` object add `expected_close: form.expected_close || null`. After the "Nilai Deal" field, add:
```tsx
        <FG label={t('Perkiraan Closing')}>
          <input type="date" value={form.expected_close} onChange={e => setForm(f=>({...f,expected_close:e.target.value}))} />
        </FG>
```

- [ ] **Step 4: Typecheck + commit**
```bash
npx tsc --noEmit
git add lib/constants.ts lib/log-interaction.ts components/CRM/index.tsx
git commit -m "feat(crm): board stages + stage probability + expected_close field + stage-note"
```

---

### Task 3: `StageReasonModal` + `moveToStage` win/loss flow (via buttons)

**Files:** Create `components/CRM/StageReasonModal.tsx`; modify `components/CRM/index.tsx` (`CRMPage`).

**Interfaces:**
- Produces: `<StageReasonModal open toStageLabel required onSubmit(reason: string) onClose />`; `moveToStage(client: Client, toStage: string)` in `CRMPage`.
- Consumes: `upsertClient` (store), `logStageChange` (Task 2), `STAGE_LABELS`.

- [ ] **Step 1: Create `components/CRM/StageReasonModal.tsx`**
```tsx
'use client'

import { useState } from 'react'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { useT } from '@/lib/i18n/LanguageProvider'

export function StageReasonModal({ open, toStageLabel, required, onSubmit, onClose }: {
  open: boolean
  toStageLabel: string
  required: boolean
  onSubmit: (reason: string) => void
  onClose: () => void
}) {
  const t = useT()
  const [reason, setReason] = useState('')
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${t('Pindah ke')} ${toStageLabel}`}
      footer={<>
        <BtnSecondary onClick={onClose}>{t('Batal')}</BtnSecondary>
        <BtnPrimary onClick={() => { if (required && !reason.trim()) { alert(t('Alasan wajib diisi.')); return } onSubmit(reason.trim()) }}>
          {t('Simpan')}
        </BtnPrimary>
      </>}
    >
      <div>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>
          {required ? t('Alasan (wajib)') : t('Catatan (opsional)')}
        </label>
        <textarea
          rows={3}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={required ? t('Kenapa deal ini tidak jadi?') : t('Catatan kemenangan...')}
          style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
        />
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: `CRMPage` — add `upsertClient` to the selector + reason-modal state**

Add `upsertClient: s.upsertClient` to the `useStore(useShallow(...))` selector (alongside `clients`, `crmFilter`, `setCrmFilter`). Add state:
```tsx
  const [reasonReq, setReasonReq] = useState<{ client: Client; toStage: string; required: boolean } | null>(null)
```
Add imports: `import { StageReasonModal } from './StageReasonModal'` and ensure `STAGE_LABELS`, `logStageChange` (`@/lib/log-interaction`) are imported (logStageChange import was added in sub-project 1; STAGE_LABELS already imported).

- [ ] **Step 3: Add `moveToStage` + `applyStageMove`, replace the bare `moveStage`**

```tsx
  async function applyStageMove(client: Client, toStage: string, reason?: string) {
    const supabase = getSupabase()
    const updates: { stage: string; close_reason?: string | null } = { stage: toStage }
    if (reason !== undefined) updates.close_reason = reason || null
    upsertClient({ ...client, ...updates } as Client) // optimistic
    const { error } = await supabase.from('clients').update(updates).eq('id', client.id)
    if (error) { upsertClient(client); return } // rollback
    logActivity(`${client.name} dipindah ke ${STAGE_LABELS[toStage] ?? toStage}`)
    if (client.stage !== toStage) logStageChange(client.id, client.stage, toStage, reason || undefined)
  }

  function moveToStage(client: Client, toStage: string) {
    if (client.stage === toStage) return
    if (toStage === 'inactive') { setReasonReq({ client, toStage, required: true }); return }
    if (toStage === 'close' || toStage === 'invoice') { setReasonReq({ client, toStage, required: false }); return }
    void applyStageMove(client, toStage)
  }
```
Keep the old `moveStage` if still referenced, OR repoint the move buttons. In the card's move buttons, change `onClick={(e) => { e.stopPropagation(); moveStage(c.id, x.key) }}` to `onClick={(e) => { e.stopPropagation(); moveToStage(c, x.key) }}`. The move-buttons list currently iterates `CRM_STAGES.filter(x => x.key !== stage.key)`; add Inactive as an option by iterating `CRM_BOARD_STAGES.filter(x => x.key !== stage.key)` instead (import `CRM_BOARD_STAGES`).

- [ ] **Step 4: Render the modal**

Before the closing tag of `CRMPage`'s returned JSX (next to the existing `{showModal && <ClientModal .../>}`):
```tsx
      {reasonReq && (
        <StageReasonModal
          open
          toStageLabel={STAGE_LABELS[reasonReq.toStage] ?? reasonReq.toStage}
          required={reasonReq.required}
          onSubmit={(reason) => { const r = reasonReq; setReasonReq(null); void applyStageMove(r.client, r.toStage, reason) }}
          onClose={() => setReasonReq(null)}
        />
      )}
```

- [ ] **Step 5: Typecheck + manual + commit**

`npx tsc --noEmit` clean. Manual: click "→ Inactive" on a card → reason modal (required) → save → card moves, timeline shows "Stage: … → Inactive — <reason>". "→ Closed" → optional note modal.
```bash
git add components/CRM/StageReasonModal.tsx components/CRM/index.tsx
git commit -m "feat(crm): win/loss reason modal + moveToStage flow"
```

---

### Task 4: Drag-and-drop on the CRM board (+ Inactive column)

**Files:** Modify `components/CRM/index.tsx` (`CRMPage` board render).

**Interfaces:** Consumes `moveToStage` (Task 3), `CRM_BOARD_STAGES` (Task 2).

- [ ] **Step 1: Render five columns from `CRM_BOARD_STAGES`**

Change the board's `CRM_STAGES.map(stage => ...)` to `CRM_BOARD_STAGES.map(stage => ...)`. The filtered cards per column already use `filtered.filter(c => c.stage === stage.key)`; the Inactive column will now show `inactive` clients. (The top filter chips stay on `CRM_STAGES` — unchanged.)

- [ ] **Step 2: Add drag state + handlers**

In `CRMPage`, add:
```tsx
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
```
On each card `<div key={c.id} ...>` add:
```tsx
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragId(c.id) }}
                  onDragEnd={() => { setDragId(null); setOverCol(null) }}
```
On each column container `<div key={stage.key} ...>` add:
```tsx
              onDragOver={(e) => { e.preventDefault(); if (overCol !== stage.key) setOverCol(stage.key) }}
              onDrop={(e) => {
                e.preventDefault()
                const c = clients.find(x => x.id === dragId)
                setDragId(null); setOverCol(null)
                if (c && c.stage !== stage.key) moveToStage(c, stage.key)
              }}
```
And reflect the drop-hover on the column style (e.g. `border: 1px solid ${overCol === stage.key ? stage.color : 'var(--border)'}` and a faint `background`). Add `cursor: 'grab'` to the card style.

- [ ] **Step 3: Mobile long-press touch drag**

Mirror the BPI board's touch approach (see `components/BPI/index.tsx` `KanbanBoard`: a `boardRef` + `touchstart` long-press to pick up, `touchmove` with `document.elementFromPoint` + a `data-col-key` attribute on columns, `touchend` to drop). Add `data-col-key={stage.key}` to each column. Implement a `useEffect` on a board ref attaching non-passive `touchmove`/`touchend` listeners that, while a card is held (set on a 200ms long-press from the card's `onTouchStart`), find the column under the finger and call `moveToStage(heldClient, colKey)` on release. The move-buttons remain as a non-drag fallback.

- [ ] **Step 4: Typecheck + manual + commit**

`npx tsc --noEmit` clean. Manual (desktop): drag a card across columns → moves + persists; drag to Inactive → reason modal fires. Mobile: long-press a card, drag to another column, release → moves.
```bash
git add components/CRM/index.tsx
git commit -m "feat(crm): drag-and-drop on the CRM board + Inactive column"
```

---

### Task 5: Forecast header + expected_close on card + closing-this-month filter

**Files:** Modify `components/CRM/index.tsx` (`CRMPage`).

**Interfaces:** Consumes `STAGE_PROBABILITY` (Task 2), `formatRupiah` (`lib/utils`), `expected_close` (Task 1).

- [ ] **Step 1: Compute the forecast + closing filter state**

Import `STAGE_PROBABILITY` and `formatRupiah`. In `CRMPage`:
```tsx
  const [closingThisMonth, setClosingThisMonth] = useState(false)
  const ym = (() => { const d = new Date(); return `${d.getFullYear()}-${`${d.getMonth()+1}`.padStart(2,'0')}` })()
  const openDeals = clients.filter(c => c.stage !== 'inactive')
  const totalPipeline = openDeals.reduce((n, c) => n + (c.value || 0), 0)
  const weightedForecast = Math.round(openDeals.reduce((n, c) => n + (c.value || 0) * (STAGE_PROBABILITY[c.stage] ?? 0), 0))
```
Then apply the closing filter to `filtered` (the existing per-stage filter source): when `closingThisMonth`, also require `(c.expected_close || '').slice(0,7) === ym`.

- [ ] **Step 2: Render the header strip above the board**

Between the filter row and the kanban:
```tsx
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div><span style={{ fontSize: 11, color: 'var(--text2)' }}>{t('Total Pipeline')}</span><div style={{ fontSize: 16, fontWeight: 700 }}>{formatRupiah(totalPipeline)}</div></div>
        <div><span style={{ fontSize: 11, color: 'var(--text2)' }}>{t('Weighted Forecast')}</span><div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent4)' }}>{formatRupiah(weightedForecast)}</div></div>
        <button
          onClick={() => setClosingThisMonth(v => !v)}
          style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
            border: '1px solid', borderColor: closingThisMonth ? 'var(--accent)' : 'var(--border)',
            background: closingThisMonth ? 'rgba(108,99,255,0.12)' : 'var(--bg3)', color: closingThisMonth ? 'var(--accent)' : 'var(--text2)' }}
        >{t('Closing bulan ini')}</button>
      </div>
```

- [ ] **Step 3: Show `expected_close` on the card with an overdue marker**

On the card, after the value line, add:
```tsx
                  {c.expected_close && (() => {
                    const open = c.stage !== 'close' && c.stage !== 'invoice' && c.stage !== 'inactive'
                    const overdue = open && c.expected_close < new Date().toISOString().slice(0,10)
                    return (
                      <div style={{ fontSize: 11, color: overdue ? '#ff6b6b' : 'var(--text2)', marginBottom: 4 }}>
                        🎯 {new Date(c.expected_close).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}{overdue ? ` · ${t('lewat')}` : ''}
                      </div>
                    )
                  })()}
```

- [ ] **Step 4: Typecheck + manual + commit**

`npx tsc --noEmit` clean. Manual: header shows Total Pipeline + Weighted Forecast matching the data and updating on a move; "Closing bulan ini" filters cards by `expected_close`; a past expected_close on an open deal shows the red overdue marker.
```bash
git add components/CRM/index.tsx
git commit -m "feat(crm): pipeline forecast header + expected_close card marker + closing filter"
```

---

## Self-Review

**Spec coverage:** drag-and-drop → Task 4 ✓; Inactive column → Tasks 2 (const) + 4 (render) ✓; win/loss reason modal → Task 3 ✓; expected_close field + card + overdue → Tasks 2 (field) + 5 (card) ✓; weighted forecast + total + closing filter → Task 5 ✓; clients.expected_close/close_reason → Task 1 ✓; stage-change logs the reason → Task 2 (logStageChange note) + Task 3 (passes reason) ✓.

**Placeholder scan:** Task 4 Step 3 (touch DnD) references the BPI pattern rather than inlining its full ~60-line handler — the implementer reads `components/BPI/index.tsx` `KanbanBoard` for the exact mechanics; the integration points (data-col-key, long-press, moveToStage on release) are named. All other steps contain complete code.

**Type consistency:** `moveToStage(client: Client, toStage: string)` (Task 3) called from Tasks 3 (buttons) + 4 (drops). `applyStageMove(client, toStage, reason?)` consistent. `logStageChange(clientId, from, to, note?)` (Task 2) called with the reason in Task 3. `CRM_BOARD_STAGES`/`STAGE_PROBABILITY` (Task 2) consumed in Tasks 4/5. `expected_close`/`close_reason` (Task 1) used in Tasks 2/3/5.
