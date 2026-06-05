'use client'

import { useEffect, useState } from 'react'
import { Modal, BtnSecondary } from '@/components/shared/Modal'
import { useStore } from '@/hooks/useStore'
import { getSupabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { StatusBadge, TeamAvatar } from '@/components/shared/StatusBadge'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import { usePostComments, PostCommentsBody, PostCommentsComposer } from '@/components/BPI/PostComments'

interface PostPreviewModalProps {
  open: boolean
  postId: string
  onClose: () => void
  onEdit: (id: string) => void
}

export function PostPreviewModal({ open, postId, onClose, onEdit }: PostPreviewModalProps) {
  const { posts } = useStore()
  const post = posts.find(p => p.id === postId)
  // Hooks must run before any early return (rules of hooks).
  const comments = usePostComments(post)

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

  if (!post) return null

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
    <Modal
      open={open}
      onClose={onClose}
      wide
      footer={
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Comment composer — pinned in the fixed footer, always at the bottom */}
          <PostCommentsComposer s={comments} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <BtnSecondary onClick={onClose}>Tutup</BtnSecondary>
            <button
              onClick={() => { onClose(); onEdit(post.id) }}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
            >
              Edit Post
            </button>
          </div>
        </div>
      }
    >
      {/* Header — status only (platforms live in the meta grid below) */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <StatusBadge status={post.status} type="post" />
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, color: 'var(--text)', marginBottom: 18 }}>
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
        <MetaItem label="Tag" value={
          (post.tagged || []).length ? (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {(post.tagged || []).map(m => <TeamAvatar key={m} name={m} size={22} />)}
            </div>
          ) : '—'
        } />
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

      {/* Attachments — links + uploaded files */}
      {attachments.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 8 }}>
            Lampiran File
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {attachments.map(a => (
              <AttachCard key={a.url} icon={a.icon} label={a.label} url={a.url} />
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {post.notes && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 8 }}>
            Catatan
          </div>
          <div style={{ fontSize: 13, color: 'var(--text)', background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px' }}>
            {post.notes}
          </div>
        </div>
      )}

      {/* Comment room + activity feed (composer lives in the fixed footer) */}
      <PostCommentsBody s={comments} />
    </Modal>
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

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}

// Compact grid card: thumbnail (image) or big icon, filename below, opens URL.
function AttachCard({ icon, label, url }: { icon: string; label: string; url: string }) {
  const img = isImageUrl(url)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10,
        padding: 8, textDecoration: 'none',
      }}
      onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
      onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
    >
      <div style={{
        width: '100%', height: 96, borderRadius: 8, background: 'var(--bg2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 32 }}>{icon}</span>
        )}
      </div>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </div>
    </a>
  )
}
