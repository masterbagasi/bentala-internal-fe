'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Chart, registerables } from 'chart.js'
import {
  SUBJECTS, WEEKS, PLATFORM_TRENDS,
  CONTENT_POSTS, PLATFORM_META, FORMAT_LABEL, type ContentPost, type Platform,
} from './mock'
import {
  Card, StatCard, PlatformChip, SectionTitle, fmtNum,
} from './ui'
import { DateRangePicker, presetRange, type DateRange } from './DateRangePicker'
import {
  OverviewStats, ContentTypeViews, InteractionsByType, ProfileActivity,
  GenderSection, AgeSection, LocationsSection, ActiveTimesSection,
} from './sections'

Chart.register(...registerables)

const GRID = 'rgba(255,255,255,0.06)'
const TICK = 'rgba(255,255,255,0.55)'

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(iso + 'T00:00:00'))
}

type SortKey = 'date' | 'reach' | 'engagement'
export type PlatformTab = 'all' | Platform
export type SubView = 'overview' | 'content' | 'audience'

export function AnalyticsView({
  subjectId: subjectIdProp,
  setSubjectId: setSubjectIdProp,
  platform: platformProp,
  setPlatform: setPlatformProp,
  view: viewProp,
  setView: setViewProp,
  range: rangeProp,
  setRange: setRangeProp,
}: {
  subjectId?: string
  setSubjectId?: (id: string) => void
  platform?: PlatformTab
  setPlatform?: (p: PlatformTab) => void
  view?: SubView
  setView?: (v: SubView) => void
  range?: DateRange
  setRange?: (r: DateRange) => void
} = {}) {
  // Account + platform can be controlled by the page (filter in the top bar) or
  // managed internally (standalone page → inline filter button).
  const controlled = subjectIdProp !== undefined
  const [subjectIdState, setSubjectIdState] = useState(SUBJECTS[0].id)
  const subjectId = subjectIdProp ?? subjectIdState
  const setSubjectId = setSubjectIdProp ?? setSubjectIdState
  const subject = SUBJECTS.find(s => s.id === subjectId) ?? SUBJECTS[0]
  const availablePlatforms = subject.connections.map(c => c.platform)

  const [platformState, setPlatformState] = useState<PlatformTab>('all')
  const platform = platformProp ?? platformState
  const setPlatform = setPlatformProp ?? setPlatformState
  const [filterOpen, setFilterOpen] = useState(false)
  // view + date range can be controlled by the page (sub-bar lives in the fixed
  // header) or managed internally (standalone page → inline sub-bar).
  const subBarControlled = viewProp !== undefined
  const [viewState, setViewState] = useState<SubView>('overview')
  const view = viewProp ?? viewState
  const setView = setViewProp ?? setViewState
  const [rangeState, setRangeState] = useState<DateRange>(presetRange('Last 90 days'))
  const range = rangeProp ?? rangeState
  const setRange = setRangeProp ?? setRangeState
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [contentType, setContentType] = useState<'all' | 'video' | 'photo'>('all')

  function changeSubject(id: string) {
    setSubjectId(id)
    setPlatform('all')
  }

  const { from, to } = range

  const filtered = useMemo(() => {
    const rows = CONTENT_POSTS.filter(p =>
      p.date >= from && p.date <= to && (platform === 'all' || p.platform === platform))
    return [...rows].sort((a, b) => {
      if (sortKey === 'date') return a.date < b.date ? 1 : -1
      return b[sortKey] - a[sortKey]
    })
  }, [from, to, sortKey, platform])

  // Summary
  const followersForFilter = platform === 'all'
    ? subject.connections.reduce((a, c) => a + c.followers, 0)
    : (subject.connections.find(c => c.platform === platform)?.followers ?? 0)
  const totalReach = filtered.reduce((a, p) => a + p.reach, 0)
  const avgEng = filtered.length ? filtered.reduce((a, p) => a + p.engagement, 0) / filtered.length : 0

  // Content type split: video (video/reel/short) vs design/photo (carousel/photo/story)
  const VIDEO_FORMATS = ['video', 'reel', 'short']
  const videoCount = filtered.filter(p => VIDEO_FORMATS.includes(p.format)).length
  const designCount = filtered.length - videoCount

  // Content tab: filter by Video / Photo
  const contentFiltered = useMemo(() => {
    const vids = ['video', 'reel', 'short']
    return filtered.filter(p =>
      contentType === 'all' ? true
        : contentType === 'video' ? vids.includes(p.format)
          : !vids.includes(p.format))
  }, [filtered, contentType])

  // Trend series for the active platform ('all' = aggregate of available)
  const series = useMemo(() => {
    const platforms: Platform[] = platform === 'all' ? availablePlatforms : [platform]
    const withData = platforms.filter(p => PLATFORM_TRENDS[p])
    if (withData.length === 0) return null
    const followers = WEEKS.map((_, i) =>
      withData.reduce((sum, p) => sum + (PLATFORM_TRENDS[p]!.followers[i] ?? 0), 0))
    const engagement = WEEKS.map((_, i) => {
      const vals = withData.map(p => PLATFORM_TRENDS[p]!.engagement[i] ?? 0)
      return vals.reduce((a, b) => a + b, 0) / vals.length
    })
    return { followers, engagement }
  }, [platform, subjectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reach by platform from filtered content
  const reachByPlatform = useMemo(() => {
    const order: Platform[] = []
    const sums: Record<string, number> = {}
    filtered.forEach(p => {
      if (sums[p.platform] === undefined) { sums[p.platform] = 0; order.push(p.platform) }
      sums[p.platform] += p.reach
    })
    const entries = order.map(p => ({ p, v: sums[p] })).sort((a, b) => b.v - a.v)
    return {
      labels: entries.map(e => PLATFORM_META[e.p].label),
      data: entries.map(e => e.v),
      colors: entries.map(e => PLATFORM_META[e.p].color),
    }
  }, [filtered])

  // ── Charts ──
  const followerRef = useRef<HTMLCanvasElement>(null)
  const engageRef = useRef<HTMLCanvasElement>(null)
  const reachRef = useRef<HTMLCanvasElement>(null)
  const charts = useRef<Chart[]>([])

  useEffect(() => {
    charts.current.forEach(c => c.destroy())
    charts.current = []
    if (followerRef.current && series) {
      charts.current.push(new Chart(followerRef.current, {
        type: 'line',
        data: { labels: WEEKS, datasets: [{
          data: series.followers, borderColor: '#2c85ad', backgroundColor: 'rgba(44,133,173,0.15)',
          fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2.5,
        }] },
        options: baseOpts(),
      }))
    }
    if (engageRef.current && series) {
      charts.current.push(new Chart(engageRef.current, {
        type: 'line',
        data: { labels: WEEKS, datasets: [{
          data: series.engagement, borderColor: '#43d9a2', backgroundColor: 'rgba(67,217,162,0.12)',
          fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2.5,
        }] },
        options: baseOpts(),
      }))
    }
    if (reachRef.current && reachByPlatform.data.length) {
      charts.current.push(new Chart(reachRef.current, {
        type: 'bar',
        data: { labels: reachByPlatform.labels, datasets: [{
          data: reachByPlatform.data, backgroundColor: reachByPlatform.colors,
          borderRadius: 6, barThickness: 46,
        }] },
        options: baseOpts(),
      }))
    }
    return () => { charts.current.forEach(c => c.destroy()); charts.current = [] }
  }, [series, reachByPlatform, view])

  return (
    <div>

      {/* Inline filter — only on the standalone page (top-bar filter when controlled) */}
      {!controlled && (
        <div style={{ display: 'flex', marginBottom: 14 }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setFilterOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 9,
                border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filter
            </button>
            {filterOpen && (
              <SocialAnalyticsFilter
                subjectId={subjectId} onSubject={changeSubject}
                platform={platform} onPlatform={setPlatform}
                availablePlatforms={availablePlatforms}
                onClose={() => setFilterOpen(false)}
              />
            )}
          </div>
        </div>
      )}

      {/* Sub-views + date range — inline only on the standalone page; the social
          page renders SocialAnalyticsSubBar in the fixed header instead. */}
      {!subBarControlled && (
        <div style={{ marginBottom: 16 }}>
          <SocialAnalyticsSubBar view={view} setView={setView} range={range} setRange={setRange} />
        </div>
      )}

      {/* Sections */}
      <div>

        {/* ── OVERVIEW ── */}
        {view === 'overview' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
              <StatCard label={platform === 'all' ? 'Total Followers' : 'Followers'} value={fmtNum(followersForFilter)} delta="460 (28 hari)" />
              <StatCard label="Konten (periode)" value={String(filtered.length)}
                breakdown={
                  <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11.5, color: 'var(--text2)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c4393a' }} />
                      <strong style={{ color: 'var(--text)' }}>{videoCount}</strong> video
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8845c0' }} />
                      <strong style={{ color: 'var(--text)' }}>{designCount}</strong> design
                    </span>
                  </div>
                } />
              <StatCard label="Total Reach" value={fmtNum(totalReach)} />
              <StatCard label="Avg Engagement" value={avgEng.toFixed(1) + '%'} />
            </div>

            <OverviewStats />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <Card>
                <SectionTitle>Pertumbuhan Followers</SectionTitle>
                <div style={{ height: 200 }}>{series ? <canvas ref={followerRef} /> : <EmptyChart />}</div>
              </Card>
              <Card>
                <SectionTitle>Engagement Rate</SectionTitle>
                <div style={{ height: 200 }}>{series ? <canvas ref={engageRef} /> : <EmptyChart />}</div>
              </Card>
            </div>

            {platform === 'all' && (
              <div style={{ marginBottom: 16 }}>
                <Card>
                  <SectionTitle>Reach per Platform</SectionTitle>
                  <div style={{ height: 200 }}>{reachByPlatform.data.length ? <canvas ref={reachRef} /> : <EmptyChart />}</div>
                </Card>
              </div>
            )}

            <ContentTypeViews />
            <InteractionsByType />
            <ProfileActivity />
          </>
        )}

        {/* ── CONTENT ── */}
        {view === 'content' && (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <SectionTitle>Performa Konten</SectionTitle>
              {/* Video / Photo filter */}
              <div style={{ display: 'flex', gap: 6 }}>
                {([['all', 'Semua'], ['video', 'Video'], ['photo', 'Photo']] as const).map(([key, lbl]) => (
                  <button key={key} onClick={() => setContentType(key)} style={typePill(contentType === key)}>{lbl}</button>
                ))}
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>Urutkan:</span>
                <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} style={{ ...selectStyle, minWidth: 0, padding: '6px 10px' }}>
                  <option value="date">Terbaru</option>
                  <option value="reach">Reach tertinggi</option>
                  <option value="engagement">Engagement tertinggi</option>
                </select>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
              {contentFiltered.length} konten
              {contentType !== 'all' && <> · {contentType === 'video' ? 'Video' : 'Photo/Design'}</>}
            </div>
            {contentFiltered.length === 0 ? (
              <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                Tidak ada konten untuk filter ini.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {contentFiltered.map(post => <ContentCard key={post.id} post={post} />)}
              </div>
            )}
          </Card>
        )}

        {/* ── AUDIENCE ── */}
        {view === 'audience' && (
          <>
            <GenderSection />
            <AgeSection />
            <LocationsSection />
            <ActiveTimesSection />
          </>
        )}
      </div>
    </div>
  )
}

// The filter popup body (Akun + Platform chips). Anchored to the right.
function SocialAnalyticsFilter({ subjectId, onSubject, platform, onPlatform, availablePlatforms, onClose }: {
  subjectId: string
  onSubject: (id: string) => void
  platform: PlatformTab
  onPlatform: (p: PlatformTab) => void
  availablePlatforms: Platform[]
  onClose: () => void
}) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={onClose} />
      <div style={{
        position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 70, width: 300,
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
        padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', fontWeight: 700, marginBottom: 8 }}>Akun</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {SUBJECTS.map(s => (
            <SocialFilterChip key={s.id} label={s.name} active={subjectId === s.id} onClick={() => onSubject(s.id)} />
          ))}
        </div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', fontWeight: 700, marginBottom: 8 }}>Platform</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <SocialFilterChip label="Semua" active={platform === 'all'} onClick={() => onPlatform('all')} />
          {availablePlatforms.map(p => (
            <SocialFilterChip key={p} label={PLATFORM_META[p].label} active={platform === p} onClick={() => onPlatform(p)} />
          ))}
        </div>
      </div>
    </>
  )
}

// Self-contained Filter button + popup for the page's top-right (tab row).
export function SocialAnalyticsFilterButton({ subjectId, setSubjectId, platform, setPlatform }: {
  subjectId: string
  setSubjectId: (id: string) => void
  platform: PlatformTab
  setPlatform: (p: PlatformTab) => void
}) {
  const [open, setOpen] = useState(false)
  const subject = SUBJECTS.find(s => s.id === subjectId) ?? SUBJECTS[0]
  const availablePlatforms = subject.connections.map(c => c.platform)
  const count = (platform !== 'all' ? 1 : 0)
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 8,
          border: '1px solid', borderColor: count ? 'var(--accent)' : 'var(--border)',
          background: count ? 'rgba(108,99,255,0.12)' : 'var(--bg3)',
          color: count ? 'var(--accent)' : 'var(--text2)',
          cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        Filter
      </button>
      {open && (
        <SocialAnalyticsFilter
          subjectId={subjectId}
          onSubject={(id) => { setSubjectId(id); setPlatform('all') }}
          platform={platform}
          onPlatform={setPlatform}
          availablePlatforms={availablePlatforms}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

export function SocialFilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 11px', borderRadius: 16, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'rgba(108,99,255,0.15)' : 'var(--bg3)',
        color: active ? 'var(--accent)' : 'var(--text2)', fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  )
}

function EmptyChart() {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 12.5 }}>
      Belum ada data tren untuk platform ini.
    </div>
  )
}

function ContentCard({ post }: { post: ContentPost }) {
  const m = PLATFORM_META[post.platform]
  // Preview cover: explicit cover, else a deterministic placeholder standing in
  // for the resolved frame (video) / first slide (design).
  const cover = post.cover ?? `https://picsum.photos/seed/bentala-${post.id}/480/600`
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg3)' }}>
      <div style={{
        aspectRatio: '4 / 5', position: 'relative', overflow: 'hidden',
        background: `linear-gradient(135deg, ${m.color}cc, ${m.color}66)`,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0) 55%)' }} />
        <span style={{ position: 'absolute', top: 8, left: 8 }}><PlatformChip platform={post.platform} /></span>
        <span style={{
          position: 'absolute', bottom: 8, left: 8, fontSize: 11, fontWeight: 700, color: '#fff',
          padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
        }}>
          {FORMAT_LABEL[post.format]}
        </span>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, minHeight: 36, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {post.caption}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>
          {fmtDate(post.date)}{post.time ? ` · ${post.time.replace(':', '.')} WIB` : ''}
        </div>

        {/* primary metrics */}
        <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 2 }}>Reach</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{fmtNum(post.reach)}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 2 }}>Engagement</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent3)' }}>{post.engagement}%</div>
          </div>
        </div>

        {/* engagement breakdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 12, paddingTop: 11, borderTop: '1px solid var(--border)' }}>
          <IconStat icon={<HeartIcon />} value={fmtNum(post.likes)} title="Likes" />
          <IconStat icon={<CommentIcon />} value={fmtNum(post.comments)} title="Komentar" />
          <IconStat icon={<ShareIcon2 />} value={fmtNum(post.shares)} title="Share" />
        </div>
      </div>
    </div>
  )
}

function IconStat({ icon, value, title }: { icon: React.ReactNode; value: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)' }} title={title}>
      {icon}
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{value}</span>
    </div>
  )
}
const HeartIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
)
const CommentIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
  </svg>
)
const ShareIcon2 = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)

const selectStyle: React.CSSProperties = {
  background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)',
  borderRadius: 9, padding: '8px 12px', fontSize: 13, fontWeight: 500, minWidth: 220,
}
/** Overview / Content / Audience pills + date range. Rendered by the social
 *  page in the fixed (non-scrolling) header so it stays put while content scrolls. */
export function SocialAnalyticsSubBar({ view, setView, range, setRange }: {
  view: SubView
  setView: (v: SubView) => void
  range: DateRange
  setRange: (r: DateRange) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {(['overview', 'audience', 'content'] as SubView[]).map(v => (
        <button key={v} onClick={() => setView(v)} style={subPill(view === v)}>
          {v === 'overview' ? 'Overview' : v === 'content' ? 'Content' : 'Audience'}
        </button>
      ))}
      <div style={{ marginLeft: 'auto' }}>
        <DateRangePicker value={range} onChange={setRange} />
      </div>
    </div>
  )
}

function subPill(active: boolean): React.CSSProperties {
  return {
    background: active ? 'var(--accent)' : 'var(--bg3)',
    color: active ? '#fff' : 'var(--text2)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 999, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  }
}
function typePill(active: boolean): React.CSSProperties {
  return {
    background: active ? 'var(--bg-hover)' : 'var(--bg3)',
    color: active ? 'var(--text)' : 'var(--text2)',
    border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
    borderRadius: 999, padding: '6px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  }
}
function baseOpts(): any {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: GRID }, ticks: { color: TICK, font: { size: 11 } } },
      y: { grid: { color: GRID }, ticks: { color: TICK, font: { size: 11 } } },
    },
  }
}
