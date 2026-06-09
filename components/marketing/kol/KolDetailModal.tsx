'use client'

import { Modal } from '@/components/shared/Modal'
import { PlatformIcon } from './PlatformIcon'
import {
  type KOL,
  PLATFORM_LABEL,
  TIER_META,
  formatCompact,
  erColor,
} from '@/lib/mock-data/kol-analytics'

interface Props {
  kol: KOL | null
  onClose: () => void
  onSave?: (kol: KOL) => void
  saved?: boolean
}

export function KolDetailModal({ kol, onClose, onSave, saved }: Props) {
  if (!kol) return null
  const tier = TIER_META[kol.tier]

  return (
    <Modal open={!!kol} onClose={onClose} wide maxWidth={720} title={null}>
      {/* Profile header */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
        <img
          src={kol.avatar}
          alt={kol.displayName}
          width={64}
          height={64}
          style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bg3)', flexShrink: 0 }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{kol.displayName}</span>
            {kol.verified && <VerifiedBadge />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)', fontSize: 13, marginTop: 2 }}>
            <PlatformIcon platform={kol.platform} size={15} />
            <span>@{kol.username}</span>
            <span>·</span>
            <span>{PLATFORM_LABEL[kol.platform]}</span>
            <Chip label={tier.label} bg={tier.bg} color={tier.color} />
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {kol.category.map((c) => (
              <Chip key={c} label={c} bg="var(--bg3)" color="var(--text2)" />
            ))}
          </div>
        </div>
        {onSave && (
          <button
            type="button"
            onClick={() => onSave(kol)}
            disabled={saved}
            style={{
              flexShrink: 0,
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: saved ? 'var(--bg3)' : 'var(--accent)',
              color: saved ? 'var(--text2)' : '#fff',
              fontSize: 13,
              fontWeight: 500,
              cursor: saved ? 'default' : 'pointer',
            }}
          >
            {saved ? '✓ Tersimpan' : '💾 Simpan'}
          </button>
        )}
      </div>

      <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 20px' }}>{kol.bio}</p>

      {/* Metric grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 22 }}>
        <Metric label="Followers" value={formatCompact(kol.followers)} />
        <Metric label="Engagement Rate" value={`${kol.engagementRate}%`} color={erColor(kol.engagementRate)} />
        <Metric label="Avg Views" value={formatCompact(kol.avgViews)} />
        <Metric label="Avg Likes" value={formatCompact(kol.avgLikes)} />
        <Metric label="Avg Comments" value={formatCompact(kol.avgComments)} />
        <Metric label="Total Posts" value={formatCompact(kol.posts)} />
      </div>

      {/* Audience */}
      <SectionLabel>Demografi Audiens</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 22 }}>
        <div>
          <Caption>Gender</Caption>
          <Bar label="Perempuan" pct={kol.audienceDemographics.gender.female} color="#ff6b9d" />
          <Bar label="Laki-laki" pct={kol.audienceDemographics.gender.male} color="#5b9bd5" />
          <Caption style={{ marginTop: 12 }}>Top Lokasi</Caption>
          {kol.audienceDemographics.location.slice(0, 5).map((l) => (
            <Bar key={l.city} label={l.city} pct={l.percentage} color="var(--accent)" />
          ))}
        </div>
        <div>
          <Caption>Rentang Usia</Caption>
          {Object.entries(kol.audienceDemographics.age).map(([range, pct]) => (
            <Bar key={range} label={range} pct={pct} color="var(--accent3)" />
          ))}
        </div>
      </div>

      {/* Top content */}
      <SectionLabel>Konten Teratas</SectionLabel>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
        {kol.topContent.map((c) => (
          <div key={c.id} style={{ width: 130, flexShrink: 0 }}>
            <img
              src={c.thumbnail}
              alt=""
              width={130}
              height={130}
              style={{ width: 130, height: 130, borderRadius: 10, objectFit: 'cover', background: 'var(--bg3)' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6, display: 'flex', gap: 10 }}>
              <span>❤ {formatCompact(c.likes)}</span>
              <span>💬 {formatCompact(c.comments)}</span>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: color || 'var(--accent)' }}>{value}</div>
    </div>
  )
}

function Bar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: 'var(--text2)' }}>
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div style={{ background: 'var(--bg3)', borderRadius: 10, height: 6, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 10 }} />
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>{children}</div>
}
function Caption({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, ...style }}>{children}</div>
}
function Chip({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{ background: bg, color, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, textTransform: 'capitalize' }}>
      {label}
    </span>
  )
}
function VerifiedBadge() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)" aria-label="Verified">
      <path d="M12 2l2.4 1.8 3-.3 1.2 2.8 2.7 1.4-.6 3 .6 3-2.7 1.4-1.2 2.8-3-.3L12 22l-2.4-1.8-3 .3-1.2-2.8L2.7 16l.6-3-.6-3 2.7-1.4 1.2-2.8 3 .3z" />
      <polyline points="8.5 12 11 14.5 15.5 9.5" fill="none" stroke="#fff" strokeWidth="1.8" />
    </svg>
  )
}
