'use client'

// Instagram-Insights-style sections for the Analytics tab (Overview/Content/Audience).
// Preview-only; mock data from ./mock.

import { useState } from 'react'
import { Card, SectionTitle } from './ui'
import {
  OVERVIEW, VIEWS_BY_TYPE, INTERACTIONS_BY_TYPE, AUDIENCE, ACTIVE_HOURS,
  type TypeBreakdown, type AgeBucket, type LocationRow,
} from './mock'

const PINK = '#c4365a'
const PINK_LIGHT = 'rgba(196,54,90,0.42)'
const TRACK = 'rgba(255,255,255,0.08)'

function fmtK(n: number) { return n >= 1000 ? (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K' : String(n) }
function pct1(n: number) { return n.toFixed(1) + '%' }

// ── shared bar primitives ──
function Track({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: 1, height: 10, borderRadius: 999, background: TRACK, overflow: 'hidden', display: 'flex' }}>{children}</div>
}

function SplitFill({ fillPct, followersShare }: { fillPct: number; followersShare: number }) {
  return (
    <div style={{ width: `${Math.max(fillPct, 1.5)}%`, height: '100%', display: 'flex', borderRadius: 999, overflow: 'hidden' }}>
      <div style={{ width: `${followersShare * 100}%`, background: PINK }} />
      <div style={{ flex: 1, background: PINK_LIGHT }} />
    </div>
  )
}

function Row({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Track>{children}</Track>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', minWidth: 56, textAlign: 'right' }}>{value}</span>
      </div>
    </div>
  )
}

function Legend() {
  return (
    <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 12, color: 'var(--text2)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot c={PINK} /> Followers</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot c={PINK_LIGHT} /> Non-followers</span>
    </div>
  )
}
function Dot({ c }: { c: string }) {
  return <span style={{ width: 9, height: 9, borderRadius: '50%', background: c, display: 'inline-block' }} />
}

// ════════ OVERVIEW ════════
export function OverviewStats() {
  const nonFollowersViews = (100 - OVERVIEW.viewsFollowersPct).toFixed(1)
  const n = (v: number) => v.toLocaleString('id-ID')
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
      <BigStat label="Views" value={n(OVERVIEW.views)}
        sub={`${OVERVIEW.viewsFollowersPct}% followers · ${nonFollowersViews}% non-followers`} />
      <BigStat label="Net followers" value={(OVERVIEW.netFollowers > 0 ? '+' : '') + OVERVIEW.netFollowers}
        sub={`+${OVERVIEW.follows} follows · -${OVERVIEW.unfollows} unfollows`}
        negative={OVERVIEW.netFollowers < 0} />
      <BigStat label="Interactions" value={n(OVERVIEW.interactions)}
        sub={`${n(OVERVIEW.likes)} likes · ${n(OVERVIEW.comments)} komentar · ${n(OVERVIEW.saves)} saves`} />
      <BigStat label="Shares" value={n(OVERVIEW.shares)}
        sub={`28 hari terakhir`} />
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

export function ContentTypeViews() {
  const max = Math.max(...VIEWS_BY_TYPE.map(r => r.total), 1)
  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <SectionTitle>Views per Tipe Konten</SectionTitle>
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>Accounts reached <strong style={{ color: 'var(--text)' }}>{OVERVIEW.accountsReached.toLocaleString('id-ID')}</strong></span>
      </div>
      <Legend />
      {VIEWS_BY_TYPE.map(r => (
        <Row key={r.type} label={r.type} value={fmtK(r.total)}>
          <SplitFill fillPct={(r.total / max) * 100} followersShare={r.followersPct / 100} />
        </Row>
      ))}
    </Card>
  )
}

const INTERACTION_TABS = ['Semua', 'Likes', 'Komentar', 'Share', 'Repost'] as const
const INTERACTION_MULT: Record<string, number> = { Semua: 1, Likes: 0.62, Komentar: 0.24, Share: 0.18, Repost: 0.14 }

export function InteractionsByType() {
  const [tab, setTab] = useState<typeof INTERACTION_TABS[number]>('Semua')
  const mult = INTERACTION_MULT[tab]
  const rows = INTERACTIONS_BY_TYPE.map(r => ({ ...r, total: Math.round(r.total * mult) }))
  const max = Math.max(...rows.map(r => r.total), 1)
  return (
    <Card style={{ marginBottom: 16 }}>
      <SectionTitle>Interaksi per Tipe Konten</SectionTitle>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {INTERACTION_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={pill(tab === t)}>{t}</button>
        ))}
      </div>
      <Legend />
      {rows.map(r => (
        <Row key={r.type} label={r.type} value={String(r.total)}>
          <SplitFill fillPct={(r.total / max) * 100} followersShare={r.followersPct / 100} />
        </Row>
      ))}
    </Card>
  )
}

export function ProfileActivity() {
  const items = [
    { label: 'Profile visits', value: OVERVIEW.profileVisits },
    { label: 'External link taps', value: OVERVIEW.externalLinkTaps },
    { label: 'Bio link taps', value: OVERVIEW.bioLinkTaps },
  ]
  return (
    <Card style={{ marginBottom: 16 }}>
      <SectionTitle>Aktivitas Profil</SectionTitle>
      {items.map((it, i) => (
        <div key={it.label} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 0', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
        }}>
          <span style={{ fontSize: 13.5, color: 'var(--text)' }}>{it.label}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{it.value.toLocaleString('id-ID')}</span>
        </div>
      ))}
    </Card>
  )
}

// ════════ AUDIENCE ════════
export function GenderSection() {
  const { women, men } = AUDIENCE.gender
  return (
    <Card style={{ marginBottom: 16 }}>
      <SectionTitle>Gender</SectionTitle>
      <Row label="Women" value={pct1(women)}>
        <div style={{ width: `${women}%`, height: '100%', background: PINK, borderRadius: 999 }} />
      </Row>
      <Row label="Men" value={pct1(men)}>
        <div style={{ width: `${men}%`, height: '100%', background: PINK_LIGHT, borderRadius: 999 }} />
      </Row>
    </Card>
  )
}

export function AgeSection() {
  const rows = AUDIENCE.ageRange
  const max = Math.max(...rows.map(r => r.women + r.men), 1)
  return (
    <Card style={{ marginBottom: 16 }}>
      <SectionTitle>Rentang Usia</SectionTitle>
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 12, color: 'var(--text2)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot c={PINK} /> Women</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot c={PINK_LIGHT} /> Men</span>
      </div>
      {rows.map(r => {
        const total = r.women + r.men
        return (
          <Row key={r.range} label={r.range} value={pct1(total)}>
            <div style={{ width: `${Math.max((total / max) * 100, 1.5)}%`, height: '100%', display: 'flex', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${(r.women / total) * 100}%`, background: PINK }} />
              <div style={{ flex: 1, background: PINK_LIGHT }} />
            </div>
          </Row>
        )
      })}
    </Card>
  )
}

export function LocationsSection() {
  const [tab, setTab] = useState<'countries' | 'cities'>('countries')
  const rows: LocationRow[] = tab === 'countries' ? AUDIENCE.countries : AUDIENCE.cities
  const max = Math.max(...rows.map(r => r.pct), 1)
  return (
    <Card style={{ marginBottom: 16 }}>
      <SectionTitle>Lokasi Teratas</SectionTitle>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button onClick={() => setTab('countries')} style={pill(tab === 'countries')}>Negara</button>
        <button onClick={() => setTab('cities')} style={pill(tab === 'cities')}>Kota</button>
      </div>
      {rows.map(r => (
        <Row key={r.name} label={r.name} value={pct1(r.pct)}>
          <div style={{ width: `${Math.max((r.pct / max) * 100, 1.5)}%`, height: '100%', background: PINK, borderRadius: 999 }} />
        </Row>
      ))}
    </Card>
  )
}

const DAYS = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa']
export function ActiveTimesSection() {
  const [day, setDay] = useState('Su')
  const bars = AUDIENCE.activeTimes[day] ?? []
  const max = Math.max(...bars, 1)
  return (
    <Card style={{ marginBottom: 16 }}>
      <SectionTitle>Waktu Aktif Follower</SectionTitle>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {DAYS.map(d => (
          <button key={d} onClick={() => setDay(d)} style={dayPill(day === d)}>{d}</button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 160, padding: '0 4px' }}>
        {bars.map((v, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ width: '100%', height: `${(v / max) * 100}%`, minHeight: 6, background: PINK, borderRadius: 8 }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '6px 4px 0' }}>
        {ACTIVE_HOURS.map(h => (
          <span key={h} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--text3)' }}>{h}</span>
        ))}
      </div>
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Waktu terbaik</div>
        {AUDIENCE.topTimes.map(t => (
          <div key={t.day} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
            <span style={{ color: 'var(--text2)' }}>{t.day}</span>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{t.time}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function pill(active: boolean): React.CSSProperties {
  return {
    background: active ? 'var(--bg-hover)' : 'var(--bg3)',
    color: active ? 'var(--text)' : 'var(--text2)',
    border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
    borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  }
}
function dayPill(active: boolean): React.CSSProperties {
  return {
    width: 38, height: 38, borderRadius: '50%',
    background: active ? 'var(--bg-hover)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--text2)',
    border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
    fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  }
}
