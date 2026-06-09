'use client'

import { useEffect, useRef, useState } from 'react'
import { Modal, BtnSecondary } from '@/components/shared/Modal'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useStore } from '@/hooks/useStore'
import { getSupabase } from '@/lib/supabase'
import { deleteFile } from '@/lib/storage'
import { formatDate } from '@/lib/utils'
import { TeamAvatar } from '@/components/shared/StatusBadge'
import { BPI_STATUS_COLS } from '@/lib/constants'
import type { Post } from '@/lib/types'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import { uploadFileResumable } from '@/lib/storage'
import { usePostComments, PostCommentsBody, PostCommentsComposer } from '@/components/BPI/PostComments'

interface PostPreviewModalProps {
  open: boolean
  postId: string
  onClose: () => void
  onEdit: (id: string) => void
  /** When false (workspace pages), the "Edit Post" button is hidden. */
  canEdit?: boolean
}

export function PostPreviewModal({ open, postId, onClose, onEdit, canEdit = true }: PostPreviewModalProps) {
  const t = useT()
  const { posts, upsertPost } = useStore()
  const post = posts.find(p => p.id === postId)
  // Hooks must run before any early return (rules of hooks).
  const comments = usePostComments(post)

  // Status change (deferred — only persisted on Simpan, not on select).
  const [statusDraft, setStatusDraft] = useState<string>(post?.status ?? '')
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [statusMenuPos, setStatusMenuPos] = useState({ top: 0, left: 0 })
  const [savingStatus, setSavingStatus] = useState(false)
  const statusBtnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    setStatusDraft(post?.status ?? '')
    setStatusMenuOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, postId, post?.status])

  // Files uploaded via the Video Production / Design worksheet live in the
  // file_attachments table — load them so they show here too.
  const [extraFiles, setExtraFiles] = useState<{ id: string; url: string; name: string }[]>([])
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
        setExtraFiles(data.map(r => ({ id: r.id as string, url: r.storage_path as string, name: (r.file_name as string) || 'file' })))
      })
    return () => { cancelled = true }
  }, [open, postId])

  // In-app file preview popup.
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null)
  // Paste-a-link input + in-flight uploads (per-file progress + cancel).
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
  const attachments: { icon: string; label: string; url: string; src: AttachSrc }[] = []
  const seenUrls = new Set<string>()
  const addAttach = (url: string | null | undefined, src: AttachSrc, icon?: string, label?: string) => {
    if (!url || seenUrls.has(url)) return
    seenUrls.add(url)
    attachments.push({ icon: icon ?? attachIcon(url), label: label ?? attachLabel(url), url, src })
  }
  addAttach(post.video_link, { kind: 'field', field: 'video_link' }, '🎬', 'Video')
  addAttach(post.design_link, { kind: 'field', field: 'design_link' }, '🎨', 'Design')
  addAttach(post.video_file_url, { kind: 'field', field: 'video_file_url' }, '🎬', 'Video')
  addAttach(post.design_file_url, { kind: 'field', field: 'design_file_url' }, '🎨', 'Design')
  ;(post.files || []).forEach((f, i) => addAttach(f, { kind: 'files', fileIdx: i }))
  for (const f of extraFiles) addAttach(f.url, { kind: 'row', rowId: f.id }, undefined, f.name)

  // Files that can be previewed in-app (image/video/pdf) — links are excluded,
  // so the preview popup can page left/right through actual files only.
  const previewFiles = attachments.filter(a => previewKind(a.url) !== 'other')

  // Persist the posts.files list (links + uploaded file URLs).
  async function saveFiles(urls: string[]) {
    if (!post) return
    const { error } = await getSupabase().from('posts').update({ files: urls }).eq('id', post.id)
    if (error) { alert(t('Gagal menyimpan: ') + error.message); return }
    upsertPost({ ...post, files: urls } as Post)
  }

  // Add a pasted link (Drive / Figma / etc.) to the attachments.
  function addLink() {
    const v = linkInput.trim()
    if (!v || !post) return
    const cur = post.files || []
    if (!cur.includes(v)) void saveFiles([...cur, v])
    setLinkInput('')
  }

  // Append a finished upload's URL to posts.files, reading the latest list from
  // the store so concurrent uploads don't overwrite each other.
  function appendUrl(url: string) {
    const latest = useStore.getState().posts.find(p => p.id === postId)
    if (!latest) return
    const cur = latest.files || []
    if (cur.includes(url)) return
    const next = [...cur, url]
    upsertPost({ ...latest, files: next }) // optimistic (synchronous)
    void getSupabase().from('posts').update({ files: next }).eq('id', postId)
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
    if (!post || !window.confirm(t('Hapus "{label}"?').replace('{label}', att.label))) return
    const sb = getSupabase() as unknown as { from: (t: string) => any }
    try {
      if (att.src.kind === 'row') {
        const { error } = await sb.from('file_attachments').delete().eq('id', att.src.rowId)
        if (error) throw error
        try { await deleteFile(att.url) } catch { /* best-effort */ }
        setExtraFiles(prev => prev.filter(f => f.id !== (att.src as { rowId: string }).rowId))
      } else if (att.src.kind === 'files') {
        const next = (post.files || []).filter((_, i) => i !== (att.src as { fileIdx: number }).fileIdx)
        const { error } = await sb.from('posts').update({ files: next }).eq('id', post.id)
        if (error) throw error
        upsertPost({ ...post, files: next } as Post)
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

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={t('Detail Post')}
      headerRight={
        canEdit ? (
        <>
          <button
            ref={statusBtnRef}
            onClick={toggleStatusMenu}
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
                    onClick={() => { setStatusDraft(c.key); setStatusMenuOpen(false) }}
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
          {/* Comment composer — pinned in the fixed footer, always at the bottom */}
          <PostCommentsComposer s={comments} />
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
            <BtnSecondary onClick={onClose}>{t('Tutup')}</BtnSecondary>
            {canEdit && (
              <button
                onClick={() => { onClose(); onEdit(post.id) }}
                style={{ background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
              >
                {t('Edit Post')}
              </button>
            )}
          </div>
        </div>
      }
    >
      <h2 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, color: 'var(--text)', marginTop: 4, marginBottom: 18 }}>
        {post.title}
      </h2>

      {/* Meta grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <MetaItem label={t('Tanggal Post')} value={formatDate(post.date)} />
        <MetaItem label={t('Platform')} value={
          (post.platforms || []).length ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {(post.platforms || []).map(pl => <PlatformIcon key={pl} platform={pl} size={20} />)}
            </div>
          ) : '—'
        } />
        <MetaItem label={t('Entity')} value={post.entity?.toUpperCase() || '—'} />
        <MetaItem label={t('Dibuat oleh')} value={post.created_by || '—'} />
        <MetaItem label={t('Jenis Konten')} value={(post.content_types || []).join(', ') || '—'} />
        <MetaItem label={t('Ratio')} value={post.ratio || '—'} />
        <MetaItem label={t('Tag')} value={(() => {
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
      </div>

      {/* Headline + Brief — always shown to mirror the edit form */}
      <CopyField label={t('Headline')} value={post.headline} emptyText={t('Belum ada headline.')} />
      <CopyField label="Brief" value={post.brief} emptyText={t('Belum ada brief.')} />

      {/* Caption / Hashtags / Notes — only when present */}
      {post.caption && <CopyField label="Caption" value={post.caption} />}
      {post.hashtags && <CopyField label="Hashtags" value={post.hashtags} color="#6b9bff" />}
      {post.notes && <CopyField label={t('Catatan')} value={post.notes} />}

      {/* Attachments — links + uploaded files + an uploader so files can be
          added straight from the details view (no need to open Edit). */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 8 }}>
          {t('Lampiran File')}
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
                icon={a.icon}
                label={a.label}
                url={a.url}
                onOpen={() => openAttachment(a.url, a.label)}
                onDelete={() => deleteAttachment(a)}
              />
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text3)', padding: '4px 2px' }}>{t('Belum ada lampiran.')}</div>
        )}
      </div>

      {/* Comment room + activity feed (composer lives in the fixed footer) */}
      <PostCommentsBody s={comments} />
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
            <a
              href={preview.url}
              download
              target="_blank"
              rel="noopener noreferrer"
              title="Download"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}
            >
              ⬇ Download
            </a>
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
    return <img src={url} alt={label} style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', margin: '0 auto', borderRadius: 8 }} />
  }
  if (kind === 'video') {
    return <video src={url} controls autoPlay style={{ width: '100%', maxHeight: '70vh', borderRadius: 8, background: '#000' }} />
  }
  if (kind === 'pdf') {
    return <iframe src={url} title={label} style={{ width: '100%', height: '70vh', border: 'none', borderRadius: 8, background: '#fff' }} />
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

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 5 }}>{label}</div>
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

function AttachCard({ icon, label, url, onOpen, onDelete }: { icon: string; label: string; url: string; onOpen: () => void; onDelete: () => void }) {
  const t = useT()
  const thumbSrc = safeImageSrc(url)
  return (
    <div
      onClick={onOpen}
      title={label}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10,
        padding: 8, cursor: 'pointer',
      }}
      onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
      onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
    >
      <div style={{
        width: '100%', height: 96, borderRadius: 8, background: 'var(--bg2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        {thumbSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbSrc} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 32 }}>{icon}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </span>
        {isSafeHttpUrl(url) && (
          <a
            href={url}
            download
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            title="Download"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, color: 'var(--text2)', flexShrink: 0 }}
            onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg2)' }}
            onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text2)'; (e.currentTarget as HTMLElement).style.background = 'none' }}
          >
            <PvDownloadIcon />
          </a>
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
    </div>
  )
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
  label, value, emptyText, color,
}: {
  label: string
  value: string | null | undefined
  emptyText?: string
  color?: string
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
          {label}
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
