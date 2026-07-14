'use client'

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Shared form primitives for the CRM v2 forms (Contacts, Deals, Projects, Invoices).
// One fixed control height + radius so every input/select/date lines up exactly.
export const CONTROL_H = 40
export const inStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: CONTROL_H, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, padding: '0 12px', color: 'var(--text)', fontSize: 13.5, outline: 'none' }
// Overrides so a SingleDatePicker trigger matches these form fields exactly.
export const CRM_DATE_TRIGGER: React.CSSProperties = { minHeight: CONTROL_H, height: CONTROL_H, borderRadius: 9, padding: '0 12px', fontSize: 13.5 }
export const taStyle: React.CSSProperties = { ...inStyle, height: 'auto', minHeight: 88, padding: '10px 12px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text3)' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>{label}</div>
      {children}
      {error && <div style={{ fontSize: 11.5, color: '#f87171', marginTop: 5 }}>{error}</div>}
    </label>
  )
}

export function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{children}</div>
}

export function Input({ value, onChange, placeholder, onEnter, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; onEnter?: () => void; type?: string
}) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inStyle}
    onKeyDown={e => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter() } }} />
}

type Opt = { v: string; l: string; sub?: string }

/** Custom themed dropdown — replaces the native <select> so the open option
 *  list matches the dark theme (native popups can't be styled). Renders the
 *  panel in a portal with fixed positioning so it never gets clipped by a
 *  scrolling modal, and flips upward when there isn't room below. */
export function Select({ value, onChange, options, disabled, searchable, placeholder }: {
  value: string; onChange: (v: string) => void; options: Opt[]; disabled?: boolean; searchable?: boolean; placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = options.find(o => o.v === value && o.v !== '')
  const shown = selected?.l ?? placeholder ?? options.find(o => o.v === value)?.l ?? ''
  const shownSub = selected?.sub
  const isPlaceholder = !selected

  const list = searchable && q.trim()
    ? options.filter(o => o.v !== '' && o.l.toLowerCase().includes(q.trim().toLowerCase()))
    : options.filter(o => o.v !== '' || !searchable)

  function measure() {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 6
    const spaceBelow = window.innerHeight - r.bottom - 12
    const spaceAbove = r.top - 12
    const up = spaceBelow < 240 && spaceAbove > spaceBelow
    setPos({
      left: r.left, width: r.width,
      top: up ? undefined : r.bottom + gap,
      bottom: up ? window.innerHeight - r.top + gap : undefined,
      maxH: Math.min(300, Math.max(160, up ? spaceAbove : spaceBelow)),
    })
  }

  function openMenu() {
    if (disabled) return
    measure()
    setQ('')
    setHi(Math.max(0, list.findIndex(o => o.v === value)))
    setOpen(true)
  }
  function close() { setOpen(false); setQ('') }
  function pick(v: string) { onChange(v); close(); triggerRef.current?.focus() }

  useLayoutEffect(() => { if (open) measure() }, [open, q])

  useEffect(() => {
    if (!open) return
    if (searchable) searchRef.current?.focus()
    else panelRef.current?.focus()
    const reposition = () => measure()
    const onDoc = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return
      if (panelRef.current?.contains(e.target as Node)) return
      close()
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    document.addEventListener('mousedown', onDoc)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      document.removeEventListener('mousedown', onDoc)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, searchable])

  // Keep the highlighted row in view.
  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>(`[data-idx="${hi}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [hi, open])

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(list.length - 1, h + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); const o = list[hi]; if (o) pick(o.v) }
    else if (e.key === 'Escape') { e.preventDefault(); close(); triggerRef.current?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); setHi(0) }
    else if (e.key === 'End') { e.preventDefault(); setHi(list.length - 1) }
  }

  if (disabled) {
    return (
      <div style={{ position: 'relative', width: '100%' }}>
        <div style={{ ...inStyle, display: 'flex', alignItems: 'center', paddingRight: 34, cursor: 'not-allowed', opacity: 0.6, color: isPlaceholder ? 'var(--text3)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shown}</div>
        <Chevron />
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={e => { if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openMenu() } }}
        style={{
          ...inStyle, paddingRight: 34, textAlign: 'left', cursor: 'pointer',
          display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
          color: isPlaceholder ? 'var(--text3)' : 'var(--text)',
          borderColor: open ? 'var(--accent)' : 'var(--border)',
          boxShadow: open ? '0 0 0 3px rgba(11,61,231,0.18)' : 'none',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shown}{shownSub && <span style={{ color: 'var(--text3)', fontWeight: 400 }}> · {shownSub}</span>}</span>
      </button>
      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'grid', placeItems: 'center', color: open ? 'var(--accent)' : 'var(--text3)', transition: 'transform 0.15s', transformOrigin: 'center' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          role="listbox"
          tabIndex={-1}
          onKeyDown={onKey}
          style={{
            position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom,
            zIndex: 1000, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
            boxShadow: 'var(--shadow-card), 0 12px 32px rgba(0,0,0,0.45)', outline: 'none',
            display: 'flex', flexDirection: 'column', maxHeight: pos.maxH, overflow: 'hidden',
            animation: 'crmpop 0.12s ease-out',
          }}
        >
          {searchable && (
            <div style={{ position: 'relative', padding: 6, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text3)', display: 'grid', placeItems: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
              </span>
              <input
                ref={searchRef}
                value={q}
                onChange={e => { setQ(e.target.value); setHi(0) }}
                onKeyDown={onKey}
                placeholder="Cari…"
                style={{ width: '100%', boxSizing: 'border-box', height: 34, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, padding: '0 10px 0 32px', color: 'var(--text)', fontSize: 13, outline: 'none', boxShadow: 'none' }}
              />
            </div>
          )}
          <div style={{ overflowY: 'auto', padding: 4 }}>
            {list.length === 0 ? (
              <div style={{ padding: '14px 10px', textAlign: 'center', fontSize: 12.5, color: 'var(--text3)' }}>Tidak ada hasil</div>
            ) : list.map((o, i) => {
              const isSel = o.v === value
              const isHi = i === hi
              return (
                <button
                  key={o.v || `__${i}`}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  data-idx={i}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(o.v)}
                  style={{
                    position: 'relative', width: '100%', textAlign: 'left', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 8px 12px', borderRadius: 7, border: 'none',
                    background: isHi ? 'var(--bg-hover)' : 'transparent',
                    color: isSel ? 'var(--link)' : 'var(--text)', fontSize: 13.5, fontWeight: isSel ? 600 : 400,
                  }}
                >
                  {isHi && <span style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, borderRadius: 3, background: 'var(--accent)' }} />}
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.l}{o.sub && <span style={{ color: 'var(--text3)', fontWeight: 400 }}> · {o.sub}</span>}</span>
                  {isSel && (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
                  )}
                </button>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

export function Err({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, color: '#f87171', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)', borderRadius: 8, padding: '8px 11px' }}>{children}</div>
}

export function StageBadge({ label, color }: { label: string; color: string }) {
  // themed-badge: dark reads --tb-bg/--tb-fg verbatim; the light rule in
  // globals.css darkens the text and adds a crisp ring so pale mid-tones (mint,
  // yellow) stay legible on white.
  return (
    <span
      className="themed-badge"
      style={{
        fontSize: 11.5, fontWeight: 700, borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap',
        boxShadow: `inset 0 0 0 1px ${color}55`,
        '--tb-bg': color + '22', '--tb-fg': color,
      } as React.CSSProperties}
    >{label}</span>
  )
}
