'use client'

import { Modal, BtnSecondary } from '@/components/shared/Modal'
import { useStore } from '@/hooks/useStore'
import { formatDate } from '@/lib/utils'
import { StatusBadge, TeamAvatar } from '@/components/shared/StatusBadge'
import { PlatformIcon } from '@/components/shared/PlatformIcon'

interface PostPreviewModalProps {
  open: boolean
  postId: string
  onClose: () => void
  onEdit: (id: string) => void
}

export function PostPreviewModal({ open, postId, onClose, onEdit }: PostPreviewModalProps) {
  const { posts } = useStore()
  const post = posts.find(p => p.id === postId)

  if (!post) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      footer={
        <>
          <BtnSecondary onClick={onClose}>Tutup</BtnSecondary>
          <button
            onClick={() => { onClose(); onEdit(post.id) }}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
          >
            Edit Post
          </button>
        </>
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

      {/* Brief */}
      {post.brief && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 8 }}>
            Brief
          </div>
          <pre style={{
            fontSize: 13, lineHeight: 1.7, color: 'var(--text)',
            background: 'var(--bg3)', borderRadius: 8, padding: '12px 14px',
            whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0,
          }}>
            {post.brief}
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

      {/* Attachments */}
      {(post.video_link || post.design_link) && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 8 }}>
            File Terlampir
          </div>
          {post.video_link && (
            <AttachItem icon="🎬" label="Video" url={post.video_link} />
          )}
          {post.design_link && (
            <AttachItem icon="🎨" label="Design" url={post.design_link} />
          )}
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
    </Modal>
  )
}

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}

function AttachItem({ icon, label, url }: { icon: string; label: string; url: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--bg3)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 12px', marginBottom: 8,
    }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 2 }}>{label}</div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseOut={e => (e.currentTarget.style.textDecoration = 'none')}
        >
          {url}
        </a>
      </div>
    </div>
  )
}
