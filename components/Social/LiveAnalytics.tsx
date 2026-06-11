'use client'

import { useEffect, useRef } from 'react'
import { Chart, registerables } from 'chart.js'
import { useT } from '@/lib/i18n/LanguageProvider'
import { Card, StatCard, SectionTitle, fmtNum } from './ui'
import type { IgAnalytics } from '@/lib/social/types'
import type { SubView } from './AnalyticsView'

Chart.register(...registerables)

const GRID = 'rgba(255,255,255,0.06)'
const TICK = 'rgba(255,255,255,0.55)'

function fmtDay(d: string): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(d + 'T00:00:00'))
}
function fmtTs(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

// Live Instagram analytics rendered purely from the synced cache (IgAnalytics).
// Activated by AnalyticsView only when a brand has synced data.
export function LiveAnalytics({
  data, view, onRefresh, refreshing,
}: {
  data: IgAnalytics
  view: SubView
  onRefresh: () => void
  refreshing: boolean
}) {
  const t = useT()
  const trendRef = useRef<HTMLCanvasElement>(null)
  const chart = useRef<Chart | null>(null)

  useEffect(() => {
    chart.current?.destroy()
    chart.current = null
    if (view === 'overview' && trendRef.current && data.followersByDay.length > 1) {
      chart.current = new Chart(trendRef.current, {
        type: 'line',
        data: {
          labels: data.followersByDay.map(p => fmtDay(p.day)),
          datasets: [{
            data: data.followersByDay.map(p => p.value),
            borderColor: '#2c85ad', backgroundColor: 'rgba(44,133,173,0.15)',
            fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2.5,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: GRID }, ticks: { color: TICK, font: { size: 11 } } },
            y: { grid: { color: GRID }, ticks: { color: TICK, font: { size: 11 } } },
          },
        },
      })
    }
    return () => { chart.current?.destroy(); chart.current = null }
  }, [data, view])

  const dash = (n: number | null) => (n == null ? '—' : fmtNum(n))

  return (
    <div>
      {/* Sync status + refresh */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>
          {t('Terakhir disinkron')}: {fmtTs(data.lastSyncedAt)}
        </span>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          style={{
            marginLeft: 'auto', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)',
            borderRadius: 9, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: refreshing ? 'default' : 'pointer', opacity: refreshing ? 0.7 : 1,
          }}
        >
          {refreshing ? t('Menyinkron…') : t('Refresh')}
        </button>
      </div>

      {view === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
            <StatCard label="Followers" value={dash(data.followers)} />
            <StatCard label="Reach (28 hari)" value={dash(data.overview.reach)} />
            <StatCard label="Views (28 hari)" value={dash(data.overview.views)} />
            <StatCard label="Interactions (28 hari)" value={dash(data.overview.interactions)} />
          </div>
          <Card style={{ marginBottom: 16 }}>
            <SectionTitle>{t('Pertumbuhan Followers')}</SectionTitle>
            <div style={{ height: 220 }}>
              {data.followersByDay.length > 1
                ? <canvas ref={trendRef} />
                : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 12.5 }}>
                    {t('Tren akan terbentuk seiring sinkron harian terkumpul.')}
                  </div>}
            </div>
          </Card>
          <PostGrid data={data} />
        </>
      )}

      {view === 'content' && <PostGrid data={data} />}

      {view === 'audience' && <Demographics data={data} />}
    </div>
  )
}

function PostGrid({ data }: { data: IgAnalytics }) {
  const t = useT()
  if (!data.posts.length) {
    return <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>{t('Belum ada konten.')}</div>
  }
  return (
    <Card>
      <SectionTitle>{t('Performa Konten')}</SectionTitle>
      <div style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 14px' }}>{data.posts.length} {t('konten')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {data.posts.map(p => (
          <a key={p.id} href={p.permalink ?? undefined} target="_blank" rel="noreferrer"
            style={{ display: 'block', border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--bg3)', textDecoration: 'none' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, minHeight: 36, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {p.caption || '(tanpa caption)'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>
              {p.timestamp ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(p.timestamp)) : ''}
              {p.type ? ` · ${p.type}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
              <Metric label="Reach" value={p.reach} />
              <Metric label="Views" value={p.views} />
              <Metric label="Likes" value={p.likes} />
              <Metric label="Komentar" value={p.comments} />
            </div>
          </a>
        ))}
      </div>
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{value == null ? '—' : fmtNum(value)}</div>
    </div>
  )
}

function Demographics({ data }: { data: IgAnalytics }) {
  const t = useT()
  if (!data.demographics.length) {
    return <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>{t('Data demografi belum tersedia.')}</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {data.demographics.map(group => {
        const buckets = [...group.buckets].sort((a, b) => b.value - a.value)
        const max = Math.max(...buckets.map(b => b.value), 1)
        return (
          <Card key={`${group.kind}:${group.breakdown}`}>
            <SectionTitle>{group.breakdown}</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {buckets.map(b => (
                <div key={b.bucket} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 80, fontSize: 12, color: 'var(--text2)', flexShrink: 0 }}>{b.bucket}</span>
                  <div style={{ flex: 1, height: 10, background: 'var(--bg3)', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${(b.value / max) * 100}%`, height: '100%', background: 'var(--accent)' }} />
                  </div>
                  <span style={{ width: 64, textAlign: 'right', fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{fmtNum(b.value)}</span>
                </div>
              ))}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
