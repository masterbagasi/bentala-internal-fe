'use client'

import { ReactNode } from 'react'

interface FieldProps {
  label: string
  required?: boolean
  hint?: string
  error?: string
  children: ReactNode
}

export function FormField({ label, required, hint, error, children }: FieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label
        style={{
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {label}
        {required && <span style={{ color: 'var(--accent2)' }}>*</span>}
      </label>
      {children}
      {hint && !error && (
        <span
          style={{
            fontSize: 12.5,
            lineHeight: 1.55,
            color: 'var(--text2)',
          }}
        >
          {hint}
        </span>
      )}
      {error && <span style={{ fontSize: 12, color: '#ff6b6b' }}>{error}</span>}
    </div>
  )
}

export const inputStyle: React.CSSProperties = {
  height: 42,
  padding: '0 14px',
  borderRadius: 8,
  background: 'var(--bg3)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 14,
  outline: 'none',
  width: '100%',
  fontFamily: 'inherit',
}

export const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  height: 'auto',
  padding: 14,
  minHeight: 96,
  lineHeight: 1.55,
  resize: 'vertical',
}
