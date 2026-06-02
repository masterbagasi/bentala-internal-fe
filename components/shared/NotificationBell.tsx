'use client'

import { useState, useEffect, useRef } from 'react'
import { useStore } from '@/hooks/useStore'

const STORAGE_KEY = 'bentala_notif_last_seen'

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'baru saja'
  if (mins < 60) return `${mins} menit lalu`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} jam lalu`
  return `${Math.floor(hours / 24)} hari lalu`
}

const BTN_H = 32

export function NotificationBell() {
  const activity = useStore(s => s.activity)
  const [open, setOpen] = useState(false)
  const [lastSeen, setLastSeen] = useState<number>(0)
  const ref = useRef<HTMLDivElement>(null)
  const wasOpenedRef = useRef(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setLastSeen(parseInt(saved, 10))
    } catch {}
  }, [])

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  function handleOpen() {
    setOpen(prev => !prev)
  }

  // Mark all as read when popup closes (but not on initial render)
  useEffect(() => {
    if (open) {
      wasOpenedRef.current = true
      return
    }
    if (!wasOpenedRef.current) return
    const now = Date.now()
    setLastSeen(now)
    try { localStorage.setItem(STORAGE_KEY, String(now)) } catch {}
  }, [open])

  function markAllRead() {
    const now = Date.now()
    setLastSeen(now)
    try { localStorage.setItem(STORAGE_KEY, String(now)) } catch {}
  }

  const recent = activity.slice(0, 20)
  const unread = recent.filter(
    a => new Date(a.created_at).getTime() > lastSeen
  ).length

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={handleOpen}
        style={{
          height: BTN_H,
          width: BTN_H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          background: 'transparent',
          border: '1px solid var(--border)',
          color: 'var(--text2)',
          cursor: 'pointer',
          position: 'relative',
          flexShrink: 0,
        }}
        onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        title="Notifikasi"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: '#ef4444',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
              pointerEvents: 'none',
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="animate-slide-up"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 4px)',
            width: 320,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            zIndex: 999,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              Aktivitas
            </span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  fontSize: 11,
                  color: 'var(--accent)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Tandai semua dibaca
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {recent.length === 0 ? (
              <div
                style={{
                  padding: '24px 14px',
                  textAlign: 'center',
                  color: 'var(--text2)',
                  fontSize: 13,
                }}
              >
                Belum ada aktivitas
              </div>
            ) : (
              recent.map(item => {
                const isUnread = new Date(item.created_at).getTime() > lastSeen
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid var(--border)',
                      background: isUnread ? 'rgba(108,99,255,0.06)' : 'transparent',
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg,#6c63ff,#a855f7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#fff',
                        flexShrink: 0,
                      }}
                    >
                      {item.user_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
                        {item.message}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 3 }}>
                        {relativeTime(item.created_at)}
                      </div>
                    </div>
                    {isUnread && (
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          marginTop: 5,
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
