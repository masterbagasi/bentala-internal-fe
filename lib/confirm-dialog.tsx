'use client'

import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'

// Imperative, dark-themed replacement for window.confirm(). Usage:
//   if (!(await confirmDialog('Hapus item ini?'))) return
// Renders a styled dialog into a throwaway portal and resolves true/false.

interface ConfirmOpts {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export function confirmDialog(message: string, opts: ConfirmOpts = {}): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false)
  return new Promise((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const finish = (v: boolean) => {
      root.unmount()
      host.remove()
      resolve(v)
    }
    root.render(<ConfirmOverlay message={message} opts={opts} onDone={finish} />)
  })
}

function btn(kind: 'primary' | 'secondary' | 'danger'): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', border: '1px solid transparent', transition: 'filter .12s',
  }
  if (kind === 'secondary') return { ...base, background: 'var(--bg3)', color: 'var(--text2)', borderColor: 'var(--border)' }
  if (kind === 'danger') return { ...base, background: 'var(--accent2)', color: '#fff' }
  return { ...base, background: 'var(--accent)', color: '#fff' }
}

function ConfirmOverlay({ message, opts, onDone }: { message: string; opts: ConfirmOpts; onDone: (v: boolean) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone(false)
      else if (e.key === 'Enter') onDone(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onDone])

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onDone(false) }}
      style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        className="animate-slide-up"
        style={{ width: '100%', maxWidth: 420, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', overflow: 'hidden' }}
      >
        <div style={{ padding: '20px 22px 16px' }}>
          {opts.title && <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{opts.title}</div>}
          <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{message}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 18px 18px' }}>
          <button type="button" onClick={() => onDone(false)} style={btn('secondary')}>{opts.cancelLabel || 'Cancel'}</button>
          <button type="button" autoFocus onClick={() => onDone(true)} style={btn(opts.danger ? 'danger' : 'primary')}>{opts.confirmLabel || 'OK'}</button>
        </div>
      </div>
    </div>
  )
}
