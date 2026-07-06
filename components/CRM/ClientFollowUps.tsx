'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useClientInteractions } from '@/hooks/useClientInteractions'
import { todayISODate } from '@/lib/follow-up'
import { linkHref } from '@/lib/attachments'
import { confirmDialog } from '@/lib/confirm-dialog'
import type { ClientInteraction } from '@/lib/types'

// Every scheduled follow-up for a client, pulled out of the interaction history
// into its own section. Pending ones (soonest first) lead; completed ones follow.
const TYPE_LABEL: Record<string, string> = {
  call: 'Telepon', meeting: 'Meeting', whatsapp: 'WhatsApp', email: 'Email',
  note: 'Catatan', stage_change: 'Pindah stage', followup: 'Follow-up',
}
const fmt = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

// Uppercase micro-label for the field grid's left column.
const LBL: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text3)', whiteSpace: 'nowrap' }

async function markDone(id: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (getSupabase() as any).from('client_interactions').update({ follow_up_done: true, follow_up_done_at: new Date().toISOString() }).eq('id', id)
}

// Undo "Done" — only offered within 24h of marking done (misclick correction).
async function markUndone(id: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (getSupabase() as any).from('client_interactions').update({ follow_up_done: false, follow_up_done_at: null }).eq('id', id)
}

const DAY_MS = 24 * 60 * 60 * 1000

// Soft-delete: keeps the row for the audit history (who + when + full detail).
async function markDeleted(id: string, t: (s: string) => string) {
  if (!(await confirmDialog(t('Hapus follow-up ini?'), { danger: true, confirmLabel: t('Hapus'), cancelLabel: t('Batal') }))) return
  const supabase = getSupabase()
  const { data: u } = await supabase.auth.getUser()
  const meta = u.user?.user_metadata ?? {}
  const by = (meta.full_name as string) ?? (meta.name as string) ?? u.user?.email?.split('@')[0] ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('client_interactions').update({ deleted_at: new Date().toISOString(), deleted_by: by }).eq('id', id)
}

// Human-friendly countdown to the follow-up: "30 menit lagi", "besok", "2 hari lagi",
// "terlambat 3 hari". Minute/hour granularity only when a time is set (else day-level).
function relativeLabel(dateISO: string, timeStr: string | null, now: Date): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  const [hh, mm] = timeStr ? timeStr.split(':').map(Number) : [0, 0]
  const target = new Date(y, m - 1, d, hh || 0, mm || 0)
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startTarget = new Date(y, m - 1, d)
  const dayDiff = Math.round((+startTarget - +startToday) / 86400000)
  if (dayDiff > 1) return `${dayDiff} hari lagi`
  if (dayDiff === 1) return 'besok'
  if (dayDiff === -1) return 'kemarin'
  if (dayDiff < -1) return `terlambat ${-dayDiff} hari`
  if (!timeStr) return 'hari ini'
  const min = Math.round((+target - +now) / 60000)
  if (min > 90) return `${Math.round(min / 60)} jam lagi`
  if (min > 0) return `${min} menit lagi`
  if (min === 0) return 'sekarang'
  const past = -min
  return past < 90 ? `lewat ${past} menit` : `lewat ${Math.round(past / 60)} jam`
}

export function ClientFollowUps({ clientId }: { clientId: string }) {
  const t = useT()
  // Tick every 30s so the countdown ("30 menit lagi") stays live without a refresh.
  const [, setTick] = useState(0)
  useEffect(() => { const id = setInterval(() => setTick((n) => n + 1), 30_000); return () => clearInterval(id) }, [])
  const today = todayISODate()
  const now = new Date()
  const withFollowUp = useClientInteractions(clientId).filter((r) => r.next_follow_up)
  const rows = withFollowUp
    .filter((r) => !r.deleted_at)
    .slice()
    .sort((a, b) => {
      if (a.follow_up_done !== b.follow_up_done) return a.follow_up_done ? 1 : -1 // pending first
      const cmp = (a.next_follow_up ?? '') < (b.next_follow_up ?? '') ? -1 : 1
      return a.follow_up_done ? -cmp : cmp // pending: soonest first; done: latest first
    })
  const deletedRows = withFollowUp
    .filter((r) => r.deleted_at)
    .slice()
    .sort((a, b) => ((a.deleted_at ?? '') < (b.deleted_at ?? '') ? 1 : -1)) // newest deletion first

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{t('Follow-up')} ({rows.length})</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>{t('Belum ada follow-up.')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r: ClientInteraction) => {
            // Status by actual date: only "jatuh tempo" on the day itself, "terlambat"
            // once it's past, and "terjadwal" while it's still in the future.
            const d = r.next_follow_up as string
            const st = r.follow_up_done ? 'done' : d < today ? 'overdue' : d === today ? 'today' : 'future'
            const color = st === 'overdue' ? '#ff6b6b' : st === 'today' ? '#ffc542' : st === 'future' ? 'var(--text2)' : 'var(--text3)'
            const statusLabel = st === 'done' ? t('Selesai') : st === 'overdue' ? t('Terlambat') : st === 'today' ? t('Jatuh tempo') : t('Terjadwal')
            return (
              <div key={r.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px', opacity: r.follow_up_done ? 0.66 : 1 }}>
                {/* Header: scheduled date + status + action */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color, fontSize: 13, fontWeight: 700 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4l2.5 1.5" /></svg>
                    {fmt(r.next_follow_up as string)}{r.next_follow_up_time ? ` · ${(r.next_follow_up_time as string).slice(0, 5)}` : ''}
                  </span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color, background: `color-mix(in srgb, ${color} 15%, transparent)`, borderRadius: 20, padding: '2px 9px' }}>{statusLabel}</span>
                  {st !== 'done' && <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text3)' }}>· {relativeLabel(d, r.next_follow_up_time, now)}</span>}
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {r.follow_up_done ? (
                      <DoneToggle canCancel={!r.follow_up_done_at || (+now - Date.parse(r.follow_up_done_at)) < DAY_MS} onCancel={() => markUndone(r.id)} t={t} />
                    ) : (
                      <button onClick={() => markDone(r.id)} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{t('Done')}</button>
                    )}
                    <button onClick={() => markDeleted(r.id, t)} title={t('Hapus follow-up')} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 26, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', color: 'var(--text3)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                    </button>
                  </span>
                </div>
                <FollowUpBody r={r} t={t} />
              </div>
            )
          })}
        </div>
      )}

      {/* Deleted follow-ups — audit history: who removed it + the full detail. */}
      {deletedRows.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text3)', marginBottom: 8 }}>{t('Dihapus')} ({deletedRows.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {deletedRows.map((r) => (
              <div key={r.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px', opacity: 0.72 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text2)', fontSize: 13, fontWeight: 700, textDecoration: 'line-through' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4l2.5 1.5" /></svg>
                    {fmt(r.next_follow_up as string)}{r.next_follow_up_time ? ` · ${(r.next_follow_up_time as string).slice(0, 5)}` : ''}
                  </span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#ff6b6b', background: 'rgba(255,107,107,0.14)', borderRadius: 20, padding: '2px 9px' }}>{t('Dihapus')}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>{t('oleh')} {r.deleted_by || '—'} · {r.deleted_at ? fmt(r.deleted_at) : ''}</span>
                </div>
                <FollowUpBody r={r} t={t} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// The two-group readout (upcoming plan + source interaction) — shared by active and deleted cards.
function FollowUpBody({ r, t }: { r: ClientInteraction; t: (s: string) => string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.16)', borderLeft: '2px solid var(--accent)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <GroupLabel color="var(--accent)">{t('Follow-up berikutnya')}</GroupLabel>
        <Field label="Jam" v={r.next_follow_up_time ? (r.next_follow_up_time as string).slice(0, 5) : null} />
        <Field label="Via" v={r.next_follow_up_via} />
        <Field label="Tujuan" v={r.next_follow_up_target} />
        <Field label="Rencana" v={r.next_follow_up_note} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 2px' }}>
        <GroupLabel color="var(--text3)">{t('Dari interaksi sebelumnya')}</GroupLabel>
        <Field label="Interaksi" v={`${TYPE_LABEL[r.type] ?? r.type} · ${fmt(r.occurred_at)}`} />
        <Field label="Oleh" v={r.author_name} />
        <Field label="Ringkasan" v={r.summary} />
        <Field label="Lampiran" node={r.files && r.files.length > 0 ? (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {r.files.map((f) => (
              <a key={f} href={linkHref(f)} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: 13, color: 'var(--link)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f}>{f}</a>
            ))}
          </span>
        ) : null} />
      </div>
    </div>
  )
}

// "Done" that reveals a Cancel (undo) on hover — only while still cancellable (<24h).
function DoneToggle({ canCancel, onCancel, t }: { canCancel: boolean; onCancel: () => void; t: (s: string) => string }) {
  const [hover, setHover] = useState(false)
  if (!canCancel) return <span style={{ fontSize: 11, fontWeight: 600, color: '#43d9a2' }}>✓ {t('Done')}</span>
  return (
    <span onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ display: 'inline-flex', alignItems: 'center' }}>
      {hover ? (
        <button onClick={onCancel} title={t('Batalkan status Done')} style={{ background: 'rgba(255,107,107,0.14)', border: '1px solid rgba(255,107,107,0.4)', borderRadius: 7, padding: '4px 11px', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#ff6b6b' }}>✕ {t('Cancel')}</button>
      ) : (
        <span style={{ fontSize: 11, fontWeight: 600, color: '#43d9a2' }}>✓ {t('Done')}</span>
      )}
    </span>
  )
}

// Section eyebrow with a leading dot — marks each group (upcoming / past).
function GroupLabel({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.7px', textTransform: 'uppercase', color }}>{children}</span>
    </div>
  )
}

// One label/value row in the readout — aligned two-column grid; shows "-" when
// empty so the card always mirrors every form input, and turns URLs into
// truncated links instead of overflowing the card.
function Field({ label, v, node }: { label: string; v?: string | null; node?: React.ReactNode }) {
  const hasNode = node !== undefined && node !== null
  const text = v == null ? '' : String(v).trim()
  const empty = !hasNode && text === ''
  const isUrl = !hasNode && /^https?:\/\//i.test(text)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '76px minmax(0, 1fr)', columnGap: 12, alignItems: 'baseline' }}>
      <span style={LBL}>{label}</span>
      <span style={{ minWidth: 0, fontSize: 13, lineHeight: 1.5, color: empty ? 'var(--text3)' : 'var(--text)' }}>
        {hasNode ? node
          : empty ? '-'
          : isUrl ? <a href={text} target="_blank" rel="noopener noreferrer" title={text} style={{ display: 'block', color: 'var(--link)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</a>
          : <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</span>}
      </span>
    </div>
  )
}
