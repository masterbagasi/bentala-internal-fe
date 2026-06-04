'use client'

// Shared preview UI primitives for the Social Media tab.
// Match the app's design vocabulary (CSS vars, radius 12-14, hairline border).

import { PLATFORM_META, type Platform, type ConnStatus } from './mock'

export function PreviewBanner() {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', marginBottom: 18, borderRadius: 10,
        background: 'rgba(196,164,20,0.10)', border: '1px solid rgba(196,164,20,0.35)',
        color: '#e6c84a', fontSize: 12.5, fontWeight: 500,
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1 }}>●</span>
      <span>Preview — data masih dummy. Belum tersambung ke Composio/Supabase.</span>
    </div>
  )
}

export function Card({
  children, style,
}: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 18, ...style,
      }}
    >
      {children}
    </div>
  )
}

export function StatCard({
  label, value, delta, deltaUp = true, breakdown,
}: { label: string; value: string; delta?: string; deltaUp?: boolean; breakdown?: React.ReactNode }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div>
      {breakdown}
      {delta && (
        <div
          style={{
            marginTop: 8, fontSize: 12, fontWeight: 600,
            color: deltaUp ? 'var(--accent3)' : 'var(--accent2)',
          }}
        >
          {deltaUp ? '▲' : '▼'} {delta}
        </div>
      )}
    </Card>
  )
}

export function PlatformChip({ platform }: { platform: Platform }) {
  const m = PLATFORM_META[platform]
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: 7, fontSize: 11, fontWeight: 700,
        color: '#fff', background: m.color,
      }}
      title={m.label}
    >
      {m.short}
    </span>
  )
}

const STATUS_META: Record<ConnStatus, { label: string; color: string }> = {
  connected: { label: 'Connected', color: 'var(--accent3)' },
  pending:   { label: 'Pending',   color: '#e6c84a' },
  error:     { label: 'Error',     color: 'var(--accent2)' },
  public:    { label: 'Public',    color: 'var(--text2)' },
}

export function StatusDot({ status }: { status: ConnStatus }) {
  const s = STATUS_META[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color }} />
      {s.label}
    </span>
  )
}

export function SubjectTypeBadge({ type }: { type: 'owned' | 'prospect' }) {
  const owned = type === 'owned'
  return (
    <span
      style={{
        fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
        color: owned ? 'var(--accent3)' : '#e6c84a',
        background: owned ? 'rgba(67,217,162,0.12)' : 'rgba(196,164,20,0.12)',
        border: `1px solid ${owned ? 'rgba(67,217,162,0.3)' : 'rgba(196,164,20,0.3)'}`,
      }}
    >
      {owned ? 'Owned' : 'Prospect'}
    </span>
  )
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 14px' }}>
      {children}
    </h3>
  )
}

export function fmtNum(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k'
  return String(n)
}
