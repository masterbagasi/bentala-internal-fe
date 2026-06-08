'use client'

import { useStore } from '@/hooks/useStore'
import { POST_STATUS_LABELS, POST_STATUS_COLORS } from '@/lib/constants'
import { useEffect, useRef } from 'react'
import { Chart, registerables } from 'chart.js'
import { useT } from '@/lib/i18n/LanguageProvider'

Chart.register(...registerables)

export function BPIAnalytics({ entity = 'bpi', picScope }: { entity?: 'bpi' | 'bsi'; picScope?: string }) {
  const t = useT()
  const { posts, dateRange } = useStore()
  const chartRef = useRef<HTMLCanvasElement>(null)
  const chartInstance = useRef<Chart | null>(null)

  const from = new Date(dateRange.from)
  const to   = new Date(dateRange.to + 'T23:59:59')

  const bpiPosts = posts.filter(p => {
    // Scope: workspace pages filter by assigned PIC; boards filter by entity.
    if (picScope ? !(p.pics || []).includes(picScope) : p.entity !== entity) return false
    if (!p.date) return true
    const d = new Date(p.date)
    return d >= from && d <= to
  })

  const statusCounts = bpiPosts.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const igPosts = bpiPosts.filter(p => (p.platforms || []).includes('ig')).length
  const ttPosts = bpiPosts.filter(p => (p.platforms || []).includes('tiktok')).length

  const publishedCount = (statusCounts['published'] || 0) + (statusCounts['done'] || 0)

  useEffect(() => {
    if (!chartRef.current) return
    if (chartInstance.current) chartInstance.current.destroy()

    const labels = Object.keys(statusCounts).map(k => POST_STATUS_LABELS[k] || k)
    const data   = Object.values(statusCounts)
    const colors = Object.keys(statusCounts).map(k => POST_STATUS_COLORS[k] || '#8b8fa8')

    chartInstance.current = new Chart(chartRef.current, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.map(c => c + 'cc'),
          borderColor: colors,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: { color: '#e8eaf6', font: { size: 12 } },
            position: 'right',
          },
        },
      },
    })

    return () => { chartInstance.current?.destroy() }
  }, [JSON.stringify(statusCounts)])

  return (
    <div>
      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Post',  value: bpiPosts.length,   color: 'var(--accent)' },
          { label: 'Published',   value: publishedCount,    color: 'var(--accent3)' },
          { label: 'Instagram',   value: igPosts,           color: '#e1306c' },
          { label: 'TikTok',      value: ttPosts,           color: '#69c9d0' },
          { label: 'In Progress', value: (statusCounts['produksi'] || 0) + (statusCounts['brief'] || 0), color: '#5b9bd5' },
          { label: t('Need Revisi'), value: statusCounts['revisi'] || 0, color: '#a78bfa' },
        ].map(k => (
          <div key={k.label}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Status Distribution</div>
          <canvas ref={chartRef} height={220} />
        </div>

        {/* Status breakdown table */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Breakdown per Status</div>
          {Object.entries(statusCounts).sort((a,b) => b[1]-a[1]).map(([status, count]) => (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: POST_STATUS_COLORS[status] || '#8b8fa8', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13 }}>{POST_STATUS_LABELS[status] || status}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: POST_STATUS_COLORS[status] || '#8b8fa8' }}>{count}</span>
              <div style={{ width: 80, background: 'var(--bg3)', borderRadius: 10, height: 6, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 10,
                  background: POST_STATUS_COLORS[status] || '#8b8fa8',
                  width: `${bpiPosts.length ? Math.round(count/bpiPosts.length*100) : 0}%`,
                }} />
              </div>
            </div>
          ))}
          {Object.keys(statusCounts).length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', padding: '20px 0' }}>{t('Belum ada data')}</div>
          )}
        </div>
      </div>
    </div>
  )
}
