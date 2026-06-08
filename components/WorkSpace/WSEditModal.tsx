'use client'

import { useState, useEffect, useRef } from 'react'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { getSupabase } from '@/lib/supabase'
import { useStore } from '@/hooks/useStore'
import { useLogActivity } from '@/hooks/useData'
import { WS_STATUS_COLS, POST_STATUS_LABELS } from '@/lib/constants'
import { formatDate, formatFileSize, getFileIcon } from '@/lib/utils'
import { uploadFileResumable, deleteFile } from '@/lib/storage'
import { TeamAvatar } from '@/components/shared/StatusBadge'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import { usePostComments, PostCommentsBody, PostCommentsComposer } from '@/components/BPI/PostComments'
import { useT } from '@/lib/i18n/LanguageProvider'
import type { Post, StageData } from '@/lib/types'

interface WSEditModalProps {
  open: boolean
  postId: string
  member: string
  onClose: () => void
}

interface LocalFile {
  id: string
  file: File | null
  name: string
  size: number
  type: string
  status: 'uploading' | 'done' | 'settled' | 'saved'
  url?: string
  storageUrl?: string
  category: string
  progress?: number // 0–100 while uploading
  // Set when this item is a link that lives in the post's own video_link/
  // design_link column (legacy single-link fields) rather than file_attachments.
  postLinkField?: 'video_link' | 'design_link'
}

export function WSEditModal({ open, postId, member, onClose }: WSEditModalProps) {
  const t = useT()
  const { posts, upsertPost } = useStore()
  const logActivity = useLogActivity()
  const post = posts.find(p => p.id === postId)

  const [status, setStatus] = useState(post?.status || 'todo')
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [statusMenuPos, setStatusMenuPos] = useState({ top: 0, left: 0 })
  // Single unified file area (video + design merged into one).
  const [link, setLink] = useState(post?.video_link || post?.design_link || '')
  const [fileTab, setFileTab] = useState<'link' | 'upload'>('link')
  const [files, setFiles] = useState<LocalFile[]>([])
  const [saving, setSaving] = useState(false)
  const statusBtnRef = useRef<HTMLButtonElement>(null)
  const [previewFile, setPreviewFile] = useState<LocalFile | null>(null)
  const supabase = getSupabase()
  // Abort handlers for in-flight uploads, keyed by local file id.
  const uploadsRef = useRef<Record<string, () => void>>({})
  // Comment thread state (composer rendered in the fixed footer).
  const comments = usePostComments(post)
  // Real accounts, to resolve tagged emails to names.
  const [accounts, setAccounts] = useState<{ email: string; name: string }[]>([])
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch('/api/accounts')
      .then(r => (r.ok ? r.json() : { accounts: [] }))
      .then((d: { accounts?: { email: string; name: string }[] }) => {
        if (!cancelled) setAccounts(d.accounts ?? [])
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    if (!open || !post) return
    setStatus(post.status)
    setLink('') // the input is for adding a NEW link, not bound to a field
    setFileTab('link')
    setFiles([])

    // Surface the post's legacy single-link fields as link items in the list.
    const legacyLinks: LocalFile[] = []
    if (post.video_link) legacyLinks.push(makeLinkItem(post.video_link, 'video_link'))
    if (post.design_link) legacyLinks.push(makeLinkItem(post.design_link, 'design_link'))
    setFiles(legacyLinks)

    // Load every already-uploaded file + saved link (any category) into the list.
    let cancelled = false
    ;(supabase as any)
      .from('file_attachments')
      .select('*')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true })
      .then(({ data }: { data: Array<Record<string, unknown>> | null }) => {
        if (cancelled || !data) return
        const toLocal = (r: Record<string, unknown>): LocalFile => {
          const fileType = (r.file_type as string) || ''
          const url = r.storage_path as string
          return {
            id: r.id as string,
            file: null,
            name: (r.file_name as string) || 'file',
            size: Number(r.file_size ?? 0),
            type: fileType,
            status: 'saved',
            storageUrl: url,
            url: fileType.startsWith('image/') ? url : undefined,
            category: 'file',
          }
        }
        setFiles([...legacyLinks, ...data.map(toLocal)])
      })
    return () => { cancelled = true }
    // Depend on postId only — NOT the whole `post` object. Otherwise an
    // optimistic status update (which creates a new post object) would re-run
    // this and reload the files / reset the modal. We only want to (re)load
    // when a different task is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, postId, supabase])

  // Update the LOCAL status only — it's persisted when the user clicks Simpan,
  // not automatically on select.
  function changeStatus(newStatus: string) {
    setStatus(newStatus as Post['status'])
    setStatusMenuOpen(false)
  }

  function toggleStatusMenu(e: React.MouseEvent) {
    e.stopPropagation()
    const btn = statusBtnRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const mw = 160
    let left = rect.right - mw
    if (left < 8) left = 8
    setStatusMenuPos({ top: rect.bottom + 6, left })
    setStatusMenuOpen(o => !o)
  }

  function handleFilePick(picked: FileList) {
    const newFiles: LocalFile[] = Array.from(picked).map(f => ({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      file: f, name: f.name, size: f.size, type: f.type,
      status: 'uploading', progress: 0, category: 'file',
      url: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
    }))
    setFiles(p => [...p, ...newFiles])
    // Start uploading immediately — no need to click Simpan.
    newFiles.forEach(lf => void uploadAndPersist(lf))
  }

  // Upload a freshly-picked file right away and persist its file_attachments
  // row, so it's saved on its own. Simpan is only for status/link changes.
  async function uploadAndPersist(lf: LocalFile) {
    if (!post || !lf.file) return
    try {
      const { promise, abort } = uploadFileResumable(lf.file, `task-${post.id}`, p => {
        setFiles(prev => prev.map(f => (f.id === lf.id ? { ...f, progress: Math.round(p.percent) } : f)))
      })
      uploadsRef.current[lf.id] = abort
      const res = await promise

      const category = (lf.type || '').startsWith('video/') ? 'video' : 'design'
      const { data, error } = await (supabase as any)
        .from('file_attachments')
        .insert({
          post_id: post.id,
          category,
          file_name: lf.name,
          file_size: lf.size,
          file_type: lf.type,
          storage_path: res.url,
        })
        .select('id')
        .single()
      if (error) throw error

      delete uploadsRef.current[lf.id]
      setFiles(prev => prev.map(f => (f.id === lf.id ? {
        ...f,
        id: data?.id ?? f.id,
        file: null,
        status: 'saved',
        storageUrl: res.url,
        url: (lf.type || '').startsWith('image/') ? res.url : undefined,
      } : f)))
      logFileActivity(`telah menambahkan ${fileKindLabel(lf.type, lf.name)} dengan nama file ${lf.name}`)
    } catch (e) {
      delete uploadsRef.current[lf.id]
      setFiles(prev => prev.filter(f => f.id !== lf.id))
      const err = e as { message?: string }
      alert(`${t('Gagal mengupload')} "${lf.name}": ${err?.message || t('Coba lagi.')}`)
    }
  }

  // Add a link as an attachment (persisted to file_attachments) — appears in
  // the list immediately, like an uploaded file.
  async function addLink() {
    if (!post) return
    const raw = link.trim()
    if (!raw) return
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    try {
      const { data, error } = await (supabase as any).from('file_attachments').insert({
        post_id: post.id,
        category: 'design',
        file_name: url,
        file_size: 0,
        file_type: 'link',
        storage_path: url,
      }).select('id').single()
      if (error) throw error
      setFiles(prev => [...prev, { ...makeLinkItem(url), id: (data?.id as string) ?? `lnk-${Math.random().toString(36).slice(2)}` }])
      setLink('')
      logFileActivity(`telah menambahkan tautan ${url}`)
    } catch (e) {
      alert(t('Gagal menambah link:') + ' ' + ((e as { message?: string })?.message || t('Coba lagi.')))
    }
  }

  async function handleSave() {
    if (!post) return
    setSaving(true)
    try {
      // Status changes apply immediately; links/files are saved on add/upload.
      // Simpan persists the (locally-changed) status now.
      const { error: updErr } = await (supabase as any).from('posts').update({
        status,
      }).eq('id', post.id)
      if (updErr) throw updErr
      upsertPost({ ...post, status } as Post) // reflect on the board instantly

      const wsLabel = WS_STATUS_COLS.find(c => c.key === status)?.label || POST_STATUS_LABELS[status] || status
      logActivity(`${member} mengupdate post: "${post.title}" → ${wsLabel}`)
      // Log the status change to the post's own activity feed too.
      if (status !== post.status) {
        logFileActivity(`telah mengubah status menjadi ${wsLabel}`)
      }
      setSaving(false)
      onClose()
    } catch (e) {
      setSaving(false)
      const err = e as { message?: string; error?: string }
      const msg = err?.message || err?.error || (typeof e === 'string' ? e : JSON.stringify(e))
      console.error('[WSEditModal] save failed:', e)
      alert(t('Gagal menyimpan:') + ' ' + msg)
    }
  }

  function removeFile(id: string) {
    // Abort an in-flight upload if this file is still uploading.
    const abort = uploadsRef.current[id]
    if (abort) { abort(); delete uploadsRef.current[id] }
    setFiles(p => p.filter(f => f.id !== id))
  }

  // Log a file activity entry (actor = logged-in user) to the post's feed.
  async function logFileActivity(body: string) {
    if (!post || !comments.me.email) return
    try {
      await (supabase as any).from('post_comments').insert({
        post_id: post.id,
        type: 'activity',
        author_email: comments.me.email,
        author_name: comments.me.name,
        body,
      })
    } catch { /* non-blocking */ }
  }

  // Permanently delete an already-saved file: remove its DB row + storage object.
  async function deleteSavedFile(lf: LocalFile) {
    if (!post) return
    if (!window.confirm(`${t('Hapus')} "${lf.name}"?`)) return
    try {
      if (lf.postLinkField) {
        // Legacy link stored on the post itself — clear that column.
        const { error } = await (supabase as any).from('posts').update({ [lf.postLinkField]: '' }).eq('id', post.id)
        if (error) throw error
      } else {
        const { error } = await (supabase as any).from('file_attachments').delete().eq('id', lf.id)
        if (error) throw error
        if (lf.storageUrl) {
          try { await deleteFile(lf.storageUrl) } catch { /* best-effort; row is gone either way */ }
        }
      }
      setFiles(prev => prev.filter(f => f.id !== lf.id))
      const kind = lf.type === 'link' ? 'tautan' : fileKindLabel(lf.type, lf.name)
      logFileActivity(`telah menghapus ${kind} ${lf.name}`)
    } catch (e) {
      const err = e as { message?: string }
      alert(t('Gagal menghapus:') + ' ' + (err?.message || t('Coba lagi.')))
    }
  }

  async function handleCreatePipeline() {
    const isVP = member === 'Video Production'
    const stageKeys = isVP
      ? ['ide', 'script', 'audio', 'video', 'upload']
      : ['ide', 'brief', 'design', 'review', 'upload']

    const stagesData: Record<string, StageData> = {}
    stageKeys.forEach(key => {
      stagesData[key] = {
        status: 'pending', notes: '', files: [], checklist: [],
        started_at: null, completed_at: null,
      }
    })

    const { error } = await (supabase as any).from('pipeline_items').insert({
      title: post!.title,
      member,
      source_post_id: post!.id,
      current_stage: stageKeys[0],
      stages_data: stagesData,
    })

    if (error) {
      alert(t('Gagal membuat pipeline item. Coba lagi.'))
    } else {
      alert(`${t('Pipeline item dibuat untuk')} "${post!.title}"`)
    }
  }

  if (!post) return null

  const isRevisi = post.status === 'revisi'

  // Status badge color
  const curStatusCol = WS_STATUS_COLS.find(c => c.key === status)
  const statusColor = curStatusCol?.color || '#8b8fa8'

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      maxWidth={640}
      title="Detail Task"
      headerRight={
        <>
          {/* Custom Status Dropdown Button */}
          <button
            ref={statusBtnRef}
            onClick={toggleStatusMenu}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
              background: statusColor + '22', border: `1px solid ${statusColor}55`,
              color: statusColor, fontSize: 12, fontWeight: 600,
            }}
          >
            {WS_STATUS_COLS.find(c => c.key === status)?.label || POST_STATUS_LABELS[status] || status}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {/* Status Menu (fixed position) */}
          {statusMenuOpen && (
            <>
              <div className="fixed inset-0 z-[2999]" onClick={() => setStatusMenuOpen(false)} />
              <div style={{
                position: 'fixed', top: statusMenuPos.top, left: statusMenuPos.left,
                zIndex: 3000, background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: 4, width: 160,
                boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
              }}>
                {WS_STATUS_COLS.filter(c => {
                  // Cannot move TO revisi from here
                  if (c.key === 'revisi' && post.status !== 'revisi') return false
                  return true
                }).map(c => (
                  <button
                    key={c.key}
                    onClick={() => changeStatus(c.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '7px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12,
                      background: status === c.key ? c.color + '22' : 'transparent',
                      color: status === c.key ? c.color : 'var(--text)',
                      border: 'none', textAlign: 'left',
                    }}
                    onMouseOver={e => { if (status !== c.key) (e.currentTarget as HTMLElement).style.background = 'var(--bg3)' }}
                    onMouseOut={e => { if (status !== c.key) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                    {c.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      }
      footer={
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Comment composer — pinned in the fixed footer, always at the bottom */}
          <PostCommentsComposer s={comments} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
            {post.status === 'produksi' && (
              <button
                onClick={handleCreatePipeline}
                style={{
                  padding: '7px 14px', background: 'transparent',
                  border: '1px solid var(--accent)', borderRadius: 8,
                  cursor: 'pointer', fontSize: 12, color: 'var(--accent)', fontWeight: 500,
                }}
              >
                📌 {t('Buat Pipeline Item')}
              </button>
            )}
            <BtnSecondary onClick={onClose}>{t('Batal')}</BtnSecondary>
            <BtnPrimary onClick={handleSave} loading={saving}>{t('Simpan')}</BtnPrimary>
          </div>
        </div>
      }
    >
      {/* Post info */}
      <div style={{ padding: '0 0 18px', borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
        {isRevisi && (
          <div style={{
            background: '#a78bfa22', border: '1px solid #a78bfa55',
            borderRadius: 8, padding: '8px 12px', marginBottom: 12,
            fontSize: 12, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            🔁 {t('Post ini sedang dalam proses revisi')}
          </div>
        )}

        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>{post.title}</div>

        {/* Meta grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <InfoRow label={t('Tanggal Post')}>{formatDate(post.date)}</InfoRow>
          <InfoRow label="Platform">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {(post.platforms || []).map(pl => <PlatformIcon key={pl} platform={pl} size={20} />)}
              {!post.platforms?.length && '—'}
            </div>
          </InfoRow>
          <InfoRow label="Entity">{post.entity?.toUpperCase() || '—'}</InfoRow>
          <InfoRow label={t('Dibuat oleh')}>{post.created_by || '—'}</InfoRow>
          <InfoRow label={t('Jenis Konten')}>{(post.content_types || []).join(', ') || '—'}</InfoRow>
          <InfoRow label="Ratio">{post.ratio || '—'}</InfoRow>
          <InfoRow label={t('Tag')}>
            {(() => {
              const tags = (post.tagged || []).filter(m => m.includes('@') || accounts.some(a => a.name === m))
              if (!tags.length) return '—'
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {tags.map(m => {
                    const acc = accounts.find(a => a.email === m || a.name === m)
                    const name = acc?.name ?? (m.includes('@') ? m.split('@')[0] : m)
                    return (
                      <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <TeamAvatar name={name} size={20} />
                        <span style={{ fontSize: 13, color: 'var(--text)' }}>{name}</span>
                      </span>
                    )
                  })}
                </div>
              )
            })()}
          </InfoRow>
        </div>

        {/* Text fields */}
        {post.brief && <DetailBlock label="Brief">{post.brief}</DetailBlock>}
        {post.caption && <DetailBlock label="Caption">{post.caption}</DetailBlock>}
        {post.hashtags && <DetailBlock label="Hashtags" accent>{post.hashtags}</DetailBlock>}
        {post.notes && <DetailBlock label={t('Catatan')}>{post.notes}</DetailBlock>}
      </div>

      {/* Update Task section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text2)', fontWeight: 700, whiteSpace: 'nowrap' }}>
          Update Task
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {/* Files — single unified section (video + design merged) */}
      <FileSection
        title={`📎 ${t('File Lampiran')}`}
        tab={fileTab}
        onTabChange={setFileTab}
        link={link}
        onLinkChange={setLink}
        files={files}
        onFilePick={handleFilePick}
        onRemove={removeFile}
        onDelete={deleteSavedFile}
        onPreview={setPreviewFile}
        onAddLink={addLink}
        accept="*/*"
        linkPlaceholder={`https://drive.google.com/... ${t('atau')} https://figma.com/...`}
        uploadHint={t('Video, gambar, PDF, dan lainnya')}
      />

      {/* Comment room + activity — same as Bentala Project / Studio
          (composer lives in the fixed footer below) */}
      <PostCommentsBody s={comments} />
    </Modal>

    {/* In-app file preview (image / video / pdf) — no need to leave the page */}
    {previewFile && (
      <Modal
        open={!!previewFile}
        onClose={() => setPreviewFile(null)}
        title={previewFile.name}
        maxWidth={760}
        headerRight={
          (previewFile.storageUrl || previewFile.url) ? (
            <a
              href={previewFile.storageUrl || previewFile.url}
              download
              target="_blank"
              rel="noopener noreferrer"
              title="Download"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                borderRadius: 8, background: 'var(--accent)', color: '#fff',
                fontSize: 12, fontWeight: 600, textDecoration: 'none',
              }}
            >
              <DownloadIcon size={14} /> Download
            </a>
          ) : undefined
        }
      >
        <FilePreviewBody file={previewFile} />
      </Modal>
    )}
    </>
  )
}

function DownloadIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function LinkIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function ExternalLinkIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

function TrashIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

// Build a LocalFile that represents a link (either a saved file_attachments
// 'link' row or one of the post's legacy video_link/design_link fields).
function makeLinkItem(url: string, postLinkField?: 'video_link' | 'design_link'): LocalFile {
  return {
    id: postLinkField ? `plink-${postLinkField}` : `lnk-${Math.random().toString(36).slice(2)}`,
    file: null,
    name: url,
    size: 0,
    type: 'link',
    status: 'saved',
    storageUrl: url,
    category: 'design',
    postLinkField,
  }
}

// Human label for a file's kind, used in activity messages
// (e.g. "menambahkan gambar dengan nama file haha.jpg").
function fileKindLabel(type?: string, name?: string): string {
  const t = (type || '').toLowerCase()
  const ext = (name || '').toLowerCase().split('.').pop() || ''
  if (t.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return 'gambar'
  if (t.startsWith('video/') || ['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'].includes(ext)) return 'video'
  if (t === 'application/pdf' || ext === 'pdf') return 'PDF'
  return 'file'
}

// Decide how to render a file preview.
function fileKind(f: { type?: string; name?: string }): 'image' | 'video' | 'pdf' | 'other' {
  const t = (f.type || '').toLowerCase()
  const ext = (f.name || '').toLowerCase().split('.').pop() || ''
  if (t.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return 'image'
  if (t.startsWith('video/') || ['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'].includes(ext)) return 'video'
  if (t === 'application/pdf' || ext === 'pdf') return 'pdf'
  return 'other'
}

function FilePreviewBody({ file }: { file: LocalFile }) {
  const t = useT()
  const url = file.storageUrl || file.url || ''
  const kind = fileKind(file)
  if (!url) {
    return <div style={{ color: 'var(--text2)', fontSize: 13 }}>{t('File tidak tersedia.')}</div>
  }
  if (kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={file.name} style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', margin: '0 auto', borderRadius: 8 }} />
  }
  if (kind === 'video') {
    return <video src={url} controls autoPlay style={{ width: '100%', maxHeight: '70vh', borderRadius: 8, background: '#000' }} />
  }
  if (kind === 'pdf') {
    return <iframe src={url} title={file.name} style={{ width: '100%', height: '70vh', border: 'none', borderRadius: 8, background: '#fff' }} />
  }
  return (
    <div style={{ textAlign: 'center', padding: 24 }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>{getFileIcon(file.type, file.name)}</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>
        {t('Preview tidak tersedia untuk tipe file ini.')}
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 13, textDecoration: 'none' }}>
        ⬇ {t('Download / Buka')}
      </a>
    </div>
  )
}

// ── File Section ──
function FileSection({
  title, tab, onTabChange, link, onLinkChange,
  files, onFilePick, onRemove, onDelete, onPreview, onAddLink, accept, linkPlaceholder, uploadHint,
}: {
  title: string
  tab: 'link' | 'upload'
  onTabChange: (t: 'link' | 'upload') => void
  link: string
  onLinkChange: (v: string) => void
  files: LocalFile[]
  onFilePick: (f: FileList) => void
  onRemove: (id: string) => void
  onDelete: (f: LocalFile) => void
  onPreview: (f: LocalFile) => void
  onAddLink: () => void
  accept: string
  linkPlaceholder: string
  uploadHint: string
}) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{title}</div>

      {/* Tab buttons */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['link', 'upload'] as const).map(t => (
          <button key={t} onClick={() => onTabChange(t)}
            style={{
              padding: '5px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
              background: tab === t ? 'var(--accent)' : 'var(--bg2)',
              color: tab === t ? '#fff' : 'var(--text2)',
              border: `1px solid ${tab === t ? 'var(--accent)' : 'var(--border)'}`,
              transition: 'all 0.15s',
            }}
          >
            {t === 'link' ? '🔗 Link' : '📁 Upload File'}
          </button>
        ))}
      </div>

      {tab === 'link' ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="url"
            value={link}
            onChange={e => onLinkChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAddLink() } }}
            placeholder={linkPlaceholder}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            onClick={onAddLink}
            disabled={!link.trim()}
            style={{
              padding: '0 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
              background: link.trim() ? 'var(--accent)' : 'var(--bg2)',
              color: link.trim() ? '#fff' : 'var(--text2)',
              cursor: link.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
            }}
          >
            + {t('Tambah')}
          </button>
        </div>
      ) : (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files) onFilePick(e.target.files) }}
          />

          {/* Dropzone */}
          <div
            className="ws-dropzone"
            style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: '24px 16px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' }}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-active') }}
            onDragLeave={e => e.currentTarget.classList.remove('drag-active')}
            onDrop={e => {
              e.preventDefault(); e.currentTarget.classList.remove('drag-active')
              if (e.dataTransfer.files) onFilePick(e.dataTransfer.files)
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="1.5" style={{ marginBottom: 8 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{t('Drop file di sini atau')} <span style={{ color: 'var(--accent)' }}>browse</span></div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{uploadHint}</div>
          </div>
        </div>
      )}

      {/* File items — always visible (uploaded files + in-progress), regardless
          of the Link/Upload tab, so saved files are shown when reopening. */}
      {files.length > 0 && (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, alignItems: 'start' }}>
          {files.map(f => (
            <FileItem key={f.id} file={f} onRemove={() => onRemove(f.id)} onDelete={() => onDelete(f)} onPreview={() => onPreview(f)} />
          ))}
        </div>
      )}
    </div>
  )
}

// Grid card (matches the BPI/BSI preview): thumbnail + name + actions.
function FileItem({ file, onRemove, onDelete, onPreview }: { file: LocalFile; onRemove: () => void; onDelete: () => void; onPreview: () => void }) {
  const t = useT()
  const isLink = file.type === 'link'
  const isImage = !isLink && !!file.url && file.type.startsWith('image/')
  const canPreview = !isLink && !!(file.storageUrl || file.url) && fileKind(file) !== 'other'
  const openLink = () => { if (file.storageUrl) window.open(file.storageUrl, '_blank', 'noopener,noreferrer') }
  const onCardClick = file.status === 'saved' ? (isLink ? openLink : (canPreview ? onPreview : undefined)) : undefined
  const uploading = file.status === 'uploading'
  return (
    <div
      onClick={onCardClick}
      title={file.name}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
        padding: 8, cursor: onCardClick ? 'pointer' : 'default',
      }}
      onMouseOver={e => { if (onCardClick) (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
      onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
    >
      {/* Thumbnail */}
      <div style={{
        width: '100%', height: 96, borderRadius: 8, background: 'var(--bg3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.url} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : isLink ? (
          <span style={{ color: 'var(--accent)' }}><LinkIcon size={28} /></span>
        ) : (
          <span style={{ fontSize: 30 }}>{getFileIcon(file.type, file.name)}</span>
        )}
      </div>

      {/* Name */}
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {file.name}
      </div>

      {/* Upload progress */}
      {uploading && (
        <div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 20, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 20, background: 'linear-gradient(90deg, var(--accent), #a78bfa)', width: `${file.progress ?? 0}%`, transition: 'width 0.2s ease' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>{t('Mengupload…')} {file.progress ?? 0}%</div>
        </div>
      )}

      {/* Meta + actions */}
      {!uploading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {isLink ? t('Tautan') : file.status === 'saved' ? formatFileSize(file.size) : t('Klik Simpan')}
          </span>
          {file.status === 'saved' ? (
            <>
              {file.storageUrl && (
                <a
                  href={file.storageUrl}
                  {...(isLink ? {} : { download: true })}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  title={isLink ? t('Buka tautan') : 'Download'}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, color: 'var(--text2)', flexShrink: 0 }}
                  onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg3)' }}
                  onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text2)'; (e.currentTarget as HTMLElement).style.background = 'none' }}
                >
                  {isLink ? <ExternalLinkIcon /> : <DownloadIcon />}
                </a>
              )}
              <button
                onClick={e => { e.stopPropagation(); onDelete() }}
                title={t('Hapus')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', flexShrink: 0 }}
                onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = '#ff6b6b'; (e.currentTarget as HTMLElement).style.background = '#ff6b6b18' }}
                onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text2)'; (e.currentTarget as HTMLElement).style.background = 'none' }}
              >
                <TrashIcon />
              </button>
            </>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); onRemove() }}
              title={t('Hapus dari daftar')}
              style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', width: 26, height: 26, borderRadius: 6, fontSize: 14, lineHeight: 1, flexShrink: 0 }}
              onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = '#ff6b6b'; (e.currentTarget as HTMLElement).style.background = '#ff6b6b18' }}
              onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text2)'; (e.currentTarget as HTMLElement).style.background = 'none' }}
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.7px', color: 'var(--text2)', fontWeight: 700, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13 }}>{children}</div>
    </div>
  )
}

function DetailBlock({ label, accent, children }: { label: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.7px', color: 'var(--text2)', fontWeight: 700, marginBottom: 6 }}>
        {label}
      </div>
      <pre style={{
        fontSize: 13, lineHeight: 1.6, color: accent ? '#6b9bff' : 'var(--text)',
        background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
        padding: '10px 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', margin: 0,
      }}>
        {children}
      </pre>
    </div>
  )
}
