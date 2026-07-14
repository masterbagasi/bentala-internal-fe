'use client'

import { useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Chart, registerables } from 'chart.js'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/lib/i18n/LanguageProvider'
import { formatRupiah } from '@/lib/utils'
import { type DateRange } from '@/components/Social/DateRangePicker'
import {
  DEAL_STAGES, DEAL_OPEN_STAGES, STAGE_LABEL, STAGE_COLOR, CLIENT_TIERS,
  INVOICE_STATUSES, INVOICE_STATUS_LABEL, INVOICE_STATUS_COLOR, invoiceTotals,
} from '@/lib/crm/schema'

Chart.register(...registerables)

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const LAV = '#8b7fff', MINT = '#43d9a2', TRACK = 'rgba(255,255,255,0.07)'
const SOURCE_COLORS = ['#8b7fff', '#43d9a2', '#5b9bd5', '#ffc542', '#ff6b6b', '#a78bfa', '#2bb673', '#ffa94d']
const TIER_COLORS: Record<string, string> = { UMKM: '#8b7fff', 'Small Business': '#5b9bd5', 'Mid Market': '#ffc542', Enterprise: '#43d9a2' }
const linkBtn: React.CSSProperties = { fontSize: 12.5, color: 'var(--link)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }
const fmtShort = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(1)}M` : n >= 1e6 ? `${(n / 1e6).toFixed(0)}jt` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}rb` : String(n)
const initials = (s: string) => (s.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2) || '?').toUpperCase()
const monthKey = (iso: string) => (iso || '').slice(0, 7)
// Probability weighting per open stage (for the weighted forecast).
const STAGE_PROB: Record<string, number> = { prospect: 0.1, contacted: 0.2, qualified: 0.35, discovery: 0.5, proposal: 0.65, negotiation: 0.8 }

const CSS = `
.fdash { display: flex; flex-direction: column; gap: 18px; padding: clamp(14px, 1.6vw, 24px); width: 100%; }
.fcard { background: var(--bg2); border: 1px solid var(--border); border-radius: 20px; padding: 22px; display: flex; flex-direction: column; }
.fcard-lav { background: linear-gradient(150deg, rgba(139,127,255,0.14), rgba(139,127,255,0.03) 60%), var(--bg2); }
.fcard-mint { background: linear-gradient(150deg, rgba(67,217,162,0.13), rgba(67,217,162,0.03) 60%), var(--bg2); }
.ftitle { font-size: 15px; font-weight: 700; color: var(--text); letter-spacing: -0.01em; }
.fpill { font-size: 12px; font-weight: 600; color: var(--text2); background: var(--bg3); border: 1px solid var(--border); border-radius: 20px; padding: 5px 12px; text-decoration: none; }
.frow { display: flex; align-items: center; gap: 12px; padding: 11px 0; }
.favatar { width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; font-size: 12.5px; font-weight: 700; }
.fdash-kpi { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.ftrack { flex: 1; min-width: 30px; height: 8px; background: var(--bg3); border-radius: 99px; overflow: hidden; }
.fgrid { display: grid; gap: 18px; grid-auto-flow: column; grid-template-rows: repeat(3, auto); grid-auto-columns: minmax(0, 1fr); }
@media (max-width: 1120px) { .fgrid { grid-auto-flow: row; grid-template-rows: none; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
@media (max-width: 700px) { .fgrid { grid-template-columns: 1fr; } }
`

export function CrmDashboard({ range }: { range: DateRange }) {
  const t = useT()
  const router = useRouter()
  const { contacts: allContacts, deals: allDeals, crmInvoices: allInv, crmInvoiceItems, crmProjects: allProjects } = useStore(useShallow((s) => ({
    contacts: s.contacts, deals: s.deals, crmInvoices: s.crmInvoices, crmInvoiceItems: s.crmInvoiceItems, crmProjects: s.crmProjects,
  })))
  const today = new Date().toISOString().slice(0, 10)

  const inRange = useMemo(() => {
    const { from, to } = range
    return (iso?: string | null) => { const d = (iso || '').slice(0, 10); return !!d && d >= from && d <= to }
  }, [range])
  const prev = useMemo(() => {
    const day = 86400000
    const from = new Date(range.from + 'T00:00:00'), to = new Date(range.to + 'T00:00:00')
    const len = Math.max(1, Math.round((+to - +from) / day) + 1)
    const pTo = new Date(+from - day), pFrom = new Date(+pTo - (len - 1) * day)
    const iso = (d: Date) => `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`
    const f = iso(pFrom), tt = iso(pTo)
    return (s?: string | null) => { const d = (s || '').slice(0, 10); return !!d && d >= f && d <= tt }
  }, [range])
  const growthPct = (cur: number, pr: number): number | null => (pr > 0 ? Math.round(((cur - pr) / pr) * 100) : null)

  const deals = useMemo(() => allDeals.filter((d) => inRange(d.created_at)), [allDeals, inRange])
  const invoices = useMemo(() => allInv.filter((i) => inRange(i.created_at)), [allInv, inRange])

  // Invoice total (from its items) + outstanding.
  const invTotal = useMemo(() => {
    const byInv = new Map<string, typeof crmInvoiceItems>()
    for (const it of crmInvoiceItems) { const a = byInv.get(it.invoice_id) ?? []; a.push(it); byInv.set(it.invoice_id, a) }
    return (id: string, discount: number, tax: boolean) => invoiceTotals(byInv.get(id) ?? [], discount, tax).total
  }, [crmInvoiceItems])
  const totalOf = (i: (typeof allInv)[number]) => invTotal(i.id, i.discount, i.tax_enabled)

  const openDeals = useMemo(() => deals.filter((d) => (DEAL_OPEN_STAGES as readonly string[]).includes(d.stage)), [deals])
  const pipelineValue = useMemo(() => openDeals.reduce((n, d) => n + (d.value || 0), 0), [openDeals])
  const weighted = useMemo(() => Math.round(openDeals.reduce((n, d) => n + (d.value || 0) * (STAGE_PROB[d.stage] ?? 0), 0)), [openDeals])
  const wonCount = deals.filter((d) => d.stage === 'won').length
  const lostCount = deals.filter((d) => d.stage === 'lost').length
  const winRate = wonCount + lostCount ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0

  const contactsCur = allContacts.filter((c) => inRange(c.created_at)).length
  const contactsPrev = allContacts.filter((c) => prev(c.created_at)).length
  const contactGrowth = growthPct(contactsCur, contactsPrev)
  const peluangGrowth = growthPct(deals.length, allDeals.filter((d) => prev(d.created_at)).length)
  const activeClients = allContacts.filter((c) => c.category === 'CLIENT').length

  // Deals per stage.
  const stageRows = useMemo(() => DEAL_STAGES.map((s) => {
    const rows = deals.filter((d) => d.stage === s)
    return { key: s, label: STAGE_LABEL[s], color: STAGE_COLOR[s], count: rows.length, value: rows.reduce((n, d) => n + (d.value || 0), 0) }
  }), [deals])
  const stageValueMax = Math.max(1, ...stageRows.map((s) => s.value))
  const topStages = useMemo(() => stageRows.filter((s) => s.count > 0 && (DEAL_OPEN_STAGES as readonly string[]).includes(s.key)).sort((a, b) => b.count - a.count).slice(0, 2), [stageRows])

  // Money — from crm_invoices.
  const dpValue = invoices.filter((i) => i.status === 'SEBAGIAN').reduce((n, i) => n + (i.paid_amount || 0), 0)
  const dpCount = invoices.filter((i) => i.status === 'SEBAGIAN').length
  const outstanding = invoices.filter((i) => i.status !== 'LUNAS' && i.status !== 'DRAFT').reduce((n, i) => n + Math.max(0, totalOf(i) - (i.paid_amount || 0)), 0)
  const outstandingCount = invoices.filter((i) => i.status !== 'LUNAS' && i.status !== 'DRAFT').length
  const paidValue = invoices.filter((i) => i.status === 'LUNAS').reduce((n, i) => n + totalOf(i), 0)
  const paidCount = invoices.filter((i) => i.status === 'LUNAS').length

  // Canceled projects (status BATAL) — value derived like the board: invoice
  // total if invoiced, else the linked deal's value, else the stored figure.
  const projValue = (p: (typeof allProjects)[number]) => {
    const invs = allInv.filter((i) => i.project_id === p.id)
    const invTot = invs.reduce((n, i) => n + totalOf(i), 0)
    if (invTot > 0) return invTot
    return allDeals.find((d) => d.id === p.deal_id)?.value || p.contract_value || 0
  }
  const canceledProjects = useMemo(() => allProjects.filter((p) => p.status === 'BATAL' && inRange(p.created_at)), [allProjects, inRange])
  const canceledValue = canceledProjects.reduce((n, p) => n + projValue(p), 0)
  const canceledCount = canceledProjects.length

  // Invoice status split.
  const invoiceRows = useMemo(() => INVOICE_STATUSES.map((st) => {
    const rows = invoices.filter((i) => i.status === st)
    return { key: st, label: INVOICE_STATUS_LABEL[st], color: INVOICE_STATUS_COLOR[st], count: rows.length, value: rows.reduce((n, i) => n + totalOf(i), 0) }
  }), [invoices]) // eslint-disable-line react-hooks/exhaustive-deps
  const invoiceMax = Math.max(1, invoices.length)

  // Contacts per source + per tier.
  const nameOfC = useMemo(() => new Map(allContacts.map((c) => [c.id, c] as const)), [allContacts])
  const contactsInRange = useMemo(() => allContacts.filter((c) => inRange(c.created_at)), [allContacts, inRange])
  const total = contactsInRange.length
  const pctOf = (n: number) => (total ? Math.round((n / total) * 100) : 0)
  const sourceRows = useMemo(() => {
    const g = new Map<string, number>()
    for (const c of contactsInRange) { const k = (c.source || '').trim() || t('Tanpa sumber'); g.set(k, (g.get(k) || 0) + 1) }
    return Array.from(g.entries()).map(([name, count], i) => ({ name, count, color: SOURCE_COLORS[i % SOURCE_COLORS.length] })).sort((a, b) => b.count - a.count)
  }, [contactsInRange, t])
  const tierRows = useMemo(() => CLIENT_TIERS.map((tp) => ({ key: tp, label: tp, color: TIER_COLORS[tp] ?? LAV, count: contactsInRange.filter((c) => c.client_tier === tp).length })), [contactsInRange])
  const tierTotal = Math.max(1, tierRows.reduce((n, x) => n + x.count, 0))

  // Recent deals.
  const recentDeals = useMemo(() => [...deals].sort((a, b) => ((a.updated_at || a.created_at) < (b.updated_at || b.created_at) ? 1 : -1)).slice(0, 5), [deals])

  // Overdue invoices (unpaid & past due) — the attention list.
  const overdueInv = useMemo(() => invoices.filter((i) => i.status !== 'LUNAS' && i.status !== 'DRAFT' && i.due_date && i.due_date < today), [invoices, today])

  // Months in range.
  const months = useMemo(() => {
    const start = new Date(range.from + 'T00:00:00'), end = new Date(range.to + 'T00:00:00')
    const out: { key: string; label: string }[] = []
    const d = new Date(start.getFullYear(), start.getMonth(), 1)
    while (d <= end && out.length < 24) { out.push({ key: `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`, label: MONTHS_ID[d.getMonth()] }); d.setMonth(d.getMonth() + 1) }
    return out.length ? out : [{ key: range.to.slice(0, 7), label: MONTHS_ID[new Date(range.to + 'T00:00:00').getMonth()] }]
  }, [range])
  const newPerMonth = useMemo(() => months.map((m) => ({ ...m, n: deals.filter((d) => monthKey(d.created_at) === m.key).length })), [months, deals])
  const barMax = Math.max(1, ...newPerMonth.map((m) => m.n))
  const peakIdx = newPerMonth.reduce((best, m, i, arr) => (m.n > arr[best].n ? i : best), 0)
  const revenue = useMemo(() => {
    const paid = invoices.filter((i) => i.status === 'LUNAS')
    return months.map((m) => paid.filter((i) => monthKey(i.invoice_date) === m.key).reduce((n, i) => n + totalOf(i), 0))
  }, [months, invoices]) // eslint-disable-line react-hooks/exhaustive-deps
  const revenueTotal = revenue.reduce((a, b) => a + b, 0)

  // Area chart (revenue)
  const areaRef = useRef<HTMLCanvasElement>(null)
  const areaChart = useRef<Chart | null>(null)
  useEffect(() => {
    if (!areaRef.current) return
    areaChart.current?.destroy()
    const ctx = areaRef.current.getContext('2d')
    let grad: CanvasGradient | string = 'rgba(139,127,255,0.25)'
    if (ctx) { const g = ctx.createLinearGradient(0, 0, 0, 220); g.addColorStop(0, 'rgba(139,127,255,0.35)'); g.addColorStop(1, 'rgba(139,127,255,0.02)'); grad = g }
    areaChart.current = new Chart(areaRef.current, {
      type: 'line',
      data: { labels: months.map((m) => m.label), datasets: [{ data: revenue, borderColor: LAV, backgroundColor: grad, fill: true, tension: 0.42, borderWidth: 2.5, pointRadius: revenue.map((_, i) => (i === revenue.length - 1 ? 5 : 0)), pointBackgroundColor: '#fff', pointBorderColor: LAV, pointBorderWidth: 3 }] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      options: ({ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: { parsed: { y: number } }) => ` Rp ${fmtShort(c.parsed.y)}` } } }, scales: { x: { grid: { display: false }, ticks: { color: '#8b8fa8', font: { size: 11 } }, border: { display: false } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b8fa8', font: { size: 11 }, callback: (v: number) => fmtShort(Number(v)) }, border: { display: false } } } } as any),
    })
    return () => areaChart.current?.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(revenue), JSON.stringify(months.map(m => m.label))])

  // Gauge (win rate)
  const gaugeRef = useRef<HTMLCanvasElement>(null)
  const gaugeChart = useRef<Chart | null>(null)
  const scoreColor = winRate >= 70 ? MINT : winRate >= 40 ? '#ffc542' : '#ff6b6b'
  const scoreLabel = winRate >= 70 ? t('Sangat baik') : winRate >= 40 ? t('Cukup') : t('Perlu perhatian')
  useEffect(() => {
    if (!gaugeRef.current) return
    gaugeChart.current?.destroy()
    const center = { id: 'gaugeCenter', afterDraw(chart: Chart) {
      const { ctx, chartArea } = chart; if (!chartArea) return
      const cx = (chartArea.left + chartArea.right) / 2, cy = chartArea.bottom - 6
      ctx.save(); ctx.textAlign = 'center'
      ctx.fillStyle = '#f3f4f8'; ctx.font = '800 34px Inter, system-ui, sans-serif'; ctx.fillText(`${winRate}%`, cx, cy - 4)
      ctx.fillStyle = scoreColor; ctx.font = '600 13px Inter, system-ui, sans-serif'; ctx.fillText(scoreLabel, cx, cy + 18); ctx.restore()
    } }
    gaugeChart.current = new Chart(gaugeRef.current, {
      type: 'doughnut',
      data: { datasets: [{ data: [winRate, 100 - winRate], backgroundColor: [scoreColor, TRACK], borderWidth: 0, circumference: 180, rotation: 270 }] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      options: ({ responsive: true, maintainAspectRatio: false, cutout: '76%', plugins: { legend: { display: false }, tooltip: { enabled: false } } } as any),
      plugins: [center],
    })
    return () => gaugeChart.current?.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winRate, scoreColor, scoreLabel])

  const goDeal = (d: (typeof allDeals)[number]) => router.push(d.contact_id ? `/contacts/${d.contact_id}` : '/pipeline')

  return (
    <div className="fdash">
      <style>{CSS}</style>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text3)', margin: '0 2px 10px' }}>{t('Ringkasan')}</div>
        <div className="fdash-kpi">
          <Stat label={t('Kontak')} value={String(contactsCur)} color={LAV} growth={contactGrowth} />
          <Stat label={t('Peluang Jalan')} value={String(openDeals.length)} sub={formatRupiah(pipelineValue)} color="#5b9bd5" growth={peluangGrowth} />
          <Stat label={t('Client Aktif')} value={String(activeClients)} color={MINT} />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text3)', margin: '0 2px 10px' }}>{t('Nilai')}</div>
        <div className="fdash-kpi">
          <Stat label={t('Down Payment')} value={formatRupiah(dpValue)} sub={`${dpCount} invoice`} color="#5b9bd5" />
          <Stat label={t('Kurang bayar')} value={formatRupiah(outstanding)} sub={`${outstandingCount} invoice`} color="#ffa94d" />
          <Stat label={t('Lunas')} value={formatRupiah(paidValue)} sub={`${paidCount} invoice`} color={MINT} />
          <Stat label={t('Dibatalkan')} value={formatRupiah(canceledValue)} sub={`${canceledCount} project`} color="#ff6b6b" />
        </div>
      </div>

      <div className="fcard">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <span className="ftitle">{t('Revenue')}</span>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{formatRupiah(revenueTotal)}</div>
          </div>
          <span className="fpill">{range.label}</span>
        </div>
        <div style={{ position: 'relative', height: 300 }}><canvas ref={areaRef} /></div>
      </div>

      <div className="fgrid">
        <div className="fcard fcard-lav">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>{t('Total Pipeline')}</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text3)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 8px' }}>{t('potensi')}</span>
            </span>
            <Link href="/pipeline" style={{ fontSize: 12.5, color: 'var(--link)', textDecoration: 'none', flexShrink: 0 }}>{t('Lihat Board')}</Link>
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1 }}>{formatRupiah(pipelineValue)}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 6 }}>{t('Weighted forecast')} {formatRupiah(weighted)}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '20px 0 12px' }}>{t('Stage teratas')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
            {topStages.map((s) => (
              <Link key={s.key} href="/pipeline" style={{ textDecoration: 'none', cursor: 'pointer', borderRadius: 16, padding: '14px 15px', background: `linear-gradient(140deg, ${s.color}33, ${s.color}0d)`, border: `1px solid ${s.color}33`, minHeight: 92, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>{s.label}</span>
                <span><span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{s.count}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>{s.value > 0 ? `Rp ${fmtShort(s.value)}` : t('peluang')}</span></span>
              </Link>
            ))}
          </div>
        </div>

        <div className="fcard">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="ftitle">{t('Peluang Baru')}</span><span className="fpill">{range.label}</span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 190 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 150 }}>
              {newPerMonth.map((m, i) => (
                <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {i === peakIdx && m.n > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: LAV, borderRadius: 8, padding: '2px 8px', whiteSpace: 'nowrap' }}>{m.n}</span>}
                  <div style={{ width: '100%', maxWidth: 26, height: `${Math.max(m.n > 0 ? 10 : 5, (m.n / barMax) * 100)}%`, background: i === peakIdx ? LAV : 'rgba(139,127,255,0.28)', borderRadius: 8, transition: 'height .2s' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>{newPerMonth.map((m) => <span key={m.key} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--text3)' }}>{m.label}</span>)}</div>
          </div>
        </div>

        <div className="fcard fcard-mint">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="ftitle">{t('Peluang Terbaru')}</span>
            <Link href="/pipeline" style={linkBtn}>{t('Lihat semua')}</Link>
          </div>
          {recentDeals.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text3)', padding: '10px 0' }}>{t('Belum ada peluang.')}</div> :
            recentDeals.map((d, i) => {
              const col = STAGE_COLOR[d.stage]; const won = d.stage === 'won'; const lost = d.stage === 'lost'
              const c = nameOfC.get(d.contact_id)
              return (
                <div key={d.id} onClick={() => goDeal(d)} role="button" className="frow" style={{ cursor: 'pointer', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                  <span className="favatar" style={{ background: `${col}22`, color: col }}>{initials(c?.name || d.name)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{STAGE_LABEL[d.stage]}</span>
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: won ? MINT : lost ? '#ff6b6b' : 'var(--text2)', whiteSpace: 'nowrap' }}>{d.value > 0 ? `${won ? '+' : lost ? '−' : ''}Rp ${fmtShort(d.value)}` : '—'}</span>
                </div>
              )
            })}
        </div>

        <div className="fcard">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="ftitle">{t('Win Rate')}</span><Link href="/pipeline" style={linkBtn}>{t('Detail')}</Link>
          </div>
          <div style={{ position: 'relative', height: 170, marginTop: 8 }}><canvas ref={gaugeRef} /></div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>✅ {wonCount} {t('menang')}</span>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>❌ {lostCount} {t('kalah')}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
            <Link href="/pipeline" style={{ background: LAV, color: '#fff', borderRadius: 24, padding: '9px 20px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>{t('Kelola pipeline')}</Link>
          </div>
        </div>

        <div className="fcard">
          <span className="ftitle">{t('Pipeline per Stage')}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 14 }}>
            {stageRows.map((s) => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flexShrink: 0, opacity: s.count ? 1 : 0.3 }} />
                <span style={{ width: 100, flexShrink: 0, fontSize: 12.5, color: s.count ? 'var(--text)' : 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                <span className="ftrack"><span style={{ display: 'block', height: '100%', width: `${(s.value / stageValueMax) * 100}%`, background: s.color, borderRadius: 99 }} /></span>
                <span style={{ width: 26, textAlign: 'right', fontSize: 13, fontWeight: 700, color: s.count ? s.color : 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{s.count}</span>
                <span style={{ width: 66, textAlign: 'right', fontSize: 11.5, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{s.value > 0 ? `Rp ${fmtShort(s.value)}` : '—'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="fcard">
          <span className="ftitle">{t('Client per Tier')}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
            {tierRows.map((tp) => { const p = Math.round((tp.count / tierTotal) * 100); return (
              <div key={tp.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--text)' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: tp.color }} />{tp.label}</span>
                  <span style={{ color: 'var(--text2)' }}>{tp.count} · {p}%</span>
                </div>
                <span className="ftrack" style={{ height: 7 }}><span style={{ display: 'block', height: '100%', width: `${p}%`, background: tp.color, borderRadius: 99 }} /></span>
              </div>
            )})}
          </div>
        </div>

        <div className="fcard">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span className="ftitle">{t('Invoice Jatuh Tempo')}</span><Link href="/crm/invoices" style={linkBtn}>{t('Lihat semua')}</Link>
          </div>
          {overdueInv.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text3)', padding: '10px 0' }}>{t('Tidak ada.')}</div> :
            overdueInv.slice(0, 6).map((i, idx) => {
              const c = nameOfC.get(i.contact_id ?? '')
              return (
                <div key={i.id} onClick={() => router.push(`/crm/invoices/${i.id}`)} role="button" className="frow" style={{ cursor: 'pointer', padding: '10px 0', borderTop: idx === 0 ? 'none' : '1px solid var(--border)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff6b6b', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.number} · {c?.name ?? '—'}</span>
                  <span style={{ fontSize: 11.5, color: '#ff6b6b', fontVariantNumeric: 'tabular-nums' }}>{i.due_date ? new Date(i.due_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : ''}</span>
                </div>
              )
            })}
        </div>

        <div className="fcard">
          <span className="ftitle">{t('Status Invoice')}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
            {invoiceRows.map((iv) => (
              <div key={iv.key} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: iv.color, flexShrink: 0, opacity: iv.count ? 1 : 0.3 }} />
                <span style={{ width: 82, flexShrink: 0, fontSize: 12.5, color: iv.count ? 'var(--text)' : 'var(--text3)' }}>{iv.label}</span>
                <span className="ftrack" style={{ height: 7 }}><span style={{ display: 'block', height: '100%', width: `${(iv.count / invoiceMax) * 100}%`, background: iv.color, borderRadius: 99 }} /></span>
                <span style={{ width: 22, textAlign: 'right', fontSize: 13, fontWeight: 700, color: iv.count ? iv.color : 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{iv.count}</span>
                <span style={{ width: 64, textAlign: 'right', fontSize: 11.5, color: iv.value ? 'var(--text2)' : 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{iv.value > 0 ? `Rp ${fmtShort(iv.value)}` : '—'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="fcard">
          <span className="ftitle">{t('Client per Sumber')}</span>
          {sourceRows.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text3)', padding: '10px 0' }}>{t('Belum ada client.')}</div> : (
            <div style={{ marginTop: 12 }}>
              {sourceRows.map((s, i) => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  <span className="ftrack" style={{ maxWidth: 90, height: 7 }}><span style={{ display: 'block', height: '100%', width: `${pctOf(s.count)}%`, background: s.color, borderRadius: 99 }} /></span>
                  <span style={{ width: 22, textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{s.count}</span>
                  <span style={{ width: 38, textAlign: 'right', fontSize: 11.5, color: 'var(--text2)' }}>{pctOf(s.count)}%</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0 0', marginTop: 4, borderTop: '2px solid var(--border)' }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)' }}>{t('Total')}</span>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}><strong style={{ color: 'var(--text)' }}>{total}</strong> {t('kontak')}</span>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

function Stat({ label, value, sub, color, growth }: { label: string; value: string; sub?: string; color: string; growth?: number | null }) {
  return (
    <div className="fcard" style={{ padding: 18, position: 'relative', overflow: 'hidden' }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: color }} />
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{value}</span>
        {growth != null && <span style={{ fontSize: 11.5, fontWeight: 700, color: growth >= 0 ? '#43d9a2' : '#ff6b6b' }}>{growth >= 0 ? '▲' : '▼'} {Math.abs(growth)}%</span>}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}
