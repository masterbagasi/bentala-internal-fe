'use client'

import { useMemo, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Modal } from '@/components/shared/Modal'
import { ClientProfile } from './ClientProfile'
import { StageSelect } from './StageSelect'
import { Chart, registerables } from 'chart.js'
import { getSupabase } from '@/lib/supabase'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/lib/i18n/LanguageProvider'
import { CRM_STAGES, STAGE_LABELS, CLOSED_STAGES, STAGE_PROBABILITY, TEMPERATURES } from '@/lib/constants'
import { formatRupiah } from '@/lib/utils'
import { followUpTone, todayISODate } from '@/lib/follow-up'
import { type DateRange } from '@/components/Social/DateRangePicker'

Chart.register(...registerables)

const CLOSED = CLOSED_STAGES as readonly string[]
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const LAV = '#8b7fff', MINT = '#43d9a2', TRACK = 'rgba(255,255,255,0.07)'
const SOURCE_COLORS = ['#8b7fff', '#43d9a2', '#5b9bd5', '#ffc542', '#ff6b6b', '#a78bfa', '#2bb673', '#ffa94d']
const linkBtn: React.CSSProperties = { fontSize: 12.5, color: 'var(--link)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }
const fmtShort = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(1)}M` : n >= 1e6 ? `${(n / 1e6).toFixed(0)}jt` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}rb` : String(n)
const initials = (s: string) => (s.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2) || '?').toUpperCase()
const monthKey = (iso: string) => (iso || '').slice(0, 7)

const CSS = `
.fdash { display: flex; flex-direction: column; gap: 18px; padding: clamp(14px, 1.6vw, 24px); width: 100%; }
.fdash-r1 { display: grid; gap: 18px; grid-template-columns: 1.5fr 1fr 1.1fr; align-items: stretch; }
.fdash-r2 { display: grid; gap: 18px; grid-template-columns: 1.9fr 1fr; align-items: stretch; }
@media (max-width: 1120px) { .fdash-r1 { grid-template-columns: 1fr 1fr; } .fdash-r2 { grid-template-columns: 1fr; } }
@media (max-width: 700px) { .fdash-r1 { grid-template-columns: 1fr; } }
.fcard { background: var(--bg2); border: 1px solid var(--border); border-radius: 20px; padding: 22px; display: flex; flex-direction: column; }
.fcard-lav { background: linear-gradient(150deg, rgba(139,127,255,0.14), rgba(139,127,255,0.03) 60%), var(--bg2); }
.fcard-mint { background: linear-gradient(150deg, rgba(67,217,162,0.13), rgba(67,217,162,0.03) 60%), var(--bg2); }
.ftitle { font-size: 15px; font-weight: 700; color: var(--text); letter-spacing: -0.01em; }
.fpill { font-size: 12px; font-weight: 600; color: var(--text2); background: var(--bg3); border: 1px solid var(--border); border-radius: 20px; padding: 5px 12px; text-decoration: none; }
.fbtn { display: inline-flex; align-items: center; gap: 9px; height: 44px; padding: 0 18px 0 8px; border-radius: 30px; text-decoration: none; font-size: 13.5px; font-weight: 600; border: 1px solid var(--border); }
.fbtn-i { width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.frow { display: flex; align-items: center; gap: 12px; padding: 11px 0; }
.favatar { width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; font-size: 12.5px; font-weight: 700; }
.flist-row { display: flex; align-items: center; gap: 12px; padding: 10px 10px; border-radius: 12px; cursor: pointer; transition: background .12s; }
.flist-row:hover { background: var(--bg3); }
.fdash-kpi { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.fdash-r3 { display: grid; gap: 18px; grid-template-columns: 1.5fr 1fr; align-items: stretch; }
.fdash-r4 { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); align-items: stretch; }
@media (max-width: 1120px) { .fdash-r3 { grid-template-columns: 1fr; } }
.ftrack { flex: 1; min-width: 30px; height: 8px; background: var(--bg3); border-radius: 99px; overflow: hidden; }
/* Column-flow grid: cards fill down each column across 3 rows, so every column
   ends at the same bottom line (flush — no ragged void). Shorter cards stretch
   to their row height (card bg fills; no black holes). */
.fgrid { display: grid; gap: 18px; grid-auto-flow: column; grid-template-rows: repeat(3, auto); grid-auto-columns: minmax(0, 1fr); }
@media (max-width: 1120px) { .fgrid { grid-auto-flow: row; grid-template-rows: none; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
@media (max-width: 700px) { .fgrid { grid-template-columns: 1fr; } }
`

export function ClientDashboard({ range }: { range: DateRange }) {
  const t = useT()
  const { clients: allClients, invoices: allInvoices, followUps: allFollowUps, clientTasks: allTasks } = useStore(useShallow((s) => ({
    clients: s.clients, invoices: s.invoices, followUps: s.followUps, clientTasks: s.clientTasks,
  })))
  const today = todayISODate()

  // Date-range filter (from the header). Scopes clients/invoices by created date
  // and follow-ups/tasks by their date; the 6-month trend cards keep their own
  // window (they read the unfiltered base below).
  const inRange = useMemo(() => {
    const { from, to } = range
    return (iso?: string | null) => { const d = (iso || '').slice(0, 10); return !!d && d >= from && d <= to }
  }, [range])

  // Everything opens a popup instead of navigating away from the dashboard.
  const [detailId, setDetailId] = useState<string | null>(null)
  const [list, setList] = useState<{ title: string; rows: { id: string; name: string; sub: string; right?: string; rightColor?: string }[] } | null>(null)

  // Website leads (bsi_leads) — for the contacts count (Contacts = clients + leads).
  // Kept live via realtime so the Kontak KPI updates without a refresh.
  const [leads, setLeads] = useState<{ submitted_at: string | null }[]>([])
  useEffect(() => {
    const supabase = getSupabase()
    let cancelled = false
    const load = () => (supabase as unknown as { from: (t: string) => any })
      .from('bsi_leads').select('submitted_at').is('converted_client_id', null).neq('status', 'spam')
      .then(({ data }: { data: { submitted_at: string | null }[] | null }) => { if (!cancelled && data) setLeads(data) })
    load()
    let channel: ReturnType<typeof supabase.channel> | null = null
    const build = () => supabase.channel('dash-bsi-leads')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'bsi_leads' } as any, () => load())
      .subscribe()
    const ensure = (token: string) => {
      if (cancelled) return
      ;(supabase.realtime as unknown as { setAuth: (t: string) => void }).setAuth(token)
      if (!channel) channel = build()
    }
    supabase.auth.getSession().then(({ data }) => { if (data.session?.access_token) ensure(data.session.access_token) })
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => { if (session?.access_token) ensure(session.access_token) })
    return () => { cancelled = true; authSub.subscription.unsubscribe(); if (channel) supabase.removeChannel(channel) }
  }, [])

  // Previous equally-long window (for period-over-period growth).
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

  const visibleClients = useMemo(() => allClients.filter((c) => !c.pipeline_hidden), [allClients])
  const clients = useMemo(() => visibleClients.filter((c) => inRange(c.created_at)), [visibleClients, inRange])
  const invoices = useMemo(() => allInvoices.filter((i) => inRange(i.created_at)), [allInvoices, inRange])
  const followUps = useMemo(() => allFollowUps.filter((f) => inRange(f.next_follow_up)), [allFollowUps, inRange])
  const clientTasks = useMemo(() => allTasks.filter((x) => inRange(x.due_date)), [allTasks, inRange])

  const openDeals = useMemo(() => clients.filter((c) => !CLOSED.includes(c.stage)), [clients])
  const pipelineValue = useMemo(() => openDeals.reduce((n, c) => n + (c.value || 0), 0), [openDeals])
  const weighted = useMemo(() => Math.round(openDeals.reduce((n, c) => n + (c.value || 0) * (STAGE_PROBABILITY[c.stage] ?? 0), 0)), [openDeals])
  const activeClients = clients.filter((c) => c.stage === 'client').length
  const wonCount = clients.filter((c) => c.stage === 'won' || c.stage === 'client').length
  const lostCount = clients.filter((c) => c.stage === 'lost').length

  // Contacts = every client (incl. those hidden from the board) + website leads,
  // matching the Contacts tab; with period-over-period growth.
  const leadsInRange = leads.filter((l) => inRange(l.submitted_at)).length
  const contactsCur = allClients.filter((c) => inRange(c.created_at)).length + leadsInRange
  const contactsPrev = allClients.filter((c) => prev(c.created_at)).length + leads.filter((l) => prev(l.submitted_at)).length
  const contactGrowth = growthPct(contactsCur, contactsPrev)
  const peluangGrowth = growthPct(clients.length, visibleClients.filter((c) => prev(c.created_at)).length)
  const winRate = wonCount + lostCount ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0
  const overdueCount = (() => {
    // Count each client at most once for overdue follow-ups (no double), plus overdue tasks.
    const seen = new Set<string>()
    const fu = followUps.filter((f) => followUpTone(f.next_follow_up, today) === 'overdue' && !seen.has(f.client_id) && (seen.add(f.client_id), true)).length
    return fu + clientTasks.filter((x) => x.due_date && x.due_date < today).length
  })()

  const total = clients.length
  const pctOf = (n: number) => (total ? Math.round((n / total) * 100) : 0)
  const nameOf = useMemo(() => { const m = new Map(allClients.map((c) => [c.id, c.name])); return (id: string) => m.get(id) || t('Client') }, [allClients, t])

  // Clients per stage (count + value).
  const stageRows = useMemo(() => CRM_STAGES.map((s) => {
    const rows = clients.filter((c) => c.stage === s.key)
    return { key: s.key, label: s.label, color: s.color, count: rows.length, value: rows.reduce((n, c) => n + (c.value || 0), 0) }
  }), [clients])
  const stageValueMax = Math.max(1, ...stageRows.map((s) => s.value))

  // Deal temperature among open deals.
  const tempRows = useMemo(() => TEMPERATURES.map((tp) => ({ ...tp, count: openDeals.filter((c) => c.temperature === tp.key).length })), [openDeals])
  const tempTotal = Math.max(1, tempRows.reduce((n, x) => n + x.count, 0))

  // Invoice status split.
  const INVOICE_META = { paid: { label: t('Lunas'), color: MINT }, dp: { label: t('DP'), color: '#5b9bd5' }, pending: { label: t('Pending'), color: '#ffc542' }, overdue: { label: t('Overdue'), color: '#ff6b6b' } } as const
  const invoiceRows = useMemo(() => (['paid', 'dp', 'pending', 'overdue'] as const).map((st) => {
    const rows = invoices.filter((i) => i.status === st)
    return { key: st, ...INVOICE_META[st], count: rows.length, value: rows.reduce((n, i) => n + (i.value || 0), 0) }
  }), [invoices])
  const invoiceMax = Math.max(1, invoices.length)

  // Money summary — Potensi (pipeline) → Kurang bayar → Down Payment → Lunas.
  const invBy = (k: string) => invoiceRows.find((r) => r.key === k) ?? { count: 0, value: 0 }
  const dpInv = invBy('dp'), paidInv = invBy('paid')
  const kurangValue = invBy('pending').value + invBy('overdue').value
  const kurangCount = invBy('pending').count + invBy('overdue').count

  // Soonest follow-ups.
  // One follow-up per client (the soonest) so the same client never repeats.
  const followUpsUniq = useMemo(() => {
    const seen = new Set<string>()
    return [...followUps]
      .sort((a, b) => (a.next_follow_up < b.next_follow_up ? -1 : 1))
      .filter((f) => (seen.has(f.client_id) ? false : (seen.add(f.client_id), true)))
  }, [followUps])
  const dueFollowUps = useMemo(() => followUpsUniq
    .slice(0, 6)
    .map((f) => ({ f, tone: followUpTone(f.next_follow_up, today), name: nameOf(f.client_id) })), [followUpsUniq, today, nameOf])

  // Clients per lead source.
  const sourceRows = useMemo(() => {
    const groups = new Map<string, number>()
    for (const c of clients) { const key = (c.source || '').trim() || t('Tanpa sumber'); groups.set(key, (groups.get(key) || 0) + 1) }
    return Array.from(groups.entries()).map(([name, count], i) => ({ name, count, color: SOURCE_COLORS[i % SOURCE_COLORS.length] })).sort((a, b) => b.count - a.count)
  }, [clients, t])

  // Two biggest stages by count → the "My cards" tiles.
  const topStages = useMemo(() => CRM_STAGES
    .map((s) => ({ ...s, count: clients.filter((c) => c.stage === s.key).length, value: clients.filter((c) => c.stage === s.key).reduce((n, c) => n + (c.value || 0), 0) }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 2), [clients])

  // Recent deals → the "Transactions" list.
  const recentDeals = useMemo(() => [...clients]
    .sort((a, b) => ((a.updated_at || a.created_at) < (b.updated_at || b.created_at) ? 1 : -1))
    .slice(0, 5), [clients])

  // Last 6 months window.
  // Months spanning the selected date range — the trend charts follow the filter.
  const months = useMemo(() => {
    const start = new Date(range.from + 'T00:00:00')
    const end = new Date(range.to + 'T00:00:00')
    const out: { key: string; label: string }[] = []
    const d = new Date(start.getFullYear(), start.getMonth(), 1)
    while (d <= end && out.length < 24) {
      out.push({ key: `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`, label: MONTHS_ID[d.getMonth()] })
      d.setMonth(d.getMonth() + 1)
    }
    return out.length ? out : [{ key: range.to.slice(0, 7), label: MONTHS_ID[new Date(range.to + 'T00:00:00').getMonth()] }]
  }, [range])

  // New deals per month → the "Spending" bar chart.
  const newPerMonth = useMemo(() => months.map((m) => ({ ...m, n: clients.filter((c) => monthKey(c.created_at) === m.key).length })), [months, clients])
  const barMax = Math.max(1, ...newPerMonth.map((m) => m.n))
  const peakIdx = newPerMonth.reduce((best, m, i, arr) => (m.n > arr[best].n ? i : best), 0)

  // Paid revenue per month → the "Expenses" area chart.
  const revenue = useMemo(() => {
    const paid = invoices.filter((i) => i.status === 'paid')
    return months.map((m) => paid.filter((i) => monthKey(i.created_at) === m.key).reduce((n, i) => n + (i.value || 0), 0))
  }, [months, invoices])
  const revenueTotal = revenue.reduce((a, b) => a + b, 0)

  // ── Area chart (revenue) ──
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

  // ── Gauge (win rate) ──
  const gaugeRef = useRef<HTMLCanvasElement>(null)
  const gaugeChart = useRef<Chart | null>(null)
  const scoreColor = winRate >= 70 ? MINT : winRate >= 40 ? '#ffc542' : '#ff6b6b'
  const scoreLabel = winRate >= 70 ? t('Sangat baik') : winRate >= 40 ? t('Cukup') : t('Perlu perhatian')
  useEffect(() => {
    if (!gaugeRef.current) return
    gaugeChart.current?.destroy()
    const center = {
      id: 'gaugeCenter',
      afterDraw(chart: Chart) {
        const { ctx, chartArea } = chart
        if (!chartArea) return
        const cx = (chartArea.left + chartArea.right) / 2
        const cy = chartArea.bottom - 6
        ctx.save(); ctx.textAlign = 'center'
        ctx.fillStyle = '#f3f4f8'; ctx.font = '800 34px Inter, system-ui, sans-serif'
        ctx.fillText(`${winRate}%`, cx, cy - 4)
        ctx.fillStyle = scoreColor; ctx.font = '600 13px Inter, system-ui, sans-serif'
        ctx.fillText(scoreLabel, cx, cy + 18)
        ctx.restore()
      },
    }
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

  return (
    <div className="fdash">
      <style>{CSS}</style>

      {/* KPI strip */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text3)', margin: '0 2px 10px' }}>{t('Ringkasan')}</div>
        <div className="fdash-kpi">
          <Stat label={t('Kontak')} value={String(contactsCur)} color={LAV} growth={contactGrowth} />
          <Stat label={t('Peluang Jalan')} value={String(openDeals.length)} sub={formatRupiah(pipelineValue)} color="#5b9bd5" growth={peluangGrowth} />
          <Stat label={t('Client Aktif')} value={String(activeClients)} color={MINT} />
        </div>
      </div>

      {/* Money summary — Down Payment · Kurang bayar · Lunas */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text3)', margin: '0 2px 10px' }}>{t('Nilai')}</div>
        <div className="fdash-kpi">
          <Stat label={t('Down Payment')} value={formatRupiah(dpInv.value)} sub={`${dpInv.count} invoice`} color="#5b9bd5" />
          <Stat label={t('Kurang bayar')} value={formatRupiah(kurangValue)} sub={`${kurangCount} invoice`} color="#ffa94d" />
          <Stat label={t('Lunas')} value={formatRupiah(paidInv.value)} sub={`${paidInv.count} invoice`} color={MINT} />
        </div>
      </div>

      {/* Revenue — full-width hero chart on top */}
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

      {/* Content cards — column-flow grid; every column ends flush (no bottom void) */}
      <div className="fgrid">
        {/* Hero — total pipeline */}
        <div className="fcard fcard-lav">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>{t('Total Pipeline')}</span>
              <span title={t('Nilai peluang yang masih berjalan — proyeksi, belum tentu masuk')} style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text3)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 8px' }}>{t('potensi')}</span>
            </span>
            <Link href="/clients" style={{ fontSize: 12.5, color: 'var(--link)', textDecoration: 'none', flexShrink: 0 }}>{t('Lihat Board')}</Link>
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1 }}>
            {formatRupiah(pipelineValue)}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 6 }}>{t('Weighted forecast')} {formatRupiah(weighted)}</div>

          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '20px 0 12px' }}>{t('Stage teratas')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
            {topStages.map((s) => (
              <div key={s.key} role="button" onClick={() => setList({ title: s.label, rows: clients.filter((c) => c.stage === s.key).map((c) => ({ id: c.id, name: c.name, sub: STAGE_LABELS[c.stage] ?? c.stage, right: c.value > 0 ? `Rp ${fmtShort(c.value)}` : '', rightColor: 'var(--accent4)' })) })} style={{ cursor: 'pointer', borderRadius: 16, padding: '14px 15px', background: `linear-gradient(140deg, ${s.color}33, ${s.color}0d)`, border: `1px solid ${s.color}33`, minHeight: 92, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>{s.label}</span>
                <span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{s.count}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>{s.value > 0 ? `Rp ${fmtShort(s.value)}` : t('peluang')}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Spending → new deals per month */}
        <div className="fcard">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="ftitle">{t('Peluang Baru')}</span>
            <span className="fpill">{range.label}</span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 190 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 150 }}>
              {newPerMonth.map((m, i) => (
                <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {i === peakIdx && m.n > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: LAV, borderRadius: 8, padding: '2px 8px', whiteSpace: 'nowrap' }}>{m.n}</span>
                  )}
                  <div style={{ width: '100%', maxWidth: 26, height: `${Math.max(m.n > 0 ? 10 : 5, (m.n / barMax) * 100)}%`, background: i === peakIdx ? LAV : 'rgba(139,127,255,0.28)', borderRadius: 8, transition: 'height .2s' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              {newPerMonth.map((m) => <span key={m.key} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--text3)' }}>{m.label}</span>)}
            </div>
          </div>
        </div>

        {/* Transactions → recent deals */}
        <div className="fcard fcard-mint">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="ftitle">{t('Peluang Terbaru')}</span>
            <button onClick={() => setList({ title: t('Semua Peluang'), rows: [...clients].sort((a, b) => ((a.updated_at || a.created_at) < (b.updated_at || b.created_at) ? 1 : -1)).map((c) => ({ id: c.id, name: c.name, sub: STAGE_LABELS[c.stage] ?? c.stage, right: c.value > 0 ? `Rp ${fmtShort(c.value)}` : '', rightColor: 'var(--accent4)' })) })} style={linkBtn}>{t('Lihat semua')}</button>
          </div>
          {recentDeals.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text3)', padding: '10px 0' }}>{t('Belum ada peluang.')}</div>
          ) : recentDeals.map((c, i) => {
            const st = CRM_STAGES.find((s) => s.key === c.stage)
            const won = c.stage === 'won' || c.stage === 'client'
            const lost = c.stage === 'lost'
            return (
              <div key={c.id} onClick={() => setDetailId(c.id)} role="button" className="frow" style={{ cursor: 'pointer', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <span className="favatar" style={{ background: `${st?.color ?? '#8b8fa8'}22`, color: st?.color ?? '#8b8fa8' }}>{initials(c.name)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{STAGE_LABELS[c.stage] ?? c.stage}</span>
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: won ? MINT : lost ? '#ff6b6b' : 'var(--text2)', whiteSpace: 'nowrap' }}>
                  {c.value > 0 ? `${won ? '+' : lost ? '−' : ''}Rp ${fmtShort(c.value)}` : '—'}
                </span>
              </div>
            )
          })}
        </div>

        {/* Credit score → win rate gauge */}
        <div className="fcard">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="ftitle">{t('Win Rate')}</span>
            <button onClick={() => setList({ title: t('Menang / Kalah'), rows: clients.filter((c) => ['won', 'client', 'lost'].includes(c.stage)).map((c) => ({ id: c.id, name: c.name, sub: STAGE_LABELS[c.stage] ?? c.stage, right: c.stage === 'lost' ? t('Kalah') : t('Menang'), rightColor: c.stage === 'lost' ? '#ff6b6b' : MINT })) })} style={linkBtn}>{t('Detail')}</button>
          </div>
          <div style={{ position: 'relative', height: 170, marginTop: 8 }}><canvas ref={gaugeRef} /></div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>✅ {wonCount} {t('menang')}</span>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>❌ {lostCount} {t('kalah')}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
            <Link href="/clients" style={{ background: LAV, color: '#fff', borderRadius: 24, padding: '9px 20px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>{t('Kelola pipeline')}</Link>
          </div>
        </div>
        {/* Pipeline per stage */}
        <div className="fcard">
          <span className="ftitle">{t('Pipeline per Stage')}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 14 }}>
            {stageRows.map((s) => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flexShrink: 0, opacity: s.count ? 1 : 0.3 }} />
                <span style={{ width: 120, flexShrink: 0, fontSize: 12.5, color: s.count ? 'var(--text)' : 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                <span className="ftrack"><span style={{ display: 'block', height: '100%', width: `${(s.value / stageValueMax) * 100}%`, background: s.color, borderRadius: 99 }} /></span>
                <span style={{ width: 26, textAlign: 'right', fontSize: 13, fontWeight: 700, color: s.count ? s.color : 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{s.count}</span>
                <span style={{ width: 66, textAlign: 'right', fontSize: 11.5, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{s.value > 0 ? `Rp ${fmtShort(s.value)}` : '—'}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="fcard">
          <span className="ftitle">{t('Temperatur Peluang')}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
            {tempRows.map((tp) => { const p = Math.round((tp.count / tempTotal) * 100); return (
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

        {/* Perlu Follow-up */}
        <div className="fcard">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span className="ftitle">{t('Perlu Follow-up')}</span>
            <button onClick={() => setList({ title: t('Semua Follow-up'), rows: followUpsUniq.map((f) => ({ id: f.client_id, name: nameOf(f.client_id), sub: new Date(f.next_follow_up).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }), right: '', rightColor: followUpTone(f.next_follow_up, today) === 'overdue' ? '#ff6b6b' : 'var(--text3)' })) })} style={linkBtn}>{t('Lihat semua')}</button>
          </div>
          {dueFollowUps.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text3)', padding: '10px 0' }}>{t('Tidak ada.')}</div> :
            dueFollowUps.map(({ f, tone, name }, i) => {
              const col = tone === 'overdue' ? '#ff6b6b' : tone === 'due' ? '#ffc542' : 'var(--text2)'
              return (
                <div key={f.id} onClick={() => setDetailId(f.client_id)} role="button" className="frow" style={{ cursor: 'pointer', padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <span style={{ fontSize: 11.5, color: col, fontVariantNumeric: 'tabular-nums' }}>{new Date(f.next_follow_up).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
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
                <span style={{ width: 70, flexShrink: 0, fontSize: 12.5, color: iv.count ? 'var(--text)' : 'var(--text3)' }}>{iv.label}</span>
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
                <span style={{ fontSize: 13, color: 'var(--text2)' }}><strong style={{ color: 'var(--text)' }}>{total}</strong> {t('peluang')}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Attention strip */}
      {overdueCount > 0 && (
        <div role="button" onClick={() => setList({ title: t('Perlu ditindak'), rows: followUpsUniq.filter((f) => followUpTone(f.next_follow_up, today) === 'overdue').map((f) => ({ id: f.client_id, name: nameOf(f.client_id), sub: new Date(f.next_follow_up).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }), right: t('Terlambat'), rightColor: '#ff6b6b' })) })} className="fcard" style={{ cursor: 'pointer', flexDirection: 'row', alignItems: 'center', gap: 12, padding: '14px 20px', borderColor: 'rgba(255,107,107,0.4)', background: 'rgba(255,107,107,0.07)' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff6b6b', flexShrink: 0 }} />
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{overdueCount} {t('follow-up & task lewat tempo')}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--link)' }}>{t('Tindak lanjuti')} →</span>
        </div>
      )}

      {/* Popups — details open here instead of navigating away */}
      {list && (
        <Modal open onClose={() => setList(null)} title={list.title} maxWidth={460}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 8px 10px' }}>
            {list.rows.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '36px 0', color: 'var(--text3)' }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}><path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4" /><path d="m9 17 3 4 3-4" /></svg>
                <span style={{ fontSize: 13 }}>{t('Belum ada data')}</span>
              </div>
            ) : list.rows.map((r, i) => (
              <div key={`${r.id}-${i}`} role="button" onClick={() => setDetailId(r.id)} className="flist-row">
                <span className="favatar" style={{ background: 'rgba(139,127,255,0.16)', color: LAV }}>{initials(r.name)}</span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{r.sub}</span>
                </span>
                {r.right && <span style={{ fontSize: 12, fontWeight: 700, color: r.rightColor ?? 'var(--text2)', whiteSpace: 'nowrap' }}>{r.right}</span>}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text3)', flexShrink: 0 }}><polyline points="9 18 15 12 9 6" /></svg>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {detailId && (
        <Modal open onClose={() => setDetailId(null)} title={t('Detail Client')} maxWidth={1040} className="h-[88vh]"
          headerRight={(() => { const dc = allClients.find((c) => c.id === detailId); return dc ? <StageSelect client={dc} /> : null })()}>
          <ClientProfile id={detailId} onClose={() => setDetailId(null)} />
        </Modal>
      )}
    </div>
  )
}

// Small KPI tile with a coloured left rail.
function Stat({ label, value, sub, color, growth }: { label: string; value: string; sub?: string; color: string; growth?: number | null }) {
  return (
    <div className="fcard" style={{ padding: 18, position: 'relative', overflow: 'hidden' }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: color }} />
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{value}</span>
        {growth != null && (
          <span title="vs periode sebelumnya" style={{ fontSize: 11.5, fontWeight: 700, color: growth >= 0 ? '#43d9a2' : '#ff6b6b' }}>
            {growth >= 0 ? '▲' : '▼'} {Math.abs(growth)}%
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}
