'use client'

import { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle, Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useIsMobile } from '@/hooks/useIsMobile'
import { getSupabase } from '@/lib/supabase'
import { useMarkPostRead } from '@/hooks/usePostReads'
import { isPostMarked, isChatUnread } from '@/lib/post-unread'
import { taskChatRoom } from '@/lib/access'
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
// A track still sitting in "To Do List" — not yet started (empty/brief/todo).
const trackPending = (v: string) => !v || v === 'brief' || v === 'todo'

// Map a track to its WS board column. Authority lives on the Socmed Management
// board: a track only sits in "Done" once the post is actually Ready to Post /
// Published. While SMM is still in Review (or earlier), a finished track waits
// in "Review" — it must never show Done while SMM hasn't published.
function trackColKey(v: string, status: string): string {
  if (status === 'ready' || status === 'published') return 'done'
  if (v === 'revisi' || v === 'produksi' || v === 'review') return v
  // A finished/stale track value while SMM hasn't published → waiting in Review.
  if (v === 'ready' || v === 'published' || v === 'done') return 'review'
  return 'brief' // empty / not started → "To Do List"
}

// Overall post status derived from the two tracks (used when a track changes).
function deriveStatus(p: Post): Post['status'] {
  const hv = hasVideo(p), hd = hasDesign(p)
  if ((hv && p.video_status === 'revisi') || (hd && p.design_status === 'revisi')) return 'revisi'
  const vOk = !hv || trackDone(p.video_status)
  const dOk = !hd || trackDone(p.design_status)
  if ((hv || hd) && vOk && dOk) return 'review'
  // Every present track still waiting in "To Do List" → the post belongs in
  // Brief on SMM (To Do List ↔ Brief), not Production. A track that has actually
  // started (produksi+) is what pulls the post into Production.
  const vPending = !hv || trackPending(p.video_status)
  const dPending = !hd || trackPending(p.design_status)
  if ((hv || hd) && vPending && dPending) return 'brief'
  return 'produksi'
}

// Which SMM column a post sits in. A single Revisi column: a post sits there
// while EITHER track is in revision. A post only reaches Review once ALL of its
// tracks are done (review/done/ready/published) — until then it stays in
// Production, with per-track chips on the card showing each discipline's stage.
function smmColKey(p: Post): string {
  const s = p.status
  if (s === 'todo' || s === 'ready' || s === 'published' || s === 'done') return s
  const hv = hasVideo(p), hd = hasDesign(p)
  // Trackless posts (no Video Production / Design Studio discipline) just honour
  // their own status — including 'brief' → the Brief column.
  if (!hv && !hd) return s
  if ((hv && p.video_status === 'revisi') || (hd && p.design_status === 'revisi')) return 'revisi'
  const vOk = !hv || trackDone(p.video_status)
  const dOk = !hd || trackDone(p.design_status)
  if (vOk && dOk) return 'review'
  // All present tracks still in "To Do List" → Brief (mirrors deriveStatus), so a
  // WS card moved back to To Do List leaves Production on the SMM board too.
  const vPending = !hv || trackPending(p.video_status)
  const dPending = !hd || trackPending(p.design_status)
  if (vPending && dPending) return 'brief'
  return 'produksi'
}

// Updates to apply when a card is dropped on an SMM column. For the track-driven
// columns (revisi / produksi / review) we move every applicable track so the
// derived column stays in sync with the card's new position.
function smmUpdates(p: Post, colKey: string): Partial<Post> {
  switch (colKey) {
    // Back to Brief / To Do List: reset every track so the WS boards follow.
    case 'brief': return {
      status: 'brief',
      ...(hasVideo(p) ? { video_status: 'brief' } : {}),
      ...(hasDesign(p) ? { design_status: 'brief' } : {}),
    }
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

// My Task board reuses the Video Production columns (WS_STATUS_COLS: To Do List ·
// Revisi · Production · Review · Done). A post's overall status maps to a column
// directly (no per-track logic, since My Task aggregates any project's posts).
export function mineColKey(p: Post): string {
  // Derive from the SAME logic the SMM board uses (status + tracks), then fold
  // it into the WS columns — so My Task and All Project always agree.
  switch (smmColKey(p)) {
    case 'revisi': return 'revisi'
    case 'produksi': return 'produksi'
    case 'review': return 'review'
    case 'ready':
    case 'published':
    case 'done': return 'done'
    default: return 'brief' // todo + brief → To Do List
  }
}
// A task belongs to an account's personal board when that account is tagged on
// it, OR it's that account's own personal/ad-hoc task. Shared by My Task, the
// Team per-account tabs, and the summary dashboards so they always agree.
export function isAccountTask(p: Post, acct: { email: string; name: string }): boolean {
  const tags = (p.tagged || []).map(x => (x || '').toLowerCase())
  const taggedMe = tags.includes(acct.email.toLowerCase())
  const myPersonal = p.entity === 'personal' && (p.created_by || '') === acct.name
  return taggedMe || myPersonal
}
// Dropping a card on a My Task column sets the post's status accordingly.
const MINE_COL_STATUS: Record<string, Post['status']> = {
  brief: 'brief', revisi: 'revisi', produksi: 'produksi', review: 'review', done: 'ready',
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
import { projectGlyph } from '@/lib/project-glyph'

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
  /** "My Task" mode: show tasks tagging me OR created by me, across all projects. */
  mineScope?: { email: string; name: string }
}

export const BPIPage = forwardRef<BPIPageHandle, BPIPageProps>(
  function BPIPage({ entity, picScope, allProjects, calEntity, currentUser = 'Naufal', activeTab, filters, mineScope }, ref) {
    const t = useT()
    const { posts, removePost, upsertPost, meEmail, postSeen, chatUnread, clearChatUnread } = useStore(useShallow((s) => ({ posts: s.posts, removePost: s.removePost, upsertPost: s.upsertPost, meEmail: s.meEmail, postSeen: s.postSeen, chatUnread: s.chatUnread, clearChatUnread: s.clearChatUnread })))
    const markPostRead = useMarkPostRead()
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
      mineScope ? undefined
      : allProjects ? 'all'
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
      // My Task uses the WS columns but writes the SAME updates as the SMM board
      // (status + every applicable track) so All Project / Video Production stay
      // in sync. No revision popup — dropping on Revisi just sets it.
      if (mineScope) {
        if (mineColKey(post) === colKey) return
        const smmKey = MINE_COL_STATUS[colKey]
        if (!smmKey) return
        const updates = smmUpdates(post, smmKey)
        upsertPost({ ...post, ...updates } as Post) // optimistic
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (getSupabase() as any).from('posts').update(updates).eq('id', post.id)
        if (error) { upsertPost(post); return }
        logActivity(`Task "${post.title}" dipindahkan`)
        return
      }
      // Video Production / Design Studio: Done belongs to the Socmed Management
      // board. Once a post is Ready to Post / Published its track cards sit in
      // Done and are LOCKED here — they can't be dragged back to Review or
      // anywhere else. Only SMM can release them (by leaving Ready/Published).
      if (boardTrack && (post.status === 'ready' || post.status === 'published')) return
      // You also can't drop INTO Revisi or Done on these boards. Revisi is set
      // only from the Socmed Management board (opens the revision popup); Done is
      // set automatically when the post goes Ready/Published.
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
      logActivity(`Task "${post.title}" dipindahkan`)
    }

    // Memoized: the board re-renders on every drag-over/hover tick. Without this
    // the filter runs (and the `unreadIds` memo below busts) on every one of
    // those renders, and a fresh `filtered` array re-renders the whole board.
    const filtered = useMemo(() => posts.filter(p => {
      // Scope: all socmed projects, by assigned PIC (workspace), or by entity (board).
      // All Project = combined view of every socmed post regardless of slug, so
      // posts on newly-created projects appear too. Only board/PIC modes scope.
      if (mineScope) {
        // My Task receives project tasks ONLY via tagging; plus my own personal
        // tasks (the private 'personal' bucket created from here).
        if (!isAccountTask(p, mineScope)) return false
      } else if (allProjects
        // All Project shows every project EXCEPT the private My Task bucket.
        ? p.entity === 'personal'
        : picScope ? !(p.pics || []).includes(picScope) : p.entity !== entity) return false
      // The per-PIC workspace boards only pick a post up once it's briefed: while
      // it's still at 'todo' (Socmed Management "Idea") it must NOT appear there.
      // My Task is different — a task that tags you is a direct assignment, so it
      // shows at any status (a 'todo' folds into the To Do List column).
      if (picScope && p.status === 'todo') return false
      if (filters.platforms.length && !filters.platforms.some(x => ((p.platforms || []) as string[]).includes(x))) return false
      if (filters.contentTypes.length && !filters.contentTypes.some(x => (p.content_types || []).includes(x))) return false
      if (filters.tagged.length && !filters.tagged.some(x => (p.tagged || []).includes(x))) return false
      if (filters.ratios.length) {
        const rs = (p.ratio || '').split(',').map(s => s.trim()).filter(Boolean)
        if (!filters.ratios.some(x => rs.includes(x))) return false
      }
      if (filters.month && (p.date || '').slice(0, 7) !== filters.month) return false
      // My Task groups by its WS columns, so its Status filter matches the folded
      // column key, not the raw post status.
      if (filters.statuses.length && !filters.statuses.includes(mineScope ? mineColKey(p) : p.status)) return false
      if (filters.projects.length && !filters.projects.includes(p.entity)) return false
      return true
    }), [posts, allProjects, picScope, entity, filters, mineScope])

    // Ids of tasks with an unseen change made by someone else → drives the card
    // dots and the per-column counts. Recomputes live as posts stream in or the
    // viewer opens tasks (postSeen changes).
    const unreadIds = useMemo(
      () => new Set(filtered.filter(p => isPostMarked(p, meEmail, postSeen, chatUnread)).map(p => p.id)),
      [filtered, meEmail, postSeen, chatUnread],
    )

    // Capture the PRIOR seen time when opening a task so the detail can flag the
    // sections changed since the last visit. We do NOT mark it read here — the
    // modal does that on CLOSE, so the markers stay visible (and identical) no
    // matter which tab opened the task, instead of one entry point clearing them
    // before another can show them.
    const [previewSince, setPreviewSince] = useState(0)
    function openPreview(id: string) {
      setPreviewSince(postSeen[id] ?? 0)
      setPreviewPostId(id)
    }

    // "Baca Semua" on a status column: clear every marker on its tasks — both
    // the post-change markers (post_reads) AND any unread chat (mark the task's
    // room read), so the whole column goes quiet for this user only.
    function readColumn(colPosts: Post[]) {
      for (const p of colPosts) {
        if (!unreadIds.has(p.id)) continue
        markPostRead(p.id, p.last_change_at)
        if (isChatUnread(p, chatUnread)) {
          const room = taskChatRoom(p.entity, p.id)
          clearChatUnread(room) // instant; the POST below persists it
          fetch(`/api/chat/${encodeURIComponent(room)}/read`, { method: 'POST' }).catch(() => {})
        }
      }
    }

    function openEdit(id?: string) {
      setEditPostId(id || null)
      setShowPostModal(true)
    }

    useImperativeHandle(ref, () => ({ openEdit }))

    function handleDelete(id: string) {
      setConfirmReq({
        title: t('Hapus Task'),
        message: t('Task ini akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.'),
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
            logActivity('Task dihapus')
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
          <DeepLinkPost onOpen={openPreview} />
        </Suspense>
        {/* Tab content */}
        {/* Board manages its own horizontal gutters INSIDE the scroll area (so
            the first/last columns keep breathing room from the card edge even
            when scrolled); other tabs get the uniform 24px page padding. */}
        <div style={{ padding: activeTab === 'board' ? '0 0 24px' : 24 }}>
          {activeTab === 'list' && (
            <ListView posts={filtered} canEdit={canEdit} onEdit={openEdit} onDelete={handleDelete} onPreview={openPreview} unreadIds={unreadIds} />
          )}
          {activeTab === 'board' && (
            <KanbanBoard
              posts={filtered}
              currentUser={currentUser}
              statusFilter={filters.statuses}
              canEdit={canEdit}
              onEdit={openEdit}
              onDelete={handleDelete}
              onCardClick={openPreview}
              unreadIds={unreadIds}
              onReadColumn={readColumn}
              accounts={accounts}
              showTrackStatus={!boardTrack && !mineScope}
              colSet={boardTrack || mineScope ? WS_STATUS_COLS : SMM_STATUS_COLS}
              noDropCols={boardTrack ? ['revisi', 'done'] : undefined}
              lockDrag={boardTrack ? (p => p.status === 'ready' || p.status === 'published') : undefined}
              colOf={
                mineScope ? mineColKey
                : boardTrack === 'video' ? (p => trackColKey(p.video_status, p.status))
                : boardTrack === 'design' ? (p => trackColKey(p.design_status, p.status))
                : smmColKey
              }
              onMove={moveOnBoard}
            />
          )}
          {activeTab === 'calendar' && <ContentCalendar entity={mineScope ? 'all' : (allProjects ? 'all' : (calEntity ?? entity))} mineScope={mineScope} onPostClick={openPreview} filters={filters} />}
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
            hideSelfAccount={!!mineScope}
            defaultStatus={mineScope ? 'brief' : undefined}
            personal={!!mineScope}
          />
        )}
        {previewPostId && (
          <PostPreviewModal
            open={!!previewPostId}
            postId={previewPostId}
            canEdit={canEdit}
            seenSince={previewSince}
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
  // Hold onOpen in a ref so the effect doesn't depend on its identity. onOpen
  // (openPreview) is recreated every render; depending on it would re-run this
  // effect each render and loop setState. Fire once per post id instead.
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen
  const firedRef = useRef<string | null>(null)
  useEffect(() => {
    const pid = searchParams.get('post')
    if (!pid || firedRef.current === pid) return
    firedRef.current = pid
    onOpenRef.current(pid)
    router.replace(pathname)
  }, [searchParams, pathname, router])
  return null
}

// ── List View ──
function ListView({
  posts, onEdit, onDelete, onPreview, canEdit = true, unreadIds,
}: {
  posts: Post[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onPreview: (id: string) => void
  canEdit?: boolean
  unreadIds?: Set<string>
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
                  {t('Belum ada task. Klik "+ Tambah Task" untuk mulai.')}
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
              <td>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  {unreadIds?.has(p.id) && (
                    <span
                      title={t('Ada perubahan baru')}
                      style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent2)', flexShrink: 0 }}
                    />
                  )}
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{p.title}</span>
                </span>
              </td>
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
  colSet, colOf, onMove, canEdit = true, accounts, showTrackStatus = false, noDropCols, lockDrag,
  unreadIds, onReadColumn,
}: {
  posts: Post[]
  currentUser: string
  statusFilter: string[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onCardClick: (id: string) => void
  /** Ids of posts with an unseen change (by someone else) → dot + column count. */
  unreadIds?: Set<string>
  /** Mark every changed task in a column as read ("Baca Semua"). */
  onReadColumn?: (posts: Post[]) => void
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
  /** Cards for which dragging is disabled entirely (e.g. Done on VP/DS boards). */
  lockDrag?: (post: Post) => boolean
}) {
  // When statuses are filtered, only show those columns.
  const t = useT()
  const isMobile = useIsMobile()
  const baseCols: readonly BoardCol[] = colSet ?? BPI_STATUS_COLS
  const keyOf = (p: Post) => (colOf ? colOf(p) : p.status)
  const cols = useMemo(
    () => (statusFilter.length ? baseCols.filter(c => statusFilter.includes(c.key)) : baseCols),
    [baseCols, statusFilter],
  )
  // Pre-group posts into their columns ONCE per data change. Dragging fires
  // setDragOverCol on every pointer tick, re-rendering the whole board; doing
  // the filter+sort per column inside the render (cols × posts, with an
  // n·log n sort each) on every one of those ticks is what made the board
  // janky. The drag state lives in this component, so colOf/posts stay stable
  // mid-drag and this memo is reused — the expensive work runs zero times per
  // drag tick instead of once per column.
  const postsByCol = useMemo(() => {
    const m = new Map<string, Post[]>()
    for (const c of cols) m.set(c.key, [])
    for (const p of posts) m.get(keyOf(p))?.push(p)
    m.forEach(arr => arr.sort(byPostDateAsc))
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, cols, colOf])
  const [dragPostId, setDragPostId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [hoverCol, setHoverCol] = useState<string | null>(null)

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
    if (!onMove || lockDrag?.(post)) return
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
      display: 'flex', gap: 12, overflowX: 'auto',
      paddingLeft: 24, paddingBottom: 8, alignItems: 'flex-start', marginTop: 20,
    }}>
      {cols.map(col => {
        const colPosts = postsByCol.get(col.key) ?? []
        const colUnread = unreadIds ? colPosts.reduce((n, p) => n + (unreadIds.has(p.id) ? 1 : 0), 0) : 0
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
            onMouseEnter={() => setHoverCol(col.key)}
            onMouseLeave={() => setHoverCol(c => (c === col.key ? null : c))}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexShrink: 0, position: 'relative' }}>
              <span style={{ fontWeight: 600, color: col.color, fontSize: 14 }}>{col.label}</span>
              <span style={{
                fontSize: 12, color: col.color, background: col.color + '22',
                borderRadius: 20, padding: '1px 7px', fontWeight: 500,
              }}>
                {colPosts.length}
              </span>
              {colUnread > 0 && (
                <span
                  title={t('Ada perubahan baru di kolom ini')}
                  style={{
                    width: 8, height: 8, borderRadius: '50%', background: 'var(--accent2)', flexShrink: 0,
                  }}
                />
              )}
              {isLocked && <span title={t('Kamu tidak bisa drag ke kolom ini')} style={{ fontSize: 13, opacity: 0.5 }}>🔒</span>}
              {colUnread > 0 && hoverCol === col.key && onReadColumn && (
                <button
                  onClick={(e) => { e.stopPropagation(); onReadColumn(colPosts) }}
                  title={t('Tandai semua perubahan di kolom ini sudah dibaca')}
                  style={{
                    position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    color: 'var(--accent2)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                  }}
                  onMouseOver={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline' }}
                  onMouseOut={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none' }}
                >
                  {t('Baca semua')}
                </button>
              )}
            </div>

            {/* paddingTop/Left + matching negative margins give the cards'
                top-left corner dot room to show without clipping, while keeping
                the cards themselves in exactly the same place. */}
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 60, paddingTop: 6, paddingLeft: 6, marginTop: -6, marginLeft: -6 }}>
              {colPosts.map(p => {
                const locked = lockDrag?.(p) ?? false
                return (
                <KanbanCard
                  key={p.id}
                  post={p}
                  locked={locked}
                  onDragStart={(e) => {
                    if (locked) { e.preventDefault(); return }
                    e.dataTransfer.setData('text/plain', p.id)
                    e.dataTransfer.effectAllowed = 'move'
                    setDragPostId(p.id)
                  }}
                  onDragEnd={() => { setDragPostId(null); setDragOverCol(null) }}
                  onTouchStart={(e) => startTouchDrag(p, e)}
                  picked={dragPostId === p.id}
                  nativeDraggable={!isMobile && !locked}
                  onClick={() => onCardClick(p.id)}
                  onEdit={() => onEdit(p.id)}
                  onDelete={() => onDelete(p.id)}
                  canEdit={canEdit}
                  accounts={accounts}
                  showTrackStatus={showTrackStatus}
                  unread={unreadIds?.has(p.id) ?? false}
                />
                )
              })}
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
                {t('Tambah task')}
              </button>
            )}
          </div>
        )
      })}
      {/* Right gutter: a flex spacer keeps the last column off the card edge
          when scrolled fully right (the gap before it + this width ≈ the left
          padding, so both ends match). */}
      <div aria-hidden style={{ flex: '0 0 12px', alignSelf: 'stretch' }} />
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

function TrackChip({ icon, track, value, status }: { icon: string; track: string; value: string; status: string }) {
  const stage = TRACK_STAGE[trackColKey(value || '', status)] ?? TRACK_STAGE.brief
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
  onTouchStart, picked = false, nativeDraggable = true, locked = false, unread = false,
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
  /** Done card on a VP/DS board — dragging is disabled (SMM owns the move). */
  locked?: boolean
  /** Someone else changed this task and the viewer hasn't opened it since. */
  unread?: boolean
}) {
  const t = useT()
  const [hovered, setHovered] = useState(false)
  // Tagged accounts (emails) shown bottom-right — NOT the content-type PICs.
  const tagged = (post.tagged || []).filter(m => m.includes('@'))
  // Show per-track status only on the Socmed Management board AND only for posts
  // that carry BOTH tracks (video + design) — so the lead can see which
  // discipline is where while the card waits in Production. The chips appear
  // once the task is briefed (status 'brief'+); while it's still an Idea ('todo')
  // it hasn't been handed to Video Production / Design Studio yet, so no chips.
  const dualTrack = showTrackStatus && hasVideo(post) && hasDesign(post) && post.status !== 'todo'
  return (
    <div
      className="kanban-card"
      draggable={nativeDraggable}
      title={locked ? t('Sudah Done — hanya Socmed Management yang bisa memindahkan') : undefined}
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
      {/* Unread-change dot — top-left corner of the card. */}
      {unread && (
        <span
          title={t('Ada perubahan baru')}
          style={{
            position: 'absolute', top: -3, left: -3, width: 10, height: 10, borderRadius: '50%',
            background: 'var(--accent2)', zIndex: 4,
            boxShadow: '0 0 0 2px var(--bg2), 0 0 6px rgba(255,69,58,0.55)',
          }}
        />
      )}

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
          <TrackChip icon="🎬" track="Video" value={post.video_status} status={post.status} />
          <TrackChip icon="🎨" track="Design" value={post.design_status} status={post.status} />
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
                  <img loading="lazy" decoding="async"
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
  // Private My Task bucket shows "me"; the ad-hoc "other" shows "OT".
  const label = entity === 'personal' ? 'me'
    : proj?.glyph || (entity === 'ws' ? 'ws' : entity === 'other' ? 'OT' : proj ? projectGlyph(proj.name) : entity.slice(0, 3))
  const color = proj?.color || '#5a5a60'
  const title = entity === 'personal' ? 'My Task' : proj?.name || (entity === 'ws' ? 'Workspace' : entity === 'other' ? 'Other' : entity)
  return (
    <span
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 1,
        backgroundColor: color,
        backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.06) 45%, rgba(0,0,0,0.16) 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -1px 0 rgba(0,0,0,0.22), 0 1px 3px rgba(0,0,0,0.25)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: '0.03em',
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
        {withFiles.length} {t('task dengan lampiran file')}
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
          {t('Belum ada task dengan file terlampir.')}
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
  projects: string[]
}
export const EMPTY_FILTERS: PostFilters = { platforms: [], contentTypes: [], tagged: [], ratios: [], month: '', statuses: [], projects: [] }

// Owns filter state + the data the popup needs (accounts, months for an entity).
export function useBoardFilter(scope: string | { pic: string }) {
  const posts = useStore((s) => s.posts)
  const socmed = useSocmedProjects(true)
  const [filters, setFilters] = useState<PostFilters>(EMPTY_FILTERS)
  const [accounts, setAccounts] = useState<{ email: string; name: string }[]>([])
  // Project filter only makes sense on the combined "All Project" board; on a
  // single-project / per-PIC board everything is one project already.
  const projects = useMemo(() => {
    if (!(typeof scope === 'string' && scope === 'all')) return [] as { slug: string; name: string }[]
    const present = new Set(posts.map(p => p.entity).filter(Boolean))
    present.add('other') // always offer the ad-hoc "Other" bucket
    present.delete('personal') // private My Task tasks never appear on All Project
    const nameOf = (slug: string) => socmed.find(p => p.slug === slug)?.name
      || (slug === 'other' ? 'Other' : slug === 'bpi' ? 'BPI' : slug === 'bsi' ? 'BSI' : slug)
    return Array.from(present).sort().map(slug => ({ slug, name: nameOf(slug) }))
  }, [posts, scope, socmed])
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
  return { filters, setFilters, accounts, months, projects }
}

// Filter button + popup. Render in the page header's tab row.
export function BoardFilter({ filters, setFilters, accounts, months, projects = [], personal = false }: {
  filters: PostFilters
  setFilters: React.Dispatch<React.SetStateAction<PostFilters>>
  accounts: { email: string; name: string }[]
  months: string[]
  projects?: { slug: string; name: string }[]
  // My Task: show only the filters that apply to personal tasks (Status + Month).
  personal?: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const count = personal
    ? filters.statuses.length + (filters.month ? 1 : 0)
    : filters.platforms.length + filters.contentTypes.length + filters.tagged.length +
      filters.ratios.length + filters.statuses.length + filters.projects.length + (filters.month ? 1 : 0)
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
        <FilterPopup filters={filters} setFilters={setFilters} accounts={accounts} months={months} projects={projects} personal={personal} onClose={() => setOpen(false)} />
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

function FilterPopup({ filters, setFilters, accounts, months, projects, personal = false, onClose }: {
  filters: PostFilters
  setFilters: React.Dispatch<React.SetStateAction<PostFilters>>
  accounts: { email: string; name: string }[]
  months: string[]
  projects: { slug: string; name: string }[]
  personal?: boolean
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

        {!personal && projects.length > 0 && (
          <FilterSection label={t('Project')}>
            {projects.map(p => (
              <FilterChip key={p.slug} label={p.name} active={filters.projects.includes(p.slug)}
                onClick={() => setFilters(f => ({ ...f, projects: toggle(f.projects, p.slug) }))} />
            ))}
          </FilterSection>
        )}

        {/* Socmed-only filters — hidden on My Task (personal tasks have none). */}
        {!personal && (<>
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
        </>)}

        <FilterSection label={personal ? t('Jatuh Tempo') : t('Bulan Posting')}>
          {months.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>—</span>
          ) : months.map(ym => (
            <FilterChip key={ym} label={monthLabel(ym)} active={filters.month === ym}
              onClick={() => setFilters(f => ({ ...f, month: f.month === ym ? '' : ym }))} />
          ))}
        </FilterSection>

        <FilterSection label={t('Status')}>
          {(personal ? WS_STATUS_COLS : BPI_STATUS_COLS).map(s => (
            <FilterChip key={s.key} label={s.label} active={filters.statuses.includes(s.key)}
              onClick={() => setFilters(f => ({ ...f, statuses: toggle(f.statuses, s.key) }))} />
          ))}
        </FilterSection>
      </div>
    </>
  )
}
