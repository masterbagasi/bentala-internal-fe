'use client'

import { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import { useStore } from '@/hooks/useStore'
import { getSupabase } from '@/lib/supabase'
import { BPI_STATUS_COLS, POST_PLATFORMS, POST_RATIOS } from '@/lib/constants'
import { formatDate, byPostDateAsc } from '@/lib/utils'
import { StatusBadge, PlatformBadge, TeamAvatar } from '@/components/shared/StatusBadge'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import { PostModal } from './PostModal'
import { PostPreviewModal } from './PostPreviewModal'
import { ContentCalendar } from '@/components/BSI/Calendar'
import dynamic from 'next/dynamic'
const BPIAnalytics = dynamic(() => import('./Analytics').then(m => ({ default: m.BPIAnalytics })), { ssr: false })
import type { Post } from '@/lib/types'
import { useLogActivity } from '@/hooks/useData'

export type BPITabType = 'list' | 'board' | 'calendar' | 'files' | 'analytics'

export interface BPIPageHandle {
  openEdit: (id?: string) => void
}

interface BPIPageProps {
  entity: 'bpi' | 'bsi'
  currentUser?: string
  activeTab: BPITabType
}

export const BPIPage = forwardRef<BPIPageHandle, BPIPageProps>(
  function BPIPage({ entity, currentUser = 'Naufal', activeTab }, ref) {
    const { posts } = useStore()
    const [showPostModal, setShowPostModal] = useState(false)
    const [editPostId, setEditPostId] = useState<string | null>(null)
    const [previewPostId, setPreviewPostId] = useState<string | null>(null)
    const logActivity = useLogActivity()

    // ── Multi-criteria filter ──
    const [filters, setFilters] = useState<PostFilters>(EMPTY_FILTERS)
    const [filterOpen, setFilterOpen] = useState(false)
    const [accounts, setAccounts] = useState<{ email: string; name: string }[]>([])
    useEffect(() => {
      let cancelled = false
      fetch('/api/accounts')
        .then(r => (r.ok ? r.json() : { accounts: [] }))
        .then((d: { accounts?: { email: string; name: string }[] }) => { if (!cancelled) setAccounts(d.accounts ?? []) })
        .catch(() => {})
      return () => { cancelled = true }
    }, [])

    const entityPosts = useMemo(() => posts.filter(p => p.entity === entity), [posts, entity])

    // Months present in this entity's posts (for the "Bulan posting" filter).
    const months = useMemo(() => {
      const set = new Set<string>()
      for (const p of entityPosts) if (p.date) set.add(p.date.slice(0, 7))
      return Array.from(set).sort().reverse()
    }, [entityPosts])

    const filterCount =
      filters.platforms.length + filters.contentTypes.length + filters.tagged.length +
      filters.ratios.length + filters.statuses.length + (filters.month ? 1 : 0)

    const filtered = entityPosts.filter(p => {
      if (filters.platforms.length && !filters.platforms.some(x => ((p.platforms || []) as string[]).includes(x))) return false
      if (filters.contentTypes.length && !filters.contentTypes.some(x => (p.content_types || []).includes(x))) return false
      if (filters.tagged.length && !filters.tagged.some(x => (p.tagged || []).includes(x))) return false
      if (filters.ratios.length) {
        const rs = (p.ratio || '').split(',').map(s => s.trim()).filter(Boolean)
        if (!filters.ratios.some(x => rs.includes(x))) return false
      }
      if (filters.month && (p.date || '').slice(0, 7) !== filters.month) return false
      if (filters.statuses.length && !filters.statuses.includes(p.status)) return false
      return true
    })

    function openEdit(id?: string) {
      setEditPostId(id || null)
      setShowPostModal(true)
    }

    useImperativeHandle(ref, () => ({ openEdit }))

    async function handleDelete(id: string) {
      if (!confirm('Hapus post ini?')) return
      const supabase = getSupabase()
      await supabase.from('posts').delete().eq('id', id)
      logActivity('Post dihapus')
    }

    return (
      <div>
        {/* Filter Bar */}
        {(activeTab === 'list' || activeTab === 'board' || activeTab === 'calendar') && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, position: 'relative',
            padding: '9px 24px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg2)', flexWrap: 'wrap',
          }}>
            {/* Filter button */}
            <div style={{ position: 'relative', marginLeft: 'auto' }}>
              <button
                onClick={() => setFilterOpen(o => !o)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8,
                  border: '1px solid', borderColor: filterCount ? 'var(--accent)' : 'var(--border)',
                  background: filterCount ? 'rgba(108,99,255,0.12)' : 'var(--bg3)',
                  color: filterCount ? 'var(--accent)' : 'var(--text2)',
                  cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                Filter{filterCount ? ` (${filterCount})` : ''}
              </button>
              {filterOpen && (
                <FilterPopup
                  filters={filters}
                  setFilters={setFilters}
                  accounts={accounts}
                  months={months}
                  onClose={() => setFilterOpen(false)}
                />
              )}
            </div>
          </div>
        )}

        {/* Tab content */}
        <div style={{ padding: activeTab === 'board' ? '0 24px 24px' : 24 }}>
          {activeTab === 'list' && (
            <ListView posts={filtered} onEdit={openEdit} onDelete={handleDelete} onPreview={id => setPreviewPostId(id)} />
          )}
          {activeTab === 'board' && (
            <KanbanBoard
              posts={filtered}
              currentUser={currentUser}
              statusFilter={filters.statuses}
              onEdit={openEdit}
              onCardClick={id => setPreviewPostId(id)}
            />
          )}
          {activeTab === 'calendar' && <ContentCalendar entity={entity} onPostClick={id => setPreviewPostId(id)} />}
          {activeTab === 'files' && <FilesTab posts={filtered} />}
          {activeTab === 'analytics' && <BPIAnalytics entity={entity} />}
        </div>

        {/* Modals */}
        {showPostModal && (
          <PostModal
            open={showPostModal}
            onClose={() => { setShowPostModal(false); setEditPostId(null) }}
            editId={editPostId}
            entity={entity}
          />
        )}
        {previewPostId && (
          <PostPreviewModal
            open={!!previewPostId}
            postId={previewPostId}
            onClose={() => setPreviewPostId(null)}
            onEdit={id => { setPreviewPostId(null); openEdit(id) }}
          />
        )}
      </div>
    )
  }
)

// ── List View ──
function ListView({
  posts, onEdit, onDelete, onPreview,
}: {
  posts: Post[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onPreview: (id: string) => void
}) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <table>
        <thead>
          <tr>
            <th style={{ width: 28 }}></th>
            <th>Judul</th>
            <th>Platform</th>
            <th>Tanggal</th>
            <th>Status</th>
            <th>PIC</th>
            <th>Caption</th>
            <th style={{ width: 80 }}>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {posts.length === 0 ? (
            <tr>
              <td colSpan={8}>
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text2)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                  Belum ada post. Klik "+ Tambah Post" untuk mulai.
                </div>
              </td>
            </tr>
          ) : posts.slice().sort(byPostDateAsc).map(p => (
            <tr key={p.id} onClick={() => onPreview(p.id)} style={{ cursor: 'pointer' }}>
              <td style={{ paddingLeft: 14 }}>
                <CheckCircle
                  done={p.status === 'published' || p.status === 'done'}
                  onChange={async (done) => {
                    const supabase = getSupabase()
                    await supabase.from('posts').update({ status: done ? 'published' : 'ready' }).eq('id', p.id)
                  }}
                />
              </td>
              <td><span style={{ fontWeight: 500, fontSize: 13 }}>{p.title}</span></td>
              <td>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(p.platforms || []).map(pl => <PlatformBadge key={pl} platform={pl} />)}
                </div>
              </td>
              <td style={{ color: 'var(--text2)', fontSize: 12 }}>{formatDate(p.date)}</td>
              <td><StatusBadge status={p.status} type="post" /></td>
              <td>
                <div style={{ display: 'flex', gap: 3 }}>
                  {(p.pics || []).map(m => <TeamAvatar key={m} name={m} size={22} />)}
                </div>
              </td>
              <td style={{ color: 'var(--text2)', fontSize: 12, maxWidth: 180 }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.caption?.slice(0, 50) || '—'}
                </span>
              </td>
              <td onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => onEdit(p.id)}
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--text)', marginRight: 4 }}
                >Edit</button>
                <button
                  onClick={() => onDelete(p.id)}
                  style={{ background: 'var(--accent2)', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: '#fff' }}
                >✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Kanban Board ──
function KanbanBoard({
  posts, currentUser, statusFilter, onEdit, onCardClick,
}: {
  posts: Post[]
  currentUser: string
  statusFilter: string[]
  onEdit: (id: string) => void
  onCardClick: (id: string) => void
}) {
  // When statuses are filtered, only show those columns.
  const cols = statusFilter.length ? BPI_STATUS_COLS.filter(c => statusFilter.includes(c.key)) : BPI_STATUS_COLS
  const [dragPostId, setDragPostId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const logActivity = useLogActivity()
  const upsertPost = useStore(s => s.upsertPost)

  async function handleDrop(newStatus: string) {
    setDragOverCol(null)
    if (!dragPostId) return
    if (currentUser === 'Naufal' && newStatus === 'review') {
      setDragPostId(null); return
    }
    const dragged = posts.find(p => p.id === dragPostId)
    setDragPostId(null)
    if (!dragged || dragged.status === newStatus) return

    // Optimistic: move the card immediately, don't wait for realtime
    upsertPost({ ...dragged, status: newStatus as Post['status'] })

    const supabase = getSupabase()
    const { error } = await supabase.from('posts').update({ status: newStatus }).eq('id', dragged.id)
    if (error) {
      upsertPost(dragged) // rollback on failure
    } else {
      logActivity(`Post "${dragged.title}" dipindahkan ke ${newStatus}`)
    }
  }

  return (
    <div style={{
      display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8,
      alignItems: 'flex-start', marginTop: 20,
    }}>
      {cols.map(col => {
        const colPosts = posts.filter(p => p.status === col.key).slice().sort(byPostDateAsc)
        const isLocked = 'locked' in col && col.locked && currentUser === 'Naufal'
        const isOver = dragOverCol === col.key
        const active = isOver && !isLocked
        const blocked = isOver && isLocked
        return (
          <div
            key={col.key}
            className="kanban-col"
            style={{
              minWidth: 265, maxWidth: 265,
              background: active ? `${col.color}14` : blocked ? '#ff6b6b12' : 'var(--bg2)',
              // Keep border width fixed (no layout shift) + ring via box-shadow.
              // No transform — scaling the drop target mid-drag breaks the drop.
              border: `1px solid ${active ? col.color : blocked ? '#ff6b6b' : 'var(--border)'}`,
              borderRadius: 12, padding: '14px 12px 10px',
              flexShrink: 0, display: 'flex', flexDirection: 'column',
              maxHeight: 'calc(100vh - 200px)',
              boxShadow: active ? `0 0 0 2px ${col.color}66, 0 8px 24px ${col.color}33` : 'none',
              transition: 'border-color 0.12s, background 0.12s, box-shadow 0.12s',
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = isLocked ? 'none' : 'move'
              // Set on hover only (no onDragLeave) to avoid flicker from
              // entering/leaving child elements.
              if (dragOverCol !== col.key) setDragOverCol(col.key)
            }}
            onDrop={() => { setDragOverCol(null); if (!isLocked) handleDrop(col.key) }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexShrink: 0 }}>
              <span style={{ fontWeight: 600, color: col.color, fontSize: 14 }}>{col.label}</span>
              <span style={{
                fontSize: 12, color: col.color, background: col.color + '22',
                borderRadius: 20, padding: '1px 7px', fontWeight: 500,
              }}>
                {colPosts.length}
              </span>
              {isLocked && <span title="Kamu tidak bisa drag ke kolom ini" style={{ fontSize: 13, opacity: 0.5 }}>🔒</span>}
            </div>

            <div style={{ overflowY: 'auto', flex: 1, minHeight: 60 }}>
              {colPosts.map(p => (
                <KanbanCard
                  key={p.id}
                  post={p}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', p.id)
                    e.dataTransfer.effectAllowed = 'move'
                    setDragPostId(p.id)
                  }}
                  onDragEnd={() => { setDragPostId(null); setDragOverCol(null) }}
                  onClick={() => onCardClick(p.id)}
                  onEdit={() => onEdit(p.id)}
                />
              ))}
            </div>

            <button
              onClick={() => onEdit('')}
              style={{
                width: '100%', background: 'none', border: 'none', color: 'var(--text2)',
                fontSize: 13, padding: '7px 4px', cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 7, borderRadius: 6,
                marginTop: 4, flexShrink: 0,
              }}
              onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(108,99,255,0.08)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
              onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text2)' }}
            >
              <span style={{ fontSize: 15, color: 'var(--accent)', lineHeight: 1 }}>+</span>
              Tambah post
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── Kanban Card ──
function KanbanCard({
  post, onDragStart, onDragEnd, onClick, onEdit,
}: {
  post: Post
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onClick: () => void
  onEdit: () => void
}) {
  return (
    <div
      className="kanban-card"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
        padding: '10px 12px', marginBottom: 8, cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseOver={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(108,99,255,0.4)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)'
      }}
      onMouseOut={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = ''
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: 'var(--text)', marginBottom: 6 }}>
        {post.title}
      </div>
      {post.date && (
        <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>{formatDate(post.date)}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(post.platforms || []).map(pl => (
            <PlatformIcon key={pl} platform={pl} size={18} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {(post.pics || []).map(m => <TeamAvatar key={m} name={m} size={20} />)}
        </div>
      </div>
    </div>
  )
}

// ── Files Tab ──
function FilesTab({ posts }: { posts: Post[] }) {
  const withFiles = posts.filter(p => p.video_link || p.design_link || p.video_file_url || p.design_file_url)
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>
        {withFiles.length} post dengan lampiran file
      </div>
      {withFiles.map(p => (
        <div key={p.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 8 }}>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>{p.title}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {p.video_link && (
              <a href={p.video_link} target="_blank" rel="noopener" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
                🎬 Video Link
              </a>
            )}
            {p.design_link && (
              <a href={p.design_link} target="_blank" rel="noopener" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
                🎨 Design Link
              </a>
            )}
          </div>
        </div>
      ))}
      {withFiles.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text2)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
          Belum ada post dengan file terlampir.
        </div>
      )}
    </div>
  )
}

// ── Check Circle ──
function CheckCircle({ done, onChange }: { done: boolean; onChange: (done: boolean) => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onChange(!done) }}
      style={{
        width: 18, height: 18, borderRadius: '50%',
        border: done ? '1.5px solid var(--accent3)' : '1.5px solid var(--border)',
        background: done ? 'rgba(67,217,162,0.15)' : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, color: done ? 'var(--accent3)' : 'transparent',
        transition: 'all 0.15s', flexShrink: 0,
      }}
    >
      {done && (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      )}
    </button>
  )
}

// ── Multi-criteria filter ──
interface PostFilters {
  platforms: string[]
  contentTypes: string[]
  tagged: string[]
  ratios: string[]
  month: string
  statuses: string[]
}
const EMPTY_FILTERS: PostFilters = { platforms: [], contentTypes: [], tagged: [], ratios: [], month: '', statuses: [] }

function toggle(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px', borderRadius: 16, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'rgba(108,99,255,0.15)' : 'var(--bg3)',
        color: active ? 'var(--accent)' : 'var(--text2)', fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  )
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', fontWeight: 700, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{children}</div>
    </div>
  )
}

function FilterPopup({ filters, setFilters, accounts, months, onClose }: {
  filters: PostFilters
  setFilters: React.Dispatch<React.SetStateAction<PostFilters>>
  accounts: { email: string; name: string }[]
  months: string[]
  onClose: () => void
}) {
  const monthLabel = (ym: string) => {
    const [y, m] = ym.split('-')
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })
  }
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={onClose} />
      <div style={{
        position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 70, width: 320,
        maxHeight: '64vh', overflowY: 'auto',
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
        padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Filter</span>
          <button
            onClick={() => setFilters(EMPTY_FILTERS)}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Reset
          </button>
        </div>

        <FilterSection label="Sosial Media">
          {POST_PLATFORMS.map(p => (
            <FilterChip key={p.key} label={p.label} active={filters.platforms.includes(p.key)}
              onClick={() => setFilters(f => ({ ...f, platforms: toggle(f.platforms, p.key) }))} />
          ))}
        </FilterSection>

        <FilterSection label="Jenis Konten">
          {[{ key: 'video', label: 'Video' }, { key: 'design', label: 'Design' }].map(c => (
            <FilterChip key={c.key} label={c.label} active={filters.contentTypes.includes(c.key)}
              onClick={() => setFilters(f => ({ ...f, contentTypes: toggle(f.contentTypes, c.key) }))} />
          ))}
        </FilterSection>

        <FilterSection label="Tag Akun">
          {accounts.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>—</span>
          ) : accounts.map(a => (
            <FilterChip key={a.email} label={a.name} active={filters.tagged.includes(a.email)}
              onClick={() => setFilters(f => ({ ...f, tagged: toggle(f.tagged, a.email) }))} />
          ))}
        </FilterSection>

        <FilterSection label="Ratio">
          {POST_RATIOS.map(r => (
            <FilterChip key={r.key} label={r.label} active={filters.ratios.includes(r.key)}
              onClick={() => setFilters(f => ({ ...f, ratios: toggle(f.ratios, r.key) }))} />
          ))}
        </FilterSection>

        <FilterSection label="Bulan Posting">
          {months.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>—</span>
          ) : months.map(ym => (
            <FilterChip key={ym} label={monthLabel(ym)} active={filters.month === ym}
              onClick={() => setFilters(f => ({ ...f, month: f.month === ym ? '' : ym }))} />
          ))}
        </FilterSection>

        <FilterSection label="Status">
          {BPI_STATUS_COLS.map(s => (
            <FilterChip key={s.key} label={s.label} active={filters.statuses.includes(s.key)}
              onClick={() => setFilters(f => ({ ...f, statuses: toggle(f.statuses, s.key) }))} />
          ))}
        </FilterSection>
      </div>
    </>
  )
}
