'use client'

import { useState, useEffect } from 'react'
import { AITool, HistoryItem, getHistoryByTool, deleteHistoryItem, clearHistoryByTool, formatHistoryDate } from '@/lib/aiHistory'
import { useT } from '@/lib/i18n/LanguageProvider'

const TOOL_CONFIG: Record<AITool, { label: string; icon: string; color: string }> = {
  chat:  { label: 'Chat AI',        icon: '💬', color: '#6c63ff' },
  image: { label: 'Generator Gambar', icon: '🖼️', color: '#43d9a2' },
  video: { label: 'Script Video',   icon: '🎬', color: '#f59e0b' },
}

interface Props {
  tool: AITool
  onRestore: (item: HistoryItem) => void
  onClose: () => void
}

export default function AIHistoryPanel({ tool, onRestore, onClose }: Props) {
  const t = useT()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [confirmClear, setConfirmClear] = useState(false)
  const config = TOOL_CONFIG[tool]

  useEffect(() => {
    setItems(getHistoryByTool(tool))
  }, [tool])

  function handleDelete(id: string) {
    deleteHistoryItem(id)
    setItems(prev => prev.filter(h => h.id !== id))
  }

  function handleClear() {
    clearHistoryByTool(tool)
    setItems([])
    setConfirmClear(false)
  }

  function handleRestore(item: HistoryItem) {
    onRestore(item)
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />

      {/* Panel */}
      <div style={{
        position: 'relative', width: 360, maxWidth: '88vw', height: '100%',
        background: 'var(--bg2)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideIn 0.2s ease',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>{config.icon}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>History</span>
              <span style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--bg3)', padding: '2px 7px', borderRadius: 10 }}>{items.length}</span>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>{config.label} — {t('disimpan di browser kamu')}</div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text2)', fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>{config.icon}</div>
              {t('Belum ada history tersimpan')}
            </div>
          ) : (
            items.map(item => <HistoryCard key={item.id} item={item} tool={tool} onRestore={handleRestore} onDelete={handleDelete} />)
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            {confirmClear ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text2)', flex: 1 }}>{t('Hapus semua history?')}</span>
                <button onClick={() => setConfirmClear(false)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontSize: 11, cursor: 'pointer' }}>{t('Batal')}</button>
                <button onClick={handleClear} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: 'rgba(255,80,80,0.15)', color: '#ff6b6b', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{t('Hapus Semua')}</button>
              </div>
            ) : (
              <button onClick={() => setConfirmClear(true)} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontSize: 12, cursor: 'pointer' }}>
                {t('Hapus semua history')}
              </button>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
    </div>
  )
}

function HistoryCard({ item, tool, onRestore, onDelete }: { item: HistoryItem; tool: AITool; onRestore: (i: HistoryItem) => void; onDelete: (id: string) => void }) {
  const config = TOOL_CONFIG[tool]
  const [hover, setHover] = useState(false)

  const preview = getPreview(item)

  return (
    <div
      style={{
        background: hover ? 'var(--bg3)' : 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'background 0.12s',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onRestore(item)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, flex: 1 }}>
          {item.title}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(item.id) }}
          style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 14, cursor: 'pointer', padding: '0 2px', flexShrink: 0, opacity: hover ? 1 : 0, transition: 'opacity 0.12s', lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      {preview && (
        <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
          {preview}
        </div>
      )}
      <div style={{ fontSize: 10, color: config.color, opacity: 0.8 }}>
        {formatHistoryDate(item.createdAt)}
      </div>
    </div>
  )
}

function getPreview(item: HistoryItem): string {
  const data = item.data as unknown as Record<string, unknown>
  if (item.tool === 'chat') {
    const msgs = (data.messages as { role: string; content: string }[]) ?? []
    const last = msgs.filter(m => m.role === 'assistant').pop()
    return last?.content?.slice(0, 100) ?? ''
  }
  if (item.tool === 'image') {
    return (data.deskripsi as string) ?? ''
  }
  if (item.tool === 'video') {
    const result = data.result as Record<string, unknown> | undefined
    return result ? `${result.duration} · ${result.format}` : ''
  }
  return ''
}
