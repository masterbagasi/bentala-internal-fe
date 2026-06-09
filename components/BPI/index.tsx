'use client'

import { useState, useEffect, useMemo, forwardRef, useImperativeHandle, Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useStore } from '@/hooks/useStore'
import { getSupabase } from '@/lib/supabase'
import { BPI_STATUS_COLS, WS_STATUS_COLS, POST_PLATFORMS, POST_RATIOS } from '@/lib/constants'

// Workspace (Video Production / Design Studio) board groups statuses its own
// way: 'ready'/'published' both fold into the "Done" column.
function wsColKey(status: string): string {
  return status === 'ready' || status === 'published' ? 'done' : status
}
import { formatDate, byPostDateAsc } from '@/lib/utils'
import { StatusBadge, PlatformBadge, TeamAvatar } from '@/components/shared/StatusBadge'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import { PostModal } from './PostModal'
import { PostPreviewModal } from './PostPreviewModal'
import { ConfirmDialog, type ConfirmRequest } from '@/components/website/ConfirmDialog'
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
  entity: 'bpi' | 'bsi' | 'ws'
  /** Workspace pages scope by assigned PIC across entities instead of by entity. */
  picScope?: string
  /** "All Project" mode: combine posts from every project (bpi + bsi + ws). */
  allProjects?: boolean
  /** Calendar entity key (e.g. 'ws-fz') when different from `entity`. */
  calEntity?: string
  currentUser?: string
  activeTab: BPITabType
  filters: PostFilters
}

const ALL_ENTITIES = ['bpi', 'bsi', 'ws']

export const BPIPage = forwardRef<BPIPageHandle, BPIPageProps>(
  function BPIPage({ entity, picScope, allProjects, calEntity, currentUser = 'Naufal', activeTab, filters }, ref) {
    const t = useT()
    const { posts, removePost } = useStore()
    const [showPostModal, setShowPostModal] = useState(false)
    const [editPostId, setEditPostId] = useState<string | null>(null)
    const [previewPostId, setPreviewPostId] = useState<string | null>(null)
    const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null)
    const [confirmBusy, setConfirmBusy] = useState(false)
    const logActivity = useLogActivity()

    const filtered = posts.filter(p => {
      // Scope: all socmed projects, by assigned PIC (workspace), or by entity (board).
      if (allProjects
        ? !ALL_ENTITIES.includes(p.entity)
        : picScope ? !(p.pics || []).includes(picScope) : p.entity !== entity) return false
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

    function handleDelete(id: string) {
      setConfirmReq({
        title: t('Hapus Post'),
        message: t('Post ini akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.'),
        confirmLabel: t('Hapus'),
        tone: 'danger',
        onConfirm: async () => {
          setConfirmBusy(true)
          try {
            const supabase = getSupabase()
            // Soft delete — keeps the row so it can be restored from History.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from('posts').update({ deleted_at: new Date().toISOString() }).eq('id', id)
            removePost(id) // optimistic; realtime UPDATE confirms
            logActivity('Post dihapus')
          } finally {
            setConfirmBusy(false)
            setConfirmReq(null)
          }
        },
      })
    }

    return (
      <div>
        {/* Deep link from a notification (/<board>?post=<id>). Isolated in a
            Suspense boundary so useSearchParams doesn't break static prerender. */}
        <Suspense fallback={null}>
          <DeepLinkPost onOpen={setPreviewPostId} />
        </Suspense>
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
              onDelete={handleDelete}
              onCardClick={id => setPreviewPostId(id)}
              colSet={picScope ? WS_STATUS_COLS : undefined}
              colKeyOf={picScope ? wsColKey : undefined}
            />
          )}
          {activeTab === 'calendar' && <ContentCalendar entity={allProjects ? 'all' : (calEntity ?? entity)} onPostClick={id => setPreviewPostId(id)} />}
          {activeTab === 'files' && <FilesTab posts={filtered} />}
          {activeTab === 'analytics' && (
            allProjects
              ? <BPIAnalytics entity="all" />
              : picScope
                ? <BPIAnalytics picScope={picScope} />
                : <BPIAnalytics entity={entity === 'ws' ? 'bpi' : entity} />
          )}
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
        {confirmReq && (
          <ConfirmDialog
            request={confirmReq}
            busy={confirmBusy}
            onCancel={() => setConfirmReq(null)}
          />
        )}
      </div>
    )
  }
)

// Reads ?post=<id> and opens that post's preview, then strips the query so a
// refresh doesn't re-open it. Kept in its own component (wrapped in Suspense by
// the parent) because useSearchParams forces client rendering and would
// otherwise fail static prerendering of the board pages.
function DeepLinkPost({ onOpen }: { onOpen: (id: string) => void }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    const pid = searchParams.get('post')
    if (!pid) return
    onOpen(pid)
    router.replace(pathname)
  }, [searchParams, pathname, router, onOpen])
  return null
}

// ── List View ──
function ListView({
  posts, onEdit, onDelete, onPreview,
}: {
  posts: Post[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onPreview: (id: string) => void
}) {
  const t = useT()
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <table>
        <thead>
          <tr>
            <th style={{ width: 28 }}></th>
            <th>{t('Judul')}</th>
            <th>{t('Platform')}</th>
            <th>{t('Tanggal')}</th>
            <th>{t('Status')}</th>
            <th>{t('PIC')}</th>
            <th>{t('Caption')}</th>
            <th style={{ width: 96, whiteSpace: 'nowrap' }}>{t('Aksi')}</th>
          </tr>
        </thead>
        <tbody>
          {posts.length === 0 ? (
            <tr>
              <td colSpan={8}>
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text2)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                  {t('Belum ada post. Klik "+ Tambah Post" untuk mulai.')}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    onClick={() => onEdit(p.id)}
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--text)', whiteSpace: 'nowrap' }}
                  >Edit</button>
                  <button
                    onClick={() => onDelete(p.id)}
                    style={{ background: 'var(--accent2)', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: '#fff', lineHeight: 1 }}
                  >✕</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Kanban Board ──
type BoardCol = { key: string; label: string; color: string; locked?: boolean }

function KanbanBoard({
  posts, currentUser, statusFilter, onEdit, onDelete, onCardClick,
  colSet, colKeyOf,
}: {
  posts: Post[]
  currentUser: string
  statusFilter: string[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onCardClick: (id: string) => void
  /** Column set + status→column mapping. Defaults to the BPI pipeline; the
   *  workspace (Video Production / Design Studio) passes its own columns. */
  colSet?: readonly BoardCol[]
  colKeyOf?: (status: string) => string
}) {
  // When statuses are filtered, only show those columns.
  const t = useT()
  const baseCols: readonly BoardCol[] = colSet ?? BPI_STATUS_COLS
  const keyOf = (status: string) => (colKeyOf ? colKeyOf(status) : status)
  const cols = statusFilter.length ? baseCols.filter(c => statusFilter.includes(c.key)) : baseCols
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
        const colPosts = posts.filter(p => keyOf(p.status) === col.key).slice().sort(byPostDateAsc)
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
              {isLocked && <span title={t('Kamu tidak bisa drag ke kolom ini')} style={{ fontSize: 13, opacity: 0.5 }}>🔒</span>}
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
                  onDelete={() => onDelete(p.id)}
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
              {t('Tambah post')}
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── Kanban Card ──
function KanbanCard({
  post, onDragStart, onDragEnd, onClick, onEdit, onDelete,
}: {
  post: Post
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const t = useT()
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className="kanban-card"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        position: 'relative',
        background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
        padding: '10px 12px', marginBottom: 8, cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseOver={e => {
        setHovered(true)
        ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(108,99,255,0.4)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)'
      }}
      onMouseOut={e => {
        setHovered(false)
        ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = ''
      }}
    >
      {/* Hover actions — edit + delete */}
      <div style={{
        position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4,
        opacity: hovered ? 1 : 0, pointerEvents: hovered ? 'auto' : 'none',
        transition: 'opacity 0.12s',
      }}>
        <button
          onClick={e => { e.stopPropagation(); onEdit() }}
          title={t('Edit')}
          style={{
            width: 22, height: 22, borderRadius: 5, cursor: 'pointer',
            background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}
          onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
          onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text2)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          title={t('Hapus')}
          style={{
            width: 22, height: 22, borderRadius: 5, cursor: 'pointer',
            background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontSize: 12, lineHeight: 1,
          }}
          onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = '#fff'; (e.currentTarget as HTMLElement).style.background = 'var(--accent2)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent2)' }}
          onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text2)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg2)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
        >✕</button>
      </div>

      {/* Project glyph (matches the sidebar tab logo) + title + date */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <EntityGlyph entity={post.entity} />
        <div style={{ flex: 1, minWidth: 0, paddingRight: 44 }}>
          <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: 'var(--text)', marginBottom: 4 }}>
            {post.title}
          </div>
          {post.date && (
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>{formatDate(post.date)}</div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
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

// Small project glyph on a board card — mirrors the sidebar tab logos
// (bpi = orange, bsi = purple) so a card shows which project it belongs to.
const ENTITY_GLYPH: Record<string, { label: string; color: string }> = {
  bpi: { label: 'bpi', color: '#c46e1f' },
  bsi: { label: 'bsi', color: '#8845c0' },
  ws:  { label: 'ws',  color: '#5a5a60' },
}
function EntityGlyph({ entity }: { entity: string }) {
  const g = ENTITY_GLYPH[entity] ?? ENTITY_GLYPH.ws
  return (
    <span
      title={entity === 'bpi' ? 'Bentala Project' : entity === 'bsi' ? 'Bentala Studio' : 'Workspace'}
      style={{
        width: 30, height: 30, borderRadius: 7, flexShrink: 0,
        backgroundColor: g.color,
        backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.05) 45%, rgba(0,0,0,0.15) 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.2)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: '0.02em', textTransform: 'lowercase',
      }}
    >
      {g.label}
    </span>
  )
}

// ── Files Tab ──
function FilesTab({ posts }: { posts: Post[] }) {
  const t = useT()
  const withFiles = posts.filter(p => p.video_link || p.design_link || p.video_file_url || p.design_file_url)
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>
        {withFiles.length} {t('post dengan lampiran file')}
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
          {t('Belum ada post dengan file terlampir.')}
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
export interface PostFilters {
  platforms: string[]
  contentTypes: string[]
  tagged: string[]
  ratios: string[]
  month: string
  statuses: string[]
}
export const EMPTY_FILTERS: PostFilters = { platforms: [], contentTypes: [], tagged: [], ratios: [], month: '', statuses: [] }

// Owns filter state + the data the popup needs (accounts, months for an entity).
export function useBoardFilter(scope: 'bpi' | 'bsi' | 'all' | { pic: string }) {
  const { posts } = useStore()
  const [filters, setFilters] = useState<PostFilters>(EMPTY_FILTERS)
  const [accounts, setAccounts] = useState<{ email: string; name: string }[]>([])
  useEffect(() => {
    let cancelled = false
    fetch('/api/accounts')
      .then(r => (r.ok ? r.json() : { accounts: [] }))
      .then((d: { accounts?: { email: string; name: string }[] }) => { if (!cancelled) setAccounts(d.accounts ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  const months = useMemo(() => {
    const set = new Set<string>()
    const inScope = (p: typeof posts[number]) =>
      typeof scope === 'string'
        ? (scope === 'all' ? ['bpi', 'bsi', 'ws'].includes(p.entity) : p.entity === scope)
        : (p.pics || []).includes(scope.pic)
    for (const p of posts) if (inScope(p) && p.date) set.add(p.date.slice(0, 7))
    return Array.from(set).sort().reverse()
  }, [posts, scope])
  return { filters, setFilters, accounts, months }
}

// Filter button + popup. Render in the page header's tab row.
export function BoardFilter({ filters, setFilters, accounts, months }: {
  filters: PostFilters
  setFilters: React.Dispatch<React.SetStateAction<PostFilters>>
  accounts: { email: string; name: string }[]
  months: string[]
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const count =
    filters.platforms.length + filters.contentTypes.length + filters.tagged.length +
    filters.ratios.length + filters.statuses.length + (filters.month ? 1 : 0)
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
        {t('Filter')}{count ? ` (${count})` : ''}
      </button>
      {open && (
        <FilterPopup filters={filters} setFilters={setFilters} accounts={accounts} months={months} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}

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
  const t = useT()
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
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('Filter')}</span>
          <button
            onClick={() => setFilters(EMPTY_FILTERS)}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            {t('Reset')}
          </button>
        </div>

        <FilterSection label={t('Sosial Media')}>
          {POST_PLATFORMS.map(p => (
            <FilterChip key={p.key} label={p.label} active={filters.platforms.includes(p.key)}
              onClick={() => setFilters(f => ({ ...f, platforms: toggle(f.platforms, p.key) }))} />
          ))}
        </FilterSection>

        <FilterSection label={t('Jenis Konten')}>
          {[{ key: 'video', label: 'Video' }, { key: 'design', label: 'Design' }].map(c => (
            <FilterChip key={c.key} label={c.label} active={filters.contentTypes.includes(c.key)}
              onClick={() => setFilters(f => ({ ...f, contentTypes: toggle(f.contentTypes, c.key) }))} />
          ))}
        </FilterSection>

        <FilterSection label={t('Tag Akun')}>
          {accounts.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>—</span>
          ) : accounts.map(a => (
            <FilterChip key={a.email} label={a.name} active={filters.tagged.includes(a.email)}
              onClick={() => setFilters(f => ({ ...f, tagged: toggle(f.tagged, a.email) }))} />
          ))}
        </FilterSection>

        <FilterSection label={t('Ratio')}>
          {POST_RATIOS.map(r => (
            <FilterChip key={r.key} label={r.label} active={filters.ratios.includes(r.key)}
              onClick={() => setFilters(f => ({ ...f, ratios: toggle(f.ratios, r.key) }))} />
          ))}
        </FilterSection>

        <FilterSection label={t('Bulan Posting')}>
          {months.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>—</span>
          ) : months.map(ym => (
            <FilterChip key={ym} label={monthLabel(ym)} active={filters.month === ym}
              onClick={() => setFilters(f => ({ ...f, month: f.month === ym ? '' : ym }))} />
          ))}
        </FilterSection>

        <FilterSection label={t('Status')}>
          {BPI_STATUS_COLS.map(s => (
            <FilterChip key={s.key} label={s.label} active={filters.statuses.includes(s.key)}
              onClick={() => setFilters(f => ({ ...f, statuses: toggle(f.statuses, s.key) }))} />
          ))}
        </FilterSection>
      </div>
    </>
  )
}
