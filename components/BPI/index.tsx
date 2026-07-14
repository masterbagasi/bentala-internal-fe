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
import { taskChatRoom, isEffectiveSuperAdmin } from '@/lib/access'
import { BPI_STATUS_COLS, WS_STATUS_COLS, SMM_STATUS_COLS, POST_PLATFORMS, POST_RATIOS, stColorFromHex, stTintFromHex } from '@/lib/constants'
import { htmlToPlain } from '@/lib/rich-text'

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
// Roll the master status UP from each tagged assignee's My Task worksheet — the
// creator's card (and the All Project board) shows this. Each tagged account is
// a "track"; a missing row = not started (To Do List). Mirrors the min-rule the
// user wants: the master only reaches Review once EVERY assignee is at Review;
// while any is still behind it stays in Production (and Revisi wins outright).
export function deriveMineColKey(statuses: string[]): string {
  if (!statuses.length) return 'brief'
  if (statuses.some(s => s === 'revisi')) return 'revisi'
  if (statuses.every(s => s === 'brief')) return 'brief'
  if (statuses.every(s => s === 'done')) return 'ready'
  if (statuses.every(s => s === 'done' || s === 'review')) return 'review'
  return 'produksi'
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

// The single source of truth for which posts a board/dashboard shows. The board
// list AND the Team dashboard summary both run this so their counts always
// agree — apply a filter and the KPIs, status spread and task source move with
// the list. Scope, briefed-only, every active filter and the date range here.
export function filterBoardPosts(posts: Post[], opts: {
  entity: string
  picScope?: string
  allProjects?: boolean
  mineScope?: { email: string; name: string }
  /** Team overview: every account's briefed work (tagged to someone OR personal). */
  teamScope?: boolean
  filters: PostFilters
  dateRange?: { from: string; to: string }
  /** slug → human project name, so search can also match a project ("Master Bagasi"). */
  projectNameOf?: (slug: string) => string
}): Post[] {
  const { entity, picScope, allProjects, mineScope, teamScope, filters, dateRange, projectNameOf } = opts
  // My Task / Team group by their folded WS columns, so Status matches that key.
  const folded = !!mineScope || !!teamScope
  return posts.filter(p => {
    if (p.deleted_at) return false
    if (teamScope) {
      if (!((p.tagged && p.tagged.length > 0) || p.entity === 'personal')) return false
    } else if (mineScope) {
      if (!isAccountTask(p, mineScope)) return false
    } else if (allProjects
      ? p.entity === 'personal'
      : picScope ? !(p.pics || []).includes(picScope) : p.entity !== entity) return false
    // Briefed-only: an account's worksheet ignores tasks still at 'todo' (Idea).
    if ((picScope || mineScope || teamScope) && p.status === 'todo') return false
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase()
      // Search anything: task title, its project (slug + human name), tagged
      // accounts, platforms and content types.
      const hay = [
        p.title,
        p.entity,
        projectNameOf ? projectNameOf(p.entity || '') : '',
        ...(p.tagged || []),
        ...((p.platforms || []) as string[]),
        ...(p.content_types || []),
      ].join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (filters.platforms.length && !filters.platforms.some(x => ((p.platforms || []) as string[]).includes(x))) return false
    if (filters.contentTypes.length && !filters.contentTypes.some(x => (p.content_types || []).includes(x))) return false
    if (filters.tagged.length && !filters.tagged.some(x => (p.tagged || []).includes(x))) return false
    if (filters.ratios.length) {
      const rs = (p.ratio || '').split(',').map(s => s.trim()).filter(Boolean)
      if (!filters.ratios.some(x => rs.includes(x))) return false
    }
    if (filters.month && (p.date || '').slice(0, 7) !== filters.month) return false
    if (dateRange) {
      // Filtering is BY task date, so an undated task matches no range — drop it.
      const d = (p.date || '').slice(0, 10)
      if (!d || d < dateRange.from || d > dateRange.to) return false
    }
    if (filters.statuses.length && !filters.statuses.includes(folded ? mineColKey(p) : p.status)) return false
    if (filters.projects.length && !filters.projects.includes(p.entity)) return false
    return true
  })
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
import { useMyTaskStatus, useAllTaskStatuses } from '@/hooks/useMyTaskStatus'
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
  /** Preview-only: hide Edit/Add/Delete and open task details read-only. */
  readOnly?: boolean
  /** Optional date-range filter (by post date). Undated tasks are excluded. */
  dateRange?: { from: string; to: string }
  /** When set, clicking a task reports its id to the parent instead of opening
   *  the built-in modal — the parent renders the detail itself (split-view). */
  onPreviewPost?: (id: string) => void
}

export const BPIPage = forwardRef<BPIPageHandle, BPIPageProps>(
  function BPIPage({ entity, picScope, allProjects, calEntity, currentUser = 'Naufal', activeTab, filters, mineScope, readOnly = false, dateRange, onPreviewPost }, ref) {
    const t = useT()
    const { posts, removePost, upsertPost, meEmail, meName, postSeen, chatUnread, clearChatUnread } = useStore(useShallow((s) => ({ posts: s.posts, removePost: s.removePost, upsertPost: s.upsertPost, meEmail: s.meEmail, meName: s.meName, postSeen: s.postSeen, chatUnread: s.chatUnread, clearChatUnread: s.clearChatUnread })))
    const markPostRead = useMarkPostRead()
    // slug → human project name, used so search can match a project by name.
    const socmedProjects = useSocmedProjects(false)
    const projectNameOf = useMemo(() => {
      const m = new Map(socmedProjects.map(pr => [pr.slug, pr.name]))
      return (slug: string) => slug === 'personal' ? 'Personal' : (m.get(slug) || (slug === 'other' ? 'Other' : slug))
    }, [socmedProjects])
    // Per-user status for My Task (tagged posts get their own independent status).
    const { statusMap: myStatus, setStatus: setMyStatus, loaded: myStatusLoaded } = useMyTaskStatus(mineScope)
    // Every account's per-task status → per-assignee chips on the My Task board.
    const { map: allTaskStatus, loaded: allStatusLoaded } = useAllTaskStatuses(!!mineScope || !!allProjects)
    // Whether the logged-in account created this task. The creator OWNS the
    // task's master status (their My Task mirrors it and their moves write it);
    // a tagged assignee instead gets an independent worksheet. Tasks with no
    // recorded creator are treated as owned by the viewer (legacy rows). Uses the
    // logged-in user's name so the creator check works on EVERY board (not just
    // My Task) — created_by is stored as a display name.
    const myName = (mineScope?.name || meName || currentUser || '').trim().toLowerCase()
    const isTaskCreator = (p: Post) => !p.created_by || myName === (p.created_by || '').trim().toLowerCase()
    // Super admins may delete/restore any task (like the creator). Everything
    // else (Revisi / finalize / worksheet) stays creator-vs-assignee as before.
    const [isSuper, setIsSuper] = useState(false)
    useEffect(() => {
      if (!mineScope) return
      getSupabase().auth.getUser().then(({ data }) => {
        setIsSuper(isEffectiveSuperAdmin(data.user?.email, data.user?.app_metadata?.role))
      })
    }, [])
    // Who may delete (and, in the history, restore/purge) a task: its creator or
    // a super admin. A tagged assignee cannot.
    const canDeleteTask = (p: Post) => isTaskCreator(p) || isSuper
    // Which My Task column a card sits in.
    //  • Creator / owner → the task's OWN master status (mineColKey). Their moves
    //    write the post; a normal move never leaks to an assignee's worksheet.
    //  • Assignee (tagged, not creator) → their OWN worksheet: a per-user status
    //    that defaults to "To Do List". The creator's normal Brief↔Production↔
    //    Review moves do NOT drag this card — only the creator finalizing it
    //    (Ready to Post / Published / Done → Done, frozen) or sending a Revisi
    //    (pushed straight into this worksheet row) moves it across.
    const mineColOf = (p: Post) => {
      if (isTaskCreator(p)) return mineColKey(p)
      if (p.status === 'ready' || p.status === 'published' || p.status === 'done') return 'done'
      return myStatus[p.id] ?? 'brief'
    }
    // Push a per-user My Task status onto every account tagged on a task — used
    // when the creator sends it to Revisi so it lands in each assignee's own
    // worksheet (RLS allows writing others' rows; each client picks it up live).
    async function pushWorksheetStatus(post: Post, status: string) {
      const emails = Array.from(new Set((post.tagged || []).map(e => (e || '').toLowerCase()).filter(Boolean)))
      if (!emails.length) return
      const rows = emails.map(email => ({ post_id: post.id, email, status, updated_at: new Date().toISOString() }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (getSupabase() as any).from('post_task_status').upsert(rows, { onConflict: 'post_id,email' })
    }
    // Brief, transient notice (e.g. blocking an assignee from a creator-only move).
    const [notice, setNotice] = useState<string | null>(null)
    const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    function showNotice(msg: string) {
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
      setNotice(msg)
      noticeTimer.current = setTimeout(() => setNotice(null), 3000)
    }
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
    const canEdit = !picScope && !readOnly
    // Opening the FULL edit form is restricted to the task's creator (or a super
    // admin). Everyone else can still open the task detail to add files, chat,
    // change their own status, etc. — just not rewrite the whole task.
    const canEditPost = (p: Post) => canEdit && (isTaskCreator(p) || isSuper)

    // Which board this is: the video track, the design track, or the combined
    // SMM board (null). Drag-to-move writes the right field per board.
    const boardTrack: 'video' | 'design' | null =
      picScope === VP_PIC ? 'video' : picScope === DS_PIC ? 'design' : null

    async function moveOnBoard(post: Post, colKey: string) {
      // My Task uses the WS columns but writes the SAME updates as the SMM board
      // (status + every applicable track) so All Project / Video Production stay
      // in sync. No revision popup — dropping on Revisi just sets it.
      if (mineScope) {
        // ── Assignee (tagged, not the creator) ──────────────────────────────
        // My Task is this account's OWN worksheet. It moves work forward on its
        // own status only; it never writes the post status, so it never touches
        // the creator's board or any other assignee.
        if (!isTaskCreator(post)) {
          // A finalized task (Ready to Post / Published / Done) is approved work —
          // frozen here; only the creator can release it.
          if (post.status === 'ready' || post.status === 'published' || post.status === 'done') {
            showNotice(t('Task sudah difinalisasi — hanya pembuatnya yang bisa memindahkannya.'))
            return
          }
          // Revisi and Done (= Ready to Post) are the creator's calls only.
          if (colKey === 'revisi' || colKey === 'done') {
            showNotice(
              colKey === 'revisi'
                ? t('Hanya pembuat task yang bisa memindahkan ke Revisi.')
                : t('Hanya pembuat task yang bisa menandai Ready to Post / Done.'),
            )
            return
          }
          // Normal move (To Do List / Production / Review) → set your own status,
          // then roll the master UP from every assignee's worksheet so the
          // creator's board follows (both at Review → Review; otherwise it stays
          // in Production). This updates the shared post status but NOT the other
          // assignees' worksheets — each account keeps its own card.
          if (mineColOf(post) === colKey) return
          await setMyStatus(post.id, colKey)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sb2 = getSupabase() as any
          const { data: rows } = await sb2.from('post_task_status').select('email, status').eq('post_id', post.id)
          const map: Record<string, string> = {}
          ;(rows ?? []).forEach((r: { email: string; status: string }) => { map[(r.email || '').toLowerCase()] = r.status })
          const meLc = (mineScope.email || '').toLowerCase()
          map[meLc] = colKey
          const assignees = Array.from(new Set((post.tagged || []).map(e => (e || '').toLowerCase()).filter(Boolean)))
          const statuses = (assignees.length ? assignees : [meLc]).map(e => map[e] ?? 'brief')
          const updates = smmUpdates(post, deriveMineColKey(statuses))
          upsertPost({ ...post, ...updates } as Post) // optimistic (master only)
          const { error } = await sb2.from('posts').update(updates).eq('id', post.id)
          if (error) { upsertPost(post); return }
          logActivity(`Task "${post.title}" dipindahkan`)
          return
        }
        // ── Creator / owner ─────────────────────────────────────────────────
        // You own the task's master status: your move writes the post directly.
        // Normal moves (Brief ↔ Production ↔ Review) stay on your board and never
        // leak to an assignee's worksheet (their mineColOf ignores them). Sending
        // to Revisi additionally lands it in every assignee's worksheet; Done
        // (Ready to Post) shows for them via the finalized display rule.
        if (mineColOf(post) === colKey) return
        const smmKey = MINE_COL_STATUS[colKey]
        if (!smmKey) return
        const updates = smmUpdates(post, smmKey)
        upsertPost({ ...post, ...updates } as Post) // optimistic
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (getSupabase() as any).from('posts').update(updates).eq('id', post.id)
        if (error) { upsertPost(post); return }
        if (colKey === 'revisi') await pushWorksheetStatus(post, 'revisi')
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
    const filtered = useMemo(
      () => filterBoardPosts(posts, { entity, picScope, allProjects, mineScope, filters, dateRange, projectNameOf }),
      [posts, allProjects, picScope, entity, filters, mineScope, dateRange, projectNameOf],
    )

    // Ids of tasks with an unseen change made by someone else → drives the card
    // dots and the per-column counts. Recomputes live as posts stream in or the
    // viewer opens tasks (postSeen changes).
    const unreadIds = useMemo(
      () => new Set(filtered.filter(p => isPostMarked(p, meEmail, postSeen, chatUnread, meName)).map(p => p.id)),
      [filtered, meEmail, meName, postSeen, chatUnread],
    )

    // Capture the PRIOR seen time when opening a task so the detail can flag the
    // sections changed since the last visit. We do NOT mark it read here — the
    // modal does that on CLOSE, so the markers stay visible (and identical) no
    // matter which tab opened the task, instead of one entry point clearing them
    // before another can show them.
    const [previewSince, setPreviewSince] = useState(0)
    function openPreview(id: string) {
      // Split-view: hand the click to the parent, which renders the detail panel.
      if (onPreviewPost) { onPreviewPost(id); return }
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
      // Editing an existing task requires being its creator (or a super admin).
      // A new task (no id) is always allowed. Non-creators can still open the
      // detail to add files, chat, change their own status, etc.
      if (id) {
        const p = posts.find(x => x.id === id)
        if (p && !canEditPost(p)) {
          showNotice(t('Hanya pembuat task atau super admin yang bisa mengedit task ini.'))
          return
        }
      }
      setEditPostId(id || null)
      setShowPostModal(true)
    }

    useImperativeHandle(ref, () => ({ openEdit }))

    function handleDelete(id: string) {
      // Only the task's creator (or a super admin) may delete it — a tagged
      // assignee can't delete a task assigned to them (My Task). Authoritative
      // guard for every entry point.
      if (mineScope) {
        const target = posts.find(p => p.id === id)
        if (target && !canDeleteTask(target)) {
          showNotice(t('Hanya pembuat task atau super admin yang bisa menghapus task ini.'))
          return
        }
      }
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
            <ListView posts={filtered} canEdit={canEdit} canEditPost={canEditPost} onEdit={openEdit} onDelete={handleDelete} onPreview={openPreview} unreadIds={unreadIds} showSource={!!mineScope || !!allProjects}
              canFinalize={mineScope ? isTaskCreator : undefined}
              onBlockedFinalize={() => showNotice(t('Hanya pembuat task yang bisa menandai Ready to Post / Done.'))}
              canDelete={mineScope ? canDeleteTask : undefined} />
          )}
          {activeTab === 'board' && (
            // My Task places cards by the per-user status map (mineColOf) — hold
            // the board until it's loaded so assignee cards don't flash in "To Do
            // List" and then jump to their real column.
            mineScope && (!myStatusLoaded || !allStatusLoaded) ? (
              <div style={{ padding: '52px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>{t('Memuat…')}</div>
            ) : (
            <KanbanBoard
              posts={filtered}
              currentUser={currentUser}
              statusFilter={filters.statuses}
              canEdit={canEdit}
              canEditPost={canEditPost}
              onEdit={openEdit}
              onDelete={handleDelete}
              onCardClick={openPreview}
              unreadIds={unreadIds}
              onReadColumn={readColumn}
              accounts={accounts}
              showTrackStatus={!boardTrack && !mineScope}
              taskStatusMap={mineScope || allProjects ? allTaskStatus : undefined}
              canDeletePost={mineScope ? canDeleteTask : undefined}
              colSet={boardTrack || mineScope ? WS_STATUS_COLS : SMM_STATUS_COLS}
              noDropCols={boardTrack ? ['revisi', 'done'] : undefined}
              lockDrag={
                boardTrack ? (p => p.status === 'ready' || p.status === 'published')
                // My Task: every card (personal or tagged) moves freely — a tagged
                // task carries the user's own status, decoupled from the owner.
                : undefined
              }
              colOf={
                mineScope ? mineColOf
                : boardTrack === 'video' ? (p => trackColKey(p.video_status, p.status))
                : boardTrack === 'design' ? (p => trackColKey(p.design_status, p.status))
                : smmColKey
              }
              onMove={moveOnBoard}
            />
            )
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
            canEditTask={(() => { const pp = posts.find(p => p.id === previewPostId); return !!pp && canEditPost(pp) })()}
            restrictStatus={!!mineScope}
            forceStaticStatus={(() => {
              // My Task: a personal task assigned to me by someone else keeps a
              // static status pill — only its creator can send it to Revisi or
              // finalize it (Ready to Post / Done).
              if (!mineScope) return false
              const pp = posts.find(p => p.id === previewPostId)
              return !!pp && !isTaskCreator(pp)
            })()}
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
            accounts={accounts}
            onClose={() => setRevisiPost(null)}
            onSaved={() => setRevisiPost(null)}
          />
        )}
        {/* Transient notice (e.g. an assignee blocked from a creator-only move). */}
        {notice && (
          <div
            role="status"
            style={{
              position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
              zIndex: 1000, padding: '11px 18px', borderRadius: 10,
              fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 9,
              background: 'rgba(255,107,107,0.16)', border: '1px solid rgba(255,107,107,0.5)',
              color: '#ff6b6b', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', maxWidth: '90vw',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {notice}
          </div>
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
// List order: unfinished work on top (soonest date first), finished tasks sink
// to the bottom — so the list reads as "what still needs doing" before "done".
const isPostDone = (p: Post) => p.status === 'published' || p.status === 'done'
function byListOrder(a: Post, b: Post): number {
  const da = isPostDone(a), db = isPostDone(b)
  if (da !== db) return da ? 1 : -1
  return byPostDateAsc(a, b)
}

// Which project a task comes from — a colour dot + name, mirroring the Task
// Source vocabulary in the dashboard summary.
function SourceCell({ entity }: { entity: string }) {
  const t = useT()
  const projects = useSocmedProjects(false)
  const key = entity === 'personal' ? 'personal' : (entity || 'other')
  const proj = projects.find(p => p.slug === key)
  const name = key === 'personal' ? t('Personal') : proj?.name || (key === 'other' ? t('Other') : key)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <EntityGlyph entity={key} size={22} />
      <span style={{ fontSize: 12.5, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
    </span>
  )
}

function ListView({
  posts, onEdit, onDelete, onPreview, canEdit = true, canEditPost, unreadIds, showSource = false,
  canFinalize, onBlockedFinalize, canDelete,
}: {
  posts: Post[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onPreview: (id: string) => void
  canEdit?: boolean
  /** Per-task gate for opening the full edit form (creator/super only). */
  canEditPost?: (p: Post) => boolean
  unreadIds?: Set<string>
  /** Cross-project views (My Task / Team / All Project) show which project a
   *  task comes from; single-project boards omit it (every row is the same). */
  showSource?: boolean
  /** My Task: whether this account may mark a task done (creator-only). */
  canFinalize?: (p: Post) => boolean
  /** Called when the finalize checkbox is blocked, to surface a notice. */
  onBlockedFinalize?: () => void
  /** My Task: whether this account may delete a task (creator-only). Hides the
   *  delete button for tasks assigned to — but not created by — this account. */
  canDelete?: (p: Post) => boolean
}) {
  const t = useT()
  // check + title + platform + date + status + pic + caption, plus optionals.
  const cols = 7 + (showSource ? 1 : 0) + (canEdit ? 1 : 0)
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
            {showSource && <th>{t('Sumber')}</th>}
            <th>{t('PIC')}</th>
            <th>{t('Caption')}</th>
            {canEdit && <th style={{ width: 96, whiteSpace: 'nowrap' }}>{t('Aksi')}</th>}
          </tr>
        </thead>
        <tbody>
          {posts.length === 0 ? (
            <tr>
              <td colSpan={cols}>
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text2)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                  {t('Belum ada task. Klik "+ Tambah Task" untuk mulai.')}
                </div>
              </td>
            </tr>
          ) : posts.slice().sort(byListOrder).map(p => (
            <tr key={p.id} onClick={() => onPreview(p.id)} style={{ cursor: 'pointer' }}>
              <td style={{ paddingLeft: 14 }}>
                <CheckCircle
                  done={p.status === 'published' || p.status === 'done'}
                  onChange={async (done) => {
                    // Finalizing (Ready to Post / Published) is creator-only in My Task.
                    if (canFinalize && !canFinalize(p)) { onBlockedFinalize?.(); return }
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
              {showSource && <td><SourceCell entity={p.entity} /></td>}
              <td>
                <div style={{ display: 'flex', gap: 3 }}>
                  {(p.pics || []).map(m => <TeamAvatar key={m} name={m} size={22} />)}
                </div>
              </td>
              <td style={{ color: 'var(--text2)', fontSize: 12, maxWidth: 180 }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {htmlToPlain(p.caption).slice(0, 50) || '—'}
                </span>
              </td>
              {canEdit && (
                <td onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {(!canEditPost || canEditPost(p)) && (
                    <button
                      onClick={() => onEdit(p.id)}
                      style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--text)', whiteSpace: 'nowrap' }}
                    >Edit</button>
                    )}
                    {(!canDelete || canDelete(p)) && (
                      <button
                        onClick={() => onDelete(p.id)}
                        style={{ background: 'var(--accent2)', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: '#fff', lineHeight: 1 }}
                      >✕</button>
                    )}
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
  colSet, colOf, onMove, canEdit = true, canEditPost, accounts, showTrackStatus = false, noDropCols, lockDrag,
  unreadIds, onReadColumn, taskStatusMap, canDeletePost,
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
  /** My Task: post_id → { email → worksheet status } for per-assignee chips. */
  taskStatusMap?: Record<string, Record<string, string>>
  /** My Task: whether this account may delete a task (creator-only) → hides the
   *  card delete button for tasks assigned to but not created by this account. */
  canDeletePost?: (p: Post) => boolean
  /** Per-task gate for opening the full edit form (creator/super only). */
  canEditPost?: (p: Post) => boolean
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
              background: active ? stTintFromHex(col.color, 8) : blocked ? '#ff6b6b12' : 'var(--bg2)',
              // Keep border width fixed (no layout shift) + ring via box-shadow.
              // No transform — scaling the drop target mid-drag breaks the drop.
              border: `1px solid ${active ? stColorFromHex(col.color) : blocked ? '#ff6b6b' : 'var(--border)'}`,
              borderRadius: 12, padding: '14px 12px 10px',
              flexShrink: 0, display: 'flex', flexDirection: 'column',
              // Desktop caps the column so its card list scrolls inside the
              // viewport. On mobile the page itself scrolls vertically and the
              // fixed top bar eats height, so an uncapped column would run off
              // the bottom — let it size to content and ride the page scroll.
              maxHeight: isMobile ? 'none' : 'calc(100vh - 200px)',
              boxShadow: active ? `0 0 0 2px ${stTintFromHex(col.color, 40)}, 0 8px 24px ${stTintFromHex(col.color, 20)}` : 'none',
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
              <span style={{ fontWeight: 600, color: stColorFromHex(col.color), fontSize: 14 }}>{col.label}</span>
              <span style={{
                fontSize: 12, color: stColorFromHex(col.color), background: stTintFromHex(col.color, 13),
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
                  canEditForm={canEditPost ? canEditPost(p) : canEdit}
                  canDelete={canDeletePost ? canDeletePost(p) : true}
                  accounts={accounts}
                  showTrackStatus={showTrackStatus}
                  assigneeStatus={taskStatusMap ? (taskStatusMap[p.id] ?? {}) : undefined}
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
                <span style={{ fontSize: 15, color: 'var(--link)', lineHeight: 1 }}>+</span>
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
        color: stColorFromHex(color), background: stTintFromHex(color, 12),
        border: `1px solid ${stTintFromHex(color, 33)}`,
      }}
    >
      <span style={{ fontSize: 10 }}>{icon}</span>
      {track} · {stage.label}
    </span>
  )
}

// ── Kanban Card ──
function KanbanCard({
  post, onDragStart, onDragEnd, onClick, onEdit, onDelete, canEdit = true, canEditForm = true, canDelete = true, accounts, showTrackStatus = false,
  onTouchStart, picked = false, nativeDraggable = true, locked = false, unread = false, assigneeStatus,
}: {
  post: Post
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
  canEdit?: boolean
  /** Whether the edit-pencil shows (creator/super only); delete stays separate. */
  canEditForm?: boolean
  /** My Task: false hides the delete button (task assigned to but not created
   *  by this account → only its creator may delete it). */
  canDelete?: boolean
  accounts?: AccountDir
  /** Socmed Management board: show per-track chips when the post has 2 tracks. */
  showTrackStatus?: boolean
  /** My Task: email → worksheet status for each tagged account → per-assignee
   *  chips (undefined off My Task; {} when set but no rows yet → all "To Do"). */
  assigneeStatus?: Record<string, string>
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

      {/* Hover actions — edit (creator/super only) + delete (Socmed Management boards only) */}
      {canEdit && (canEditForm || canDelete) && (
      <div style={{
        position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4,
        opacity: hovered ? 1 : 0, pointerEvents: hovered ? 'auto' : 'none',
        transition: 'opacity 0.12s',
      }}>
        {canEditForm && (
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
        )}
        {canDelete && (
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
        )}
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
          {/* My Task: each tagged account's progress on ITS OWN worksheet, read as
              a quiet list — the avatar wears its status colour as a ring, the
              status echoes it in a right-aligned micro-label so a whole card's
              statuses scan down one column. Finalized → everyone Done; a missing
              row = To Do List. Platforms (socmed) sit BELOW it. */}
          {assigneeStatus !== undefined && tagged.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 9 }}>
              {tagged.map(m => {
                const acc = accounts?.[m.toLowerCase()]
                const name = acc?.name || m.split('@')[0] || m
                const finalized = post.status === 'ready' || post.status === 'published' || post.status === 'done'
                const raw = finalized ? 'done' : (assigneeStatus[m.toLowerCase()] ?? 'brief')
                const stage = TRACK_STAGE[raw] ?? TRACK_STAGE.brief
                return (
                  <div key={m} title={`${name}: ${stage.label}`} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '3px 0' }}>
                    <span style={{ display: 'inline-flex', flexShrink: 0, borderRadius: '50%', boxShadow: `0 0 0 1.5px var(--bg3), 0 0 0 3px ${stColorFromHex(stage.color)}` }}>
                      {acc?.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" decoding="async" src={acc.avatarUrl} alt={name}
                          style={{ width: 19, height: 19, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <TeamAvatar name={name} size={19} />
                      )}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.055em', textTransform: 'uppercase', color: stColorFromHex(stage.color) }}>
                      {stage.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          {/* Platforms row (socmed) — sits at the BOTTOM. Off My Task the bare
              tagged avatars ride on the right of this same row. */}
          {((post.platforms || []).length > 0 || (assigneeStatus === undefined && tagged.length > 0)) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 9, minHeight: 22 }}>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                {(post.platforms || []).map(pl => (
                  <PlatformIcon key={pl} platform={pl} size={18} />
                ))}
              </div>
              {assigneeStatus === undefined && (
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
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Small project glyph on a board card — mirrors the sidebar tab logos
// (bpi = orange, bsi = purple) so a card shows which project it belongs to.
function EntityGlyph({ entity, size = 28 }: { entity: string; size?: number }) {
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
        width: size, height: size, borderRadius: size >= 26 ? 8 : 6, flexShrink: 0, marginTop: 1,
        backgroundColor: color,
        backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.06) 45%, rgba(0,0,0,0.16) 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -1px 0 rgba(0,0,0,0.22), 0 1px 3px rgba(0,0,0,0.25)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size >= 26 ? 9 : 8, fontWeight: 800, color: '#fff', letterSpacing: '0.03em',
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
              <a href={p.video_link} target="_blank" rel="noopener" style={{ fontSize: 12, color: 'var(--link)', textDecoration: 'none' }}>
                🎬 Video Link
              </a>
            )}
            {p.design_link && (
              <a href={p.design_link} target="_blank" rel="noopener" style={{ fontSize: 12, color: 'var(--link)', textDecoration: 'none' }}>
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
  /** Free-text task search (matches the title). */
  search: string
}
export const EMPTY_FILTERS: PostFilters = { platforms: [], contentTypes: [], tagged: [], ratios: [], month: '', statuses: [], projects: [], search: '' }

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

// Free-text task search for the header tab row. Collapsed to a single icon
// button by default; clicking it expands the input with a width animation and
// focuses it. Collapses back when left empty. Filters the board/list via
// filters.search → filterBoardPosts (matches title, project, tags, platforms).
export function BoardSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT()
  const [open, setOpen] = useState(!!value)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) inputRef.current?.focus() }, [open])
  return (
    <div
      style={{
        position: 'relative', height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', overflow: 'hidden',
        width: open ? 210 : 34, transition: 'width .22s cubic-bezier(.22,1,.36,1)',
        background: 'var(--bg2)', border: `1px solid ${open ? 'var(--border-strong)' : 'var(--border)'}`, borderRadius: 8,
      }}
    >
      <button
        type="button"
        aria-label={t('Cari task…')}
        onClick={() => (open ? inputRef.current?.focus() : setOpen(true))}
        style={{ width: 32, height: 32, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', color: 'var(--text2)', cursor: 'pointer' }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
      </button>
      <input
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => { if (!value.trim()) setOpen(false) }}
        placeholder={t('Cari task…')}
        style={{ flex: 1, minWidth: 0, height: '100%', background: 'transparent', border: 'none', outline: 'none', boxShadow: 'none', color: 'var(--text)', fontSize: 13, padding: 0, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
      />
      {open && value && (
        <button onClick={() => { onChange(''); inputRef.current?.focus() }} aria-label={t('Hapus')} style={{ width: 28, height: 32, flexShrink: 0, display: 'grid', placeItems: 'center', border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</button>
      )}
    </div>
  )
}

// Filter button + popup. Render in the page header's tab row.
export function BoardFilter({ filters, setFilters, accounts, months, projects = [], personal = false, size = 'sm' }: {
  filters: PostFilters
  setFilters: React.Dispatch<React.SetStateAction<PostFilters>>
  accounts: { email: string; name: string }[]
  months: string[]
  projects?: { slug: string; name: string }[]
  // My Task: show only the filters that apply to personal tasks (Status + Month).
  personal?: boolean
  // 'lg' matches the 40px control row in the Team account popup.
  size?: 'sm' | 'lg'
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const lg = size === 'lg'
  const count = personal
    ? filters.platforms.length + filters.projects.length + filters.statuses.length + (filters.month ? 1 : 0)
    : filters.platforms.length + filters.contentTypes.length + filters.tagged.length +
      filters.ratios.length + filters.statuses.length + filters.projects.length + (filters.month ? 1 : 0)
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: lg ? 8 : 6,
          height: lg ? 40 : 30, padding: lg ? '0 16px' : '0 12px', borderRadius: lg ? 10 : 8,
          boxSizing: 'border-box',
          border: '1px solid', borderColor: count ? 'var(--accent)' : 'var(--border)',
          background: count ? 'rgba(108,99,255,0.12)' : 'var(--bg3)',
          color: count ? 'var(--accent)' : 'var(--text2)',
          cursor: 'pointer', fontSize: lg ? 13 : 12, fontWeight: 600, whiteSpace: 'nowrap',
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
            style={{ background: 'none', border: 'none', color: 'var(--link)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            {t('Reset')}
          </button>
        </div>

        {/* Source (project) + Platform — useful on every cross-project view, so
            the account views (Team / My Task) get them too. */}
        {projects.length > 0 && (
          <FilterSection label={personal ? t('Sumber') : t('Project')}>
            {projects.map(p => (
              <FilterChip key={p.slug} label={p.name} active={filters.projects.includes(p.slug)}
                onClick={() => setFilters(f => ({ ...f, projects: toggle(f.projects, p.slug) }))} />
            ))}
          </FilterSection>
        )}

        <FilterSection label={t('Sosial Media')}>
          {POST_PLATFORMS.map(p => (
            <FilterChip key={p.key} label={p.label} active={filters.platforms.includes(p.key)}
              onClick={() => setFilters(f => ({ ...f, platforms: toggle(f.platforms, p.key) }))} />
          ))}
        </FilterSection>

        {/* Content type / Tag / Ratio — full boards only. */}
        {!personal && (<>
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
