'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { C } from './theme'

// ── Platform icon (Instagram / TikTok) ───────────────────────

export function PlatformIcon({ platform, size = 16 }: { platform: 'instagram' | 'tiktok'; size?: number }) {
  if (platform === 'tiktok') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="#25F4EE" aria-label="TikTok">
        <path d="M16.6 5.82a4.28 4.28 0 01-1.06-2.82h-3.1v12.4a2.6 2.6 0 11-1.85-2.5V9.7a5.7 5.7 0 103.95 5.42V8.9a7.3 7.3 0 004.27 1.37V7.16a4.28 4.28 0 01-2.21-1.34z" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#E1306C" aria-label="Instagram">
      <path d="M12 2.2c3.2 0 3.6 0 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s0 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58 0-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 01-1.38-.9 3.7 3.7 0 01-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.2 15.58 2.2 15.2 2.2 12s0-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.2 8.8 2.2 12 2.2zm0 3.05A6.75 6.75 0 1018.75 12 6.75 6.75 0 0012 5.25zm0 11.13A4.38 4.38 0 1116.38 12 4.38 4.38 0 0112 16.38zm6.97-11.4a1.58 1.58 0 11-1.58-1.58 1.58 1.58 0 011.58 1.58z" />
    </svg>
  )
}

// ── Pill selector ────────────────────────────────────────────

export function Pill({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button type="button" onClick={onClick} title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 999,
        background: active ? C.accentSoft : 'var(--bg3)',
        border: `1px solid ${active ? C.accentBorder : 'var(--border)'}`,
        color: active ? C.accent : 'var(--text2)', fontSize: 13, fontWeight: active ? 600 : 500, cursor: 'pointer',
      }}>
      {children}
    </button>
  )
}

// ── Status dot (ok / warn / muted) ───────────────────────────

export type DotStatus = 'ok' | 'warn' | 'muted'
export function StatusDot({ status, size = 18 }: { status: DotStatus; size?: number }) {
  const map = {
    ok: { bg: C.successSoft, color: C.success, icon: '✓' },
    warn: { bg: C.warningSoft, color: C.warning, icon: '⚠' },
    muted: { bg: 'var(--bg3)', color: 'var(--text2)', icon: '—' },
  }[status]
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: map.bg, color: map.color, fontSize: size * 0.6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{map.icon}</span>
  )
}

// ── Avatar initials ──────────────────────────────────────────

const AVATAR_COLORS = ['#00D4FF', '#48BB78', '#ECC94B', '#FC8181', '#9F7AEA', '#4FD1C5']
export function AvatarInitials({ name, size = 36 }: { name: string; size?: number }) {
  const clean = name.replace(/^@/, '')
  const initials = clean.slice(0, 2).toUpperCase()
  let h = 0
  for (let i = 0; i < clean.length; i++) h = (h * 31 + clean.charCodeAt(i)) >>> 0
  const color = AVATAR_COLORS[h % AVATAR_COLORS.length]
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: `${color}22`, color, fontSize: size * 0.38, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials}</span>
  )
}

// ── Progress bar ─────────────────────────────────────────────

export function ProgressBar({ pct, color = C.accent, height = 8 }: { pct: number; color?: string; height?: number }) {
  return (
    <div style={{ width: '100%', height, background: 'var(--bg3)', borderRadius: height, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height, background: color, borderRadius: height, transition: 'width 0.3s' }} />
    </div>
  )
}

// ── Modal ────────────────────────────────────────────────────

export function Modal({ open, onClose, title, children, footer, maxWidth = 520 }: {
  open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; maxWidth?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth, maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        {title != null && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        )}
        <div style={{ padding: 20 }}>{children}</div>
        {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--border)' }}>{footer}</div>}
      </div>
    </div>
  )
}

// ── Toast ────────────────────────────────────────────────────

export function useToast() {
  const [toast, setToast] = useState<{ msg: string; tone: 'success' | 'error' } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((msg: string, tone: 'success' | 'error' = 'success') => {
    setToast({ msg, tone })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 2600)
  }, [])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const toastNode = toast ? (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 2000, background: 'var(--bg2)', border: `1px solid ${toast.tone === 'error' ? C.danger : C.accentBorder}`, color: 'var(--text)', padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500, boxShadow: '0 10px 30px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span>{toast.tone === 'error' ? '⚠️' : '✅'}</span>{toast.msg}
    </div>
  ) : null
  return { showToast, toastNode }
}
