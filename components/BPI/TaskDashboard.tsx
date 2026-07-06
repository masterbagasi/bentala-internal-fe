'use client'

import { useMemo, useEffect, useRef } from 'react'
import { Chart, registerables } from 'chart.js'
import { useT } from '@/lib/i18n/LanguageProvider'
import { WS_STATUS_COLS } from '@/lib/constants'
import type { Post } from '@/lib/types'
import { isAccountTask, mineColKey } from './index'
import { useSocmedProjects } from '@/lib/socmed-projects'
import { projectGlyph } from '@/lib/project-glyph'
import { AccountAvatar } from '@/components/shared/AccountAvatar'
import { useThemeTick } from '@/hooks/useThemeTick'

Chart.register(...registerables)

type Acct = { email: string; name: string; avatarUrl?: string | null }

// Short column headers for the per-account table (the full labels are too wide
// for the narrow count columns).
const SHORT: Record<string, string> = {
  brief: 'To Do', produksi: 'Prod', review: 'Review', revisi: 'Revisi', done: 'Done',
}

function tally(posts: Post[]) {
  const counts: Record<string, number> = { brief: 0, produksi: 0, review: 0, revisi: 0, done: 0 }
  for (const p of posts) {
    const col = mineColKey(p)
    if (col in counts) counts[col] += 1
  }
  // Reconcile the KPI strip with the status breakdown, the same way the All
  // Project dashboard does: In progress = every active (non-done) worksheet
  // status, and Total = In progress + Done — so the tiles, donut and breakdown
  // always agree (Total = To Do List + Production + Review + Revisi + Done).
  const done = counts.done
  const open = counts.brief + counts.produksi + counts.review + counts.revisi
  const total = open + done
  return { counts, total, done, open }
}

// Shared styling for every metric tile — a top colour rail (::after) and, when
// the value is non-zero, a soft wash glowing down from that rail so each card
// carries a quiet colour identity instead of reading as an empty box. Hover
// lifts the card and warms its border toward the accent. Driven by a single
// --c custom property the tile sets per metric.
const TILE_CSS = `
.dt { position: relative; background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; transition: border-color .16s ease, transform .16s ease; }
.dt:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--c) 45%, var(--border)); }
.dt-accent::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--c); }
.dt-live { background: linear-gradient(180deg, color-mix(in srgb, var(--c) 11%, var(--bg2)) 0%, var(--bg2) 56%); }
@media (prefers-reduced-motion: reduce) { .dt { transition: none; } .dt:hover { transform: none; } }

/* KPI strip — fixed columns so the four headline tiles fill the row edge-to-edge
   and reflow cleanly (4 → 2 → 1) instead of orphaning one card. */
.dt-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 1100px) { .dt-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 520px) { .dt-kpis { grid-template-columns: 1fr; } }

/* KPI card — label top-left, big coloured number below, % beside it, top rail.
   Matches the All Project (Analytics) dashboard exactly so the two read alike. */
.an-kpi { position: relative; overflow: hidden; background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; padding: 16px 16px; transition: border-color .14s, transform .14s; }
.an-kpi:hover { border-color: color-mix(in srgb, var(--c) 55%, var(--border)); transform: translateY(-1px); }
.an-kpi-accent { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--c); opacity: .9; }
.an-kpi-label { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text3); margin-bottom: 10px; }
.an-kpi-row { display: flex; align-items: baseline; gap: 8px; }
.an-kpi-value { font-size: 32px; font-weight: 800; line-height: 1; letter-spacing: -0.02em; color: var(--c); font-variant-numeric: tabular-nums; }
.an-kpi-sub { font-size: 11.5px; font-weight: 600; color: var(--text3); font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { .an-kpi { transition: none; } .an-kpi:hover { transform: none; } }

/* Analytics-style cards (donut + breakdown), shared with the Projects summary look */
/* Stack the donut + breakdown at the same width the KPIs drop to 2-up (1100px),
   so the breakdown always has full width to render its bars + percentages. */
.an-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: stretch; }
@media (max-width: 1100px) { .an-grid2 { grid-template-columns: 1fr; } }
.an-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 14px; padding: 18px 18px 20px; }
.an-track { flex: 1; min-width: 0; height: 7px; background: var(--bg3); border-radius: 99px; overflow: hidden; }

/* Task Source project cards */
.src-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 14px; padding: 16px 16px 15px; }
.src-head { display: flex; align-items: center; gap: 10px; margin-bottom: 13px; }
.src-glyph { width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; color: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,.22), inset 0 -1px 0 rgba(0,0,0,.2); }
.src-name { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 700; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.src-total { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
.src-cap { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--text3); }
.src-bar { display: flex; gap: 2px; height: 8px; border-radius: 6px; overflow: hidden; background: var(--bg3); margin-bottom: 13px; }
.src-grid { display: flex; flex-direction: column; gap: 8px; }
.src-stat { display: flex; align-items: center; gap: 8px; }
`

export function TaskDashboard({ posts, allPosts, accounts, projects, onAccountClick }: { posts: Post[]; allPosts?: Post[]; accounts?: Acct[]; projects?: { slug: string; name: string }[]; onAccountClick?: (a: Acct) => void }) {
  const t = useT()
  const agg = useMemo(() => tally(posts), [posts])

  // Status distribution — a donut with the total in its core, plus a counted
  // breakdown, mirroring the Projects summary so the dashboard isn't flat.
  const pct = (n: number) => (agg.total ? Math.round((n / agg.total) * 100) : 0)
  const statusRows = WS_STATUS_COLS.map(c => ({ key: c.key, label: c.label, color: c.color, count: agg.counts[c.key] ?? 0 }))
  const chartRef = useRef<HTMLCanvasElement>(null)
  const chartInstance = useRef<Chart | null>(null)
  const themeTick = useThemeTick() // re-render the donut when the theme flips
  useEffect(() => {
    if (!chartRef.current || agg.total === 0) return
    if (chartInstance.current) chartInstance.current.destroy()
    // Theme-aware canvas colours (LIGHT only; dark values kept exactly as before).
    const cs = getComputedStyle(document.documentElement)
    const isLight = document.documentElement.getAttribute('data-theme') === 'light'
    const centerColor = isLight ? (cs.getPropertyValue('--text').trim() || '#1A1D23') : '#f3f4f8'
    const centerSub = isLight ? (cs.getPropertyValue('--text3').trim() || '#9AA3B2') : '#8b8fa8'
    const segBorder = isLight ? (cs.getPropertyValue('--border').trim() || '#E7EAEE') : 'rgba(0,0,0,0)'
    const segBorderWidth = isLight ? 2 : 0
    const shown = statusRows.filter(r => r.count > 0)
    const centerText = {
      id: 'teamCenterText',
      afterDraw(chart: Chart) {
        const { ctx, chartArea } = chart
        if (!chartArea) return
        const cx = (chartArea.left + chartArea.right) / 2
        const cy = (chartArea.top + chartArea.bottom) / 2
        ctx.save()
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillStyle = centerColor; ctx.font = '700 30px Inter, system-ui, sans-serif'
        ctx.fillText(String(agg.total), cx, cy - 6)
        ctx.fillStyle = centerSub; ctx.font = '600 11px Inter, system-ui, sans-serif'
        ctx.fillText('TASK', cx, cy + 16)
        ctx.restore()
      },
    }
    chartInstance.current = new Chart(chartRef.current, {
      type: 'doughnut',
      data: {
        labels: shown.map(r => r.label),
        datasets: [{ data: shown.map(r => r.count), backgroundColor: shown.map(r => r.color), borderColor: segBorder, borderWidth: segBorderWidth, spacing: 2, borderRadius: 4 }],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      options: ({ responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: { label?: string; parsed: number }) => ` ${c.label}: ${c.parsed} (${pct(c.parsed)}%)` } } } } as any),
      plugins: [centerText],
    })
    return () => { chartInstance.current?.destroy() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(statusRows), agg.total, themeTick])

  // Task source: how many of the tasks come from each project (Master Bagasi,
  // Bagasian, …) vs Personal. Columns are built from the live projects list, so
  // a new project shows up automatically once it has tasks.
  const sourceKey = (p: Post) => (p.entity === 'personal' ? 'personal' : (p.entity || 'other'))
  // Sources the account has EVER had a task in (ever tagged). Derived from the
  // unfiltered task set so a source doesn't vanish just because the date range
  // is empty — but a source that was never tagged is dropped entirely.
  const activeKeys = useMemo(() => new Set((allPosts ?? posts).map(sourceKey)), [allPosts, posts])
  const sourceCols = useMemo(() => {
    if (!projects) return null
    const known: { key: string; name: string }[] = [
      { key: 'personal', name: t('Personal') },
      ...projects.map(p => ({ key: p.slug, name: p.name })),
    ]
    const seen = new Set(known.map(k => k.key))
    for (const k of Array.from(activeKeys)) if (!seen.has(k)) known.push({ key: k, name: k === 'other' ? t('Other') : k })
    return known.filter(c => activeKeys.has(c.key))
  }, [projects, activeKeys, t])

  // One combined row per account: status counts (by WS column) AND source counts
  // (by project), so the overview is a single complete table.
  const rows = useMemo(() => {
    if (!accounts) return null
    return accounts
      .map(a => {
        const mine = posts.filter(p => isAccountTask(p, a))
        const status: Record<string, number> = { brief: 0, produksi: 0, review: 0, revisi: 0, done: 0 }
        const source: Record<string, number> = {}
        for (const p of mine) {
          const sc = mineColKey(p); if (sc in status) status[sc] += 1
          const sk = sourceKey(p); source[sk] = (source[sk] || 0) + 1
        }
        return { account: a, status, source, total: mine.length, done: status.done }
      })
      // Every account is listed (even with no tasks); busiest first, zeros last.
      .sort((x, y) => y.total - x.total)
  }, [accounts, posts])

  // Task Source — one card per source/project: total + a status breakdown and
  // a stacked bar, carrying the project's own glyph and colour.
  const projectsMeta = useSocmedProjects(false)
  const sourceBreakdown = useMemo(() => {
    if (!sourceCols) return null
    return sourceCols.map(c => {
      const mine = posts.filter(p => sourceKey(p) === c.key)
      const proj = projectsMeta.find(p => p.slug === c.key)
      const color = c.key === 'personal' ? '#a78bfa' : c.key === 'other' ? '#5a5a60' : (proj?.color || '#5a5a60')
      const glyph = c.key === 'personal' ? 'me' : c.key === 'other' ? 'OT' : (proj?.glyph || projectGlyph(c.name))
      const statuses = WS_STATUS_COLS.map(s => ({
        key: s.key, label: s.label, color: s.color,
        count: mine.filter(p => mineColKey(p) === s.key).length,
      }))
      return { key: c.key, name: c.name, color, glyph, total: mine.length, statuses }
    })
  }, [sourceCols, posts, projectsMeta])

  // KPI strip mirrors the All Project dashboard: Total · Done · In Progress ·
  // Need Revisi. In Progress excludes Revisi (its own tile), so the three shares
  // add up to exactly 100% — Done + In Progress + Need Revisi = Total. The
  // In Progress % absorbs any rounding so the trio always lands on 100.
  const revisiCount = agg.counts.revisi ?? 0
  const inProgress = (agg.counts.brief ?? 0) + (agg.counts.produksi ?? 0) + (agg.counts.review ?? 0)
  const donePct = pct(agg.done)
  const revisiPct = pct(revisiCount)
  const inProgressPct = agg.total ? Math.max(0, 100 - donePct - revisiPct) : 0
  const kpis: { label: string; value: number; color: string; pct?: number }[] = [
    { label: t('Total Task'),  value: agg.total,    color: 'var(--link)' },
    { label: t('Selesai'),     value: agg.done,     color: '#22c55e', pct: donePct },
    { label: t('In Progress'), value: inProgress,   color: '#5b9bd5', pct: inProgressPct },
    { label: t('Need Revisi'), value: revisiCount,  color: '#a78bfa', pct: revisiPct },
  ]

  // Single combined table: account · 5 status columns · N source columns · total.
  const nSrc = sourceCols?.length ?? 0
  const colGrid = `minmax(200px, 1.4fr) repeat(5, 58px) repeat(${nSrc}, minmax(82px, 0.9fr)) 78px`
  // Group boundary: a slightly brighter rule than the row separators, so STATUS /
  // SOURCE / TOTAL read as three blocks rather than one long strip.
  const groupDiv: React.CSSProperties = { borderLeft: '1px solid var(--border)', paddingLeft: 10 }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 22 }}>
      <style>{TILE_CSS}</style>
      {/* KPIs — label-on-top, big coloured number, % beside it (same as All Project). */}
      <div className="dt-kpis">
        {kpis.map(k => (
          <div key={k.label} className="an-kpi" style={{ ['--c' as string]: k.color }}>
            <span className="an-kpi-accent" />
            <div className="an-kpi-label">{k.label}</div>
            <div className="an-kpi-row">
              <span className="an-kpi-value">{k.value}</span>
              {k.pct != null && <span className="an-kpi-sub">{k.pct}%</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Status spread — a donut with the total in its core + a counted
          breakdown, the same rich pair the Projects summary uses. */}
      <div className="an-grid2">
        <div className="an-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <SectionTitle>{t('Distribusi Status')}</SectionTitle>
          {agg.total === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13, minHeight: 240 }}>{t('Belum ada data')}</div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240, marginTop: 6 }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: 280, height: 240 }}><canvas ref={chartRef} /></div>
            </div>
          )}
        </div>

        <div className="an-card">
          <SectionTitle>{t('Breakdown per Status')}</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 8 }}>
            {statusRows.map(r => (
              <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: r.color, flexShrink: 0, opacity: r.count ? 1 : 0.3 }} />
                <span style={{ flex: '1 1 96px', minWidth: 0, fontSize: 12.5, color: r.count ? 'var(--text)' : 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                <div className="an-track" style={{ flex: '1 1 90px' }}><div style={{ height: '100%', borderRadius: 99, background: r.color, width: `${pct(r.count)}%` }} /></div>
                <span style={{ width: 24, flexShrink: 0, textAlign: 'right', fontSize: 13, fontWeight: 700, color: r.count ? r.color : 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{r.count}</span>
                <span style={{ width: 40, flexShrink: 0, textAlign: 'right', fontSize: 11, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{pct(r.count)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Task source — one project card each: glyph, total, stacked bar, and a
          per-status breakdown. Shown in every view (overview + popup). */}
      {sourceBreakdown && (
        <div>
          <SectionLabel>{t('Sumber Task')}</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(248px, 1fr))', gap: 14 }}>
            {sourceBreakdown.map(p => (
              <div key={p.key} className="src-card">
                <div className="src-head">
                  <span className="src-glyph" style={{ background: p.color }}>{p.glyph}</span>
                  <span className="src-name">{p.name}</span>
                  <span className="src-total" style={{ color: p.total ? p.color : 'var(--text3)' }}>{p.total}</span>
                  <span className="src-cap">{t('task')}</span>
                </div>
                <div className="src-bar">
                  {p.total > 0 && p.statuses.filter(s => s.count > 0).map(s => (
                    <div key={s.key} title={`${s.label}: ${s.count}`} style={{ width: `${(s.count / p.total) * 100}%`, background: s.color }} />
                  ))}
                </div>
                <div className="src-grid">
                  {p.statuses.map(s => (
                    <div key={s.key} className="src-stat">
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0, opacity: s.count ? 1 : 0.3 }} />
                      <span style={{ flex: 1, fontSize: 12, color: s.count ? 'var(--text2)' : 'var(--text3)' }}>{s.label}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: s.count ? s.color : 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By account — ONE combined table: status columns + source (project)
          columns + total. Only rendered in the Team overview. */}
      {rows && sourceCols && (
        <div>
          <SectionLabel>{t('Per Akun')}</SectionLabel>
          {rows.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text3)', padding: '6px 2px' }}>{t('Belum ada task.')}</div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 540 + nSrc * 78 }}>
                  {/* Group-label tier — brackets the Status and Source blocks. */}
                  <div style={{ display: 'grid', gridTemplateColumns: colGrid, gap: 8, alignItems: 'end', padding: '9px 14px 4px', background: 'var(--bg2)' }}>
                    <span />
                    <span style={{ ...gStyle, gridColumn: '2 / 7', ...groupDiv }}>{t('Status')}</span>
                    <span style={{ ...gStyle, gridColumn: `7 / ${7 + nSrc}`, ...groupDiv }}>{t('Sumber')}</span>
                    <span style={{ ...gStyle, gridColumn: `${7 + nSrc} / ${8 + nSrc}`, ...groupDiv, textAlign: 'right' }}>{t('Total')}</span>
                  </div>
                  {/* Column-label tier. */}
                  <div style={{ display: 'grid', gridTemplateColumns: colGrid, gap: 8, alignItems: 'center', padding: '0 14px 9px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                    <span style={hStyle}>{t('Akun')}</span>
                    {WS_STATUS_COLS.map((c, idx) => (
                      <span key={c.key} style={{ ...hStyle, textAlign: 'center', whiteSpace: 'nowrap', color: c.color, ...(idx === 0 ? groupDiv : null) }}>{SHORT[c.key]}</span>
                    ))}
                    {sourceCols.map((c, idx) => (
                      <span key={c.key} style={{ ...hStyle, textAlign: 'center', lineHeight: 1.25, ...(idx === 0 ? groupDiv : null) }}>{c.name}</span>
                    ))}
                    <span />
                  </div>
                  {/* Rows */}
                  {rows.map((r, i) => (
                    <div
                      key={r.account.email}
                      onClick={onAccountClick ? () => onAccountClick(r.account) : undefined}
                      onKeyDown={onAccountClick ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAccountClick(r.account) } }) : undefined}
                      role={onAccountClick ? 'button' : undefined}
                      tabIndex={onAccountClick ? 0 : undefined}
                      title={onAccountClick ? `${t('Lihat board')} ${r.account.name}` : undefined}
                      onMouseOver={onAccountClick ? (e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg2)' }) : undefined}
                      onMouseOut={onAccountClick ? (e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }) : undefined}
                      style={{ display: 'grid', gridTemplateColumns: colGrid, gap: 8, alignItems: 'center', padding: '11px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', cursor: onAccountClick ? 'pointer' : 'default' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <AccountAvatar name={r.account.name} url={r.account.avatarUrl} size={30} />
                        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.account.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.account.email}</span>
                        </span>
                      </div>
                      {WS_STATUS_COLS.map((c, idx) => {
                        const v = r.status[c.key] ?? 0
                        return <span key={c.key} style={{ textAlign: 'center', fontSize: 13, fontWeight: v ? 700 : 400, color: v ? c.color : 'var(--text3)', ...(idx === 0 ? groupDiv : null) }}>{v}</span>
                      })}
                      {sourceCols.map((c, idx) => {
                        const v = r.source[c.key] ?? 0
                        return <span key={c.key} style={{ textAlign: 'center', fontSize: 13, fontWeight: v ? 700 : 400, color: v ? (c.key === 'personal' ? '#a78bfa' : 'var(--text)') : 'var(--text3)', ...(idx === 0 ? groupDiv : null) }}>{v}</span>
                      })}
                      <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--text)', ...groupDiv }}>{r.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}

const hStyle: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text3)',
}

// Group eyebrow (STATUS / SOURCE / TOTAL) — brighter than the column labels.
const gStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text2)', textAlign: 'center',
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text2)', marginBottom: 10 }}>{children}</div>
  )
}

// Card title — matches the Projects summary cards (not the uppercase eyebrow).
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em', marginBottom: 4 }}>{children}</div>
  )
}
