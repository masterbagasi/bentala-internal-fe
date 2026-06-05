'use client'

import { useState, useEffect, useRef } from 'react'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { getSupabase } from '@/lib/supabase'
import { useStore } from '@/hooks/useStore'
import { useLogActivity } from '@/hooks/useData'
import { WS_STATUS_COLS, POST_STATUS_LABELS } from '@/lib/constants'
import { formatDate, formatFileSize, getFileIcon } from '@/lib/utils'
import { uploadFileResumable, deleteFile } from '@/lib/storage'
import { PlatformBadge, TeamAvatar } from '@/components/shared/StatusBadge'
import { usePostComments, PostCommentsBody, PostCommentsComposer } from '@/components/BPI/PostComments'
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
}

export function WSEditModal({ open, postId, member, onClose }: WSEditModalProps) {
  const { posts } = useStore()
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
  // Comment thread state (composer rendered in the fixed footer).
  const comments = usePostComments(post)

  useEffect(() => {
    if (!open || !post) return
    setStatus(post.status)
    setLink(post.video_link || post.design_link || '')
    setFileTab('link')
    setFiles([])

    // Load every already-uploaded file (any category) into one combined list.
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
        setFiles(data.map(toLocal))
      })
    return () => { cancelled = true }
  }, [open, postId, post, supabase])

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
      status: 'settled', category: 'file',
      url: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
    }))
    // The real upload happens on Save; just queue the picked files here.
    setFiles(p => [...p, ...newFiles])
  }

  async function handleSave() {
    if (!post) return
    setSaving(true)

    // Upload one local file via the resumable (TUS) uploader — chunked, so it
    // bypasses the 50MB single-shot cap and handles large videos. Reports real
    // progress and throws on failure.
    const uploadOne = async (lf: LocalFile): Promise<string> => {
      if (!lf.file) return lf.storageUrl || ''
      setFiles(prev => prev.map(f => (f.id === lf.id ? { ...f, status: 'uploading', progress: 0 } : f)))
      const { promise } = uploadFileResumable(lf.file, `task-${post.id}`, p => {
        setFiles(prev => prev.map(f => (f.id === lf.id ? { ...f, progress: Math.round(p.percent) } : f)))
      })
      const res = await promise
      return res.url
    }

    try {
      // Upload every locally-picked file (don't depend on the cosmetic
      // upload-progress status, so saving early still works).
      const pending = files.filter(f => f.file)
      const urls = await Promise.all(pending.map(uploadOne))

      for (let i = 0; i < pending.length; i++) {
        const lf = pending[i]
        // The table's category CHECK only allows 'video' | 'design'; derive a
        // valid value from the file type (everything non-video → 'design').
        const category = (lf.type || '').startsWith('video/') ? 'video' : 'design'
        const { error: insErr } = await (supabase as any).from('file_attachments').insert({
          post_id: post.id,
          category,
          file_name: lf.name,
          file_size: lf.size,
          file_type: lf.type,
          storage_path: urls[i],
        })
        if (insErr) throw insErr
      }

      // Update post status & link. The single link is consolidated into
      // video_link; design_link is cleared so there's one source of truth.
      const { error: updErr } = await (supabase as any).from('posts').update({
        status,
        video_link: link,
        design_link: '',
      }).eq('id', post.id)
      if (updErr) throw updErr

      const wsLabel = WS_STATUS_COLS.find(c => c.key === status)?.label || POST_STATUS_LABELS[status] || status
      logActivity(`${member} mengupdate post: "${post.title}" → ${wsLabel}`)
      setSaving(false)
      onClose()
    } catch (e) {
      setSaving(false)
      // Supabase errors aren't always `Error` instances — dig out a message.
      const err = e as { message?: string; error?: string; statusCode?: string | number; name?: string }
      const msg = err?.message || err?.error || (typeof e === 'string' ? e : JSON.stringify(e))
      console.error('[WSEditModal] save failed:', e)
      alert('Gagal menyimpan file: ' + msg)
    }
  }

  function removeFile(id: string) {
    setFiles(p => p.filter(f => f.id !== id))
  }

  // Permanently delete an already-saved file: remove its DB row + storage object.
  async function deleteSavedFile(lf: LocalFile) {
    if (!window.confirm(`Hapus file "${lf.name}"?`)) return
    try {
      const { error } = await (supabase as any).from('file_attachments').delete().eq('id', lf.id)
      if (error) throw error
      if (lf.storageUrl) {
        try { await deleteFile(lf.storageUrl) } catch { /* best-effort; row is gone either way */ }
      }
      setFiles(prev => prev.filter(f => f.id !== lf.id))
    } catch (e) {
      const err = e as { message?: string }
      alert('Gagal menghapus file: ' + (err?.message || 'Coba lagi.'))
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
      alert('Gagal membuat pipeline item. Coba lagi.')
    } else {
      alert(`Pipeline item dibuat untuk "${post!.title}"`)
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
                    onClick={() => { setStatus(c.key as Post['status']); setStatusMenuOpen(false) }}
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
                📌 Buat Pipeline Item
              </button>
            )}
            <BtnSecondary onClick={onClose}>Batal</BtnSecondary>
            <BtnPrimary onClick={handleSave} loading={saving}>Simpan</BtnPrimary>
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
            🔁 Post ini sedang dalam proses revisi
          </div>
        )}

        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{post.title}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <InfoRow label="Platform">
            <div style={{ display: 'flex', gap: 4 }}>
              {(post.platforms || []).map(pl => <PlatformBadge key={pl} platform={pl} />)}
              {!post.platforms?.length && '—'}
            </div>
          </InfoRow>
          <InfoRow label="Tanggal Post">
            {formatDate(post.date)}
          </InfoRow>
          <InfoRow label="Caption">
            <span style={{ color: 'var(--text2)', fontSize: 12 }}>
              {post.caption ? post.caption.slice(0, 60) + (post.caption.length > 60 ? '...' : '') : '—'}
            </span>
          </InfoRow>
        </div>
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
        title="📎 File Lampiran"
        tab={fileTab}
        onTabChange={setFileTab}
        link={link}
        onLinkChange={setLink}
        files={files}
        onFilePick={handleFilePick}
        onRemove={removeFile}
        onDelete={deleteSavedFile}
        onPreview={setPreviewFile}
        accept="*/*"
        linkPlaceholder="https://drive.google.com/... atau https://figma.com/..."
        uploadHint="Video, gambar, PDF, dan lainnya"
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
  const url = file.storageUrl || file.url || ''
  const kind = fileKind(file)
  if (!url) {
    return <div style={{ color: 'var(--text2)', fontSize: 13 }}>File tidak tersedia.</div>
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
        Preview tidak tersedia untuk tipe file ini.
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 13, textDecoration: 'none' }}>
        ⬇ Download / Buka
      </a>
    </div>
  )
}

// ── File Section ──
function FileSection({
  title, tab, onTabChange, link, onLinkChange,
  files, onFilePick, onRemove, onDelete, onPreview, accept, linkPlaceholder, uploadHint,
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
  accept: string
  linkPlaceholder: string
  uploadHint: string
}) {
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
        <input type="url" value={link} onChange={e => onLinkChange(e.target.value)} placeholder={linkPlaceholder} />
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
            <div style={{ fontSize: 13, fontWeight: 500 }}>Drop file di sini atau <span style={{ color: 'var(--accent)' }}>browse</span></div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{uploadHint}</div>
          </div>
        </div>
      )}

      {/* File items — always visible (uploaded files + in-progress), regardless
          of the Link/Upload tab, so saved files are shown when reopening. */}
      {files.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {files.map(f => (
            <FileItem key={f.id} file={f} onRemove={() => onRemove(f.id)} onDelete={() => onDelete(f)} onPreview={() => onPreview(f)} />
          ))}
        </div>
      )}
    </div>
  )
}

function FileItem({ file, onRemove, onDelete, onPreview }: { file: LocalFile; onRemove: () => void; onDelete: () => void; onPreview: () => void }) {
  const canPreview = !!(file.storageUrl || file.url) && fileKind(file) !== 'other'
  return (
    <div
      onClick={canPreview ? onPreview : undefined}
      title={canPreview ? 'Klik untuk preview' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg2)',
        border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px',
        cursor: canPreview ? 'pointer' : 'default',
      }}
    >
      {/* Thumbnail */}
      {file.url && file.type.startsWith('image/') ? (
        <img src={file.url} alt={file.name} style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
      ) : (
        <div style={{ width: 34, height: 34, borderRadius: 7, background: 'var(--bg3)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>
          {getFileIcon(file.type, file.name)}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{formatFileSize(file.size)}</div>

        {/* Status */}
        {file.status === 'uploading' && (
          <div style={{ marginTop: 4 }}>
            <div style={{ height: 4, background: 'var(--border)', borderRadius: 20, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 20, background: 'linear-gradient(90deg, var(--accent), #a78bfa)',
                width: `${file.progress ?? 0}%`, transition: 'width 0.2s ease',
              }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>
              Mengupload… {file.progress ?? 0}%
            </div>
          </div>
        )}
        {file.status === 'done' && (
          <div style={{ fontSize: 11, color: 'var(--accent3)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
            ✓ Selesai
          </div>
        )}
        {file.status === 'settled' && file.file && (
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>
            Klik Simpan untuk menyimpan
          </div>
        )}
        {file.status === 'saved' && (
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>Tersimpan · klik untuk preview</div>
        )}
      </div>

      {/* Right actions */}
      {file.status === 'saved' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {file.storageUrl && (
            <a
              href={file.storageUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              title="Download"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, color: 'var(--text2)' }}
              onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg3)' }}
              onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text2)'; (e.currentTarget as HTMLElement).style.background = 'none' }}
            >
              <DownloadIcon />
            </a>
          )}
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            title="Hapus"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer' }}
            onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = '#ff6b6b'; (e.currentTarget as HTMLElement).style.background = '#ff6b6b18' }}
            onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text2)'; (e.currentTarget as HTMLElement).style.background = 'none' }}
          >
            <TrashIcon />
          </button>
        </div>
      ) : (
        <button
          onClick={e => { e.stopPropagation(); onRemove() }}
          title="Hapus dari daftar"
          style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', padding: 4, borderRadius: 5, fontSize: 15, lineHeight: 1, flexShrink: 0 }}
          onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = '#ff6b6b'; (e.currentTarget as HTMLElement).style.background = '#ff6b6b18' }}
          onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text2)'; (e.currentTarget as HTMLElement).style.background = 'none' }}
        >
          ✕
        </button>
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
