'use client'

import { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle, Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useStore } from '@/hooks/useStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import { getSupabase } from '@/lib/supabase'
import { BPI_STATUS_COLS, WS_STATUS_COLS, SMM_STATUS_COLS, POST_PLATFORMS, POST_RATIOS } from '@/lib/constants'

// ── Per-track workflow helpers ───────────────────────────────
// Posts carry two independent production tracks (video_status, design_status).
// VP / DS boards each show their own track; the SMM board derives a single
// column from both tracks + the overall status.
const VP_PIC = 'Video Production'
const DS_PIC = 'Design Studio'
const hasVideo = (p: Post) => (p.pics || []).includes(VP_PIC)
const hasDesign = (p: Post) => (p.pics || []).includes(DS_PIC)
const trackDone = (v: string) => v === 'review' || v === 'done' || v === 'ready' || v === 'published'

// Map a track value to its WS board column (ready/published/done → "Done").
function trackColKey(v: string): string {
  if (v === 'ready' || v === 'published' || v === 'done') return 'done'
  if (v === 'revisi' || v === 'produksi' || v === 'review') return v
  return 'brief' // empty / not started → "To Do List"
}

// Overall post status derived from the two tracks (used when a track changes).
function deriveStatus(p: Post): Post['status'] {
  const hv = hasVideo(p), hd = hasDesign(p)
  if ((hv && p.video_status === 'revisi') || (hd && p.design_status === 'revisi')) return 'revisi'
  const vOk = !hv || trackDone(p.video_status)
  const dOk = !hd || trackDone(p.design_status)
  if ((hv || hd) && vOk && dOk) return 'review'
  return 'produksi'
}

// Which SMM column a post sits in. A single Revisi column: a post sits there
// while EITHER track is in revision. A post only reaches Review once ALL of its
// tracks are done (review/done/ready/published) — until then it stays in
// Production, with per-track chips on the card showing each discipline's stage.
function smmColKey(p: Post): string {
  const s = p.status
  if (s === 'todo' || s === 'brief' || s === 'ready' || s === 'published' || s === 'done') return s
  const hv = hasVideo(p), hd = hasDesign(p)
  if ((hv && p.video_status === 'revisi') || (hd && p.design_status === 'revisi')) return 'revisi'
  const vOk = !hv || trackDone(p.video_status)
  const dOk = !hd || trackDone(p.design_status)
  if ((hv || hd) && vOk && dOk) return 'review'
  return 'produksi'
}

// Updates to apply when a card is dropped on an SMM column. For the track-driven
// columns (revisi / produksi / review) we move every applicable track so the
// derived column stays in sync with the card's new position.
function smmUpdates(p: Post, colKey: string): Partial<Post> {
  switch (colKey) {
    case 'revisi': return {
      status: 'revisi',
      ...(hasVideo(p) ? { video_status: 'revisi' } : {}),
      ...(hasDesign(p) ? { design_status: 'revisi' } : {}),
    }
    case 'produksi': return {
      status: 'produksi',
      ...(hasVideo(p) ? { video_status: 'produksi' } : {}),
      ...(hasDesign(p) ? { design_status: 'produksi' } : {}),
    }
    case 'review': return {
      status: 'review',
      ...(hasVideo(p) ? { video_status: 'review' } : {}),
      ...(hasDesign(p) ? { design_status: 'review' } : {}),
    }
    // Ready to Post / Published → every track is automatically marked Done, so
    // the Video Production / Design Studio boards move the card to their Done
    // column (you can't drag a card to Done there by hand).
    case 'ready':
    case 'published': return {
      status: colKey as Post['status'],
      ...(hasVideo(p) ? { video_status: 'done' } : {}),
      ...(hasDesign(p) ? { design_status: 'done' } : {}),
    }
    default: return { status: colKey as Post['status'] } // todo / brief
  }
}
import { formatDate, byPostDateAsc } from '@/lib/utils'
import { StatusBadge, PlatformBadge, TeamAvatar } from '@/components/shared/StatusBadge'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import { PostModal } from './PostModal'
import { PostPreviewModal } from './PostPreviewModal'
import { RevisiModal } from './RevisiModal'
import { ConfirmDialog, type ConfirmRequest } from '@/components/website/ConfirmDialog'
import { ContentCalendar } from '@/components/BSI/Calendar'
import dynamic from 'next/dynamic'
const BPIAnalytics = dynamic(() => import('./Analytics').then(m => ({ default: m.BPIAnalytics })), { ssr: false })
import type { Post } from '@/lib/types'
import { useLogActivity } from '@/hooks/useData'
import { useSocmedProjects } from '@/lib/socmed-projects'

export type BPITabType = 'list' | 'board' | 'calendar' | 'files' | 'analytics'

export interface BPIPageHandle {
  openEdit: (id?: string) => void
}

interface BPIPageProps {
  entity: string
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

export const BPIPage = forwardRef<BPIPageHandle, BPIPageProps>(
  function BPIPage({ entity, picScope, allProjects, calEntity, currentUser = 'Naufal', activeTab, filters }, ref) {
    const t = useT()
    const { posts, removePost, upsertPost } = useStore()
    const [showPostModal, setShowPostModal] = useState(false)
    const [editPostId, setEditPostId] = useState<string | null>(null)
    const [previewPostId, setPreviewPostId] = useState<string | null>(null)
    // Post awaiting a revision popup (drag → Revisi on the Socmed Management board).
    const [revisiPost, setRevisiPost] = useState<Post | null>(null)
    // Tagged-account directory (email → name + avatar) for the card avatars.
    const [accounts, setAccounts] = useState<Record<string, { name: string; avatarUrl: string | null }>>({})
    useEffect(() => {
      let cancelled = false
      fetch('/api/accounts')
        .then(r => (r.ok ? r.json() : { accounts: [] }))
        .then((d: { accounts?: { email: string; name: string; avatarUrl: string | null }[] }) => {
          if (cancelled) return
          const m: Record<string, { name: string; avatarUrl: string | null }> = {}
          for (const a of d.accounts ?? []) m[a.email.toLowerCase()] = { name: a.name, avatarUrl: a.avatarUrl }
          setAccounts(m)
        })
        .catch(() => {})
      return () => { cancelled = true }
    }, [])
    const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null)
    const [confirmBusy, setConfirmBusy] = useState(false)
    const logActivity = useLogActivity()

    // Project dropdown in the post modal: empty on "All Project", pre-selected
    // on the bpi/bsi boards, hidden on workspace (ws) pages.
    const projectScope: 'bpi' | 'bsi' | 'all' | undefined =
      allProjects ? 'all'
      : picScope ? undefined
      : (entity === 'bpi' || entity === 'bsi') ? entity
      : undefined

    // Only the Socmed Management boards (bpi / bsi / all) can create, edit or
    // delete posts. Workspace pages (Video Production / Design Studio) are
    // work-only: view, change status, and attach files — but not edit the post.
    const canEdit = !picScope

    // Which board this is: the video track, the design track, or the combined
    // SMM board (null). Drag-to-move writes the right field per board.
    const boardTrack: 'video' | 'design' | null =
      picScope === VP_PIC ? 'video' : picScope === DS_PIC ? 'design' : null

    async function moveOnBoard(post: Post, colKey: string) {
      // Video Production / Design Studio: you can't drop INTO Revisi or Done.
      // Revisi is set only from the Socmed Management board (opens the revision
      // popup); Done is set automatically when the post goes Ready/Published.
      // Cards can still be dragged OUT of Revisi (→ Production, Review, …).
      if (boardTrack && (colKey === 'done' || colKey === 'revisi')) return
      // Socmed Management → Revisi opens the revision popup instead of moving
      // straight away; the status/track flip happens when the revision is saved.
      if (!boardTrack && colKey === 'revisi') { setRevisiPost(post); return }
      const updates: Partial<Post> =
        boardTrack === 'video' ? (() => { const u: Partial<Post> = { video_status: colKey }; u.status = deriveStatus({ ...post, ...u } as Post); return u })()
        : boardTrack === 'design' ? (() => { const u: Partial<Post> = { design_status: colKey }; u.status = deriveStatus({ ...post, ...u } as Post); return u })()
        : smmUpdates(post, colKey)
      const next = { ...post, ...updates } as Post
      upsertPost(next) // optimistic
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (getSupabase() as any).from('posts').update(updates).eq('id', post.id)
      if (error) { upsertPost(post); return } // rollback
      logActivity(`Post "${post.title}" dipindahkan`)
    }

    const filtered = posts.filter(p => {
      // Scope: all socmed projects, by assigned PIC (workspace), or by entity (board).
      // All Project = combined view of every socmed post regardless of slug, so
      // posts on newly-created projects appear too. Only board/PIC modes scope.
      if (allProjects
        ? false
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
            <ListView posts={filtered} canEdit={canEdit} onEdit={openEdit} onDelete={handleDelete} onPreview={id => setPreviewPostId(id)} />
          )}
          {activeTab === 'board' && (
            <KanbanBoard
              posts={filtered}
              currentUser={currentUser}
              statusFilter={filters.statuses}
              canEdit={canEdit}
              onEdit={openEdit}
              onDelete={handleDelete}
              onCardClick={id => setPreviewPostId(id)}
              accounts={accounts}
              showTrackStatus={!boardTrack}
              colSet={boardTrack ? WS_STATUS_COLS : SMM_STATUS_COLS}
              noDropCols={boardTrack ? ['revisi', 'done'] : undefined}
              colOf={
                boardTrack === 'video' ? (p => trackColKey(p.video_status))
                : boardTrack === 'design' ? (p => trackColKey(p.design_status))
                : smmColKey
              }
              onMove={moveOnBoard}
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
            projectScope={projectScope}
          />
        )}
        {previewPostId && (
          <PostPreviewModal
            open={!!previewPostId}
            postId={previewPostId}
            canEdit={canEdit}
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
        {revisiPost && (
          <RevisiModal
            open={!!revisiPost}
            post={revisiPost}
            onClose={() => setRevisiPost(null)}
            onSaved={() => setRevisiPost(null)}
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
  posts, onEdit, onDelete, onPreview, canEdit = true,
}: {
  posts: Post[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onPreview: (id: string) => void
  canEdit?: boolean
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
            {canEdit && <th style={{ width: 96, whiteSpace: 'nowrap' }}>{t('Aksi')}</th>}
          </tr>
        </thead>
        <tbody>
          {posts.length === 0 ? (
            <tr>
              <td colSpan={canEdit ? 8 : 7}>
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
                    // Ready/Published → mark every track Done too (keeps the VP/DS boards in sync).
                    await supabase.from('posts').update({
                      status: done ? 'published' : 'ready',
                      ...(hasVideo(p) ? { video_status: 'done' } : {}),
                      ...(hasDesign(p) ? { design_status: 'done' } : {}),
                    }).eq('id', p.id)
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
              {canEdit && (
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
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Kanban Board ──
type BoardCol = { key: string; label: string; color: string; locked?: boolean }
type AccountDir = Record<string, { name: string; avatarUrl: string | null }>

function KanbanBoard({
  posts, currentUser, statusFilter, onEdit, onDelete, onCardClick,
  colSet, colOf, onMove, canEdit = true, accounts, showTrackStatus = false, noDropCols,
}: {
  posts: Post[]
  currentUser: string
  statusFilter: string[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onCardClick: (id: string) => void
  /** Column set; defaults to the BPI pipeline. */
  colSet?: readonly BoardCol[]
  /** Which column a post belongs to (defaults to its status). */
  colOf?: (post: Post) => string
  /** Perform the move write when a card is dropped on a column. */
  onMove?: (post: Post, colKey: string) => void | Promise<void>
  canEdit?: boolean
  /** email → { name, avatarUrl } for tagged-account avatars. */
  accounts?: AccountDir
  /** Socmed Management board: show per-track status chips on dual-track cards. */
  showTrackStatus?: boolean
  /** Columns nobody can drop into (e.g. Done on the VP/DS boards — auto-only). */
  noDropCols?: readonly string[]
}) {
  // When statuses are filtered, only show those columns.
  const t = useT()
  const isMobile = useIsMobile()
  const baseCols: readonly BoardCol[] = colSet ?? BPI_STATUS_COLS
  const keyOf = (p: Post) => (colOf ? colOf(p) : p.status)
  const cols = statusFilter.length ? baseCols.filter(c => statusFilter.includes(c.key)) : baseCols
  const [dragPostId, setDragPostId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  function handleDrop(newCol: string) {
    setDragOverCol(null)
    if (!dragPostId) { setDragPostId(null); return }
    const dragged = posts.find(p => p.id === dragPostId)
    setDragPostId(null)
    if (!dragged || keyOf(dragged) === newCol) return
    void onMove?.(dragged, newCol)
  }

  // ── Touch drag-and-drop (mobile) ──
  // HTML5 drag events never fire on touchscreens, so the desktop DnD above is
  // dead on phones. We add a long-press-to-pick-up gesture: hold a card ~200ms
  // to grab it (a quick tap still opens it, a pre-grab swipe still scrolls),
  // then drag over a column and lift to move. The column under the finger is
  // found via elementFromPoint + a data-col-key marker.
  const boardRef = useRef<HTMLDivElement>(null)
  const touchRef = useRef<
    { post: Post; startX: number; startY: number; dragging: boolean; overCol: string | null; timer: ReturnType<typeof setTimeout> | null } | null
  >(null)
  // Latest values for the stable native listeners to read without re-binding.
  const liveRef = useRef({ cols, currentUser, onMove, keyOf })
  liveRef.current = { cols, currentUser, onMove, keyOf }

  function startTouchDrag(post: Post, e: React.TouchEvent) {
    if (!onMove) return
    const tch = e.touches[0]
    if (!tch) return
    const st = { post, startX: tch.clientX, startY: tch.clientY, dragging: false, overCol: null as string | null, timer: null as ReturnType<typeof setTimeout> | null }
    st.timer = setTimeout(() => {
      if (touchRef.current !== st) return
      st.dragging = true
      setDragPostId(post.id)
      try { navigator.vibrate?.(12) } catch { /* not supported */ }
    }, 200)
    touchRef.current = st
  }

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const clear = () => {
      const st = touchRef.current
      if (st?.timer) clearTimeout(st.timer)
      if (st?.dragging) { setDragPostId(null); setDragOverCol(null) }
      touchRef.current = null
    }
    const onMoveN = (e: TouchEvent) => {
      const st = touchRef.current
      if (!st) return
      const tch = e.touches[0]
      if (!tch) return
      if (!st.dragging) {
        // Moved before the long-press fired → treat as a scroll, not a drag.
        if (Math.abs(tch.clientX - st.startX) > 12 || Math.abs(tch.clientY - st.startY) > 12) clear()
        return
      }
      e.preventDefault() // hold the scroll still while dragging
      const tEl = document.elementFromPoint(tch.clientX, tch.clientY) as HTMLElement | null
      const key = tEl?.closest('[data-col-key]')?.getAttribute('data-col-key') ?? null
      st.overCol = key
      setDragOverCol(key)
    }
    const onEndN = (e: TouchEvent) => {
      const st = touchRef.current
      if (st?.dragging) {
        // Cancel the click that would otherwise fire after touchend and open
        // the card we just dropped.
        e.preventDefault()
        if (st.overCol) {
          const live = liveRef.current
          const target = live.cols.find(c => c.key === st.overCol)
          const locked = !!target && 'locked' in target && (target as { locked?: boolean }).locked && live.currentUser === 'Naufal'
          if (target && !locked && live.keyOf(st.post) !== st.overCol) void live.onMove?.(st.post, st.overCol)
        }
      }
      clear()
    }
    el.addEventListener('touchmove', onMoveN, { passive: false })
    el.addEventListener('touchend', onEndN, { passive: false })
    el.addEventListener('touchcancel', clear)
    return () => {
      el.removeEventListener('touchmove', onMoveN)
      el.removeEventListener('touchend', onEndN)
      el.removeEventListener('touchcancel', clear)
    }
  }, [])

  return (
    <div ref={boardRef} style={{
      display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8,
      alignItems: 'flex-start', marginTop: 20,
    }}>
      {cols.map(col => {
        const colPosts = posts.filter(p => keyOf(p) === col.key).slice().sort(byPostDateAsc)
        const isLocked = ('locked' in col && col.locked && currentUser === 'Naufal') || (noDropCols?.includes(col.key) ?? false)
        const isOver = dragOverCol === col.key
        const active = isOver && !isLocked
        const blocked = isOver && isLocked
        return (
          <div
            key={col.key}
            className="kanban-col"
            data-col-key={col.key}
            style={{
              minWidth: 265, maxWidth: 265,
              background: active ? `${col.color}14` : blocked ? '#ff6b6b12' : 'var(--bg2)',
              // Keep border width fixed (no layout shift) + ring via box-shadow.
              // No transform — scaling the drop target mid-drag breaks the drop.
              border: `1px solid ${active ? col.color : blocked ? '#ff6b6b' : 'var(--border)'}`,
              borderRadius: 12, padding: '14px 12px 10px',
              flexShrink: 0, display: 'flex', flexDirection: 'column',
              // Desktop caps the column so its card list scrolls inside the
              // viewport. On mobile the page itself scrolls vertically and the
              // fixed top bar eats height, so an uncapped column would run off
              // the bottom — let it size to content and ride the page scroll.
              maxHeight: isMobile ? 'none' : 'calc(100vh - 200px)',
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
                  onTouchStart={(e) => startTouchDrag(p, e)}
                  picked={dragPostId === p.id}
                  nativeDraggable={!isMobile}
                  onClick={() => onCardClick(p.id)}
                  onEdit={() => onEdit(p.id)}
                  onDelete={() => onDelete(p.id)}
                  canEdit={canEdit}
                  accounts={accounts}
                  showTrackStatus={showTrackStatus}
                />
              ))}
            </div>

            {canEdit && (
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
            )}
          </div>
        )
      })}
    </div>
  )
}

// Per-track stage chip metadata (Socmed Management cards). Maps a raw track
// value (via trackColKey) to a short label + colour, reusing the WS palette.
const TRACK_STAGE: Record<string, { label: string; color: string }> = {
  brief:    { label: 'To Do',      color: '#8b8fa8' },
  revisi:   { label: 'Revisi',     color: '#a78bfa' },
  produksi: { label: 'Production', color: '#5b9bd5' },
  review:   { label: 'Review',     color: '#ffc542' },
  done:     { label: 'Done',       color: '#43d9a2' },
}

// Chip colour is fixed per TRACK (Video = purple, Design = yellow) so the two
// tracks are visually distinct regardless of which stage each is at. The stage
// (Review / Revisi / …) is only the label.
const TRACK_COLOR: Record<string, string> = { Video: '#a78bfa', Design: '#ffc542' }

function TrackChip({ icon, track, value }: { icon: string; track: string; value: string }) {
  const stage = TRACK_STAGE[trackColKey(value || '')] ?? TRACK_STAGE.brief
  const color = TRACK_COLOR[track] ?? '#8b8fa8'
  return (
    <span
      title={`${track}: ${stage.label}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 10.5, fontWeight: 600, lineHeight: 1,
        padding: '3px 7px', borderRadius: 20, whiteSpace: 'nowrap',
        color, background: color + '1f',
        border: `1px solid ${color}55`,
      }}
    >
      <span style={{ fontSize: 10 }}>{icon}</span>
      {track} · {stage.label}
    </span>
  )
}

// ── Kanban Card ──
function KanbanCard({
  post, onDragStart, onDragEnd, onClick, onEdit, onDelete, canEdit = true, accounts, showTrackStatus = false,
  onTouchStart, picked = false, nativeDraggable = true,
}: {
  post: Post
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
  canEdit?: boolean
  accounts?: AccountDir
  /** Socmed Management board: show per-track chips when the post has 2 tracks. */
  showTrackStatus?: boolean
  /** Touch drag-and-drop (mobile) — HTML5 DnD doesn't fire on touch. */
  onTouchStart?: (e: React.TouchEvent) => void
  /** True while this card is the one being touch-dragged. */
  picked?: boolean
  /** HTML5 `draggable` — disabled on touch so iOS doesn't start its own native
   *  drag (which fights our long-press gesture and can navigate away). */
  nativeDraggable?: boolean
}) {
  const t = useT()
  const [hovered, setHovered] = useState(false)
  // Tagged accounts (emails) shown bottom-right — NOT the content-type PICs.
  const tagged = (post.tagged || []).filter(m => m.includes('@'))
  // Show per-track status only on the Socmed Management board AND only for posts
  // that carry BOTH tracks (video + design) — so the lead can see which
  // discipline is where while the card waits in Production.
  const dualTrack = showTrackStatus && hasVideo(post) && hasDesign(post)
  return (
    <div
      className="kanban-card"
      draggable={nativeDraggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onTouchStart={onTouchStart}
      onClick={onClick}
      style={{
        position: 'relative',
        background: 'var(--bg3)', border: `1px solid ${picked ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10,
        padding: '12px 13px', marginBottom: 8, cursor: 'pointer',
        opacity: picked ? 0.55 : 1,
        boxShadow: picked ? '0 8px 24px rgba(0,0,0,0.4)' : undefined,
        // Suppress the iOS long-press callout so the gesture picks up the card.
        WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none',
        transition: 'border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease, opacity 0.16s ease',
      }}
      onMouseOver={e => {
        setHovered(true)
        ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(108,99,255,0.45)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px rgba(0,0,0,0.28)'
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
      }}
      onMouseOut={e => {
        setHovered(false)
        ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = ''
        ;(e.currentTarget as HTMLElement).style.transform = ''
      }}
    >
      {/* Hover actions — edit + delete (Socmed Management boards only) */}
      {canEdit && (
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
      )}

      {/* Project glyph (matches the sidebar tab logo) + title + date */}
      <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
        <EntityGlyph entity={post.entity} />
        <div style={{ flex: 1, minWidth: 0, paddingRight: 44 }}>
          <div style={{
            fontSize: 13.5, fontWeight: 600, lineHeight: 1.35, color: 'var(--text)', marginBottom: 4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {post.title}
          </div>
          {post.date && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text3)' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.85 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {formatDate(post.date)}
            </div>
          )}
        </div>
      </div>

      {dualTrack && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
          <TrackChip icon="🎬" track="Video" value={post.video_status} />
          <TrackChip icon="🎨" track="Design" value={post.design_status} />
        </div>
      )}

      {((post.platforms || []).length > 0 || tagged.length > 0) && (
        <>
          <div style={{ height: 1, background: 'var(--border)', opacity: 0.55, marginTop: 11 }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 9, minHeight: 22 }}>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              {(post.platforms || []).map(pl => (
                <PlatformIcon key={pl} platform={pl} size={18} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              {tagged.map(m => {
                const acc = accounts?.[m.toLowerCase()]
                return acc?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={m}
                    src={acc.avatarUrl}
                    alt={acc.name}
                    title={acc.name}
                    style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }}
                  />
                ) : (
                  <TeamAvatar key={m} name={acc?.name || m} size={20} />
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Small project glyph on a board card — mirrors the sidebar tab logos
// (bpi = orange, bsi = purple) so a card shows which project it belongs to.
function EntityGlyph({ entity }: { entity: string }) {
  const projects = useSocmedProjects(false)
  const proj = projects.find(p => p.slug === entity)
  const label = proj?.glyph || (entity === 'ws' ? 'ws' : entity.slice(0, 3))
  const color = proj?.color || '#5a5a60'
  const title = proj?.name || (entity === 'ws' ? 'Workspace' : entity)
  return (
    <span
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 1,
        backgroundColor: color,
        backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.06) 45%, rgba(0,0,0,0.16) 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -1px 0 rgba(0,0,0,0.22), 0 1px 3px rgba(0,0,0,0.25)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: '0.03em', textTransform: 'lowercase',
      }}
    >
      {label}
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
export function useBoardFilter(scope: string | { pic: string }) {
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
        ? (scope === 'all' ? true : p.entity === scope)
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
        maxWidth: 'min(320px, 92vw)', maxHeight: '64vh', overflowY: 'auto',
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
