'use client'

import { ReactNode } from 'react'

export function ListEmpty({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: 48,
        textAlign: 'center',
        border: '1px dashed var(--border)',
        borderRadius: 12,
        color: 'var(--text2)',
        fontSize: 13,
      }}
    >
      {message}
    </div>
  )
}

export function ListError({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        background: 'rgba(255,107,107,0.1)',
        border: '1px solid rgba(255,107,107,0.3)',
        color: '#ff6b6b',
        fontSize: 12,
        marginBottom: 16,
      }}
    >
      {message}
    </div>
  )
}

export function ActionButton({
  onClick,
  children,
  variant = 'default',
  disabled,
}: {
  onClick: () => void
  children: ReactNode
  variant?: 'default' | 'primary' | 'danger'
  disabled?: boolean
}) {
  const styles: Record<string, React.CSSProperties> = {
    default: {
      background: 'var(--bg3)',
      border: '1px solid var(--border)',
      color: 'var(--text)',
    },
    primary: {
      background: 'var(--accent)',
      border: 'none',
      color: '#fff',
      fontWeight: 500,
    },
    danger: {
      background: 'var(--bg3)',
      border: '1px solid var(--border)',
      color: '#ff6b6b',
    },
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 32,
        padding: '0 14px',
        borderRadius: 8,
        fontSize: 13,
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        ...styles[variant],
      }}
    >
      {children}
    </button>
  )
}

export function ModalShell({
  title,
  onClose,
  children,
  footer,
  headerExtra,
  maxWidth = 560,
  minHeight = 'min(70vh, calc(100vh - 48px))',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
  /** Optional control rendered to the left of the close button (e.g. a status toggle). */
  headerExtra?: ReactNode
  /** Override the default 560px modal width — useful for two-column layouts. */
  maxWidth?: number
  /** Override the default min-height. Pass 'auto' for short forms that would
   *  otherwise leave a large empty gap on tall viewports. */
  minHeight?: string
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 100,
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
          maxWidth,
          // Tall and roomy: the modal grows to fit content up to
          // 92vh, and never goes shorter than 70vh — so on tall
          // viewports body always has substantial vertical room.
          // Without minHeight the modal could collapse to header +
          // footer only when the body's flex-basis is 0.
          height: 'auto',
          minHeight,
          maxHeight: '92vh',
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          display: 'flex',
          flexDirection: 'column',
          // overflow hidden on the outer shell so only the middle
          // body scrolls — header + footer stay pinned regardless of
          // how long the body content is. Cancel + Save in the
          // footer are always reachable without scrolling.
          overflow: 'hidden',
          boxShadow:
            '0 32px 80px -24px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02)',
        }}
      >
        {/* Header — pinned at the top of the modal */}
        <div
          style={{
            padding: '18px 26px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: 'var(--text)',
              margin: 0,
              letterSpacing: '-0.005em',
            }}
          >
            {title}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {headerExtra}
            <button
              onClick={onClose}
              aria-label="Tutup"
              style={{
                width: 30,
                height: 30,
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 7,
                color: 'var(--text2)',
                fontSize: 15,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Body — scrollable middle. `flex: 1 1 auto` (not `1 1 0`)
            so the body's content height contributes to the parent's
            height calculation; otherwise the parent would collapse
            to header + footer only and never give the body room to
            grow. `minHeight: 0` is still needed so the body can
            shrink below its content size and scroll. */}
        <div
          style={{
            padding: '22px 26px 26px',
            overflowY: 'auto',
            flex: '1 1 auto',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          {children}
        </div>

        {/* Footer — pinned at the bottom. */}
        <div
          style={{
            padding: '14px 26px 18px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            flexShrink: 0,
          }}
        >
          {footer}
        </div>
      </div>
    </div>
  )
}

export function RowCard({
  children,
  dimmed,
}: {
  children: ReactNode
  dimmed?: boolean
}) {
  return (
    <div
      style={{
        padding: 16,
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      {children}
    </div>
  )
}

export function IconBtn({
  onClick,
  title,
  color = 'var(--text2)',
  children,
}: {
  /** Receives the synthetic mouse event so callers nested inside a
      clickable parent (expand-on-row-click etc.) can stopPropagation
      without dropping the click handler entirely. */
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  title: string
  color?: string
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 32,
        height: 32,
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        color,
        fontSize: 14,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}
