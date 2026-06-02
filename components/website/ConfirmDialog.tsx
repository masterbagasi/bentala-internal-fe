'use client'

import { ReactNode } from 'react'

export type ConfirmTone = 'danger' | 'warning' | 'info'

export interface ConfirmRequest {
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
  onConfirm: () => void | Promise<void>
}

interface Props {
  request: ConfirmRequest
  onCancel: () => void
  /** Set true while the confirm action is running, to disable buttons. */
  busy?: boolean
}

const TONE_COLOR: Record<ConfirmTone, string> = {
  danger: '#ff6b6b',
  warning: '#ffc542',
  info: '#6c63ff',
}

/**
 * Centered confirmation dialog. Renders above whatever modal is below it
 * (z-index 200) so an existing gallery / preview modal stays open behind.
 */
export function ConfirmDialog({ request, onCancel, busy = false }: Props) {
  const tone = request.tone ?? 'danger'
  const accent = TONE_COLOR[tone]

  return (
    <div
      onClick={() => !busy && onCancel()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 400,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            background: `${accent}26`,
            color: accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
          }}
        >
          {tone === 'danger' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
          {request.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 16 }}>
          {request.message}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', width: '100%' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              height: 34,
              padding: '0 14px',
              background: 'var(--bg3)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {request.cancelLabel ?? 'Batal'}
          </button>
          <button
            type="button"
            onClick={() => void request.onConfirm()}
            disabled={busy}
            style={{
              height: 34,
              padding: '0 16px',
              background: accent,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Memproses…' : request.confirmLabel ?? 'Lanjut'}
          </button>
        </div>
      </div>
    </div>
  )
}
