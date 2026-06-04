'use client'

// YouTube-Analytics-style date range picker: a trigger showing the range +
// label, a dropdown of presets (Last 7/28/90/365 days, Lifetime, years,
// months, Custom), and a Custom calendar with range selection + Apply/Cancel.

import { useEffect, useRef, useState } from 'react'

export const PICKER_TODAY = '2026-06-03'
export const DATA_START = '2026-01-01'

export interface DateRange { from: string; to: string; label: string }

const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const isoDate = (d: Date) => isoOf(d.getFullYear(), d.getMonth(), d.getDate())
function shiftDays(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d)
}
function fmtLong(iso: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(iso + 'T00:00:00'))
}
export function fmtRange(from: string, to: string) {
  const f = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
    .format(new Date(from + 'T00:00:00'))
  return `${f} – ${fmtLong(to)}`
}
function diffDays(from: string, to: string) {
  return Math.round((+new Date(to + 'T00:00:00') - +new Date(from + 'T00:00:00')) / 86400000) + 1
}
/** ISO (YYYY-MM-DD) → display DD-MM-YYYY. */
function isoToDMY(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}
/** Parse a typed DD-MM-YYYY (or DD/MM/YYYY) string; returns normalized ISO or null. */
function parseDMY(s: string): string | null {
  const m = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(s.trim())
  if (!m) return null
  const [, d, mo, y] = m
  const dt = new Date(`${y}-${mo}-${d}T00:00:00`)
  if (isNaN(dt.getTime()) || dt.getFullYear() !== +y || dt.getMonth() !== +mo - 1 || dt.getDate() !== +d) return null
  return `${y}-${mo}-${d}`
}

export function presetRange(label: string): DateRange {
  switch (label) {
    case 'Last 7 days':   return { label, from: shiftDays(PICKER_TODAY, -6),   to: PICKER_TODAY }
    case 'Last 28 days':  return { label, from: shiftDays(PICKER_TODAY, -27),  to: PICKER_TODAY }
    case 'Last 90 days':  return { label, from: shiftDays(PICKER_TODAY, -89),  to: PICKER_TODAY }
    case 'Last 365 days': return { label, from: shiftDays(PICKER_TODAY, -364), to: PICKER_TODAY }
    default:              return { label: 'Lifetime', from: DATA_START, to: PICKER_TODAY }
  }
}

const PRESETS = ['Last 7 days', 'Last 28 days', 'Last 90 days', 'Last 365 days', 'Lifetime']
const YEARS = [2026, 2025]
const MONTHS = [
  { l: 'June',  y: 2026, m: 5 },
  { l: 'May',   y: 2026, m: 4 },
  { l: 'April', y: 2026, m: 3 },
]
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const NOW_Y = Number(PICKER_TODAY.slice(0, 4))
const NOW_M = Number(PICKER_TODAY.slice(5, 7)) - 1

export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'presets' | 'custom'>('presets')
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) { setOpen(false); setMode('presets') }
    }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function pick(r: DateRange) { onChange(r); setOpen(false); setMode('presets') }

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={trigger}>
        <span style={{ textAlign: 'left', lineHeight: 1.25 }}>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--text3)' }}>{fmtRange(value.from, value.to)}</span>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{value.label}</span>
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <div style={panel}>
          {mode === 'presets' ? (
            <div style={{ padding: 6 }}>
              {PRESETS.map(p => (
                <Row key={p} active={value.label === p} onClick={() => pick(presetRange(p))}>{p}</Row>
              ))}
              <Divider />
              {YEARS.map(y => (
                <Row key={y} active={value.label === String(y)}
                  onClick={() => pick({ label: String(y), from: isoOf(y, 0, 1), to: y === 2026 ? PICKER_TODAY : isoOf(y, 11, 31) })}>
                  {y}
                </Row>
              ))}
              <Divider />
              {MONTHS.map(mo => (
                <Row key={mo.l} active={value.label === mo.l}
                  onClick={() => pick({ label: mo.l, from: isoOf(mo.y, mo.m, 1), to: isoOf(mo.y, mo.m, new Date(mo.y, mo.m + 1, 0).getDate()) })}>
                  {mo.l}
                </Row>
              ))}
              <Divider />
              <Row active={value.label === 'Custom'} onClick={() => setMode('custom')}>Custom</Row>
            </div>
          ) : (
            <CustomCalendar value={value} onApply={pick} onCancel={() => setMode('presets')} />
          )}
        </div>
      )}
    </div>
  )
}

function CustomCalendar({ value, onApply, onCancel }: {
  value: DateRange; onApply: (r: DateRange) => void; onCancel: () => void
}) {
  const init = new Date(value.to + 'T00:00:00')
  const [viewY, setViewY] = useState(init.getFullYear())
  const [viewM, setViewM] = useState(init.getMonth())
  const [from, setFrom] = useState<string | null>(value.from)
  const [to, setTo] = useState<string | null>(value.to)
  const [picking, setPicking] = useState<'none' | 'month' | 'year'>('none')
  // Raw text for the manually-typed fields (kept in sync when the calendar changes from/to)
  const [fromText, setFromText] = useState(isoToDMY(value.from))
  const [toText, setToText] = useState(isoToDMY(value.to))
  useEffect(() => { setFromText(from ? isoToDMY(from) : '') }, [from])
  useEffect(() => { setToText(to ? isoToDMY(to) : '') }, [to])

  function clickDay(iso: string) {
    if (!from || (from && to)) { setFrom(iso); setTo(null) }
    else if (iso < from) { setTo(from); setFrom(iso) }
    else setTo(iso)
  }
  function move(delta: number) {
    let m = viewM + delta, y = viewY
    if (m < 0) { m = 11; y-- } else if (m > 11) { m = 0; y++ }
    setViewM(m); setViewY(y)
  }

  const firstDow = new Date(viewY, viewM, 1).getDay()
  const dim = new Date(viewY, viewM + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)]
  const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(viewY, viewM, 1))
  const selectedCount = from && to ? diffDays(from, to) : from ? 1 : 0

  return (
    <div style={{ padding: 14, width: 300 }}>
      {/* manual text fields — pure typing, format YYYY-MM-DD (no native popup) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <input
          type="text" inputMode="numeric" placeholder="DD-MM-YYYY" value={fromText}
          onChange={e => {
            const t = e.target.value; setFromText(t)
            const iso = parseDMY(t)
            if (iso && iso <= PICKER_TODAY) {
              setFrom(iso); if (to && iso > to) setTo(iso)
              const d = new Date(iso + 'T00:00:00'); setViewY(d.getFullYear()); setViewM(d.getMonth()); setPicking('none')
            }
          }}
          onBlur={() => { if (!parseDMY(fromText)) setFromText(from ? isoToDMY(from) : '') }}
          style={dateField}
        />
        <span style={{ color: 'var(--text3)' }}>–</span>
        <input
          type="text" inputMode="numeric" placeholder="DD-MM-YYYY" value={toText}
          onChange={e => {
            const t = e.target.value; setToText(t)
            const iso = parseDMY(t)
            if (iso && iso <= PICKER_TODAY && (!from || iso >= from)) {
              setTo(iso)
              const d = new Date(iso + 'T00:00:00'); setViewY(d.getFullYear()); setViewM(d.getMonth()); setPicking('none')
            }
          }}
          onBlur={() => { if (!parseDMY(toText)) setToText(to ? isoToDMY(to) : '') }}
          style={dateField}
        />
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 8 }}>Format: DD-MM-YYYY (tanggal-bulan-tahun)</div>
      <div style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 10 }}>{selectedCount} days selected</div>

      {/* nav — click month to pick month, click year to pick year */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <button
          onClick={() => picking === 'none' ? move(-1) : picking === 'month' ? setViewY(viewY - 1) : null}
          style={{ ...navBtn, visibility: picking === 'year' ? 'hidden' : 'visible' }}
        >‹</button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          {picking === 'none' ? (
            <button onClick={() => setPicking('month')} style={labelBtn}>
              {MONTHS_SHORT[viewM]} <span style={{ color: 'var(--text2)' }}>·</span>{' '}
              <span onClick={(e) => { e.stopPropagation(); setPicking('year') }} style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{viewY}</span>
              <Caret />
            </button>
          ) : picking === 'month' ? (
            <button onClick={() => setPicking('year')} style={labelBtn}>Pilih bulan · {viewY} <Caret up /></button>
          ) : (
            <button onClick={() => setPicking('none')} style={labelBtn}>Pilih tahun <Caret up /></button>
          )}
        </div>
        <button
          onClick={() => picking === 'none' ? move(1) : picking === 'month' ? setViewY(viewY + 1) : null}
          style={{ ...navBtn, visibility: picking === 'year' ? 'hidden' : 'visible' }}
        >›</button>
      </div>

      {picking === 'year' ? (
        /* Year grid */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '6px 0 4px' }}>
          {Array.from({ length: 12 }, (_, i) => NOW_Y - i).map(y => {
            const active = y === viewY
            return (
              <button
                key={y} onClick={() => { setViewY(y); setPicking('month') }}
                style={{
                  padding: '11px 0', borderRadius: 9, fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
                  background: active ? 'var(--accent)' : 'var(--bg3)',
                  color: active ? '#fff' : 'var(--text)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {y}
              </button>
            )
          })}
        </div>
      ) : picking === 'month' ? (
        /* Month grid for the year in view */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '6px 0 4px' }}>
          {MONTHS_SHORT.map((mn, i) => {
            const active = i === viewM
            const disabled = viewY > NOW_Y || (viewY === NOW_Y && i > NOW_M)
            return (
              <button
                key={mn} disabled={disabled}
                onClick={() => { setViewM(i); setPicking('none') }}
                style={{
                  padding: '11px 0', borderRadius: 9, fontSize: 13, fontWeight: active ? 700 : 500,
                  cursor: disabled ? 'default' : 'pointer',
                  background: active ? 'var(--accent)' : 'var(--bg3)',
                  color: disabled ? 'var(--text3)' : active ? '#fff' : 'var(--text)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                {mn}
              </button>
            )
          })}
        </div>
      ) : (
        <>
          {/* weekday header */}
          <div style={grid}>
            {DOW.map((d, i) => <span key={i} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', padding: '4px 0' }}>{d}</span>)}
          </div>
          {/* days */}
          <div style={grid}>
            {cells.map((d, i) => {
              if (d === null) return <span key={i} />
              const iso = isoOf(viewY, viewM, d)
              const disabled = iso > PICKER_TODAY
              const isFrom = iso === from, isTo = iso === to
              const inRange = !!from && !!to && iso >= from && iso <= to
              const endpoint = isFrom || isTo
              return (
                <button
                  key={i} disabled={disabled} onClick={() => clickDay(iso)}
                  style={{
                    height: 34, border: 'none', cursor: disabled ? 'default' : 'pointer', fontSize: 12.5,
                    borderRadius: endpoint ? '50%' : inRange ? 0 : '50%',
                    background: endpoint ? '#fff' : inRange ? 'var(--bg-hover)' : 'transparent',
                    color: disabled ? 'var(--text3)' : endpoint ? '#000' : 'var(--text)',
                    opacity: disabled ? 0.4 : 1, fontWeight: endpoint ? 700 : 400,
                  }}
                >
                  {d}
                </button>
              )
            })}
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button onClick={onCancel} style={ghostBtn}>Cancel</button>
        <button
          disabled={!from || !to}
          onClick={() => from && to && onApply({ from, to, label: 'Custom' })}
          style={{ ...applyBtn, opacity: from && to ? 1 : 0.5 }}
        >
          Apply
        </button>
      </div>
    </div>
  )
}

const labelBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent',
  border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text)',
}
function Caret({ up }: { up?: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ color: 'var(--text3)', transform: up ? 'rotate(180deg)' : 'none' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

const dateField: React.CSSProperties = {
  flex: 1, width: 'auto', minWidth: 0, background: 'transparent', outline: 'none',
  border: 'none', borderBottom: '2px solid var(--border)', borderRadius: 0,
  color: 'var(--text)', fontSize: 13, padding: '6px 2px', colorScheme: 'dark',
}

function Row({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
        padding: '9px 12px', borderRadius: 8, fontSize: 13, fontWeight: active ? 600 : 400,
        background: active ? 'var(--bg-hover)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--text2)',
      }}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '6px 8px' }} />
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      style={{ color: 'var(--text2)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

const trigger: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 14, cursor: 'pointer',
  background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10,
  padding: '7px 12px', minWidth: 200,
}
const panel: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
  background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
  boxShadow: '0 12px 40px rgba(0,0,0,0.5)', minWidth: 220,
}
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }
const navBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', fontSize: 15,
}
const ghostBtn: React.CSSProperties = {
  background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)',
  borderRadius: 999, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const applyBtn: React.CSSProperties = {
  background: 'var(--accent)', color: '#fff', border: 'none',
  borderRadius: 999, padding: '7px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}

function gridCell(active: boolean): React.CSSProperties {
  return {
    padding: '11px 0', borderRadius: 9, fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
    background: active ? 'var(--accent)' : 'var(--bg3)',
    color: active ? '#fff' : 'var(--text)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  }
}

/**
 * Single-date picker with the same month/year selection UX as the Analytics
 * range picker. Trigger matches the form's dropdown shape; future dates allowed
 * (for scheduling). `value`/`onChange` use ISO YYYY-MM-DD ('' = empty).
 */
export function SingleDatePicker({ value, onChange, placeholder = 'Pilih tanggal...' }: {
  value: string
  onChange: (iso: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState<'none' | 'month' | 'year'>('none')
  const ref = useRef<HTMLDivElement>(null)
  const base = new Date((value || PICKER_TODAY) + 'T00:00:00')
  const [viewY, setViewY] = useState(base.getFullYear())
  const [viewM, setViewM] = useState(base.getMonth())

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setPicking('none') }
    }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function toggleOpen() {
    if (!open && value) { const d = new Date(value + 'T00:00:00'); setViewY(d.getFullYear()); setViewM(d.getMonth()) }
    setPicking('none'); setOpen(o => !o)
  }
  function move(delta: number) {
    let m = viewM + delta, y = viewY
    if (m < 0) { m = 11; y-- } else if (m > 11) { m = 0; y++ }
    setViewM(m); setViewY(y)
  }

  const firstDow = new Date(viewY, viewM, 1).getDay()
  const dim = new Date(viewY, viewM + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)]
  const display = value
    ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value + 'T00:00:00'))
    : ''

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button" onClick={toggleOpen}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, minHeight: 42,
          background: 'var(--bg3)', border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 8, padding: '6px 10px 6px 12px', cursor: 'pointer',
        }}
      >
        <span style={{ flex: 1, textAlign: 'left', fontSize: 14, color: value ? 'var(--text)' : 'var(--text3)' }}>
          {value ? display : placeholder}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ color: 'var(--text2)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div style={{ ...panel, left: 0, right: 'auto', width: 300 }}>
          <div style={{ padding: 14 }}>
            {/* month/year nav */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <button onClick={() => picking === 'none' ? move(-1) : picking === 'month' ? setViewY(viewY - 1) : null}
                style={{ ...navBtn, visibility: picking === 'year' ? 'hidden' : 'visible' }}>‹</button>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {picking === 'none' ? (
                  <button onClick={() => setPicking('month')} style={labelBtn}>
                    {MONTHS_SHORT[viewM]} <span style={{ color: 'var(--text2)' }}>·</span>{' '}
                    <span onClick={(e) => { e.stopPropagation(); setPicking('year') }} style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{viewY}</span>
                    <Caret />
                  </button>
                ) : picking === 'month' ? (
                  <button onClick={() => setPicking('year')} style={labelBtn}>Pilih bulan · {viewY} <Caret up /></button>
                ) : (
                  <button onClick={() => setPicking('none')} style={labelBtn}>Pilih tahun <Caret up /></button>
                )}
              </div>
              <button onClick={() => picking === 'none' ? move(1) : picking === 'month' ? setViewY(viewY + 1) : null}
                style={{ ...navBtn, visibility: picking === 'year' ? 'hidden' : 'visible' }}>›</button>
            </div>

            {picking === 'year' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '6px 0 4px' }}>
                {Array.from({ length: 12 }, (_, i) => NOW_Y - 3 + i).map(y => (
                  <button key={y} onClick={() => { setViewY(y); setPicking('month') }} style={gridCell(y === viewY)}>{y}</button>
                ))}
              </div>
            ) : picking === 'month' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '6px 0 4px' }}>
                {MONTHS_SHORT.map((mn, i) => (
                  <button key={mn} onClick={() => { setViewM(i); setPicking('none') }} style={gridCell(i === viewM)}>{mn}</button>
                ))}
              </div>
            ) : (
              <>
                <div style={grid}>
                  {DOW.map((d, i) => <span key={i} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', padding: '4px 0' }}>{d}</span>)}
                </div>
                <div style={grid}>
                  {cells.map((d, i) => {
                    if (d === null) return <span key={i} />
                    const iso = isoOf(viewY, viewM, d)
                    const sel = iso === value
                    return (
                      <button
                        key={i} onClick={() => { onChange(iso); setOpen(false); setPicking('none') }}
                        style={{
                          height: 34, border: 'none', cursor: 'pointer', fontSize: 12.5, borderRadius: '50%',
                          background: sel ? '#fff' : 'transparent', color: sel ? '#000' : 'var(--text)', fontWeight: sel ? 700 : 400,
                        }}
                      >
                        {d}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
