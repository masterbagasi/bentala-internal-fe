'use client'

import { useCallback, useState } from 'react'

interface Toast {
  id: number
  message: string
  tone: 'success' | 'error'
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600)
  }, [])

  const toastNode = (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="animate-slide-up"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 10,
            background: 'var(--bg2)',
            border: `1px solid ${t.tone === 'success' ? 'var(--accent3)' : 'var(--accent2)'}`,
            color: 'var(--text)',
            fontSize: 13,
            fontWeight: 500,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          <span style={{ color: t.tone === 'success' ? 'var(--accent3)' : 'var(--accent2)' }}>
            {t.tone === 'success' ? '✓' : '✕'}
          </span>
          {t.message}
        </div>
      ))}
    </div>
  )

  return { showToast, toastNode }
}
