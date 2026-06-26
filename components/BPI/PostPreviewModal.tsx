'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, BtnSecondary, ConfirmDialog } from '@/components/shared/Modal'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { getSupabase } from '@/lib/supabase'
import { deleteFile } from '@/lib/storage'
import { isUploadedFile } from '@/lib/attachments'
import { SubtaskEditor } from './SubtaskEditor'
import type { Subtask } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { TeamAvatar } from '@/components/shared/StatusBadge'
import { BPI_STATUS_COLS } from '@/lib/constants'
import type { Post } from '@/lib/types'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import { uploadFileResumable } from '@/lib/storage'
import { usePostComments, Tab } from '@/components/BPI/PostComments'
import { PostHistoryFeed } from '@/components/BPI/PostHistoryFeed'
import { usePostHistory } from '@/hooks/usePostHistory'
import { useMarkPostRead } from '@/hooks/usePostReads'
import { fieldsChangedSince, sectionMarked, attachmentsAddedSince, ATTACH_FIELDS } from '@/lib/post-history'
import { ChatRoom } from '@/components/Chat/ChatRoom'
import { taskChatRoom, isEffectiveSuperAdmin } from '@/lib/access'
import { RevisiModal, RevisiSection } from '@/components/BPI/RevisiModal'
import type { PostRevision } from '@/lib/types'
import { useIsMobile } from '@/hooks/useIsMobile'
import { downloadFileNoNav } from '@/lib/download'

// Module-level cache of resolved link titles (e.g. the real Google Drive file
// name) keyed by URL, so we only hit /api/og-preview once per link per session.
const linkNameCache = new Map<string, string>()

interface PostPreviewModalProps {
  open: boolean
  postId: string
  onClose: () => void
  onEdit: (id: string) => void
  /** When false (workspace pages), the "Edit Post" button is hidden. */
  canEdit?: boolean
  /** My Task / Team context: project-origin tasks follow the Video Production /
   *  Design Studio flow, so their status is changed only by dragging on the
   *  board (a static pill here, no free dropdown). Personal tasks stay free. */
  restrictStatus?: boolean
  /** Epoch ms the viewer last opened this task; sections changed by others
   *  after this (and the Activity rows) are flagged as new. Omit it (e.g. when
   *  opening from chat/notifications) and the modal resolves it from the store
   *  and marks the task read itself, matching the Projects board. */
  seenSince?: number
}

export function PostPreviewModal({ open, postId, onClose, onEdit, canEdit = true, restrictStatus = false, seenSince }: PostPreviewModalProps) {
  const t = useT()
  const isMobile = useIsMobile()
  const { posts, upsertPost, meEmail, chatUnread, clearChatUnread } = useStore(useShallow((s) => ({ posts: s.posts, upsertPost: s.upsertPost, meEmail: s.meEmail, chatUnread: s.chatUnread, clearChatUnread: s.clearChatUnread })))
  const post = posts.find(p => p.id === postId)
  const taskRoom = post ? taskChatRoom(post.entity, post.id) : ''
  // Unread chat in this task's room — drives the dot on the Chat tab. The dot
  // PERSISTS while the task is open: merely viewing the Chat tab no longer marks
  // the room read. It clears only when the user acts on the chat (send / react /
  // reply / edit / type) or closes the task — see markChatRead below.
  const chatHasUnread = !!taskRoom && (chatUnread[taskRoom] ?? 0) > 0
  // Mark this task's chat room read (server + local store). Called on a chat
  // action or when the task is closed.
  const markChatRead = useCallback(() => {
    if (!taskRoom) return
    clearChatUnread(taskRoom) // instant; the POST below persists it for next load
    fetch(`/api/chat/${encodeURIComponent(taskRoom)}/read`, { method: 'POST' }).catch(() => {})
  }, [taskRoom, clearChatUnread])
  // The viewer's last-seen time for THIS task drives every per-section "new"
  // dot. We snapshot it once when the task opens and DON'T advance it until the
  // task is closed — so the markers are identical no matter which tab opened the
  // task (Socmed board, Chat, notification, workspace) and never get consumed by
  // one entry point before the other can show them. When opened with an explicit
  // seenSince prop (the board), use that; otherwise resolve it from the store.
  const markPostRead = useMarkPostRead()
  const [selfSince, setSelfSince] = useState(0)
  useEffect(() => {
    if (!open || !postId || seenSince !== undefined) return
    setSelfSince(useStore.getState().postSeen[postId] ?? 0)
  }, [open, postId, seenSince])
  const effSince = seenSince ?? selfSince
  // Close the task: NOW mark it read (per-section dots clear next open) and
  // acknowledge the chat. Marking on close — not open — is what keeps the
  // markers consistent across entry points.
  const handleClose = useCallback(() => {
    markChatRead()
    if (postId) markPostRead(postId, posts.find(p => p.id === postId)?.last_change_at)
    onClose()
  }, [markChatRead, markPostRead, onClose, postId, posts])
  // Change-log for this task (realtime): drives the Activity tab AND the
  // per-section "what changed since you last looked" dots.
  const history = usePostHistory(open ? postId : null)
  const changedFields = fieldsChangedSince(history, effSince, meEmail)
  const briefMark = sectionMarked(changedFields, ['brief'])
  // The big task name in the header = the `title` field (labelled "Project Name"
  // in the edit form).
  const titleMark = sectionMarked(changedFields, ['title'])
  const statusMark = sectionMarked(changedFields, ['status'])
  // HEADLINE = the `headline` field only. `title` (the task name in the modal
  // header) has no section, so a title change must NOT light up Headline.
  const headlineMark = sectionMarked(changedFields, ['headline'])
  const captionMark = sectionMarked(changedFields, ['caption'])
  const hashtagsMark = sectionMarked(changedFields, ['hashtags'])
  const notesMark = sectionMarked(changedFields, ['notes'])
  const attachMark = sectionMarked(changedFields, ATTACH_FIELDS)
  // Exact set of attachment URLs added by someone else since the viewer last
  // looked — drives the per-file "new" outline. Authorship-aware (unlike a
  // plain time check), so the viewer's own uploads never get marked.
  const newAttachUrls = attachmentsAddedSince(history, effSince, meEmail)
  // Top metadata fields (Entity / Created by are immutable, so no marks there).
  const dateMark = sectionMarked(changedFields, ['date'])
  const platformMark = sectionMarked(changedFields, ['platforms'])
  const contentTypeMark = sectionMarked(changedFields, ['content_types'])
  const ratioMark = sectionMarked(changedFields, ['ratio'])
  const tagMark = sectionMarked(changedFields, ['tagged'])
  // Hooks must run before any early return (rules of hooks).
  // usePostComments is kept only for comments.me (used by activity-log inserts);
  // the discussion itself is now a full chat room (below).
  const comments = usePostComments(post)
  // Discussion area: Chat (the room) | Activity (change history), like before.
  const [detailTab, setDetailTab] = useState<'chat' | 'activity'>('chat')
  // Current user for the embedded task chat (needs email/name/super up front).
  const [me, setMe] = useState<{ email: string; name: string; super: boolean } | null>(null)
  useEffect(() => {
    let cancelled = false
    getSupabase().auth.getUser().then(({ data }) => {
      if (cancelled) return
      const u = data.user
      const m = (u?.user_metadata ?? {}) as Record<string, unknown>
      const email = u?.email ?? ''
      const name = (m.full_name as string) || (m.name as string) || email.split('@')[0]
      const sup = isEffectiveSuperAdmin(u?.email, (u?.app_metadata as Record<string, unknown> | undefined)?.role)
      setMe({ email, name, super: sup })
    })
    return () => { cancelled = true }
  }, [])

  // Status change (deferred — only persisted on Simpan, not on select).
  const [statusDraft, setStatusDraft] = useState<string>(post?.status ?? '')
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [statusMenuPos, setStatusMenuPos] = useState({ top: 0, left: 0 })
  const [savingStatus, setSavingStatus] = useState(false)
  // Revisi popup: create (status → revisi) or edit an existing revision.
  const [revisiCreate, setRevisiCreate] = useState(false)
  const [editingRevisi, setEditingRevisi] = useState<PostRevision | null>(null)
  const statusBtnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    setStatusDraft(post?.status ?? '')
    setStatusMenuOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, postId, post?.status])

  // Files uploaded via the Video Production / Design worksheet live in the
  // file_attachments table — load them so they show here too.
  const [extraFiles, setExtraFiles] = useState<{ id: string; url: string; name: string; createdAt?: string | null }[]>([])
  useEffect(() => {
    if (!open || !postId) { setExtraFiles([]); return }
    let cancelled = false
    ;(getSupabase() as unknown as { from: (t: string) => any })
      .from('file_attachments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .then(({ data }: { data: Array<Record<string, unknown>> | null }) => {
        if (cancelled || !data) return
        setExtraFiles(data.map(r => ({ id: r.id as string, url: r.storage_path as string, name: (r.file_name as string) || 'file', createdAt: (r.created_at as string) ?? null })))
      })
    return () => { cancelled = true }
  }, [open, postId])

  // In-app file preview popup.
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null)

  // Real names for pasted external links (e.g. the actual Google Drive file
  // name instead of the random id in the URL). Resolved lazily via the
  // og-preview endpoint and cached module-side so reopening is instant.
  const [linkNames, setLinkNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(linkNameCache.entries()),
  )
  useEffect(() => {
    if (!open) return
    const urls = (post?.files || []).filter(
      u => isSafeHttpUrl(u) && previewKind(u) === 'other' && !linkNameCache.has(u),
    )
    if (!urls.length) return
    let cancelled = false
    urls.forEach(async u => {
      try {
        const r = await fetch(`/api/og-preview?url=${encodeURIComponent(u)}`)
        if (!r.ok) return
        const d = (await r.json()) as { title?: string }
        const title = d?.title?.trim()
        if (!title) return
        // Strip the trailing " - Google Drive" / " - Figma" provider suffix.
        const clean = title.replace(/\s*[-–|]\s*(Google Drive|Figma|Dropbox)\s*$/i, '').trim() || title
        linkNameCache.set(u, clean)
        if (!cancelled) setLinkNames(prev => ({ ...prev, [u]: clean }))
      } catch {
        /* ignore — falls back to attachLabel(url) */
      }
    })
    return () => { cancelled = true }
  }, [open, post?.files])

  // Attach time for links: a pasted link carries no timestamp in its URL (unlike
  // an uploaded file, whose name starts with the upload ms). Recover WHEN each
  // url was first added from the post_history audit trail, so links show their
  // attached date/time exactly like uploaded files.
  const [attachTimes, setAttachTimes] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!open || !postId) return
    let cancelled = false
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (getSupabase() as any)
        .from('post_history').select('created_at, changes')
        .eq('post_id', postId).order('created_at', { ascending: true })
      if (cancelled || !Array.isArray(data)) return
      const map: Record<string, number> = {}
      // `data` is ascending by time, so the FIRST row whose files snapshot ("to")
      // contains a url is the earliest moment we can prove it was attached. We do
      // NOT require the url to be absent from "from": some links were added
      // without a recorded from→to diff (so they already sit in the earliest
      // logged snapshot). Taking the earliest "to" still yields a real timestamp.
      for (const row of data as { created_at: string; changes: { files?: { to?: unknown } } | null }[]) {
        const to = row.changes?.files?.to
        if (!Array.isArray(to)) continue
        const ts = new Date(row.created_at).getTime()
        if (!Number.isFinite(ts)) continue
        for (const u of to) {
          if (typeof u === 'string' && map[u] == null) map[u] = ts
        }
      }
      if (!cancelled) setAttachTimes(map)
    })()
    return () => { cancelled = true }
  }, [open, postId])
  // Paste-a-link input + in-flight uploads (per-file progress + cancel).
  const [confirmReq, setConfirmReq] = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [linkInput, setLinkInput] = useState('')
  const [uploads, setUploads] = useState<{ id: string; name: string; progress: number; abort: () => void }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadSeq = useRef(0)

  // Real accounts, to resolve tagged emails to names/avatars.
  const [accounts, setAccounts] = useState<{ email: string; name: string; avatarUrl: string | null }[]>([])
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch('/api/accounts')
      .then(r => (r.ok ? r.json() : { accounts: [] }))
      .then((d: { accounts?: { email: string; name: string; avatarUrl: string | null }[] }) => {
        if (!cancelled) setAccounts(d.accounts ?? [])
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open])

  if (!post) return null

  // Open an attachment: preview image/video/pdf in a popup; open other links
  // (Drive/Figma/etc.) in a new tab.
  const openAttachment = (url: string, label: string) => {
    if (!isSafeHttpUrl(url)) return // reject javascript:/data:/etc.
    if (previewKind(url) === 'other') {
      window.open(url, '_blank', 'noopener,noreferrer')
    } else {
      setPreview({ url, label })
    }
  }

  const statusChanged = statusDraft !== post.status
  async function saveStatus() {
    if (!statusChanged) return
    setSavingStatus(true)
    const { error } = await getSupabase().from('posts').update({ status: statusDraft }).eq('id', post!.id)
    setSavingStatus(false)
    if (error) { alert(t('Gagal mengubah status: ') + error.message); return }
    upsertPost({ ...post!, status: statusDraft } as Post) // reflect on the board
    // Log to the post's activity feed.
    if (comments.me.email) {
      const label = BPI_STATUS_COLS.find(c => c.key === statusDraft)?.label || statusDraft
      await (getSupabase() as unknown as { from: (t: string) => any }).from('post_comments').insert({
        post_id: post!.id, type: 'activity', author_email: comments.me.email, author_name: comments.me.name,
        body: `telah mengubah status menjadi ${label}`,
      })
    }
  }
  const draftCol = BPI_STATUS_COLS.find(c => c.key === statusDraft)

  function toggleStatusMenu(e: React.MouseEvent) {
    e.stopPropagation()
    const btn = statusBtnRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const mw = 180
    let left = rect.right - mw
    if (left < 8) left = 8
    setStatusMenuPos({ top: rect.bottom + 6, left })
    setStatusMenuOpen(o => !o)
  }

  // All attachments: legacy video/design links + uploaded file URLs + the
  // links/files list — deduped, each tagged with its source so it can be
  // deleted from the right place.
  type AttachSrc =
    | { kind: 'field'; field: 'video_link' | 'design_link' | 'video_file_url' | 'design_file_url' }
    | { kind: 'files'; fileIdx: number }
    | { kind: 'row'; rowId: string }
  const attachments: { icon: string; label: string; url: string; src: AttachSrc; at?: number }[] = []
  const seenUrls = new Set<string>()
  // Last-resort time so EVERY attachment shows a date/time, no exceptions: the
  // post's own creation time. Real per-file times (upload ms in the filename, or
  // the audit-trail attach time) take precedence over this.
  const postCreatedMs = (() => {
    const ms = post.created_at ? new Date(post.created_at).getTime() : NaN
    return Number.isFinite(ms) ? ms : undefined
  })()
  const addAttach = (url: string | null | undefined, src: AttachSrc, icon?: string, label?: string, at?: number) => {
    if (!url || seenUrls.has(url)) return
    seenUrls.add(url)
    attachments.push({ icon: icon ?? attachIcon(url), label: label ?? linkNames[url] ?? attachLabel(url), url, src, at: at ?? uploadTimeFromUrl(url) ?? attachTimes[url] ?? postCreatedMs })
  }
  addAttach(post.video_link, { kind: 'field', field: 'video_link' }, '🎬', 'Video')
  addAttach(post.design_link, { kind: 'field', field: 'design_link' }, '🎨', 'Design')
  addAttach(post.video_file_url, { kind: 'field', field: 'video_file_url' }, '🎬', 'Video')
  addAttach(post.design_file_url, { kind: 'field', field: 'design_file_url' }, '🎨', 'Design')
  ;(post.files || []).forEach((f, i) => addAttach(f, { kind: 'files', fileIdx: i }))
  for (const f of extraFiles) addAttach(f.url, { kind: 'row', rowId: f.id }, undefined, f.name, f.createdAt ? new Date(f.createdAt).getTime() : undefined)
  // Newest attachment always first. Every item now resolves a time (upload ms,
  // audit-trail attach time, or the post's creation time as a last resort), so
  // the order is a clean newest→oldest with nothing sinking to the bottom.
  attachments.sort((a, b) => (b.at ?? -1) - (a.at ?? -1))

  // Reference bucket — a separate list (post.reference_files), added via Add/Edit
  // Task, shown as its own section below File Attachments.
  const referenceItems: { icon: string; label: string; url: string; at?: number }[] = []
  const seenRef = new Set<string>()
  ;(post.reference_files || []).forEach(u => {
    if (!u || seenRef.has(u)) return
    seenRef.add(u)
    referenceItems.push({ icon: attachIcon(u), label: linkNames[u] ?? attachLabel(u), url: u, at: uploadTimeFromUrl(u) ?? postCreatedMs })
  })
  referenceItems.sort((a, b) => (b.at ?? -1) - (a.at ?? -1))

  // Files that can be previewed in-app (image/video/pdf) — links are excluded,
  // so the preview popup can page left/right through actual files only.
  const previewFiles = attachments.filter(a => previewKind(a.url) !== 'other')

  // Remove a revision entry from posts.revisions (Socmed Management only).
  // Atomic delete-by-id so a revision added concurrently by someone else is
  // never dropped along with this one.
  async function deleteRevisi(rev: PostRevision) {
    if (!post) return
    const sb = getSupabase() as any // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb.rpc('post_revision_delete', { p_id: post.id, p_rev_id: rev.id })
    if (error) { alert(t('Gagal menghapus: ') + error.message); return }
    const fresh = useStore.getState().posts.find(p => p.id === post.id) ?? post
    upsertPost({ ...fresh, revisions: (data ?? []) as PostRevision[] } as Post)
    if (comments.me.email) {
      await sb.from('post_comments').insert({
        post_id: post.id, type: 'activity', author_email: comments.me.email, author_name: comments.me.name,
        body: t('menghapus sebuah revisi'),
      })
    }
  }

  // Add a pasted link (Drive / Figma / etc.) — atomic, deduped server-side.
  function addLink() {
    const v = linkInput.trim()
    if (!v || !post) return
    void appendUrl(v)
    setLinkInput('')
  }

  // Append a file/link URL to posts.files. Uses an ATOMIC, server-side,
  // deduped append (post_files_add) so two uploads finishing at the same time
  // can never overwrite each other — the merge happens under the row lock, not
  // as a read-modify-write of a possibly-stale in-memory list. Returns the
  // authoritative new list, which we write back to the store.
  async function appendUrl(url: string) {
    const latest = useStore.getState().posts.find(p => p.id === postId)
    if (!latest) return
    const cur = latest.files || []
    if (!cur.includes(url)) upsertPost({ ...latest, files: [...cur, url] }) // optimistic
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (getSupabase() as any)
      .rpc('post_files_add', { p_id: postId, p_url: url })
    if (error || data == null) {
      const reverted = useStore.getState().posts.find(p => p.id === postId)
      if (reverted) upsertPost({ ...reverted, files: cur }) // revert optimistic
      alert(t('Gagal menyimpan file: ') + (error?.message || t('tidak tersimpan ke database')))
      return
    }
    const fresh = useStore.getState().posts.find(p => p.id === postId)
    if (fresh) upsertPost({ ...fresh, files: data as string[] }) // authoritative
  }

  // Upload each picked file with live progress + a per-file cancel handle.
  function uploadPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!files.length || !post) return
    for (const file of files) {
      const id = `up-${uploadSeq.current++}`
      const { promise, abort } = uploadFileResumable(file, 'posts/files', p => {
        setUploads(prev => prev.map(u => (u.id === id ? { ...u, progress: p.percent } : u)))
      })
      setUploads(prev => [...prev, { id, name: file.name, progress: 0, abort }])
      promise
        .then(res => { appendUrl(res.url) })
        .catch(err => {
          if (!(err as { message?: string })?.message?.toLowerCase().includes('abort')) {
            alert(t('Gagal mengupload') + ' "' + file.name + '": ' + ((err as { message?: string })?.message || t('Coba lagi.')))
          }
        })
        .finally(() => setUploads(prev => prev.filter(u => u.id !== id)))
    }
  }

  function cancelUpload(id: string) {
    setUploads(prev => {
      prev.find(u => u.id === id)?.abort()
      return prev.filter(u => u.id !== id)
    })
  }

  async function deleteAttachment(att: { url: string; label: string; src: AttachSrc }) {
    if (!post) return
    const sb = getSupabase() as unknown as { from: (t: string) => any }
    try {
      if (att.src.kind === 'row') {
        const { error } = await sb.from('file_attachments').delete().eq('id', att.src.rowId)
        if (error) throw error
        try { await deleteFile(att.url) } catch { /* best-effort */ }
        setExtraFiles(prev => prev.filter(f => f.id !== (att.src as { rowId: string }).rowId))
      } else if (att.src.kind === 'files') {
        // Atomic remove BY VALUE (not index) — a list reordered/extended by a
        // concurrent upload can never cause the wrong file to be deleted.
        const { data, error } = await (sb as any).rpc('post_files_remove', { p_id: post.id, p_url: att.url })
        if (error) throw error
        const fresh = useStore.getState().posts.find(p => p.id === post.id) ?? post
        upsertPost({ ...fresh, files: (data ?? (fresh.files || []).filter(f => f !== att.url)) as string[] } as Post)
      } else {
        const field = att.src.field
        const { error } = await sb.from('posts').update({ [field]: '' }).eq('id', post.id)
        if (error) throw error
        upsertPost({ ...post, [field]: '' } as Post)
      }
    } catch (e) {
      alert(t('Gagal menghapus: ') + ((e as { message?: string })?.message || t('Coba lagi.')))
    }
  }

  async function saveSubtasks(next: Subtask[]) {
    if (!post) return
    const fresh = useStore.getState().posts.find(p => p.id === post.id) ?? post
    upsertPost({ ...fresh, subtasks: next } as Post) // optimistic
    const sb = getSupabase() as unknown as { from: (t: string) => any }
    const { error } = await sb.from('posts').update({ subtasks: next }).eq('id', post.id)
    if (error) { upsertPost(fresh); alert(t('Gagal menyimpan: ') + (error.message || '')) }
  }

  async function deleteReference(url: string) {
    if (!post) return
    const fresh = useStore.getState().posts.find(p => p.id === post.id) ?? post
    const next = (fresh.reference_files || []).filter(u => u !== url)
    upsertPost({ ...fresh, reference_files: next } as Post) // optimistic
    const sb = getSupabase() as unknown as { from: (t: string) => any }
    const { error } = await sb.from('posts').update({ reference_files: next }).eq('id', post.id)
    if (error) { upsertPost(fresh); alert(t('Gagal menghapus: ') + (error.message || '')); return }
    try { if (isUploadedFile(url)) await deleteFile(url) } catch { /* best-effort */ }
  }

  return (
    <>
    <Modal
      open={open}
      onClose={handleClose}
      wide
      title={t('Detail Task')}
      headerRight={
        // Project tasks in My Task / Team follow the VP/DS flow → static pill
        // (status moves only by board drag). Personal tasks keep the free dropdown.
        canEdit && !(restrictStatus && post.entity !== 'personal') ? (
        <>
          <span style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            ref={statusBtnRef}
            onClick={toggleStatusMenu}
            title={statusMark ? t('Status diubah') : undefined}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
              background: (draftCol?.color || '#8b8fa8') + '22',
              border: `1px solid ${(draftCol?.color || '#8b8fa8')}55`,
              color: draftCol?.color || '#8b8fa8', fontSize: 12, fontWeight: 600,
            }}
          >
            {draftCol?.label || statusDraft}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {statusMark && <span title={t('Status diubah')} style={{ position: 'absolute', top: -2, left: -2, width: 10, height: 10, borderRadius: '50%', background: 'var(--accent2)', zIndex: 4, boxShadow: '0 0 0 2px var(--bg2), 0 0 6px rgba(255,69,58,0.55)' }} />}
          </span>
          {statusMenuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 2999 }} onClick={() => setStatusMenuOpen(false)} />
              <div style={{
                position: 'fixed', top: statusMenuPos.top, left: statusMenuPos.left, zIndex: 3000,
                background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8,
                padding: 4, width: 180, boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
              }}>
                {BPI_STATUS_COLS.map(c => (
                  <button
                    key={c.key}
                    onClick={() => {
                      setStatusMenuOpen(false)
                      // Switching to Revisi opens the revision popup straight
                      // away (it persists status + the revision on Save).
                      if (c.key === 'revisi') { setRevisiCreate(true); return }
                      setStatusDraft(c.key)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '7px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12,
                      background: statusDraft === c.key ? c.color + '22' : 'transparent',
                      color: statusDraft === c.key ? c.color : 'var(--text)', border: 'none', textAlign: 'left',
                    }}
                    onMouseOver={e => { if (statusDraft !== c.key) (e.currentTarget as HTMLElement).style.background = 'var(--bg3)' }}
                    onMouseOut={e => { if (statusDraft !== c.key) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                    {c.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 20, background: (draftCol?.color || '#8b8fa8') + '22', border: `1px solid ${(draftCol?.color || '#8b8fa8')}55`, color: draftCol?.color || '#8b8fa8', fontSize: 12, fontWeight: 600 }}>
            {draftCol?.label || statusDraft}
          </span>
        )
      }
      footer={
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
            {statusChanged && (
              <button
                onClick={saveStatus}
                disabled={savingStatus}
                style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: savingStatus ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: savingStatus ? 0.7 : 1 }}
              >
                {savingStatus ? t('Menyimpan…') : t('Simpan Status')}
              </button>
            )}
            <BtnSecondary onClick={handleClose}>{t('Tutup')}</BtnSecondary>
            {canEdit && (
              <button
                onClick={() => { handleClose(); onEdit(post.id) }}
                style={{ background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
              >
                {t('Edit Task')}
              </button>
            )}
          </div>
        </div>
      }
    >
      <h2 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, color: 'var(--text)', marginTop: 4, marginBottom: 18 }}>
        <span style={{ position: 'relative', display: 'inline-block' }}>
          {post.title}
          {titleMark && <span title={t('Ada perubahan baru')} style={{ position: 'absolute', top: -1, right: -13, width: 9, height: 9, borderRadius: '50%', background: 'var(--accent2)' }} />}
        </span>
      </h2>

      {/* Meta grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <MetaItem label={post.entity === 'personal' ? t('Due date') : t('Tanggal Task')} value={post.date ? formatDate(post.date) : (post.entity === 'personal' ? t('No due date') : '—')} mark={dateMark} />
        {post.entity === 'personal' && <MetaItem label={t('Dibuat')} value={post.created_at ? new Date(post.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'} />}
        {/* Socmed-only meta — hidden for a personal My Task task. */}
        {post.entity !== 'personal' && (<>
        <MetaItem label={t('Platform')} mark={platformMark} value={
          (post.platforms || []).length ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {(post.platforms || []).map(pl => <PlatformIcon key={pl} platform={pl} size={20} />)}
            </div>
          ) : '—'
        } />
        <MetaItem label={t('Entity')} value={post.entity?.toUpperCase() || '—'} />
        <MetaItem label={t('Dibuat oleh')} value={post.created_by || '—'} />
        <MetaItem label={t('Jenis Konten')} value={(post.content_types || []).join(', ') || '—'} mark={contentTypeMark} />
        <MetaItem label={t('Ratio')} value={post.ratio || '—'} mark={ratioMark} />
        <MetaItem label={t('Tag')} mark={tagMark} value={(() => {
          // Only show tags that are real accounts (by email, or — for legacy
          // name tags — by matching an account name). Stale dummy-name tags
          // left over from before the email-based Tag Akun are dropped, so the
          // preview matches who's actually tagged in the edit form.
          const tags = (post.tagged || []).filter(
            m => m.includes('@') || accounts.some(a => a.name === m),
          )
          if (!tags.length) return '—'
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tags.map(m => {
                const acc = accounts.find(a => a.email === m || a.name === m)
                const name = acc?.name ?? (m.includes('@') ? m.split('@')[0] : m)
                return (
                  <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <TeamAvatar name={name} size={22} />
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>{name}</span>
                  </span>
                )
              })}
            </div>
          )
        })()} />
        </>)}
      </div>

      {/* Headline + Brief — hidden for a personal task. */}
      {post.entity !== 'personal' && (<>
      <CopyField label={t('Headline')} value={post.headline} emptyText={t('Belum ada headline.')} mark={headlineMark} />
      <CopyField label="Brief" value={post.brief} emptyText={t('Belum ada brief.')} mark={briefMark} />
      </>)}

      {/* Caption / Hashtags / Notes — only when present */}
      {post.caption && <CopyField label="Caption" value={post.caption} mark={captionMark} />}
      {post.hashtags && <CopyField label="Hashtags" value={post.hashtags} color="#6b9bff" mark={hashtagsMark} />}
      {/* Description (personal My Task) — above Notes. */}
      {post.entity === 'personal' && <CopyField label={t('Description')} value={post.description || ''} emptyText={t('What is this task about?')} />}
      {post.entity !== 'personal' && post.notes && <CopyField label={t('Catatan')} value={post.notes} mark={notesMark} />}
      {/* Subtasks (personal My Task) — tick off live. */}
      {post.entity === 'personal' && (
        <div style={{ marginBottom: 18 }}>
          <SubtaskEditor value={post.subtasks} onChange={saveSubtasks} />
        </div>
      )}

      {/* Reference — separate bucket; added via Add/Edit Task. Shown ABOVE File
          Attachments. Hidden for personal tasks (they use File Attachments). */}
      {post.entity !== 'personal' && (
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 8 }}>{t('Referensi')}</div>
        {referenceItems.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, alignItems: 'start' }}>
            {referenceItems.map(a => (
              <AttachCard
                key={a.url}
                label={a.label}
                url={a.url}
                time={a.at ? formatUploadTime(a.at) : undefined}
                onOpen={() => openAttachment(a.url, a.label)}
                onDelete={() => setConfirmReq({ message: t('Hapus "{label}"?').replace('{label}', a.label), onConfirm: () => deleteReference(a.url) })}
              />
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text3)', padding: '4px 2px' }}>{t('Belum ada reference. Tambah lewat Edit Task.')}</div>
        )}
      </div>
      )}

      {/* Attachments — links + uploaded files + an uploader so files can be
          added straight from the details view (no need to open Edit). */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 8 }}>
          <span style={{ position: 'relative', display: 'inline-block' }}>
            {t('Lampiran File')}
            {attachMark && <span title={t('Ada perubahan baru')} style={{ position: 'absolute', top: -3, right: -9, width: 7, height: 7, borderRadius: '50%', background: 'var(--accent2)' }} />}
          </span>
        </div>

        {/* Add link + upload controls */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            type="url"
            placeholder={t('Tempel link (Drive / Figma / dll)...')}
            value={linkInput}
            onChange={e => setLinkInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            onClick={addLink}
            style={{ flexShrink: 0, padding: '0 16px', borderRadius: 8, cursor: 'pointer', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}
          >
            + Link
          </button>
          <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={uploadPicked} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{ flexShrink: 0, padding: '0 16px', borderRadius: 8, cursor: 'pointer', background: 'var(--accent)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600 }}
          >
            {t('+ Upload')}
          </button>
        </div>

        {/* Gallery — uploading files (with live progress + cancel) then finished
            attachments, 3 per row. */}
        {(attachments.length > 0 || uploads.length > 0) ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, alignItems: 'start' }}>
            {uploads.map(u => (
              <UploadingCard key={u.id} name={u.name} progress={u.progress} onCancel={() => cancelUpload(u.id)} cancelLabel={t('Batal')} />
            ))}
            {attachments.map(a => (
              <AttachCard
                key={a.url}
                label={a.label}
                url={a.url}
                time={a.at ? formatUploadTime(a.at) : undefined}
                isNew={newAttachUrls.has(a.url)}
                onOpen={() => openAttachment(a.url, a.label)}
                onDelete={() => setConfirmReq({ message: t('Hapus "{label}"?').replace('{label}', a.label), onConfirm: () => deleteAttachment(a) })}
              />
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text3)', padding: '4px 2px' }}>{t('Belum ada lampiran.')}</div>
        )}
      </div>

      {/* Detail Revisi — above comments + activity. Editable here (Socmed
          Management); read-only preview on the worksheet pages. Hidden for a
          personal My Task task. */}
      {post.entity !== 'personal' && (canEdit || (post.revisions?.length ?? 0) > 0) && (
        <RevisiSection
          revisions={post.revisions ?? []}
          canEdit={canEdit}
          onAdd={() => setRevisiCreate(true)}
          onEdit={rev => setEditingRevisi(rev)}
          onDelete={rev => setConfirmReq({ message: t('Hapus revisi ini?'), onConfirm: () => deleteRevisi(rev) })}
          onOpenLink={(url, label) => openAttachment(url, label)}
        />
      )}

      {/* Discussion: Chat | Activity tabs (the discussion is a chat now, not
          comments; the change history stays under the Activity tab). */}
      <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
          {/* Chat is hidden for a personal My Task task — only Activity remains. */}
          {post.entity !== 'personal' && (
            <span style={{ display: 'inline-flex', alignItems: 'flex-start', position: 'relative' }}>
              <Tab label={t('Chat')} active={detailTab === 'chat'} onClick={() => setDetailTab('chat')} />
              {chatHasUnread && (
                <span title={t('Ada chat baru')} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent2)', marginLeft: 4, marginTop: 1, flexShrink: 0 }} />
              )}
            </span>
          )}
          <Tab label={t('Aktivitas')} active={detailTab === 'activity' || post.entity === 'personal'} onClick={() => setDetailTab('activity')} />
        </div>
        {(detailTab === 'activity' || post.entity === 'personal') ? (
          <PostHistoryFeed rows={history} accounts={comments.accounts} />
        ) : me && post ? (
          <div style={{ height: 460, display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg2)' }}>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 12px' }}>
              <ChatRoom room={taskChatRoom(post.entity, post.id)} roomName={post.title || t('(Tanpa judul)')} meEmail={me.email} meName={me.name} meSuper={me.super} autoMarkRead={false} onActivity={markChatRead} />
            </div>
          </div>
        ) : (
          <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>{t('Memuat…')}</div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmReq}
        danger
        title={t('Hapus')}
        message={confirmReq?.message ?? ''}
        confirmLabel={t('Hapus')}
        cancelLabel={t('Batal')}
        onCancel={() => setConfirmReq(null)}
        onConfirm={() => { confirmReq?.onConfirm(); setConfirmReq(null) }}
      />
    </Modal>

    {/* In-app file preview popup */}
    {preview && (() => {
      const n = previewFiles.length
      const idx = previewFiles.findIndex(a => a.url === preview.url)
      // Loop around: next on the last file wraps to the first, and vice-versa.
      const go = (i: number) => { const a = previewFiles[((i % n) + n) % n]; if (a) setPreview({ url: a.url, label: a.label }) }
      const canPage = n > 1 && idx >= 0
      return (
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview.label}
        maxWidth={760}
        headerRight={
          isSafeHttpUrl(preview.url) ? (
            <button
              type="button"
              onClick={() => downloadFileNoNav(preview.url, preview.label)}
              title="Download"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: isMobile ? '7px 10px' : '6px 12px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}
            >
              ⬇{isMobile ? '' : ' Download'}
            </button>
          ) : undefined
        }
      >
        <div style={{ position: 'relative' }}>
          <AttachPreviewBody url={preview.url} label={preview.label} />
          {canPage && <PreviewNavBtn dir="left" onClick={() => go(idx - 1)} />}
          {canPage && <PreviewNavBtn dir="right" onClick={() => go(idx + 1)} />}
          {canPage && (
            <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, backdropFilter: 'blur(4px)' }}>
              {idx + 1} / {n}
            </div>
          )}
        </div>
      </Modal>
      )
    })()}

    {/* Revisi popup — create. applyStatus flips the post (and its tracks) to
        'revisi' on save, so adding a revision from any status (e.g. Review)
        moves it to Revisi automatically. */}
    {revisiCreate && (
      <RevisiModal
        open={revisiCreate}
        post={post}
        applyStatus
        onClose={() => setRevisiCreate(false)}
        onSaved={() => setRevisiCreate(false)}
      />
    )}
    {/* Revisi popup — edit an existing revision (Socmed Management only) */}
    {editingRevisi && (
      <RevisiModal
        open={!!editingRevisi}
        post={post}
        editing={editingRevisi}
        applyStatus={false}
        onClose={() => setEditingRevisi(null)}
        onSaved={() => setEditingRevisi(null)}
      />
    )}
    </>
  )
}

function attachIcon(url: string): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || ''
  if (['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'].includes(ext)) return '🎬'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return '🖼️'
  if (ext === 'pdf') return '📄'
  return '🔗'
}

function attachLabel(url: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop()
    return last ? decodeURIComponent(last) : u.hostname
  } catch {
    return url
  }
}

// Files uploaded through the app are stored as `${prefix}/${Date.now()}-${rand}.${ext}`,
// so the leading number in the filename is the upload time. Returns ms epoch, or
// undefined for pasted links / non-conforming names.
function uploadTimeFromUrl(url: string): number | undefined {
  // The upload timestamp prefixes a path segment — historically the filename
  // (`${stamp}-${rand}.ext`), now the parent folder (`${stamp}-${rand}/name`).
  // Scan segments so both layouts resolve a time.
  let segs: string[] = [url]
  try { segs = new URL(url).pathname.split('/').filter(Boolean) } catch { /* keep raw */ }
  const m = segs.map(s => s.match(/^(\d{10,16})/)).find(Boolean)
  if (!m) return undefined
  let n = Number(m[1])
  if (!Number.isFinite(n)) return undefined
  if (m[1].length <= 10) n *= 1000 // seconds → ms
  // Plausible range: 2010-01-01 .. 2100-01-01 — guards against random digit prefixes.
  if (n < 1262304000000 || n > 4102444800000) return undefined
  return n
}

function formatUploadTime(ms: number): string {
  return new Date(ms).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function isImageUrl(url: string): boolean {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || ''
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)
}

// Only http(s) URLs may be rendered/opened — blocks javascript:/data:/blob:/
// vbscript: schemes that could execute when used as iframe/anchor/window.open.
function isSafeHttpUrl(url: string): boolean {
  try {
    const p = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    return p.protocol === 'http:' || p.protocol === 'https:'
  } catch {
    return false
  }
}

function previewKind(url: string): 'image' | 'video' | 'pdf' | 'other' {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'].includes(ext)) return 'video'
  if (ext === 'pdf') return 'pdf'
  return 'other'
}

function AttachPreviewBody({ url, label }: { url: string; label: string }) {
  const t = useT()
  if (!isSafeHttpUrl(url)) {
    return <div style={{ textAlign: 'center', padding: 24, fontSize: 13, color: 'var(--text2)' }}>{t('File tidak tersedia.')}</div>
  }
  const kind = previewKind(url)
  if (kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img loading="lazy" decoding="async" src={url} alt={label} style={{ maxWidth: '100%', maxHeight: '72dvh', display: 'block', margin: '0 auto', borderRadius: 8 }} />
  }
  if (kind === 'video') {
    return <video src={url} controls autoPlay style={{ width: '100%', maxHeight: '72dvh', borderRadius: 8, background: '#000' }} />
  }
  if (kind === 'pdf') {
    return <iframe src={url} title={label} style={{ width: '100%', height: '72dvh', border: 'none', borderRadius: 8, background: '#fff' }} />
  }
  return (
    <div style={{ textAlign: 'center', padding: 24, fontSize: 13, color: 'var(--text2)' }}>
      {t('Preview tidak tersedia.')}{' '}
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{t('Buka di tab baru')}</a>
    </div>
  )
}

// Render an image thumbnail only for safe http(s) image URLs.
function safeImageSrc(url: string): string | null {
  return isImageUrl(url) && isSafeHttpUrl(url) ? url : null
}

function MetaItem({ label, value, mark = false }: { label: string; value: React.ReactNode; mark?: boolean }) {
  const t = useT()
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 5 }}>
        <span style={{ position: 'relative', display: 'inline-block' }}>
          {label}
          {mark && <span title={t('Ada perubahan baru')} style={{ position: 'absolute', top: -3, right: -9, width: 7, height: 7, borderRadius: '50%', background: 'var(--accent2)' }} />}
        </span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}

// Compact grid card: thumbnail (image) or big icon, filename below. Clicking
// opens the in-app preview popup (or a new tab for non-previewable links).
// Left / right pager button overlaid on the file preview popup.
function PreviewNavBtn({ dir, onClick }: { dir: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={dir === 'left' ? 'Sebelumnya' : 'Berikutnya'}
      style={{
        position: 'absolute', top: '50%', transform: 'translateY(-50%)',
        [dir]: 8, width: 38, height: 38, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff',
        cursor: 'pointer', backdropFilter: 'blur(4px)', zIndex: 5, padding: 0,
      } as React.CSSProperties}
      onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.8)' }}
      onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.55)' }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  )
}

// A card shown for a file that is currently uploading — live 0–100% bar + cancel.
function UploadingCard({ name, progress, onCancel, cancelLabel }: { name: string; progress: number; onCancel: () => void; cancelLabel: string }) {
  const pct = Math.min(100, Math.max(0, Math.round(progress)))
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--bg2)' }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{pct}%</span>
        <div style={{ width: '78%', height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width 0.15s ease' }} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px' }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <button
          onClick={onCancel}
          title={cancelLabel}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 5, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: '#f87171', fontSize: 11, fontWeight: 600 }}
          onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.12)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent2)' }}
          onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
        >
          ✕ {cancelLabel}
        </button>
      </div>
    </div>
  )
}

// ── Brand logos for known link providers, so a pasted Instagram / Drive / etc.
//    link shows its real logo instead of a generic icon. All rendered at a
//    consistent size inside the same fixed thumbnail box as image previews. ──
function IgLogo() {
  return (
    <svg width="58" height="58" viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <radialGradient id="ig-grad" cx="30%" cy="100%" r="125%">
          <stop offset="0%" stopColor="#FFDD77" />
          <stop offset="22%" stopColor="#FA8E37" />
          <stop offset="48%" stopColor="#E8417A" />
          <stop offset="74%" stopColor="#C32EAF" />
          <stop offset="100%" stopColor="#7A2FD6" />
        </radialGradient>
      </defs>
      <rect x="3" y="3" width="42" height="42" rx="12" fill="url(#ig-grad)" />
      <rect x="13" y="13" width="22" height="22" rx="7" fill="none" stroke="#fff" strokeWidth="3" />
      <circle cx="24" cy="24" r="6" fill="none" stroke="#fff" strokeWidth="3" />
      <circle cx="32.6" cy="15.4" r="2.2" fill="#fff" />
    </svg>
  )
}
function DriveLogo() {
  return (
    <svg width="56" height="50" viewBox="0 0 87.3 78" aria-hidden="true">
      <path fill="#0066da" d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" />
      <path fill="#00ac47" d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5C.4 49.9 0 51.45 0 53h27.5z" />
      <path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H67.3l5.85 11.5z" />
      <path fill="#00832d" d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" />
      <path fill="#2684fc" d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" />
      <path fill="#ffba00" d="M73.4 26.5L60.7 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" />
    </svg>
  )
}
function YtLogo() {
  return (
    <svg width="58" height="42" viewBox="0 0 48 34" aria-hidden="true">
      <rect x="1" y="1" width="46" height="32" rx="9" fill="#FF0000" />
      <path d="M20 10.5L33 17L20 23.5z" fill="#fff" />
    </svg>
  )
}
function TiktokLogo() {
  return (
    <svg width="50" height="56" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#fff" d="M33 4c.6 4.6 3.2 7.35 7.6 7.65v5.2c-2.55.25-4.9-.55-7.6-2.15v10.85c0 8.05-6 13.25-13 11.85-4.4-.9-7.3-4.6-7.3-9.1 0-5.4 4.35-9.35 9.75-8.95.5.04 1.05.12 1.55.24v5.5c-.5-.16-1.05-.27-1.55-.3-2.35-.13-4.25 1.5-4.25 3.8 0 2.1 1.65 3.7 3.75 3.7 2.2 0 3.8-1.6 3.8-4.3V4z" />
    </svg>
  )
}
function FigmaLogo() {
  return (
    <svg width="36" height="54" viewBox="0 0 38 57" aria-hidden="true">
      <path fill="#1abcfe" d="M19 28.5a9.5 9.5 0 1 1 9.5 9.5A9.5 9.5 0 0 1 19 28.5z" />
      <path fill="#0acf83" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" />
      <path fill="#ff7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19z" />
      <path fill="#f24e1e" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" />
      <path fill="#a259ff" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" />
    </svg>
  )
}
function GlyphVideo() {
  return (
    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="5" width="13" height="14" rx="2.5" />
      <path d="M15.5 9.5L21 6.5v11l-5.5-3z" fill="var(--text2)" stroke="none" />
    </svg>
  )
}
function GlyphPdf() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2.5h7l5 5V21a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 21V4A1.5 1.5 0 0 1 6 2.5z" />
      <path d="M13 2.5V8h5" />
    </svg>
  )
}
function GlyphLink() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 15l6-6" />
      <path d="M11 6.5L12.5 5a4 4 0 0 1 5.6 5.6L16.5 12" />
      <path d="M13 17.5L11.5 19a4 4 0 0 1-5.6-5.6L7.5 12" />
    </svg>
  )
}
// Pick the visual mark for an attachment: a brand logo for known providers, a
// file glyph for video/pdf, or a generic link icon. `tint` colours the thumb
// background so every card reads as "full" (no tiny lonely icon); `short` is
// the bottom-left badge (e.g. IG / DRIVE / LINK).
function markFor(url: string): { node: React.ReactNode; tint: string; short: string } {
  let host = ''
  try { host = new URL(url).hostname.replace(/^www\./, '').toLowerCase() } catch { /* not a URL */ }
  if (host.includes('instagram.com')) return { node: <IgLogo />, tint: 'rgba(214,41,118,0.20)', short: 'IG' }
  if (host.includes('drive.google.com') || host.includes('docs.google.com')) return { node: <DriveLogo />, tint: 'rgba(38,132,252,0.16)', short: 'DRIVE' }
  if (host.includes('youtube.com') || host === 'youtu.be') return { node: <YtLogo />, tint: 'rgba(255,0,0,0.15)', short: 'YT' }
  if (host.includes('tiktok.com')) return { node: <TiktokLogo />, tint: 'rgba(255,255,255,0.08)', short: 'TIKTOK' }
  if (host.includes('figma.com')) return { node: <FigmaLogo />, tint: 'rgba(162,89,255,0.16)', short: 'FIGMA' }
  const k = previewKind(url)
  if (k === 'video') return { node: <GlyphVideo />, tint: '', short: '' }
  if (k === 'pdf') return { node: <GlyphPdf />, tint: '', short: '' }
  return { node: <GlyphLink />, tint: 'rgba(120,140,170,0.14)', short: 'LINK' }
}

function AttachCard({ label, url, time, isNew = false, onOpen, onDelete }: { label: string; url: string; time?: string; isNew?: boolean; onOpen: () => void; onDelete: () => void }) {
  const t = useT()
  const thumbSrc = safeImageSrc(url)
  const mark = thumbSrc ? null : markFor(url)
  const ext = fileExt(label) || fileExt(url)
  const badge = ext || mark?.short || ''
  return (
    <div
      onClick={onOpen}
      title={label}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        background: 'var(--bg3)',
        // New-since-last-seen files get a red outline (no dot) so they stand out
        // in the gallery; the ring persists through hover below.
        border: isNew ? '1.5px solid var(--accent2)' : '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: isNew ? '0 0 0 1px var(--accent2), 0 0 12px rgba(255,69,58,0.30)' : 'none',
        overflow: 'hidden', cursor: 'pointer',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease',
      }}
      onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = isNew ? 'var(--accent2)' : 'var(--accent)'; el.style.boxShadow = isNew ? '0 0 0 1px var(--accent2), 0 8px 22px rgba(0,0,0,0.32)' : '0 8px 22px rgba(0,0,0,0.32)'; el.style.transform = 'translateY(-2px)' }}
      onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = isNew ? 'var(--accent2)' : 'var(--border)'; el.style.boxShadow = isNew ? '0 0 0 1px var(--accent2), 0 0 12px rgba(255,69,58,0.30)' : 'none'; el.style.transform = 'none' }}
    >
      {/* Thumbnail / brand logo / file glyph — identical fixed box on every card */}
      <div style={{
        position: 'relative', width: '100%', height: 122, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: thumbSrc || !mark?.tint
          ? 'var(--bg2)'
          : `radial-gradient(circle at 50% 42%, ${mark.tint}, transparent 70%), var(--bg2)`,
      }}>
        {thumbSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" decoding="async" src={thumbSrc} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0 }}>{mark?.node}</span>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.42) 0%, transparent 40%)', pointerEvents: 'none' }} />
        {badge && (
          <span style={{ position: 'absolute', left: 8, bottom: 8, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.05em', color: '#fff', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 5, padding: '2px 6px', backdropFilter: 'blur(4px)' }}>{badge}</span>
        )}
      </div>

      {/* Footer — name + actions on one row, timestamp on its own full-width row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '9px 10px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label}
          </span>
          {isSafeHttpUrl(url) && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); void downloadFileNoNav(url, label) }}
              title="Download"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, color: 'var(--text2)', flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer' }}
              onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg2)' }}
              onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text2)'; (e.currentTarget as HTMLElement).style.background = 'none' }}
            >
              <PvDownloadIcon />
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            title={t('Hapus')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', flexShrink: 0 }}
            onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = '#ff6b6b'; (e.currentTarget as HTMLElement).style.background = '#ff6b6b18' }}
            onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text2)'; (e.currentTarget as HTMLElement).style.background = 'none' }}
          >
            <PvTrashIcon />
          </button>
        </div>
        {/* Always rendered (min-height reserved) so every card is the same total
            height whether or not it has a timestamp. */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--text3)', minHeight: 15 }}>
          {time && (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              {time}
            </>
          )}
        </span>
      </div>
    </div>
  )
}

// Short uppercase file extension for the thumbnail badge (PNG / MP4 / PDF …).
function fileExt(s: string): string {
  const e = (s.split('?')[0].split('.').pop() || '').toUpperCase()
  return e.length >= 2 && e.length <= 5 && /^[A-Z0-9]+$/.test(e) ? e : ''
}

function PvDownloadIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function PvTrashIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

// ── Field with a copy-to-clipboard button ────────────────────
function CopyField({
  label, value, emptyText, color, mark = false,
}: {
  label: string
  value: string | null | undefined
  emptyText?: string
  color?: string
  /** Show an "unseen change" dot next to the label. */
  mark?: boolean
}) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const text = (value ?? '').toString()
  const hasText = text.trim().length > 0

  async function copy() {
    if (!hasText) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {}
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)' }}>
          <span style={{ position: 'relative', display: 'inline-block' }}>
            {label}
            {mark && <span title={t('Ada perubahan baru')} style={{ position: 'absolute', top: -3, right: -9, width: 7, height: 7, borderRadius: '50%', background: 'var(--accent2)' }} />}
          </span>
        </div>
        <button
          onClick={copy}
          disabled={!hasText}
          title={copied ? t('Tersalin') : t('Salin')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 6, padding: 0,
            background: 'transparent', border: '1px solid var(--border)',
            color: copied ? 'var(--accent3)' : 'var(--text2)',
            cursor: hasText ? 'pointer' : 'not-allowed', opacity: hasText ? 1 : 0.4,
            transition: 'color 0.15s, border-color 0.15s',
          }}
          onMouseOver={e => { if (hasText) { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' } }}
          onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = copied ? 'var(--accent3)' : 'var(--text2)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
        >
          {copied ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      </div>
      <pre style={{
        fontSize: 13, lineHeight: 1.7, color: hasText ? (color ?? 'var(--text)') : 'var(--text2)',
        background: 'var(--bg3)', borderRadius: 8, padding: '12px 14px',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', margin: 0,
      }}>
        {hasText ? text : (emptyText ?? '—')}
      </pre>
    </div>
  )
}
