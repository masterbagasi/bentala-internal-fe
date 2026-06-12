'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Chart, registerables } from 'chart.js'
import { useT } from '@/lib/i18n/LanguageProvider'
import { Card, StatCard, SectionTitle, fmtNum } from './ui'
import type { IgAnalytics } from '@/lib/social/types'
import type { SubView } from './AnalyticsView'
import type { DateRange } from './DateRangePicker'

Chart.register(...registerables)

const GRID = 'rgba(255,255,255,0.06)'
const TICK = 'rgba(255,255,255,0.55)'
const PINK = '#c4365a'
const TRACK = 'rgba(255,255,255,0.08)'

function fmtDay(d: string): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(d + 'T00:00:00'))
}
function fmtTs(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}
const idn = (v: number) => Math.round(v).toLocaleString('id-ID')

// Reels/Video count as "video"; everything else (feed photo, carousel) as "design".
const VIDEO_TYPES = new Set(['REELS', 'VIDEO'])
const isVideo = (type: string | null) => VIDEO_TYPES.has(String(type ?? '').toUpperCase())
const TYPE_LABEL: Record<string, string> = {
  REELS: 'Reels', FEED: 'Feed', VIDEO: 'Video', IMAGE: 'Foto', CAROUSEL_ALBUM: 'Carousel', STORY: 'Stories', AD: 'Ad',
}
const typeLabel = (t: string | null) => TYPE_LABEL[String(t ?? '').toUpperCase()] ?? (t || 'Lainnya')

// Live Instagram analytics rendered purely from the synced cache (IgAnalytics).
// Everything below is REAL — computed from the brand's connected account. Two
// things Instagram's API can't provide are handled honestly: the absolute
// follower history (the line builds from daily snapshots) and any weekly
// engagement curve (replaced by real engagement-per-post over time).
export function LiveAnalytics({
  data, view, range, onRefresh, refreshing,
}: {
  data: IgAnalytics
  view: SubView
  range?: DateRange
  onRefresh: () => void
  refreshing: boolean
}) {
  const t = useT()

  // ── Aggregate everything from real posts, windowed to the selected range ──
  const agg = useMemo(() => {
    const from = range?.from ?? '0000-01-01'
    const to = range?.to ?? '9999-12-31'
    const inRange = (iso: string | null) => {
      if (!iso) return true
      const d = iso.slice(0, 10)
      return d >= from && d <= to
    }
    const posts = data.posts.filter(p => inRange(p.timestamp))
    const sum = (f: (p: typeof posts[number]) => number | null) => posts.reduce((a, p) => a + (f(p) ?? 0), 0)

    const likes = sum(p => p.likes)
    const comments = sum(p => p.comments)
    const saves = sum(p => p.saved)
    const shares = sum(p => p.shares)
    const reach = sum(p => p.reach)
    const views = sum(p => p.views)
    const interactions = likes + comments + saves
    const videoCount = posts.filter(p => isVideo(p.type)).length

    const fdays = data.followersByDay.filter(p => p.day >= from && p.day <= to)
    const netFollowers = fdays.length >= 2 ? fdays[fdays.length - 1].value - fdays[0].value : 0

    // Views grouped by content type (real, no fabricated follower split).
    const byType = new Map<string, number>()
    for (const p of posts) {
      const key = typeLabel(p.type)
      byType.set(key, (byType.get(key) ?? 0) + (p.views ?? p.reach ?? 0))
    }
    const viewsByType = Array.from(byType.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)

    // Engagement rate per post over time (replaces the fabricated weekly curve).
    const engPoints = posts
      .filter(p => (p.reach ?? 0) > 0 && p.timestamp)
      .map(p => ({ day: p.timestamp!.slice(0, 10), value: ((p.likes ?? 0) + (p.comments ?? 0) + (p.saved ?? 0)) / (p.reach as number) * 100 }))
      .sort((a, b) => (a.day < b.day ? -1 : 1))

    return {
      kontenCount: posts.length, videoCount, designCount: posts.length - videoCount,
      likes, comments, saves, shares, reach, views, interactions,
      avgEng: reach > 0 ? (interactions / reach) * 100 : 0,
      netFollowers, viewsByType, engPoints,
      followerSeries: data.followersByDay,
    }
  }, [data, range])

  // ── Charts (followers line, engagement-per-post, reach-per-platform) ──
  const followerRef = useRef<HTMLCanvasElement>(null)
  const engageRef = useRef<HTMLCanvasElement>(null)
  const reachRef = useRef<HTMLCanvasElement>(null)
  const charts = useRef<Chart[]>([])

  useEffect(() => {
    charts.current.forEach(c => c.destroy())
    charts.current = []
    if (view !== 'overview') return

    const baseScales = {
      x: { grid: { color: GRID }, ticks: { color: TICK, font: { size: 11 } } },
      y: { grace: '15%' as const, grid: { color: GRID }, ticks: { color: TICK, font: { size: 11 } } },
    }

    if (followerRef.current && agg.followerSeries.length > 0) {
      charts.current.push(new Chart(followerRef.current, {
        type: 'line',
        data: {
          labels: agg.followerSeries.map(p => fmtDay(p.day)),
          datasets: [{
            data: agg.followerSeries.map(p => p.value),
            borderColor: '#2c85ad', backgroundColor: 'rgba(44,133,173,0.15)', fill: true, tension: 0.4,
            pointRadius: agg.followerSeries.length <= 7 ? 4 : 0, pointBackgroundColor: '#2c85ad', pointBorderColor: '#fff', pointBorderWidth: 1.5,
            borderWidth: 2.5,
          }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: baseScales },
      }))
    }

    if (engageRef.current && agg.engPoints.length > 0) {
      charts.current.push(new Chart(engageRef.current, {
        type: 'line',
        data: {
          labels: agg.engPoints.map(p => fmtDay(p.day)),
          datasets: [{
            data: agg.engPoints.map(p => p.value),
            borderColor: '#43d9a2', backgroundColor: 'rgba(67,217,162,0.13)', fill: true, tension: 0.35,
            pointRadius: agg.engPoints.length <= 30 ? 3 : 0, pointBackgroundColor: '#43d9a2',
            borderWidth: 2.5,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${(c.raw as number).toFixed(1)}%` } } },
          scales: { ...baseScales, y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: (v) => `${v}%` } } },
        },
      }))
    }

    if (reachRef.current && agg.reach > 0) {
      charts.current.push(new Chart(reachRef.current, {
        type: 'bar',
        data: { labels: ['Instagram'], datasets: [{ data: [agg.reach], backgroundColor: PINK, borderRadius: 6, maxBarThickness: 90 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: baseScales },
      }))
    }

    return () => { charts.current.forEach(c => c.destroy()); charts.current = [] }
  }, [agg, view])

  const dash = (n: number | null) => (n == null ? '—' : fmtNum(n))
  const fewFollowerDays = agg.followerSeries.length > 0 && agg.followerSeries.length <= 2
  const maxTypeViews = Math.max(...agg.viewsByType.map(r => r.value), 1)

  return (
    <div>
      {/* Sync status + refresh */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--accent3)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent3)', animation: 'livePulse 1.6s ease-in-out infinite' }} />
          {refreshing ? t('Memperbarui…') : 'Live'}
        </span>
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
          {/* Row 1 — headline stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
            <StatCard
              label="Total Followers"
              value={dash(data.followers)}
              delta={agg.netFollowers !== 0 ? `${agg.netFollowers > 0 ? '+' : ''}${idn(agg.netFollowers)} ${t('(periode)')}` : undefined}
              deltaUp={agg.netFollowers >= 0}
            />
            <StatCard label={t('Konten (periode)')} value={idn(agg.kontenCount)}
              breakdown={
                <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11.5, color: 'var(--text2)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c4393a' }} />
                    <strong style={{ color: 'var(--text)' }}>{agg.videoCount}</strong> video
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8845c0' }} />
                    <strong style={{ color: 'var(--text)' }}>{agg.designCount}</strong> design
                  </span>
                </div>
              } />
            <StatCard label="Total Reach" value={idn(agg.reach)} />
            <StatCard label="Avg Engagement" value={agg.avgEng.toFixed(1) + '%'} />
          </div>

          {/* Row 2 — secondary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
            <BigStat label="Views" value={idn(agg.views)} sub={`${idn(agg.reach)} accounts reached`} />
            <BigStat label="Net followers" value={(agg.netFollowers > 0 ? '+' : '') + idn(agg.netFollowers)}
              sub={t('periode terpilih')} negative={agg.netFollowers < 0} />
            <BigStat label="Interactions" value={idn(agg.interactions)}
              sub={`${idn(agg.likes)} likes · ${idn(agg.comments)} ${t('komentar')} · ${idn(agg.saves)} saves`} />
            <BigStat label="Shares" value={idn(agg.shares)} sub={t('periode terpilih')} />
          </div>

          {/* Charts row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <Card>
              <SectionTitle>{t('Pertumbuhan Followers')}</SectionTitle>
              <div style={{ height: 200 }}>
                {agg.followerSeries.length > 0 ? <canvas ref={followerRef} /> : <ChartEmpty text={t('Tren akan terbentuk seiring sinkron harian terkumpul.')} />}
              </div>
              {fewFollowerDays && (
                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8 }}>
                  {t('Instagram hanya menyediakan data follower terbatas. Tren harian akan makin lengkap seiring sinkron berjalan tiap hari.')}
                </div>
              )}
            </Card>
            <Card>
              <SectionTitle>{t('Engagement per Konten')}</SectionTitle>
              <div style={{ height: 200 }}>
                {agg.engPoints.length > 0 ? <canvas ref={engageRef} /> : <ChartEmpty text={t('Belum ada data engagement konten.')} />}
              </div>
            </Card>
          </div>

          {/* Reach per platform */}
          <Card style={{ marginBottom: 16 }}>
            <SectionTitle>Reach per Platform</SectionTitle>
            <div style={{ height: 200 }}>
              {agg.reach > 0 ? <canvas ref={reachRef} /> : <ChartEmpty text={t('Belum ada data reach.')} />}
            </div>
          </Card>

          {/* Views per content type (real, single-fill bars) */}
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <SectionTitle>{t('Views per Tipe Konten')}</SectionTitle>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>Accounts reached <strong style={{ color: 'var(--text)' }}>{idn(agg.reach)}</strong></span>
            </div>
            {agg.viewsByType.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>{t('Belum ada konten.')}</div>
            ) : agg.viewsByType.map(r => (
              <div key={r.label} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 6 }}>{r.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ flex: 1, height: 10, borderRadius: 999, background: TRACK, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max((r.value / maxTypeViews) * 100, 1.5)}%`, height: '100%', background: PINK, borderRadius: 999 }} />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', minWidth: 56, textAlign: 'right' }}>{fmtNum(r.value)}</span>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      {view === 'content' && <PostGrid data={data} />}

      {view === 'audience' && <Demographics data={data} />}
    </div>
  )
}

function BigStat({ label, value, sub, negative }: { label: string; value: string; sub: string; negative?: boolean }) {
  return (
    <Card>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.05, color: negative ? 'var(--accent2)' : 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8 }}>{sub}</div>
    </Card>
  )
}

function ChartEmpty({ text }: { text: string }) {
  return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 12.5, textAlign: 'center', padding: '0 16px' }}>{text}</div>
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
            style={{ display: 'block', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg3)', textDecoration: 'none' }}>
            <PostCover src={p.cover} type={p.type} />
            <div style={{ padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, minHeight: 36, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {p.caption || '(tanpa caption)'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>
              {p.timestamp ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(p.timestamp)) : ''}
              {p.type ? ` · ${typeLabel(p.type)}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
              <Metric label="Reach" value={p.reach} />
              <Metric label="Views" value={p.views} />
              <Metric label="Likes" value={p.likes} />
              <Metric label="Komentar" value={p.comments} />
            </div>
            </div>
          </a>
        ))}
      </div>
    </Card>
  )
}

// Cover thumbnail. IG CDN URLs expire, so on load error we fall back to a
// typed gradient placeholder instead of a broken-image icon.
function PostCover({ src, type }: { src: string | null; type: string | null }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div style={{
        width: '100%', aspectRatio: '1.91 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #2a2440, #161922)', color: 'var(--text3)', fontSize: 12, fontWeight: 600, letterSpacing: '0.3px',
      }}>{typeLabel(type)}</div>
    )
  }
  return (
    <div style={{ width: '100%', aspectRatio: '1.91 / 1', background: 'var(--bg2)', overflow: 'hidden' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src} alt="" loading="lazy"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        onError={() => setFailed(true)}
      />
    </div>
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
