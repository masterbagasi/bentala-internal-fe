'use client'

import { useState } from 'react'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/lib/i18n/LanguageProvider'
import { Modal } from '@/components/shared/Modal'
import { getSupabase } from '@/lib/supabase'
import { useLogActivity } from '@/hooks/useData'
import type { ActivityLog } from '@/lib/types'

// Relative time for recent items, absolute for older — easier to scan than a raw stamp.
function relTime(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'baru saja'
  if (min < 60) return `${min} menit lalu`
  if (min < 24 * 60) return `${Math.round(min / 60)} jam lalu`
  const d = new Date(iso)
  return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
}

// A colour + glyph per activity kind, inferred from the message text.
function ActIcon({ msg }: { msg: string }) {
  const m = msg.toLowerCase()
  let color = 'var(--text3)'
  let icon = <circle cx="12" cy="12" r="3.2" />
  if (m.includes('hapus')) { color = '#ff6b6b'; icon = <><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /></> }
  else if (m.includes('pindah')) { color = '#5b9bd5'; icon = <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></> }
  else if (m.includes('baru') || m.includes('tambah')) { color = '#43d9a2'; icon = <><path d="M12 5v14" /><path d="M5 12h14" /></> }
  else if (m.includes('update') || m.includes('ubah') || m.includes('edit')) { color = '#8b7fff'; icon = <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></> }
  return (
    <span style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
    </span>
  )
}

/** Activity feed button + popup — reads the store's activity_log slice, which is
 *  kept live by useRealtime, so the list updates in realtime without a refresh. */
export function ActivityButton({ scope }: { scope?: string }) {
  const t = useT()
  const activityAll = useStore(useShallow((s) => s.activity))
  // Scope the feed to the current tab (e.g. only pipeline / only contact activities).
  const activity = scope ? activityAll.filter((a) => a.scope === scope) : activityAll
  const [open, setOpen] = useState(false)
  const logActivity = useLogActivity()
  const [restored, setRestored] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)

  // A deleted contact is recoverable: clear its deleted_at. Realtime then re-adds
  // it to the list live (clients globally, leads on the Contacts tab).
  async function restore(a: ActivityLog) {
    const kind = a.meta?.kind
    const id = a.meta?.id
    if (!kind || !id || busy) return
    setBusy(a.id)
    const table = kind === 'client' ? 'clients' : 'bsi_leads'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (getSupabase() as any).from(table).update({ deleted_at: null }).eq('id', id)
    setRestored((s) => new Set(s).add(a.id))
    setBusy(null)
    const nm = a.message.match(/"([^"]*)"/)?.[1] || 'kontak'
    logActivity(`Kontak dipulihkan: "${nm}"`, a.scope ?? undefined)
  }

  const canRestore = (a: ActivityLog) => !!a.meta?.id && /dihapus/i.test(a.message)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t('Activity')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
        {t('Activity')}
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title={t('Activity')} maxWidth={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 6px 8px' }}>
            {activity.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '36px 0', color: 'var(--text3)' }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                <span style={{ fontSize: 13 }}>{t('Belum ada aktivitas.')}</span>
              </div>
            ) : activity.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 8px', borderRadius: 10 }}>
                <ActIcon msg={a.message} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>{a.message}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{(a.user_name || t('Sistem'))} · {relTime(a.created_at)}</div>
                </div>
                {canRestore(a) && (
                  restored.has(a.id) ? (
                    <span style={{ flexShrink: 0, alignSelf: 'center', fontSize: 11, color: '#43d9a2', fontWeight: 600 }}>{t('Dipulihkan')}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => restore(a)}
                      disabled={busy === a.id}
                      style={{ flexShrink: 0, alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 5, height: 28, padding: '0 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text2)', cursor: busy === a.id ? 'default' : 'pointer', fontSize: 12, fontWeight: 500, opacity: busy === a.id ? 0.6 : 1, whiteSpace: 'nowrap' }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M3 13a9 9 0 1 0 3-7.7L3 8" /></svg>
                      {busy === a.id ? t('Memulihkan…') : t('Pulihkan')}
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  )
}
