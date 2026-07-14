'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/lib/i18n/LanguageProvider'

// Scope tags for CRM2 (new) feeds — kept separate from the legacy clients/leads
// activity (scope 'contact') and from each other.
export const CONTACT_SCOPE = 'crm-contact'
export const PIPELINE_SCOPE = 'crm-pipeline'

// Relative for recent, absolute for older — easier to scan than a raw stamp.
function relTime(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'baru saja'
  if (min < 60) return `${min} menit lalu`
  if (min < 24 * 60) return `${Math.round(min / 60)} jam lalu`
  const d = new Date(iso)
  return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
}

// Colour + glyph inferred from the message text.
function ActIcon({ msg }: { msg: string }) {
  const m = msg.toLowerCase()
  let color = 'var(--text3)'
  let icon = <circle cx="12" cy="12" r="3.2" />
  if (m.includes('hapus')) { color = '#ff6b6b'; icon = <><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /></> }
  else if (m.includes('won')) { color = '#43d9a2'; icon = <><path d="M20 6 9 17l-5-5" /></> }
  else if (m.includes('lost')) { color = '#ff6b6b'; icon = <><path d="M18 6 6 18" /><path d="M6 6l12 12" /></> }
  else if (m.includes('pindah')) { color = '#5b9bd5'; icon = <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></> }
  else if (m.includes('baru') || m.includes('tambah')) { color = '#43d9a2'; icon = <><path d="M12 5v14" /><path d="M5 12h14" /></> }
  else if (m.includes('update') || m.includes('ubah') || m.includes('edit')) { color = '#8b7fff'; icon = <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></> }
  return (
    <span style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
    </span>
  )
}

/** Generic activity feed button + notification-style dropdown for a single CRM2
 *  scope. Reads the store's activity slice (kept live by useRealtime) filtered to
 *  `scope`, so it updates in realtime without a refresh. The panel renders in a
 *  portal with fixed positioning so a scrolling toolbar/modal can't clip it, and
 *  flips above the button when there isn't room below. */
export function CrmActivityButton({ scope, title }: { scope: string; title: string }) {
  const t = useT()
  const activity = useStore(useShallow(s => s.activity.filter(a => a.scope === scope)))
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Unread badge — items newer than the last time this feed was opened. Persisted
  // per scope so "read" survives reloads. Uses the newest item's timestamp (not
  // Date.now) as the watermark so clock skew can't mark a fresh item as read.
  const storageKey = `bentala_crm_activity_seen_${scope}`
  const [lastSeen, setLastSeen] = useState(0)
  useEffect(() => {
    try { const v = localStorage.getItem(storageKey); if (v) setLastSeen(parseInt(v, 10) || 0) } catch { /* ignore */ }
  }, [storageKey])
  const newest = activity.reduce((m, a) => Math.max(m, new Date(a.created_at).getTime()), 0)
  const unread = activity.reduce((n, a) => n + (new Date(a.created_at).getTime() > lastSeen ? 1 : 0), 0)
  // Mark everything read while the panel is open (also catches items arriving live).
  useEffect(() => {
    if (!open || newest <= lastSeen) return
    setLastSeen(newest)
    try { localStorage.setItem(storageKey, String(newest)) } catch { /* ignore */ }
  }, [open, newest, lastSeen, storageKey])

  function measure() {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const w = 360
    const gap = 6
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))
    const spaceBelow = window.innerHeight - r.bottom - 12
    const spaceAbove = r.top - 12
    const up = spaceBelow < 300 && spaceAbove > spaceBelow
    setPos({
      left, width: w,
      top: up ? undefined : r.bottom + gap,
      bottom: up ? window.innerHeight - r.top + gap : undefined,
      maxH: Math.min(440, Math.max(220, up ? spaceAbove : spaceBelow)),
    })
  }

  useLayoutEffect(() => { if (open) measure() }, [open])

  useEffect(() => {
    if (!open) return
    const reposition = () => measure()
    function onDoc(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node)) return
      if (panelRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    document.addEventListener('mousedown', onDoc)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        title={t('Activity')}
        style={{ position: 'relative', height: 38, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', cursor: 'pointer', background: open ? 'var(--bg-hover)' : 'var(--bg2)', border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, color: 'var(--text)', fontSize: 13, fontWeight: 600 }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
        {t('Activity')}
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -8, right: -8, minWidth: 20, height: 20, padding: '0 5px',
            display: 'grid', placeItems: 'center', background: '#ff3b30', color: '#fff',
            borderRadius: 20, fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
            border: '2px solid var(--bg)', boxShadow: '0 1px 4px rgba(0,0,0,0.45)', lineHeight: 1, pointerEvents: 'none',
          }}>{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          className="crm-pop"
          role="menu"
          style={{
            position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, zIndex: 1000,
            background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: pos.maxH,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
            <span style={{ flex: 1 }} />
            {activity.length > 0 && <span style={{ fontSize: 11.5, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{activity.length}</span>}
          </div>

          <div style={{ overflowY: 'auto' }}>
            {activity.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '32px 14px', textAlign: 'center', color: 'var(--text3)' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                <span style={{ fontSize: 13 }}>{t('Belum ada aktivitas.')}</span>
              </div>
            ) : activity.map(a => (
              <div key={a.id} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '11px 14px', borderBottom: '1px solid var(--border)', transition: 'background 0.12s' }}
                onMouseOver={e => (e.currentTarget.style.background = 'var(--bg3)')}
                onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
              >
                <ActIcon msg={a.message} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.45 }}>{a.message}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 3 }}>{(a.user_name || t('Sistem'))} · {relTime(a.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/** Activity feed for CRM contacts only. */
export function ContactsActivity() {
  const t = useT()
  return <CrmActivityButton scope={CONTACT_SCOPE} title={t('Aktivitas Contact')} />
}

/** Activity feed for the deals pipeline only. */
export function PipelineActivity() {
  const t = useT()
  return <CrmActivityButton scope={PIPELINE_SCOPE} title={t('Aktivitas Pipeline')} />
}
