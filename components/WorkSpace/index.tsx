'use client'

import { useState, forwardRef, useImperativeHandle } from 'react'
import { useStore } from '@/hooks/useStore'
import { getSupabase } from '@/lib/supabase'
import { WS_STATUS_COLS, TEAM } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import { StatusBadge, TeamAvatar } from '@/components/shared/StatusBadge'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import { WSEditModal } from './WSEditModal'
import { PostPreviewModal } from '@/components/BPI/PostPreviewModal'
import { ContentCalendar } from '@/components/BSI/Calendar'
import { useLogActivity } from '@/hooks/useData'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import type { Post } from '@/lib/types'

interface WorkspacePageProps {
  member: string    // 'Video Production' | 'Design Studio'
  memberKey: string // 'fz' | 'rn'
}

export interface WorkspacePageHandle {
  openAdd: () => void
}

type WsTab = 'list' | 'board' | 'calendar' | 'summary'

export const WorkspacePage = forwardRef<WorkspacePageHandle, WorkspacePageProps>(
  function WorkspacePage({ member, memberKey }, ref) {
  const { posts } = useStore()
  const [tab, setTab] = useState<WsTab>('list')
  const [platformFilter, setPlatformFilter] = useState<string>('all')
  const [editPostId, setEditPostId] = useState<string | null>(null)
  const [previewPostId, setPreviewPostId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const logActivity = useLogActivity()
  const calEntity = `ws-${memberKey}` as 'ws-fz' | 'ws-rn'

  useImperativeHandle(ref, () => ({ openAdd: () => setShowAdd(true) }))

  const memberInfo = TEAM.find(t => t.name === member)
  const color = memberInfo?.color || '#6c63ff'

  // Filter posts assigned to this member (BPI, BSI, and self-created workspace
  // tasks). Posts still at 'todo' (BPI "Idea") are NOT yet handed to production,
  // so they must not appear in the worksheet.
  const myPosts = posts.filter(p =>
    (p.entity === 'bpi' || p.entity === 'bsi' || p.entity === 'ws') &&
    p.status !== 'todo' &&
    (p.pics || []).includes(member)
  )

  const filtered = platformFilter === 'all'
    ? myPosts
    : myPosts.filter(p => (p.platforms || []).includes(platformFilter as 'ig' | 'tiktok'))

  // Summary stats
  const stats = WS_STATUS_COLS.reduce((acc, col) => {
    acc[col.key] = myPosts.filter(p => p.status === col.key).length
    return acc
  }, {} as Record<string, number>)

  return (
    <div>
      {/* Sticky Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 45, background: 'var(--bg)', margin: 0 }}>
        {/* Tab Bar */}
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '0 24px' }}>
          {(['list','board','calendar','summary'] as WsTab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                color: tab === t ? 'var(--accent)' : 'var(--text2)',
                background: 'none', border: 'none',
                borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
                marginBottom: -1, transition: 'all 0.15s',
                textTransform: 'capitalize',
              }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Filter Bar */}
        {(tab === 'list' || tab === 'board') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 24px', borderBottom: '2px solid var(--border)' }}>
            {[
              { key: 'all', label: 'Semua' },
              { key: 'ig', label: 'Instagram' },
              { key: 'tiktok', label: 'TikTok' },
            ].map(f => (
              <button key={f.key}
                onClick={() => setPlatformFilter(f.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: f.key === 'all' ? '5px 12px' : '5px 12px 5px 5px', borderRadius: 20,
                  border: '1px solid var(--border)',
                  background: platformFilter === f.key ? 'var(--accent)' : 'transparent',
                  borderColor: platformFilter === f.key ? 'var(--accent)' : 'var(--border)',
                  color: platformFilter === f.key ? '#fff' : 'var(--text2)',
                  cursor: 'pointer', fontSize: 12, fontWeight: 500,
                }}
              >
                {f.key !== 'all' && <PlatformIcon platform={f.key} size={16} />}
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: tab === 'board' ? '0 24px 24px' : 24 }}>
        {tab === 'list' && (
          <WSListView
            posts={filtered}
            member={member}
            onRowClick={id => setEditPostId(id)}
          />
        )}
        {tab === 'board' && (
          <WSKanbanBoard
            posts={filtered}
            member={member}
            onCardClick={id => setEditPostId(id)}
          />
        )}
        {tab === 'calendar' && (
          <ContentCalendar entity={calEntity} onPostClick={id => setEditPostId(id)} />
        )}
        {tab === 'summary' && (
          <WSSummary stats={stats} posts={myPosts} member={member} color={color} />
        )}
      </div>

      {/* Edit Modal */}
      {editPostId && (
        <WSEditModal
          open={!!editPostId}
          postId={editPostId}
          member={member}
          onClose={() => setEditPostId(null)}
        />
      )}

      {/* Add Task Modal */}
      <WSAddModal
        open={showAdd}
        member={member}
        onClose={() => setShowAdd(false)}
      />
    </div>
  )
})

// ── List View ──
function WSListView({ posts, member, onRowClick }: {
  posts: Post[]
  member: string
  onRowClick: (id: string) => void
}) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <table>
        <thead>
          <tr>
            <th>Judul</th>
            <th>Jenis</th>
            <th>Entity</th>
            <th>Platform</th>
            <th>Tanggal</th>
            <th>Status</th>
            <th>Catatan</th>
          </tr>
        </thead>
        <tbody>
          {posts.length === 0 ? (
            <tr><td colSpan={7}>
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text2)' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                Tidak ada post yang ditugaskan ke kamu.
              </div>
            </td></tr>
          ) : posts.map(p => {
            const hasVideo = (p.content_types || []).includes('video')
            const hasDesign = (p.content_types || []).includes('design')
            const entityColor = p.entity === 'bpi' ? { bg: '#6c63ff22', text: '#6c63ff' }
              : p.entity === 'bsi' ? { bg: '#43d9a222', text: '#43d9a2' }
              : { bg: '#ffc54222', text: '#ffc542' }
            return (
              <tr key={p.id} onClick={() => onRowClick(p.id)} style={{ cursor: 'pointer' }}>
                <td><span style={{ fontWeight: 600 }}>{p.title}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {hasVideo && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 10, fontWeight: 600, color: '#6c63ff',
                        background: '#6c63ff18', padding: '2px 8px 2px 6px', borderRadius: 20,
                      }}>
                        <VideoIcon16 /> Video
                      </span>
                    )}
                    {hasDesign && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 10, fontWeight: 600, color: '#43d9a2',
                        background: '#43d9a218', padding: '2px 8px 2px 6px', borderRadius: 20,
                      }}>
                        <DesignIcon16 /> Design
                      </span>
                    )}
                    {!hasVideo && !hasDesign && <span style={{ color: 'var(--text2)', fontSize: 12 }}>—</span>}
                  </div>
                </td>
                <td>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                    background: entityColor.bg, color: entityColor.text,
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>
                    {p.entity}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {(p.platforms || []).map(pl => (
                      <PlatformIcon key={pl} platform={pl} size={18} />
                    ))}
                    {(p.platforms || []).length === 0 && <span style={{ color: 'var(--text2)', fontSize: 12 }}>—</span>}
                  </div>
                </td>
                <td>
                  {p.date ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)' }}>
                      <CalIcon12 /> {formatDate(p.date)}
                    </span>
                  ) : <span style={{ color: 'var(--text2)', fontSize: 12 }}>—</span>}
                </td>
                <td><StatusBadge status={p.status} type="post" label={WS_STATUS_COLS.find(c => c.key === p.status)?.label} /></td>
                <td style={{ color: 'var(--text2)', fontSize: 12, maxWidth: 160 }}>
                  {p.notes ? p.notes.slice(0, 50) + (p.notes.length > 50 ? '...' : '') : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── WS Kanban Board ──
function WSKanbanBoard({ posts, member, onCardClick }: {
  posts: Post[]
  member: string
  onCardClick: (id: string) => void
}) {
  const [dragPostId, setDragPostId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const logActivity = useLogActivity()
  const { upsertPost } = useStore()

  async function handleDrop(newStatus: string) {
    const id = dragPostId
    setDragPostId(null)
    setDragOverCol(null)
    if (!id) return

    // WS rule: cannot drag TO revisi
    if (newStatus === 'revisi') return

    const target = posts.find(p => p.id === id)
    if (!target || target.status === newStatus) return

    // Optimistically move the card so it updates instantly (don't wait for the
    // realtime echo), then persist. Revert if the write fails.
    upsertPost({ ...target, status: newStatus } as Post)
    const supabase = getSupabase()
    const { error } = await supabase.from('posts').update({ status: newStatus }).eq('id', id)
    if (error) {
      upsertPost(target)
      return
    }
    logActivity(`${member} memindahkan post ke ${newStatus}`)
  }

  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start', marginTop: 20 }}>
      {WS_STATUS_COLS.map(col => {
        const colPosts = posts.filter(p => p.status === col.key)
        const isLocked = col.key === 'revisi' // can't drag TO revisi
        const isOver = dragOverCol === col.key
        const dragging = dragPostId !== null
        const active = isOver && !isLocked          // valid drop target hovered
        const blocked = isOver && isLocked          // hovering a locked column

        return (
          <div
            key={col.key}
            className="kanban-col"
            style={{
              minWidth: 265, maxWidth: 265,
              background: active ? `${col.color}14` : blocked ? '#ff6b6b12' : 'var(--bg2)',
              border: `${active || blocked ? 2 : 1}px solid ${active ? col.color : blocked ? '#ff6b6b' : 'var(--border)'}`,
              borderRadius: 12,
              padding: '14px 12px 10px', flexShrink: 0,
              display: 'flex', flexDirection: 'column',
              maxHeight: 'calc(100vh - 200px)',
              transform: active ? 'scale(1.03)' : 'scale(1)',
              boxShadow: active ? `0 8px 24px ${col.color}44` : 'none',
              transition: 'transform 0.12s ease, border-color 0.12s, background 0.12s, box-shadow 0.12s',
            }}
            onDragOver={e => {
              e.preventDefault()
              e.dataTransfer.dropEffect = isLocked ? 'none' : 'move'
              if (dragOverCol !== col.key) setDragOverCol(col.key)
            }}
            onDragLeave={e => {
              // Only clear when the pointer truly leaves the column (not when
              // moving over a child element).
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverCol(c => (c === col.key ? null : c))
              }
            }}
            onDrop={() => { setDragOverCol(null); if (!isLocked) handleDrop(col.key) }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexShrink: 0 }}>
              <span style={{ fontWeight: 600, color: col.color, fontSize: 14 }}>{col.label}</span>
              <span style={{ fontSize: 12, color: col.color, background: col.color + '22', borderRadius: 20, padding: '1px 7px', fontWeight: 500 }}>
                {colPosts.length}
              </span>
              {col.key === 'revisi' && <span title="Hanya BPI yang bisa memindahkan ke Revisi" style={{ fontSize: 13, opacity: 0.5 }}>🔒</span>}
            </div>

            {/* Drop hint — appears while dragging over this column */}
            {dragging && (active || blocked) && (
              <div style={{
                border: `2px dashed ${active ? col.color : '#ff6b6b'}`,
                borderRadius: 10, padding: '14px 8px', marginBottom: 10,
                textAlign: 'center', fontSize: 12, fontWeight: 600,
                color: active ? col.color : '#ff6b6b',
                background: active ? `${col.color}10` : '#ff6b6b10',
              }}>
                {active ? `Lepas di ${col.label}` : '🔒 Tidak bisa ke Revisi'}
              </div>
            )}

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {colPosts.map(p => (
                <WSCard
                  key={p.id}
                  post={p}
                  onDragStart={e => {
                    // setData is required for the drag to actually start in
                    // Safari/Firefox.
                    e.dataTransfer.setData('text/plain', p.id)
                    e.dataTransfer.effectAllowed = 'move'
                    setDragPostId(p.id)
                  }}
                  onDragEnd={() => { setDragPostId(null); setDragOverCol(null) }}
                  onClick={() => onCardClick(p.id)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Content type icons ──
function VideoIcon16() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
    </svg>
  )
}
function DesignIcon16() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>
    </svg>
  )
}
function CalIcon12() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}

function WSCard({ post, onDragStart, onDragEnd, onClick }: {
  post: Post
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onClick: () => void
}) {
  const hasVideo = (post.content_types || []).includes('video')
  const hasDesign = (post.content_types || []).includes('design')
  const accentColor = (hasVideo && hasDesign) ? '#ffc542' : hasVideo ? '#6c63ff' : hasDesign ? '#43d9a2' : 'var(--border)'

  const entityColor = post.entity === 'bpi' ? { bg: '#6c63ff22', text: '#6c63ff' }
    : post.entity === 'bsi' ? { bg: '#43d9a222', text: '#43d9a2' }
    : { bg: '#ffc54222', text: '#ffc542' }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="kanban-card"
      style={{
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 8,
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseOver={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(108,99,255,0.45)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 3px 10px rgba(0,0,0,0.28)'
      }}
      onMouseOut={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
        ;(e.currentTarget as HTMLElement).style.borderLeftColor = accentColor
        ;(e.currentTarget as HTMLElement).style.boxShadow = ''
      }}
    >
      {/* Top row: content type badges + entity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
          {hasVideo && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 600, color: '#6c63ff',
              background: '#6c63ff18', padding: '2px 8px 2px 6px', borderRadius: 20,
            }}>
              <VideoIcon16 /> Video
            </span>
          )}
          {hasDesign && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 600, color: '#43d9a2',
              background: '#43d9a218', padding: '2px 8px 2px 6px', borderRadius: 20,
            }}>
              <DesignIcon16 /> Design
            </span>
          )}
          {!hasVideo && !hasDesign && (
            <span style={{ fontSize: 10, color: 'var(--text2)' }}>—</span>
          )}
        </div>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
          background: entityColor.bg, color: entityColor.text,
          textTransform: 'uppercase', letterSpacing: '0.4px', flexShrink: 0,
        }}>
          {post.entity}
        </span>
      </div>

      {/* Title */}
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45, color: 'var(--text)', marginBottom: 10 }}>
        {post.title}
      </div>

      {/* Footer: date + platforms */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {post.date ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, color: 'var(--text2)', flex: 1,
          }}>
            <CalIcon12 /> {formatDate(post.date)}
          </span>
        ) : (
          <span style={{ flex: 1 }} />
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {(post.platforms || []).map(pl => (
            <PlatformIcon key={pl} platform={pl} size={16} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Summary Tab ──
function WSSummary({ stats, posts, member, color }: {
  stats: Record<string, number>
  posts: Post[]
  member: string
  color: string
}) {
  const total = posts.length
  const done = (stats.done || 0) + (stats.published || 0) + (stats.ready || 0)

  return (
    <div>
      {/* Status grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 12, marginBottom: 24 }}>
        {WS_STATUS_COLS.map(col => (
          <div key={col.key}
            style={{ background: 'var(--bg2)', border: `1px solid ${col.color}44`, borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
              {col.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: col.color }}>{stats[col.key] || 0}</div>
          </div>
        ))}
      </div>

      {/* Progress */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
          <span>Progress keseluruhan</span>
          <span style={{ color: 'var(--text2)' }}>{total ? Math.round(done / total * 100) : 0}%</span>
        </div>
        <div style={{ background: 'var(--bg3)', borderRadius: 10, height: 8, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 10,
            background: `linear-gradient(90deg, ${color}, ${color}aa)`,
            width: `${total ? Math.round(done / total * 100) : 0}%`,
            transition: 'width 0.5s ease',
          }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>
          {done} dari {total} task selesai
        </div>
      </div>
    </div>
  )
}

// ── WSAddModal — Custom task creation for workspace members ──
function WSAddModal({ open, member, onClose }: {
  open: boolean
  member: string
  onClose: () => void
}) {
  const logActivity = useLogActivity()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [status, setStatus] = useState<string>('todo')
  const [contentTypes, setContentTypes] = useState<string[]>([])
  const [videoLink, setVideoLink] = useState('')
  const [designLink, setDesignLink] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  function reset() {
    setTitle(''); setDate(''); setStatus('brief')
    setContentTypes([]); setVideoLink(''); setDesignLink(''); setNotes('')
  }

  function handleClose() { reset(); onClose() }

  function toggleType(t: string) {
    setContentTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  async function handleSave() {
    if (!title.trim()) { alert('Judul pekerjaan wajib diisi!'); return }
    setLoading(true)
    const supabase = getSupabase()
    await supabase.from('posts').insert({
      entity: 'ws',
      title: title.trim(),
      date: date || null,
      status,
      pics: [member],
      platforms: [],
      content_types: contentTypes,
      video_link: videoLink,
      design_link: designLink,
      caption: '',
      hashtags: '',
      notes,
    })
    logActivity(`${member} menambahkan pekerjaan: "${title.trim()}"`)
    setLoading(false)
    handleClose()
  }

  const statusOpts = WS_STATUS_COLS.filter(c => c.key !== 'revisi')

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Tambah Pekerjaan"
      footer={
        <>
          <BtnSecondary onClick={handleClose}>Batal</BtnSecondary>
          <BtnPrimary onClick={handleSave} loading={loading}>Simpan</BtnPrimary>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Title */}
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>Judul Pekerjaan *</label>
          <input
            type="text"
            placeholder="Nama pekerjaan..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        {/* Date + Status */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>Tanggal</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}>
              {statusOpts.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Content type chips */}
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>Jenis Konten</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { key: 'video', label: '🎬 Video', color: '#6c63ff' },
              { key: 'design', label: '🎨 Design', color: '#43d9a2' },
            ].map(t => {
              const sel = contentTypes.includes(t.key)
              return (
                <button key={t.key} type="button" onClick={() => toggleType(t.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 12,
                    border: `1px solid ${sel ? t.color : 'var(--border)'}`,
                    background: sel ? t.color + '18' : 'var(--bg3)',
                    color: sel ? t.color : 'var(--text2)',
                    fontWeight: sel ? 600 : 400, transition: 'all 0.15s',
                  }}
                >
                  {sel && <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.color, flexShrink: 0 }} />}
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Links */}
        {contentTypes.includes('video') && (
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>Link Video</label>
            <input type="url" placeholder="https://drive.google.com/..." value={videoLink} onChange={e => setVideoLink(e.target.value)} />
          </div>
        )}
        {contentTypes.includes('design') && (
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>Link Design</label>
            <input type="url" placeholder="https://figma.com/..." value={designLink} onChange={e => setDesignLink(e.target.value)} />
          </div>
        )}

        {/* Notes */}
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>Catatan</label>
          <textarea
            rows={3}
            placeholder="Catatan tambahan..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>
      </div>
    </Modal>
  )
}
