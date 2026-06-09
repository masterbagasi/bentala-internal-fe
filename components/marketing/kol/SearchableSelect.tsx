'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
}

export function SearchableSelect({ value, onChange, options, placeholder = 'Pilih...' }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'var(--bg3)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          color: value ? 'var(--text)' : 'var(--text2)',
          padding: '10px 12px',
          fontSize: 14,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value || placeholder}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text2)', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari..."
              style={{ padding: '8px 10px', fontSize: 13 }}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {value && (
              <Option
                label="— Kosongkan —"
                muted
                onClick={() => { onChange(''); setOpen(false); setQuery('') }}
              />
            )}
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text2)' }}>Tidak ditemukan</div>
            ) : (
              filtered.map((o) => (
                <Option
                  key={o}
                  label={o}
                  active={o === value}
                  onClick={() => { onChange(o); setOpen(false); setQuery('') }}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Option({ label, active, muted, onClick }: { label: string; active?: boolean; muted?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        background: active ? 'var(--bg3)' : 'none',
        border: 'none',
        color: muted ? 'var(--text2)' : active ? 'var(--accent)' : 'var(--text)',
        padding: '9px 12px',
        fontSize: 13,
        cursor: 'pointer',
      }}
      onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)')}
      onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.background = active ? 'var(--bg3)' : 'transparent')}
    >
      {label}
    </button>
  )
}
