'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

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
}

export function Modal({
  open, onClose, title, children, footer, headerRight,
  wide = false, maxWidth, className,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // ESC key to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 flex items-center justify-center z-[1000]"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div
        className={cn('animate-slide-up', className)}
        style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          width: maxWidth || (wide ? 640 : 480),
          maxWidth: '95vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
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
