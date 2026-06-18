'use client'

import { useStore } from '@/hooks/useStore'
import { BPI_STATUS_COLS, POST_PLATFORMS } from '@/lib/constants'
import { useEffect, useRef } from 'react'
import { Chart, registerables } from 'chart.js'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useSocmedProjects } from '@/lib/socmed-projects'
import { projectGlyph } from '@/lib/project-glyph'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import type { Post } from '@/lib/types'

Chart.register(...registerables)

const FALLBACK = '#8b8fa8'

// Workspace track stages (Video Production / Design Studio columns).
const WS_TRACK_COLS = [
  { key: 'brief',    label: 'To Do',      color: '#8b8fa8' },
  { key: 'produksi', label: 'Production', color: '#5b9bd5' },
  { key: 'revisi',   label: 'Revisi',     color: '#a78bfa' },
  { key: 'review',   label: 'Review',     color: '#ffc542' },
  { key: 'done',     label: 'Done',       color: '#43d9a2' },
] as const

export function BPIAnalytics({ entity = 'bpi', picScope }: { entity?: string; picScope?: string }) {
  const t = useT()
  const { posts, dateRange } = useStore()
  const projects = useSocmedProjects(true)
  const chartRef = useRef<HTMLCanvasElement>(null)
  const chartInstance = useRef<Chart | null>(null)

  const from = new Date(dateRange.from)
  const to   = new Date(dateRange.to + 'T23:59:59')

  const bpiPosts = posts.filter(p => {
    if (picScope
      ? !(p.pics || []).includes(picScope)
      : entity === 'all' ? false : p.entity !== entity) return false
    if (!p.date) return true
    const d = new Date(p.date)
    return d >= from && d <= to
  })

  const statusCounts = bpiPosts.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const countFor = (key: string) =>
    key === 'published' ? (statusCounts['published'] || 0) + (statusCounts['done'] || 0) : (statusCounts[key] || 0)
  const statusRows = BPI_STATUS_COLS.map(c => ({ key: c.key, label: c.label, color: c.color, count: countFor(c.key) }))

  const total = bpiPosts.length
  const publishedCount = countFor('published')
  const inProgress = (statusCounts['produksi'] || 0) + (statusCounts['brief'] || 0)
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)

  // Per-platform spread across every supported socmed (IG, TikTok, YouTube, X, LinkedIn).
  const platforms = POST_PLATFORMS.map(p => ({
    key: p.key, label: p.label, short: p.short, color: p.color,
    count: bpiPosts.filter(x => (x.platforms || []).includes(p.key)).length,
  }))

  // Per-track breakdown (Video Production / Design Studio). Each task carries
  // its own video_status & design_status; show their status spread on the
  // Socmed Management boards (where tasks have both tracks). On the dedicated
  // VP/DS boards (picScope) the overall breakdown already is that track.
  const VP_PIC = 'Video Production', DS_PIC = 'Design Studio'
  const trackColOf = (v: string) =>
    v === 'produksi' ? 'produksi' : v === 'revisi' ? 'revisi' : v === 'review' ? 'review'
      : (v === 'done' || v === 'ready' || v === 'published') ? 'done' : 'brief'
  const trackBreakdown = (pic: string, get: (p: Post) => string) => {
    const arr = bpiPosts.filter(p => (p.pics || []).includes(pic))
    return {
      total: arr.length,
      rows: WS_TRACK_COLS.map(c => ({ ...c, count: arr.filter(p => trackColOf(get(p)) === c.key).length })),
    }
  }
  const showTracks = !picScope
  const vpTrack = trackBreakdown(VP_PIC, p => p.video_status || '')
  const dsTrack = trackBreakdown(DS_PIC, p => p.design_status || '')

  const showPerProject = entity === 'all' || !!picScope
  const perProject = projects
    .map(p => {
      const projPosts = bpiPosts.filter((x: Post) => x.entity === p.slug)
      const sc = projPosts.reduce((acc, x) => { acc[x.status] = (acc[x.status] || 0) + 1; return acc }, {} as Record<string, number>)
      const cf = (k: string) => k === 'published' ? (sc['published'] || 0) + (sc['done'] || 0) : (sc[k] || 0)
      return {
        slug: p.slug, name: p.name, color: p.color || FALLBACK, glyph: p.glyph || projectGlyph(p.name),
        total: projPosts.length,
        statuses: BPI_STATUS_COLS.map(c => ({ key: c.key, label: c.label, color: c.color, count: cf(c.key) })),
      }
    })
    .sort((a, b) => b.total - a.total)

  useEffect(() => {
    if (!chartRef.current || total === 0) return
    if (chartInstance.current) chartInstance.current.destroy()

    const shown = statusRows.filter(r => r.count > 0)
    // Signature: a thin ring with the grand total parked in its center.
    const centerText = {
      id: 'bpiCenterText',
      afterDraw(chart: Chart) {
        const { ctx, chartArea } = chart
        if (!chartArea) return
        const cx = (chartArea.left + chartArea.right) / 2
        const cy = (chartArea.top + chartArea.bottom) / 2
        ctx.save()
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#f3f4f8'
        ctx.font = '700 30px Inter, system-ui, sans-serif'
        ctx.fillText(String(total), cx, cy - 6)
        ctx.fillStyle = '#8b8fa8'
        ctx.font = '600 11px Inter, system-ui, sans-serif'
        ctx.fillText('TASK', cx, cy + 16)
        ctx.restore()
      },
    }

    chartInstance.current = new Chart(chartRef.current, {
      type: 'doughnut',
      data: {
        labels: shown.map(r => r.label),
        datasets: [{
          data: shown.map(r => r.count),
          backgroundColor: shown.map(r => r.color),
          borderColor: 'rgba(0,0,0,0)',
          borderWidth: 0,
          spacing: 2,
          borderRadius: 4,
        }],
      },
      options: ({
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (c: { label?: string; parsed: number }) => ` ${c.label}: ${c.parsed} (${pct(c.parsed)}%)` },
          },
        },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
      plugins: [centerText],
    })

    return () => { chartInstance.current?.destroy() }
  }, [JSON.stringify(statusRows), total])

  const kpis = [
    { label: t('Total Task'),   value: total,          color: 'var(--accent)',  sub: '' },
    { label: t('Published'),    value: publishedCount, color: '#22c55e',        sub: `${pct(publishedCount)}%` },
    { label: t('In Progress'),  value: inProgress,     color: '#5b9bd5',        sub: `${pct(inProgress)}%` },
    { label: t('Need Revisi'),  value: statusCounts['revisi'] || 0, color: '#a78bfa', sub: `${pct(statusCounts['revisi'] || 0)}%` },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 1400, margin: '0 auto' }}>
      <style>{CSS}</style>

      {/* KPI strip */}
      <div className="an-kpis">
        {kpis.map(k => (
          <div key={k.label} className="an-kpi" style={{ ['--c' as string]: k.color }}>
            <span className="an-kpi-accent" />
            <div className="an-kpi-label">{k.label}</div>
            <div className="an-kpi-row">
              <span className="an-kpi-value">{k.value}</span>
              {k.sub && <span className="an-kpi-sub">{k.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Distribution + breakdown */}
      <div className="an-grid2">
        <div className="an-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <SectionTitle title={t('Distribusi Status')} />
          {total === 0
            ? <Empty t={t} />
            : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280, marginTop: 6 }}>
                <div style={{ position: 'relative', width: '100%', maxWidth: 320, height: 280 }}><canvas ref={chartRef} /></div>
              </div>
            )}
        </div>

        <div className="an-card">
          <SectionTitle title={t('Breakdown per Status')} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 6 }}>
            {statusRows.map(r => (
              <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: r.color, flexShrink: 0, opacity: r.count ? 1 : 0.3 }} />
                <span style={{ width: 104, flexShrink: 0, fontSize: 12.5, color: r.count ? 'var(--text)' : 'var(--text3)' }}>{r.label}</span>
                <div className="an-track"><div style={{ height: '100%', borderRadius: 99, background: r.color, width: `${pct(r.count)}%` }} /></div>
                <span style={{ width: 24, textAlign: 'right', fontSize: 13, fontWeight: 700, color: r.count ? r.color : 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{r.count}</span>
                <span style={{ width: 38, textAlign: 'right', fontSize: 11, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{pct(r.count)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Per-platform spread */}
      <div className="an-card">
        <SectionTitle title={t('Distribusi Platform')} />
        <div className="an-plat">
          {platforms.map(p => (
            <div key={p.key} className="an-plat-tile" style={{ ['--c' as string]: p.color }}>
              <div className="an-plat-top">
                <PlatformIcon platform={p.key} size={24} />
                <span className="an-plat-name">{p.label}</span>
              </div>
              <div className="an-plat-row">
                <span className="an-plat-count">{p.count}</span>
                <span className="an-plat-pct">{pct(p.count)}%</span>
              </div>
              <div className="an-track"><div style={{ height: '100%', borderRadius: 99, background: p.color, width: `${pct(p.count)}%` }} /></div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-track detail (Video Production / Design Studio) */}
      {showTracks && (vpTrack.total > 0 || dsTrack.total > 0) && (
        <div className="an-grid2">
          <TrackCard t={t} name={t('Video Production')} data={vpTrack} />
          <TrackCard t={t} name={t('Design Studio')} data={dsTrack} />
        </div>
      )}

      {/* Per-project detail */}
      {showPerProject && (
        <div className="an-card">
          <SectionTitle title={t('Task per Project')} />
          {perProject.length === 0 ? (
            <Empty t={t} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginTop: 6 }}>
              {perProject.map(p => (
                <div key={p.slug} className="an-proj">
                  <div className="an-proj-head">
                    <span className="an-proj-glyph" style={{ background: p.color }}>{p.glyph}</span>
                    <span className="an-proj-name">{p.name}</span>
                    <span className="an-proj-total" style={{ color: p.color }}>{p.total}</span>
                    <span className="an-proj-total-cap">{t('task')}</span>
                  </div>

                  <div className="an-stacked">
                    {p.total === 0
                      ? <div style={{ flex: 1 }} />
                      : p.statuses.filter(s => s.count > 0).map(s => (
                          <div key={s.key} title={`${s.label}: ${s.count}`} style={{ width: `${(s.count / p.total) * 100}%`, background: s.color }} />
                        ))}
                  </div>

                  <div className="an-proj-grid">
                    {p.statuses.map(s => (
                      <div key={s.key} className="an-proj-stat">
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0, opacity: s.count ? 1 : 0.3 }} />
                        <span style={{ flex: 1, fontSize: 12, color: s.count ? 'var(--text2)' : 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: s.count ? s.color : 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{s.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TrackCard({ t, name, data }: {
  t: (s: string) => string
  name: string
  data: { total: number; rows: { key: string; label: string; color: string; count: number }[] }
}) {
  const pct = (n: number) => (data.total ? Math.round((n / data.total) * 100) : 0)
  return (
    <div className="an-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>{name}</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{data.total}</span>
        <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)' }}>{t('task')}</span>
      </div>
      {data.total === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text3)', textAlign: 'center', padding: '20px 0' }}>{t('Belum ada data')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {data.rows.map(r => (
            <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: r.color, flexShrink: 0, opacity: r.count ? 1 : 0.3 }} />
              <span style={{ width: 96, flexShrink: 0, fontSize: 12.5, color: r.count ? 'var(--text)' : 'var(--text3)' }}>{r.label}</span>
              <div className="an-track"><div style={{ height: '100%', borderRadius: 99, background: r.color, width: `${pct(r.count)}%` }} /></div>
              <span style={{ width: 24, textAlign: 'right', fontSize: 13, fontWeight: 700, color: r.count ? r.color : 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{r.count}</span>
              <span style={{ width: 38, textAlign: 'right', fontSize: 11, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{pct(r.count)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>{title}</span>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function Empty({ t }: { t: (s: string) => string }) {
  return <div style={{ fontSize: 12.5, color: 'var(--text3)', textAlign: 'center', padding: '56px 0' }}>{t('Belum ada data')}</div>
}

const CSS = `
.an-kpi { position: relative; overflow: hidden; background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; padding: 14px 15px; transition: border-color .14s, transform .14s; }
.an-kpi:hover { border-color: color-mix(in srgb, var(--c) 55%, var(--border)); transform: translateY(-1px); }
.an-kpi-accent { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--c); opacity: .9; }
.an-kpi-label { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text3); margin-bottom: 8px; }
.an-kpi-row { display: flex; align-items: baseline; gap: 8px; }
.an-kpi-value { font-size: 30px; font-weight: 800; line-height: 1; color: var(--c); font-variant-numeric: tabular-nums; }
.an-kpi-sub { font-size: 11.5px; font-weight: 600; color: var(--text3); }

/* KPI strip — 4 status metrics; 4 → 2 so cards always fill their row. */
.an-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
@media (max-width: 720px) { .an-kpis { grid-template-columns: repeat(2, 1fr); gap: 10px; } }

/* Platform tiles — 5 socmeds; 5 → 3 → 2 across breakpoints. */
.an-plat { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-top: 8px; }
@media (max-width: 980px) { .an-plat { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 560px) { .an-plat { grid-template-columns: repeat(2, 1fr); } }
.an-plat-tile { background: var(--bg3); border: 1px solid var(--border); border-radius: 10px; padding: 12px 13px; }
.an-plat-top { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.an-plat-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 20px; padding: 0 6px; border-radius: 6px; font-size: 10px; font-weight: 800; color: #fff; background: var(--c); }
.an-plat-name { font-size: 12px; font-weight: 600; color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.an-plat-row { display: flex; align-items: baseline; gap: 7px; margin-bottom: 8px; }
.an-plat-count { font-size: 22px; font-weight: 800; line-height: 1; color: var(--c); font-variant-numeric: tabular-nums; }
.an-plat-pct { font-size: 11px; font-weight: 600; color: var(--text3); }

.an-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: stretch; }
@media (max-width: 880px) { .an-grid2 { grid-template-columns: 1fr; } }

/* Mobile polish */
@media (max-width: 560px) {
  .an-card { padding: 15px 14px 16px; border-radius: 12px; }
  .an-kpi { padding: 12px 13px; }
  .an-kpi-value { font-size: 26px; }
  .an-proj { padding: 13px; }
}

.an-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 14px; padding: 18px 18px 20px; }

.an-track { flex: 1; min-width: 0; height: 7px; background: var(--bg3); border-radius: 99px; overflow: hidden; }

.an-proj { background: var(--bg3); border: 1px solid var(--border); border-radius: 12px; padding: 14px 15px; }
.an-proj-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.an-proj-glyph { width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; color: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,.2); }
.an-proj-name { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 700; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.an-proj-total { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
.an-proj-total-cap { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--text3); }
.an-stacked { display: flex; gap: 2px; height: 9px; border-radius: 6px; overflow: hidden; background: var(--bg2); margin-bottom: 13px; }
/* Single column so statuses read top-to-bottom in exact List/Board order. */
.an-proj-grid { display: flex; flex-direction: column; gap: 8px; }
.an-proj-stat { display: flex; align-items: center; gap: 8px; }

@media (prefers-reduced-motion: reduce) { .an-kpi { transition: none; } }
`
