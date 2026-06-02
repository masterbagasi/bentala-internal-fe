'use client'

import { ReactNode } from 'react'

const BTN_HEIGHT = 32

const baseBtnStyle: React.CSSProperties = {
  height: BTN_HEIGHT,
  padding: '0 14px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  border: 'none',
  whiteSpace: 'nowrap',
}

export function PrimaryActionButton({
  onClick,
  children,
  disabled,
  title,
}: {
  onClick: () => void
  children: ReactNode
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        ...baseBtnStyle,
        background: disabled ? 'var(--bg3)' : 'var(--accent)',
        color: disabled ? 'var(--text2)' : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  )
}

export function SecondaryActionButton({
  onClick,
  children,
  disabled,
  title,
}: {
  onClick: () => void
  children: ReactNode
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        ...baseBtnStyle,
        background: 'var(--bg3)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  )
}

interface SaveActionsProps {
  isDirty: boolean
  saving: boolean
  savedAt: Date | null
  onSave: () => void
  onDiscard?: () => void
  saveLabel?: string
}

/**
 * Standard save action group used by singleton editors (Hero, About).
 * Shows: unsaved badge + Discard + Save, OR a "Tersimpan {time}" indicator.
 */
export function SaveActions({
  isDirty,
  saving,
  savedAt,
  onSave,
  onDiscard,
  saveLabel = 'Simpan',
}: SaveActionsProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {isDirty ? (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#ffc542',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            background: 'rgba(255,197,66,0.12)',
            border: '1px solid rgba(255,197,66,0.3)',
            borderRadius: 12,
          }}
        >
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: '#ffc542' }} />
          Belum disimpan
        </span>
      ) : savedAt ? (
        <span style={{ fontSize: 11, color: 'var(--accent3)' }}>
          Tersimpan {savedAt.toLocaleTimeString('id-ID')}
        </span>
      ) : null}

      {isDirty && onDiscard && (
        <SecondaryActionButton onClick={onDiscard} disabled={saving}>
          Batalkan
        </SecondaryActionButton>
      )}

      <PrimaryActionButton onClick={onSave} disabled={saving || !isDirty}>
        {saving ? 'Menyimpan…' : saveLabel}
      </PrimaryActionButton>
    </div>
  )
}
