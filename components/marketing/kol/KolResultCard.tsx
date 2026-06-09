'use client'

import {
  type KOL,
  PLATFORM_LABEL,
  formatCompact,
  erColor,
} from '@/lib/mock-data/kol-analytics'
import { formatRupiah } from '@/lib/utils'
import { PlatformIcon } from './PlatformIcon'
import { GenderPie, AgeBar, GrowthLine } from './charts/KolCharts'

interface Props {
  kol: KOL
  saved?: boolean
  onSave: (k: KOL) => void
  onAddToReport: (k: KOL) => void
}

export function KolResultCard({ kol, saved, onSave, onAddToReport }: Props) {
  // Reach estimate ≈ followers × 0.4 (mock heuristic).
  const reach = Math.round(kol.followers * 0.4)

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <img src={kol.avatar} alt="" width={48} height={48} style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--bg3)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{kol.displayName}</span>
            {kol.verified && <Verified />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
            <PlatformIcon platform={kol.platform} size={14} />
            <span>@{kol.username}</span>
            <span>·</span>
            <span>{PLATFORM_LABEL[kol.platform]}</span>
            <span>·</span>
            <span>{formatCompact(kol.followers)} followers</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => onSave(kol)}
            disabled={saved}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: saved ? 'var(--bg3)' : 'var(--bg3)', color: saved ? 'var(--accent3)' : 'var(--text)', fontSize: 13, fontWeight: 500, cursor: saved ? 'default' : 'pointer' }}
          >
            {saved ? '✓ Tersimpan' : '💾 Simpan'}
          </button>
          <button
            type="button"
            onClick={() => onAddToReport(kol)}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            📄 Tambah ke Laporan
          </button>
        </div>
      </div>

      {/* Metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 22 }}>
        <Metric label="Avg Views" value={formatCompact(kol.avgViews)} />
        <Metric label="Avg Likes" value={formatCompact(kol.avgLikes)} />
        <Metric label="Avg Comments" value={formatCompact(kol.avgComments)} />
        <Metric label="Engagement Rate" value={`${kol.engagementRate}%`} color={erColor(kol.engagementRate)} />
        <Metric label="Reach (est.)" value={formatCompact(reach)} />
        <Metric label="CPE (est.)" value={formatRupiah(kol.cpe)} small />
      </div>

      {/* Top content */}
      <SubLabel>Konten Teratas</SubLabel>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, marginBottom: 20 }}>
        {kol.topContent.map((c) => (
          <div key={c.id} style={{ width: 120, flexShrink: 0 }}>
            <img src={c.thumbnail} alt="" width={120} height={120} style={{ width: 120, height: 120, borderRadius: 10, objectFit: 'cover', background: 'var(--bg3)' }} />
            <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 5, display: 'flex', gap: 8 }}>
              <span>❤ {formatCompact(c.likes)}</span>
              <span>💬 {formatCompact(c.comments)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Audience demographics */}
      <SubLabel>Demografi Audiens</SubLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 18, marginBottom: 20 }}>
        <Panel title="Gender"><GenderPie kol={kol} /></Panel>
        <Panel title="Rentang Usia"><AgeBar kol={kol} /></Panel>
        <Panel title="Top 5 Kota">
          <div style={{ paddingTop: 4 }}>
            {kol.audienceDemographics.location.slice(0, 5).map((l) => (
              <div key={l.city} style={{ marginBottom: 9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)', marginBottom: 3 }}>
                  <span>{l.city}</span><span>{l.percentage}%</span>
                </div>
                <div style={{ background: 'var(--bg3)', borderRadius: 10, height: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(l.percentage, 100)}%`, background: 'var(--accent)', borderRadius: 10 }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Growth chart */}
      <SubLabel>Pertumbuhan Followers (30 Hari)</SubLabel>
      <Panel><GrowthLine kol={kol} /></Panel>
    </div>
  )
}

function Metric({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: small ? 14 : 18, fontWeight: 700, marginTop: 4, color: color || 'var(--accent)' }}>{value}</div>
    </div>
  )
}
function SubLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>{children}</div>
}
function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
      {title && <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>{title}</div>}
      {children}
    </div>
  )
}
function Verified() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="var(--accent)" aria-label="Verified">
      <path d="M12 2l2.4 1.8 3-.3 1.2 2.8 2.7 1.4-.6 3 .6 3-2.7 1.4-1.2 2.8-3-.3L12 22l-2.4-1.8-3 .3-1.2-2.8L2.7 16l.6-3-.6-3 2.7-1.4 1.2-2.8 3 .3z" />
      <polyline points="8.5 12 11 14.5 15.5 9.5" fill="none" stroke="#fff" strokeWidth="1.8" />
    </svg>
  )
}
