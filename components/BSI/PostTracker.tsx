'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useStore } from '@/hooks/useStore'
import { getSupabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { StatusBadge, PlatformBadge, TeamAvatar } from '@/components/shared/StatusBadge'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import { PostModal } from '@/components/BPI/PostModal'
import { PostPreviewModal } from '@/components/BPI/PostPreviewModal'
import { useLogActivity } from '@/hooks/useData'

interface PostTrackerProps {
  entity: 'bpi' | 'bsi'
}

export function PostTracker({ entity }: PostTrackerProps) {
  const t = useT()
  const { posts } = useStore()
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const logActivity = useLogActivity()

  const filtered = posts.filter(p => {
    if (p.entity !== entity) return false
    if (filter === 'all') return true
    return (p.platforms || []).includes(filter as 'ig' | 'tiktok')
  })

  async function handleDelete(id: string) {
    if (!confirm(t('Hapus post ini?'))) return
    const supabase = getSupabase()
    await supabase.from('posts').delete().eq('id', id)
    logActivity('Post dihapus')
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { key: 'all', label: t('Semua') },
            { key: 'ig', label: 'Instagram' },
            { key: 'tiktok', label: 'TikTok' },
          ].map(f => (
            <button key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: f.key === 'all' ? '5px 14px' : '5px 14px 5px 6px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                background: filter === f.key ? 'var(--accent)' : 'var(--bg2)',
                color: filter === f.key ? '#fff' : 'var(--text2)',
                borderColor: filter === f.key ? 'var(--accent)' : 'var(--border)',
              }}
            >
              {f.key !== 'all' && <PlatformIcon platform={f.key} size={16} />}
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setEditId(null); setShowModal(true) }}
          style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
        >
          + {t('Tambah Post')}
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>{t('Judul')}</th>
              <th>Platform</th>
              <th>{t('Tanggal')}</th>
              <th>Status</th>
              <th>PIC</th>
              <th style={{ width: 80 }}>{t('Aksi')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6}>
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text2)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                  {t('Belum ada post. Klik "+ Tambah Post" untuk mulai.')}
                </div>
              </td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} onClick={() => setPreviewId(p.id)} style={{ cursor: 'pointer' }}>
                <td><span style={{ fontWeight: 500 }}>{p.title}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
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
                <td onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => { setEditId(p.id); setShowModal(true) }}
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--text)', marginRight: 4 }}
                  >{t('Edit')}</button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    style={{ background: 'var(--accent2)', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: '#fff' }}
                  >✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <PostModal
          open={showModal}
          onClose={() => { setShowModal(false); setEditId(null) }}
          editId={editId}
          entity={entity}
        />
      )}
      {previewId && (
        <PostPreviewModal
          open={!!previewId}
          postId={previewId}
          onClose={() => setPreviewId(null)}
          onEdit={id => { setPreviewId(null); setEditId(id); setShowModal(true) }}
        />
      )}
    </div>
  )
}
