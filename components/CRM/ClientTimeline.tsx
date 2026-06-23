'use client'

import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useClientInteractions } from '@/hooks/useClientInteractions'
import { InteractionComposer } from './InteractionComposer'
import { followUpTone, todayISODate } from '@/lib/follow-up'
import { linkHref } from '@/lib/attachments'
import type { ClientInteraction } from '@/lib/types'

const TYPE_META: Record<string, { icon: string; label: string }> = {
  call: { icon: '📞', label: 'Telepon' }, meeting: { icon: '🤝', label: 'Meeting' },
  whatsapp: { icon: '💬', label: 'WhatsApp' }, email: { icon: '✉️', label: 'Email' },
  note: { icon: '📝', label: 'Catatan' }, stage_change: { icon: '🔀', label: 'Pindah stage' }, followup: { icon: '⏰', label: 'Follow-up' },
}
const fmt = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

async function markFollowUpDone(id: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (getSupabase() as any).from('client_interactions').update({ follow_up_done: true }).eq('id', id)
}

export function ClientTimeline({ clientId }: { clientId: string }) {
  const t = useT()
  const rows = useClientInteractions(clientId)
  const today = todayISODate()

  return (
    <div>
      <InteractionComposer clientId={clientId} />
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{t('Riwayat Interaksi')} ({rows.length})</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>{t('Belum ada interaksi. Catat yang pertama di atas.')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r: ClientInteraction) => {
            const meta = TYPE_META[r.type] ?? TYPE_META.note
            const tone = r.next_follow_up && !r.follow_up_done ? followUpTone(r.next_follow_up, today) : 'none'
            return (
              <div key={r.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span>{meta.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{meta.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>· {fmt(r.occurred_at)}{r.author_name ? ` · ${r.author_name}` : ''}</span>
                </div>
                {r.summary && <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: r.files.length || r.next_follow_up ? 6 : 0 }}>{r.summary}</div>}
                {r.files.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: r.next_follow_up ? 6 : 0 }}>
                    {r.files.map(f => <a key={f} href={linkHref(f)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>🔗 {f.split('/').pop()?.slice(0, 28) || f}</a>)}
                  </div>
                )}
                {r.next_follow_up && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <span style={{ color: r.follow_up_done ? 'var(--text3)' : tone === 'overdue' ? '#ff6b6b' : tone === 'due' ? '#ffc542' : 'var(--text2)' }}>
                      ⏰ {t('Follow-up')}: {fmt(r.next_follow_up)}{r.follow_up_done ? ` (${t('selesai')})` : ''}
                    </span>
                    {!r.follow_up_done && (
                      <button onClick={() => markFollowUpDone(r.id)} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--text)' }}>{t('Selesai')}</button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
