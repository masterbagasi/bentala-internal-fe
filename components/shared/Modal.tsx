'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/useIsMobile'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  headerRight?: React.ReactNode
  wide?: boolean
  maxWidth?: number
  className?: string
  /** 'right' docks as a full-height overlay panel on the right edge; 'inline'
   *  renders the panel in normal flow (no backdrop), filling its container —
   *  used for split-view layouts where it sits beside the content. */
  dock?: 'center' | 'right' | 'inline'
}

export function Modal({
  open, onClose, title, children, footer, headerRight,
  wide = false, maxWidth, className, dock = 'center',
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  // ESC key to close — the inline panel lets its host own Escape so it doesn't
  // also dismiss the surrounding view in one keystroke.
  useEffect(() => {
    if (dock === 'inline') return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose, dock])

  // Prevent body scroll when open — but not for the inline panel, which lives
  // in normal flow beside the page rather than over it.
  useEffect(() => {
    if (dock === 'inline') return
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open, dock])

  if (!open) return null

  const inline = dock === 'inline'
  const docked = dock === 'right' && !isMobile

  const panel = (
    <>
        {/* Header */}
        {(title || headerRight) && (
          <div
            className="flex items-center justify-between flex-shrink-0"
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg2)',
            }}
          >
            <div className="text-base font-semibold" style={{ color: 'var(--text)' }}>
              {title}
            </div>
            <div className="flex items-center gap-2">
              {headerRight}
              <button
                onClick={onClose}
                className="flex items-center justify-center rounded-md transition-all"
                style={{
                  width: 32, height: 32,
                  background: 'none', border: 'none',
                  color: 'var(--text2)', cursor: 'pointer', fontSize: 18,
                }}
                onMouseOver={e => {
                  (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--text)'
                }}
                onMouseOut={e => {
                  (e.currentTarget as HTMLElement).style.background = 'none'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--text2)'
                }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1" style={{ padding: '20px' }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className="flex items-center justify-end gap-2 flex-shrink-0"
            style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg2)',
            }}
          >
            {footer}
          </div>
        )}
    </>
  )

  // Inline: a plain panel that fills its parent (split-view), no backdrop.
  if (inline) {
    return (
      <div
        className={cn('animate-slide-right', className)}
        style={{
          background: 'var(--bg2)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {panel}
      </div>
    )
  }

  return (
    <div
      ref={overlayRef}
      className={cn(
        'fixed inset-0 flex z-[1000]',
        docked ? 'items-stretch justify-end' : 'items-center justify-center',
      )}
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div
        className={cn(docked ? 'animate-slide-right' : 'animate-slide-up', className)}
        style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: docked ? '12px 0 0 12px' : 12,
          width: maxWidth || (wide ? 640 : 480),
          maxWidth: isMobile ? 'calc(100vw - 24px)' : '95vw',
          height: docked ? '100dvh' : undefined,
          maxHeight: docked ? '100dvh' : isMobile ? '90dvh' : '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {panel}
      </div>
    </div>
  )
}

// ── Button components for consistency ──
export function BtnPrimary({
  children, onClick, disabled, type = 'button', loading,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  loading?: boolean
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all"
      style={{
        background: disabled || loading ? 'var(--border)' : 'var(--accent)',
        color: '#fff',
        border: 'none',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
      }}
    >
      {loading && (
        <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white" style={{ animation: 'spin 0.65s linear infinite' }} />
      )}
      {children}
    </button>
  )
}

export function BtnSecondary({
  children, onClick, disabled,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-3.5 py-1.5 rounded-md text-sm font-medium transition-all"
      style={{
        background: 'var(--bg3)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseOver={e => !disabled && ((e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)')}
      onMouseOut={e => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--border)')}
    >
      {children}
    </button>
  )
}

export function BtnDanger({
  children, onClick,
}: {
  children: React.ReactNode
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3.5 py-1.5 rounded-md text-sm font-medium"
      style={{ background: 'var(--accent2)', color: '#fff', border: 'none', cursor: 'pointer' }}
    >
      {children}
    </button>
  )
}

// ── Styled replacement for the native window.confirm() ──
export function ConfirmDialog({
  open, title, message, confirmLabel = 'OK', cancelLabel = 'Batal',
  danger = false, onConfirm, onCancel,
}: {
  open: boolean
  title?: React.ReactNode
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      maxWidth={420}
      footer={
        <>
          <BtnSecondary onClick={onCancel}>{cancelLabel}</BtnSecondary>
          {danger
            ? <BtnDanger onClick={onConfirm}>{confirmLabel}</BtnDanger>
            : <BtnPrimary onClick={onConfirm}>{confirmLabel}</BtnPrimary>}
        </>
      }
    >
      <div className="text-sm" style={{ color: 'var(--text2)', lineHeight: 1.6 }}>{message}</div>
    </Modal>
  )
}
