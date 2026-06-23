# CRM Sales Dashboard & Reports — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/sales-report` page with conversion funnel, pipeline + weighted forecast, win/loss per PIC, monthly revenue, and target-vs-actual per PIC + team, backed by a `sales_targets` table.

**Architecture:** All figures are memoized over the already-realtime `clients`/`invoices` store data; `sales_targets` gets a small table + a focused-realtime hook. One `SalesReport` component (split into small sub-cards) + a route + a gated sidebar entry.

**Tech Stack:** Next.js + React + TypeScript, Zustand, Supabase. No test runner.

## Global Constraints

- **No automated test framework.** Verification = `npx tsc --noEmit` clean + manual. **Never `npm run build`** while `next dev` runs; use `tsc`.
- **DB changes** committed as `schema_*.sql` + applied to Supabase (`gbmqudkkuzpqykmyrkqc`) via MCP `apply_migration`. Additive only.
- **All work local (no `git push`).** Branch `feat/crm-dashboard` (spec committed there).
- Internal PICs: `['Dandi','Naufal','Reinaldi','Faizal']`. Stage probabilities from `STAGE_PROBABILITY` (`lib/constants.ts`). Won = stage ∈ {close,invoice}; lost = inactive; open = ≠ inactive.
- Revenue attribution: invoices with `status='paid'`, bucketed by `created_at` month.

---

### Task 1: DB migration + `SalesTarget` type

**Files:** Create `schema_crm_targets.sql`; modify `lib/types.ts`; apply via MCP.

**Interfaces:** Produces table `sales_targets`; type `SalesTarget`.

- [ ] **Step 1: Write `schema_crm_targets.sql`** (verbatim from the spec's Data model SQL block).

- [ ] **Step 2: Apply** — MCP `apply_migration` `project_id: gbmqudkkuzpqykmyrkqc`, `name: crm_sales_targets`, `query:` file contents.

- [ ] **Step 3: Verify** — MCP `execute_sql`:
```sql
select count(*) as targets from public.sales_targets;
select tablename from pg_publication_tables where pubname='supabase_realtime' and tablename='sales_targets';
```
Expected: 0 targets; one publication row.

- [ ] **Step 4: `lib/types.ts`** — append:
```ts
export interface SalesTarget {
  id: string
  internal: string
  month: string          // YYYY-MM-DD (first of month)
  target_amount: number
  created_at: string
  updated_at: string
}
```

- [ ] **Step 5: Typecheck + commit**
```bash
npx tsc --noEmit
git add schema_crm_targets.sql lib/types.ts
git commit -m "feat(crm): sales_targets table + SalesTarget type"
```

---

### Task 2: `useSalesTargets` hook

**Files:** Create `hooks/useSalesTargets.ts`.

**Interfaces:** Produces `useSalesTargets(): SalesTarget[]` (live).

- [ ] **Step 1: Create `hooks/useSalesTargets.ts`** (mirror the focused-realtime shape of `hooks/useClientInteractions.ts`, but unfiltered — all targets):
```ts
'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { SalesTarget } from '@/lib/types'

let stChanSeq = 0

export function useSalesTargets(): SalesTarget[] {
  const [rows, setRows] = useState<SalesTarget[]>([])

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabase()

    supabase.from('sales_targets').select('*')
      .then(({ data }) => { if (!cancelled) setRows((data as SalesTarget[] | null) ?? []) })

    const buildChannel = () => supabase
      .channel(`sales-targets:${++stChanSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_targets' }, (payload) => {
        if (cancelled) return
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id: string }).id
          setRows(prev => prev.filter(r => r.id !== id))
        } else {
          const row = payload.new as SalesTarget
          setRows(prev => { const rest = prev.filter(r => r.id !== row.id); return [...rest, row] })
        }
      })
      .subscribe()

    let channel: ReturnType<typeof buildChannel> | null = null
    const ensure = (token: string) => {
      if (cancelled) return
      ;(supabase.realtime as unknown as { setAuth: (t: string) => void }).setAuth(token)
      if (!channel) channel = buildChannel()
    }
    supabase.auth.getSession().then(({ data }) => { if (data.session?.access_token) ensure(data.session.access_token) })
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => { if (session?.access_token) ensure(session.access_token) })

    return () => { cancelled = true; authSub.subscription.unsubscribe(); if (channel) supabase.removeChannel(channel) }
  }, [])

  return rows
}
```

- [ ] **Step 2: Typecheck + commit**
```bash
npx tsc --noEmit
git add hooks/useSalesTargets.ts
git commit -m "feat(crm): sales targets realtime hook"
```

---

### Task 3: `SalesReport` component

**Files:** Create `components/CRM/SalesReport.tsx`.

**Interfaces:** Produces `<SalesReport />`. Consumes store `clients`/`invoices`, `useSalesTargets`, `STAGE_LABELS`/`STAGE_PROBABILITY` (`lib/constants`), `formatRupiah` (`lib/utils`).

- [ ] **Step 1: Create `components/CRM/SalesReport.tsx`**
```tsx
'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'
import { STAGE_LABELS, STAGE_PROBABILITY } from '@/lib/constants'
import { formatRupiah } from '@/lib/utils'
import { useSalesTargets } from '@/hooks/useSalesTargets'

const INTERNALS = ['Dandi', 'Naufal', 'Reinaldi', 'Faizal']
const FUNNEL = ['lead', 'pitch', 'close', 'invoice']
const mk = (iso: string) => (iso || '').slice(0, 7)

export function SalesReport() {
  const t = useT()
  const { clients, invoices } = useStore(useShallow((s) => ({ clients: s.clients, invoices: s.invoices })))
  const targets = useSalesTargets()
  const now = new Date()
  const ym = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}`

  const funnel = useMemo(() => FUNNEL.map(k => ({ k, label: STAGE_LABELS[k] ?? k, n: clients.filter(c => c.stage === k).length })), [clients])
  const pipeline = useMemo(() => {
    const open = clients.filter(c => c.stage !== 'inactive')
    return {
      total: open.reduce((n, c) => n + (c.value || 0), 0),
      weighted: Math.round(open.reduce((n, c) => n + (c.value || 0) * (STAGE_PROBABILITY[c.stage] ?? 0), 0)),
    }
  }, [clients])
  const winLoss = useMemo(() => INTERNALS.map(p => {
    const mine = clients.filter(c => c.internal === p)
    const won = mine.filter(c => c.stage === 'close' || c.stage === 'invoice').length
    const lost = mine.filter(c => c.stage === 'inactive').length
    return { p, won, lost, rate: won + lost ? Math.round((won / (won + lost)) * 100) : 0 }
  }), [clients])
  const months = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`
  }), [now])
  const paid = useMemo(() => invoices.filter(inv => inv.status === 'paid'), [invoices])
  const revenue = useMemo(() => months.map(m => ({ m, total: paid.filter(inv => mk(inv.created_at) === m).reduce((n, inv) => n + (inv.value || 0), 0) })), [months, paid])
  const internalOf = useMemo(() => {
    const map = new Map(clients.map(c => [c.id, c.internal]))
    return (clientId: string | null | undefined) => (clientId ? map.get(clientId) : undefined)
  }, [clients])
  const targetTable = useMemo(() => INTERNALS.map(p => {
    const target = targets.find(tt => tt.internal === p && mk(tt.month) === ym)?.target_amount ?? 0
    const actual = paid.filter(inv => mk(inv.created_at) === ym && internalOf(inv.client_id) === p).reduce((n, inv) => n + (inv.value || 0), 0)
    return { p, target, actual }
  }), [targets, paid, internalOf, ym])

  async function setTarget(internal: string, amount: number) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (getSupabase() as any).from('sales_targets').upsert({ internal, month: `${ym}-01`, target_amount: amount }, { onConflict: 'internal,month' })
  }

  const maxRev = Math.max(1, ...revenue.map(r => r.total))
  const card: React.CSSProperties = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }
  const h: React.CSSProperties = { fontSize: 13, fontWeight: 600, marginBottom: 12 }

  return (
    <div style={{ padding: 24, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
      {/* Pipeline */}
      <div style={card}>
        <div style={h}>{t('Pipeline')}</div>
        <div style={{ display: 'flex', gap: 20 }}>
          <div><div style={{ fontSize: 11, color: 'var(--text2)' }}>{t('Total Pipeline')}</div><div style={{ fontSize: 18, fontWeight: 700 }}>{formatRupiah(pipeline.total)}</div></div>
          <div><div style={{ fontSize: 11, color: 'var(--text2)' }}>{t('Weighted Forecast')}</div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent4)' }}>{formatRupiah(pipeline.weighted)}</div></div>
        </div>
      </div>

      {/* Funnel */}
      <div style={card}>
        <div style={h}>{t('Funnel Konversi')}</div>
        {funnel.map(f => {
          const max = Math.max(1, ...funnel.map(x => x.n))
          return (
            <div key={f.k} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}><span>{f.label}</span><span>{f.n}</span></div>
              <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4 }}><div style={{ width: `${(f.n / max) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} /></div>
            </div>
          )
        })}
      </div>

      {/* Win/Loss per PIC */}
      <div style={card}>
        <div style={h}>{t('Win/Loss per PIC')}</div>
        <table style={{ width: '100%', fontSize: 12 }}>
          <thead><tr style={{ color: 'var(--text2)', textAlign: 'left' }}><th>PIC</th><th>{t('Menang')}</th><th>{t('Kalah')}</th><th>Win-rate</th></tr></thead>
          <tbody>
            {winLoss.map(w => <tr key={w.p}><td>{w.p}</td><td style={{ color: 'var(--accent3)' }}>{w.won}</td><td style={{ color: '#ff6b6b' }}>{w.lost}</td><td>{w.rate}%</td></tr>)}
          </tbody>
        </table>
      </div>

      {/* Revenue 6 months */}
      <div style={card}>
        <div style={h}>{t('Revenue 6 Bulan')} <span style={{ fontWeight: 400, color: 'var(--text2)', fontSize: 11 }}>({t('invoice lunas')})</span></div>
        {revenue.map(r => (
          <div key={r.m} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}><span>{r.m}</span><span>{formatRupiah(r.total)}</span></div>
            <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4 }}><div style={{ width: `${(r.total / maxRev) * 100}%`, height: '100%', background: 'var(--accent3)', borderRadius: 4 }} /></div>
          </div>
        ))}
      </div>

      {/* Target vs Realisasi */}
      <div style={{ ...card, gridColumn: '1 / -1' }}>
        <div style={h}>{t('Target vs Realisasi')} — {ym}</div>
        <table style={{ width: '100%', fontSize: 12 }}>
          <thead><tr style={{ color: 'var(--text2)', textAlign: 'left' }}><th>PIC</th><th>{t('Target')}</th><th>{t('Realisasi')}</th><th>%</th><th></th></tr></thead>
          <tbody>
            {targetTable.map(row => (
              <tr key={row.p}>
                <td>{row.p}</td>
                <td>{formatRupiah(row.target)}</td>
                <td>{formatRupiah(row.actual)}</td>
                <td style={{ color: row.target && row.actual >= row.target ? 'var(--accent3)' : 'var(--text2)' }}>{row.target ? Math.round((row.actual / row.target) * 100) : 0}%</td>
                <td><SetTarget current={row.target} onSet={(amt) => setTarget(row.p, amt)} t={t} /></td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700, borderTop: '1px solid var(--border)' }}>
              <td>{t('Tim')}</td>
              <td>{formatRupiah(targetTable.reduce((n, r) => n + r.target, 0))}</td>
              <td>{formatRupiah(targetTable.reduce((n, r) => n + r.actual, 0))}</td>
              <td></td><td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SetTarget({ current, onSet, t }: { current: number; onSet: (amt: number) => void; t: (s: string) => string }) {
  const [v, setV] = useState('')
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      <input type="number" value={v} onChange={e => setV(e.target.value)} placeholder={current ? String(current) : t('target')} style={{ width: 110, fontSize: 12 }} />
      <button type="button" onClick={() => { const n = parseFloat(v); if (!Number.isNaN(n)) { onSet(n); setV('') } }}
        style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg3)', cursor: 'pointer', color: 'var(--text)' }}>
        {t('Set')}
      </button>
    </span>
  )
}
```

- [ ] **Step 2: Typecheck + commit**
```bash
npx tsc --noEmit
git add components/CRM/SalesReport.tsx
git commit -m "feat(crm): sales report component (funnel, pipeline, win/loss, revenue, targets)"
```

---

### Task 4: Route + sidebar item + access entry

**Files:** Create `app/(dashboard)/sales-report/page.tsx`; modify `components/Sidebar.tsx`, `lib/access.ts`.

**Interfaces:** Consumes `SalesReport` (Task 3).

- [ ] **Step 1: Create `app/(dashboard)/sales-report/page.tsx`**
```tsx
import { PageHeader } from '@/components/shared/PageHeader'
import { SalesReport } from '@/components/CRM/SalesReport'

export default function SalesReportPage() {
  return (
    <>
      <PageHeader title="Laporan Sales" />
      <SalesReport />
    </>
  )
}
```
(Read another `app/(dashboard)/*/page.tsx` first to match the exact page-shell pattern this codebase uses — e.g. whether it uses `PageHeader`, `PageShell`, or a bare component. Mirror the closest sibling, e.g. `app/(dashboard)/clients/page.tsx`.)

- [ ] **Step 2: `lib/access.ts`** — add a `client.report` entry after the `client.invoices` line (line ~60):
```ts
  { id: 'client.report',   label: 'Laporan Sales',   group: 'Client', routes: ['/sales-report'],  landing: '/sales-report' },
```
and add `'client.report'` to the `client:` group array (line ~126): `client: ['client.leads', 'client.crm', 'client.invoices', 'client.report'],`.

- [ ] **Step 3: `components/Sidebar.tsx`** — add to the `client` group's `items` array (after the Invoice item):
```tsx
        { href: '/sales-report', label: 'Laporan Sales', icon: <ChartIcon />, color: COLOR.purple },
```
(`ChartIcon` is already defined in this file.)

- [ ] **Step 4: Typecheck + manual + commit**

`npx tsc --noEmit` clean. Manual: the "Laporan Sales" sidebar item appears under Client and opens `/sales-report`; funnel/pipeline/win-loss/revenue render from the data; set a PIC target → the target-vs-actual row updates live.
```bash
git add "app/(dashboard)/sales-report/page.tsx" components/Sidebar.tsx lib/access.ts
git commit -m "feat(crm): sales-report route + sidebar item + access entry"
```

---

## Self-Review

**Spec coverage:** `sales_targets` + type → Task 1 ✓; targets hook → Task 2 ✓; funnel/pipeline/win-loss/revenue/target-vs-actual + set-target → Task 3 ✓; route + sidebar + `client.report` gate → Task 4 ✓. Revenue = paid invoices by `created_at` month ✓. Target-vs-actual joins invoice→client→internal ✓.

**Placeholder scan:** none — full code in each step. Task 4 Step 1 says to mirror the closest sibling page shell (concrete instruction), since the exact `PageHeader`/`PageShell` choice must match the codebase.

**Type consistency:** `SalesTarget` (Task 1) consumed by `useSalesTargets` (Task 2) + `SalesReport` (Task 3). `useSalesTargets(): SalesTarget[]` consumed in Task 3. `SalesReport` consumed by the route (Task 4). Internal list, stage sets, and attribution rule consistent with the Global Constraints.
