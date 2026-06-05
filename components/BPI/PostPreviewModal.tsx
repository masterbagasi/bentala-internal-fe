'use client'

import { useEffect, useRef, useState } from 'react'
import { Modal, BtnSecondary } from '@/components/shared/Modal'
import { useStore } from '@/hooks/useStore'
import { getSupabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { TeamAvatar } from '@/components/shared/StatusBadge'
import { BPI_STATUS_COLS } from '@/lib/constants'
import type { Post } from '@/lib/types'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import { usePostComments, PostCommentsBody, PostCommentsComposer } from '@/components/BPI/PostComments'

interface PostPreviewModalProps {
  open: boolean
  postId: string
  onClose: () => void
  onEdit: (id: string) => void
}

export function PostPreviewModal({ open, postId, onClose, onEdit }: PostPreviewModalProps) {
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
  const [extraFiles, setExtraFiles] = useState<{ url: string; name: string }[]>([])
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
        setExtraFiles(data.map(r => ({ url: r.storage_path as string, name: (r.file_name as string) || 'file' })))
      })
    return () => { cancelled = true }
  }, [open, postId])

  // In-app file preview popup.
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null)

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
    if (error) { alert('Gagal mengubah status: ' + error.message); return }
    upsertPost({ ...post!, status: statusDraft } as Post) // reflect on the board
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
  // links/files list — deduped, so the preview mirrors the edit form.
  const attachments: { icon: string; label: string; url: string }[] = []
  const seenUrls = new Set<string>()
  const addAttach = (url: string | null | undefined, icon?: string, label?: string) => {
    if (!url || seenUrls.has(url)) return
    seenUrls.add(url)
    attachments.push({ icon: icon ?? attachIcon(url), label: label ?? attachLabel(url), url })
  }
  addAttach(post.video_link, '🎬', 'Video')
  addAttach(post.design_link, '🎨', 'Design')
  addAttach(post.video_file_url, '🎬', 'Video')
  addAttach(post.design_file_url, '🎨', 'Design')
  for (const f of post.files || []) addAttach(f)
  for (const f of extraFiles) addAttach(f.url, undefined, f.name)

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Detail Post"
      headerRight={
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
                {savingStatus ? 'Menyimpan…' : 'Simpan Status'}
              </button>
            )}
            <BtnSecondary onClick={onClose}>Tutup</BtnSecondary>
            <button
              onClick={() => { onClose(); onEdit(post.id) }}
              style={{ background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
            >
              Edit Post
            </button>
          </div>
        </div>
      }
    >
      <h2 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, color: 'var(--text)', marginTop: 4, marginBottom: 18 }}>
        {post.title}
      </h2>

      {/* Meta grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <MetaItem label="Tanggal Post" value={formatDate(post.date)} />
        <MetaItem label="Platform" value={
          (post.platforms || []).length ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {(post.platforms || []).map(pl => <PlatformIcon key={pl} platform={pl} size={20} />)}
            </div>
          ) : '—'
        } />
        <MetaItem label="Entity" value={post.entity?.toUpperCase() || '—'} />
        <MetaItem label="Dibuat oleh" value={post.created_by || '—'} />
        <MetaItem label="Jenis Konten" value={(post.content_types || []).join(', ') || '—'} />
        <MetaItem label="Ratio" value={post.ratio || '—'} />
        <MetaItem label="Tag" value={(() => {
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

      {/* Brief — always shown to mirror the edit form */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 8 }}>
          Brief
        </div>
        <pre style={{
          fontSize: 13, lineHeight: 1.7, color: post.brief ? 'var(--text)' : 'var(--text2)',
          background: 'var(--bg3)', borderRadius: 8, padding: '12px 14px',
          whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0,
        }}>
          {post.brief || 'Belum ada brief.'}
        </pre>
      </div>

      {/* Caption */}
      {post.caption && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 8 }}>
            Caption
          </div>
          <pre style={{
            fontSize: 13, lineHeight: 1.7, color: 'var(--text)',
            background: 'var(--bg3)', borderRadius: 8, padding: '12px 14px',
            whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0,
          }}>
            {post.caption}
          </pre>
        </div>
      )}

      {/* Hashtags */}
      {post.hashtags && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 8 }}>
            Hashtags
          </div>
          <div style={{
            fontSize: 13, lineHeight: 1.7, color: '#6b9bff',
            background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px',
          }}>{post.hashtags}</div>
        </div>
      )}

      {/* Notes */}
      {post.notes && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 8 }}>
            Catatan
          </div>
          <div style={{ fontSize: 13, color: 'var(--text)', background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px' }}>
            {post.notes}
          </div>
        </div>
      )}

      {/* Attachments — links + uploaded files. Positioned right above the
          comments/activity section. */}
      {attachments.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 8 }}>
            Lampiran File
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {attachments.map(a => (
              <AttachCard key={a.url} icon={a.icon} label={a.label} url={a.url} onOpen={() => openAttachment(a.url, a.label)} />
            ))}
          </div>
        </div>
      )}

      {/* Comment room + activity feed (composer lives in the fixed footer) */}
      <PostCommentsBody s={comments} />
    </Modal>

    {/* In-app file preview popup */}
    {preview && (
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
        <AttachPreviewBody url={preview.url} label={preview.label} />
      </Modal>
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
  if (!isSafeHttpUrl(url)) {
    return <div style={{ textAlign: 'center', padding: 24, fontSize: 13, color: 'var(--text2)' }}>File tidak tersedia.</div>
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
      Preview tidak tersedia.{' '}
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Buka di tab baru</a>
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
function AttachCard({ icon, label, url, onOpen }: { icon: string; label: string; url: string; onOpen: () => void }) {
  const thumbSrc = safeImageSrc(url)
  return (
    <button
      type="button"
      onClick={onOpen}
      title={label}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left',
        background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10,
        padding: 8, cursor: 'pointer', width: '100%',
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
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
        {label}
      </div>
    </button>
  )
}
