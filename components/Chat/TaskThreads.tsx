'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'
import { POST_STATUS_LABELS, POST_STATUS_COLORS } from '@/lib/constants'
import { PostPreviewModal } from '@/components/BPI/PostPreviewModal'
import { ConfirmDialog } from '@/components/shared/Modal'
import { ChatRoom } from './ChatRoom'
import { clearTaskChat } from './useTaskThreads'
import { taskChatRoom } from '@/lib/access'
import type { Post } from '@/lib/types'

// A single task's discussion. It IS a full chat room (chat_messages) keyed by the
// task — same component and feature set as a project room (reply, react, unsend,
// edit, delete, attachments, read receipts). Lives in the conversation pane; the
// Task Details popup shows the same room. Access derives from the task's project.
export function TaskThreadPanel({ post, onBack, meEmail, meName, meSuper }: {
  post: Post
  onBack: () => void
  meEmail: string
  meName: string
  meSuper: boolean
}) {
  const t = useT()
  const [detail, setDetail] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const color = POST_STATUS_COLORS[post.status] || '#8b8fa8'
  const label = POST_STATUS_LABELS[post.status] || post.status
  const room = taskChatRoom(post.entity, post.id)

  return (
    <div className="tt-thread">
      <style>{TT_CSS}</style>
      <div className="tt-thread-head">
        <button type="button" className="tt-back" onClick={onBack} aria-label={t('Kembali')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <button type="button" className="tt-thread-title" onClick={() => setDetail(true)} title={t('Lihat detail task')}>
          {post.title || t('(Tanpa judul)')}
        </button>
        <span className="tt-status" style={{ color, background: color + '1f', border: `1px solid ${color}55` }}>{label}</span>
        <button type="button" className="tt-detail-btn" onClick={() => setDetail(true)} title={t('Detail task')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
        </button>
        <button type="button" className="tt-detail-btn tt-del-btn" onClick={() => setConfirmClear(true)} title={t('Hapus chat task ini (untuk Anda)')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
        </button>
      </div>

      <div className="tt-thread-body">
        <ChatRoom room={room} roomName={post.title || t('(Tanpa judul)')} meEmail={meEmail} meName={meName} meSuper={meSuper} />
      </div>

      {detail && (
        <PostPreviewModal open postId={post.id} canEdit={false} onClose={() => setDetail(false)} onEdit={() => {}} />
      )}

      <ConfirmDialog
        open={confirmClear}
        danger
        title={t('Hapus Chat Task')}
        confirmLabel={t('Hapus')}
        cancelLabel={t('Batal')}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => { setConfirmClear(false); if (meEmail) void clearTaskChat(meEmail, post.id); onBack() }}
        message={t('Hapus chat task ini dari daftar Anda? Hanya hilang untuk Anda dan akan muncul lagi saat ada chat baru.')}
      />
    </div>
  )
}

const TT_CSS = `
.tt-status { font-size:10.5px; font-weight:700; padding:2px 9px; border-radius:999px; white-space:nowrap; letter-spacing:0.01em; }

.tt-thread { flex:1; min-height:0; display:flex; flex-direction:column; }
.tt-thread-head { display:flex; align-items:center; gap:8px; padding:2px 0 12px; border-bottom:1px solid var(--border); flex-shrink:0; }
.tt-back, .tt-detail-btn { width:30px; height:30px; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; border-radius:8px; background:transparent; border:1px solid transparent; color:var(--text2); cursor:pointer; transition:background .12s, color .12s, border-color .12s; }
.tt-back:hover { color:var(--text); background:var(--bg3); }
.tt-thread-title { flex:1; min-width:0; text-align:left; background:none; border:none; padding:0; font-size:14.5px; font-weight:700; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer; letter-spacing:-0.01em; }
.tt-thread-title:hover { color:var(--accent); }
.tt-detail-btn:hover { color:var(--accent); background:var(--bg3); }
.tt-del-btn:hover { color:var(--accent2) !important; background:var(--bg3); }

.tt-thread-body { flex:1; min-height:0; display:flex; flex-direction:column; }
`
