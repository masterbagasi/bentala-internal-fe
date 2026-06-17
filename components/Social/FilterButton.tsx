'use client'

import { useState, type ReactNode } from 'react'

/** Top-right Filter button + anchored popup shell — matches the Analytics filter.
 *  `count` highlights the button when any filter is active. */
export function SocialFilterButton({ count = 0, width = 300, children }: {
  count?: number
  width?: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 8,
          border: '1px solid', borderColor: count ? 'var(--accent)' : 'var(--border)',
          background: count ? 'rgba(108,99,255,0.12)' : 'var(--bg3)',
          color: count ? 'var(--accent)' : 'var(--text2)',
          cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        Filter
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 70, width, maxWidth: `min(${width}px, 92vw)`,
            background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
            padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}>
            {children}
          </div>
        </>
      )}
    </div>
  )
}

export function SocialFilterLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', fontWeight: 700, marginBottom: 8 }}>
      {children}
    </div>
  )
}
