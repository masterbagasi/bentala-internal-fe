'use client'

import { useMemo, useState } from 'react'
import {
  MOCK_SAVED_KOLS,
  type KOL,
  type Platform,
  type Tier,
  TIER_META,
  formatCompact,
  erColor,
} from '@/lib/mock-data/kol-analytics'
import { formatRupiah } from '@/lib/utils'
import { PlatformIcon } from '../PlatformIcon'
import { KolDetailModal } from '../KolDetailModal'
import { Modal } from '@/components/shared/Modal'
import { useToast } from '../useToast'

const PLATFORMS: Platform[] = ['instagram', 'tiktok', 'youtube', 'facebook']
const PLATFORM_LABEL_SHORT: Record<Platform, string> = {
  instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', facebook: 'Facebook',
}
const TIERS: Tier[] = ['nano', 'micro', 'mid', 'macro', 'mega']
const ALL_CATEGORIES = ['beauty', 'food', 'travel', 'lifestyle', 'tech', 'fashion', 'gaming', 'parenting']
const PAGE_SIZE = 8

export function MyCreatorTab() {
  const [list, setList] = useState<KOL[]>(MOCK_SAVED_KOLS)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [detailKol, setDetailKol] = useState<KOL | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [fPlatforms, setFPlatforms] = useState<Set<Platform>>(new Set())
  const [fTiers, setFTiers] = useState<Set<Tier>>(new Set())
  const [fCats, setFCats] = useState<Set<string>>(new Set())
  const { showToast, toastNode } = useToast()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return list.filter((k) => {
      if (q && !(`${k.username} ${k.displayName}`.toLowerCase().includes(q))) return false
      if (fPlatforms.size && !fPlatforms.has(k.platform)) return false
      if (fTiers.size && !fTiers.has(k.tier)) return false
      if (fCats.size && !k.category.some((c) => fCats.has(c))) return false
      return true
    })
  }, [list, search, fPlatforms, fTiers, fCats])

  const totalFollowers = list.reduce((s, k) => s + k.followers, 0)
  const avgER = list.length ? list.reduce((s, k) => s + k.engagementRate, 0) / list.length : 0
  const totalCats = new Set(list.flatMap((k) => k.category)).size

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const activeFilters = fPlatforms.size + fTiers.size + fCats.size

  function remove(k: KOL) {
    setList((prev) => prev.filter((x) => x.id !== k.id))
    showToast('Kreator dihapus.')
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Kreator Saya</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>Daftar kreator yang Anda kelola</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
        <SummaryCard label="Total Kreator" value={String(list.length)} />
        <SummaryCard label="Total Followers" value={formatCompact(totalFollowers)} color="var(--accent3)" />
        <SummaryCard label="Avg Engagement Rate" value={`${avgER.toFixed(1)}%`} color={erColor(avgER)} />
        <SummaryCard label="Total Kategori" value={String(totalCats)} />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setFilterOpen(true)} style={btnSecondary}>
          🔍 Filter{activeFilters > 0 ? ` (${activeFilters})` : ''}
        </button>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320, minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text2)', fontSize: 14 }}>🔍</span>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Cari kreator..."
            style={{ paddingLeft: 34 }}
          />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState hasAny={list.length > 0} />
      ) : (
        <>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
                <thead>
                  <tr>
                    <Th rowSpan={2}>Username</Th>
                    <Th rowSpan={2} center>Platform</Th>
                    <Th rowSpan={2} center>Tier</Th>
                    <Th rowSpan={2}>Category</Th>
                    <th colSpan={5} style={{ ...thStyle, textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Campaign Performance</th>
                    <Th rowSpan={2} right>Aksi</Th>
                  </tr>
                  <tr>
                    <Th right>Avg Views</Th>
                    <Th right>Avg EN</Th>
                    <Th right>Avg E.R</Th>
                    <Th right>Avg CPE</Th>
                    <Th right>Avg CPV</Th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((k) => {
                    const en = k.avgLikes + k.avgComments
                    const tier = TIER_META[k.tier]
                    return (
                      <tr key={k.id}>
                        <Td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <img src={k.avatar} alt="" width={34} height={34} style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--bg3)' }} />
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>@{k.username}</span>
                                {k.verified && <MiniVerified />}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text2)' }}>{k.displayName}</div>
                            </div>
                          </div>
                        </Td>
                        <Td center><PlatformIcon platform={k.platform} size={18} /></Td>
                        <Td center>
                          <span style={{ background: tier.bg, color: tier.color, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6 }}>{tier.label}</span>
                        </Td>
                        <Td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {k.category.map((c) => (
                              <span key={c} style={{ background: 'var(--bg3)', color: 'var(--text2)', fontSize: 10, padding: '2px 7px', borderRadius: 6, textTransform: 'capitalize' }}>{c}</span>
                            ))}
                          </div>
                        </Td>
                        <Td right mono>{formatCompact(k.avgViews)}</Td>
                        <Td right mono>{formatCompact(en)}</Td>
                        <Td right mono><span style={{ color: erColor(k.engagementRate), fontWeight: 600 }}>{k.engagementRate}%</span></Td>
                        <Td right mono>{formatRupiah(k.cpe)}</Td>
                        <Td right mono>{formatRupiah(k.cpv)}</Td>
                        <Td right>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setDetailKol(k)} style={miniBtn}>Detail</button>
                            <button type="button" onClick={() => remove(k)} style={{ ...miniBtn, color: 'var(--accent2)', borderColor: 'rgba(255,69,58,0.4)' }}>Hapus</button>
                          </div>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {pageCount > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 16 }}>
              <PageBtn disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>‹</PageBtn>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                <PageBtn key={p} active={p === safePage} onClick={() => setPage(p)}>{p}</PageBtn>
              ))}
              <PageBtn disabled={safePage === pageCount} onClick={() => setPage(safePage + 1)}>›</PageBtn>
            </div>
          )}
        </>
      )}

      {/* Filter modal */}
      <Modal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter Kreator"
        footer={
          <>
            <button type="button" onClick={() => { setFPlatforms(new Set()); setFTiers(new Set()); setFCats(new Set()) }} style={btnSecondary}>Reset</button>
            <button type="button" onClick={() => { setFilterOpen(false); setPage(1) }} style={btnPrimary}>Terapkan</button>
          </>
        }
      >
        <FilterGroup label="Platform">
          {PLATFORMS.map((p) => (
            <ToggleChip key={p} on={fPlatforms.has(p)} onClick={() => toggle(setFPlatforms, p)}>
              <PlatformIcon platform={p} size={14} /> {PLATFORM_LABEL_SHORT[p]}
            </ToggleChip>
          ))}
        </FilterGroup>
        <FilterGroup label="Tier">
          {TIERS.map((t) => (
            <ToggleChip key={t} on={fTiers.has(t)} onClick={() => toggle(setFTiers, t)}>{TIER_META[t].label}</ToggleChip>
          ))}
        </FilterGroup>
        <FilterGroup label="Category">
          {ALL_CATEGORIES.map((c) => (
            <ToggleChip key={c} on={fCats.has(c)} onClick={() => toggle(setFCats, c)}>
              <span style={{ textTransform: 'capitalize' }}>{c}</span>
            </ToggleChip>
          ))}
        </FilterGroup>
      </Modal>

      <KolDetailModal kol={detailKol} onClose={() => setDetailKol(null)} />
      {toastNode}
    </div>
  )
}

function toggle<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, value: T) {
  setter((prev) => {
    const next = new Set(prev)
    next.has(value) ? next.delete(value) : next.add(value)
    return next
  })
}

// ── Pieces ───────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, margin: '4px 0 0', color: color || 'var(--accent)' }}>{value}</div>
    </div>
  )
}
function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '56px 24px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, textAlign: 'center' }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="1.6">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
      <div style={{ fontSize: 14, color: 'var(--text2)' }}>
        {hasAny ? 'Tidak ada kreator yang cocok dengan filter/pencarian.' : 'Belum ada kreator. Tambahkan dari Discovery atau Analyser.'}
      </div>
    </div>
  )
}
function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10, fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}
function ToggleChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 999,
        background: on ? 'rgba(11,61,231,0.14)' : 'var(--bg3)',
        border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
        color: on ? 'var(--text)' : 'var(--text2)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

const thStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '12px 14px', whiteSpace: 'nowrap',
}
function Th({ children, right, center, rowSpan, colSpan }: { children: React.ReactNode; right?: boolean; center?: boolean; rowSpan?: number; colSpan?: number }) {
  return <th rowSpan={rowSpan} colSpan={colSpan} style={{ ...thStyle, textAlign: right ? 'right' : center ? 'center' : 'left', borderBottom: '1px solid var(--border)' }}>{children}</th>
}
function Td({ children, right, center, mono }: { children: React.ReactNode; right?: boolean; center?: boolean; mono?: boolean }) {
  return <td style={{ textAlign: right ? 'right' : center ? 'center' : 'left', fontSize: 13, color: 'var(--text)', padding: '12px 14px', borderBottom: '1px solid var(--border)', fontVariantNumeric: mono ? 'tabular-nums' : undefined, whiteSpace: mono ? 'nowrap' : undefined }}>{children}</td>
}
function PageBtn({ children, active, disabled, onClick }: { children: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ minWidth: 32, height: 32, padding: '0 8px', borderRadius: 8, background: active ? 'var(--accent)' : 'var(--bg3)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, color: active ? '#fff' : 'var(--text)', fontSize: 13, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }}>
      {children}
    </button>
  )
}
function MiniVerified() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--accent)" aria-label="Verified">
      <path d="M12 2l2.4 1.8 3-.3 1.2 2.8 2.7 1.4-.6 3 .6 3-2.7 1.4-1.2 2.8-3-.3L12 22l-2.4-1.8-3 .3-1.2-2.8L2.7 16l.6-3-.6-3 2.7-1.4 1.2-2.8 3 .3z" />
      <polyline points="8.5 12 11 14.5 15.5 9.5" fill="none" stroke="#fff" strokeWidth="1.8" />
    </svg>
  )
}

const miniBtn: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 8, background: 'var(--bg3)', color: 'var(--text)',
  border: '1px solid var(--border)', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
}
const btnPrimary: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 8, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
}
