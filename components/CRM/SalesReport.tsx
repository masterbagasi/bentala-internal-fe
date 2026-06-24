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
const FUNNEL = ['prospect', 'contacted', 'qualified', 'discovery', 'proposal', 'negotiation', 'won', 'client']
const WON_STAGES = ['won', 'client']
const mk = (iso: string) => (iso || '').slice(0, 7)

export function SalesReport() {
  const t = useT()
  const { clients, invoices } = useStore(useShallow((s) => ({ clients: s.clients, invoices: s.invoices })))
  const targets = useSalesTargets()
  const now = new Date()
  const ym = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}`

  const funnel = useMemo(() => FUNNEL.map(k => ({ k, label: STAGE_LABELS[k] ?? k, n: clients.filter(c => c.stage === k).length })), [clients])
  const pipeline = useMemo(() => {
    const open = clients.filter(c => !WON_STAGES.includes(c.stage) && c.stage !== 'lost')
    return {
      total: open.reduce((n, c) => n + (c.value || 0), 0),
      weighted: Math.round(open.reduce((n, c) => n + (c.value || 0) * (STAGE_PROBABILITY[c.stage] ?? 0), 0)),
    }
  }, [clients])
  const winLoss = useMemo(() => INTERNALS.map(p => {
    const mine = clients.filter(c => c.internal === p)
    const won = mine.filter(c => WON_STAGES.includes(c.stage)).length
    const lost = mine.filter(c => c.stage === 'lost').length
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
