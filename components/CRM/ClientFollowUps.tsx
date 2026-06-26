'use client'

import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useClientInteractions } from '@/hooks/useClientInteractions'
import { followUpTone, todayISODate } from '@/lib/follow-up'
import type { ClientInteraction } from '@/lib/types'

// Every scheduled follow-up for a client, pulled out of the interaction history
// into its own section. Pending ones (soonest first) lead; completed ones follow.
const TYPE_LABEL: Record<string, string> = {
  call: 'Telepon', meeting: 'Meeting', whatsapp: 'WhatsApp', email: 'Email',
  note: 'Catatan', stage_change: 'Pindah stage', followup: 'Follow-up',
}
const fmt = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

async function markDone(id: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (getSupabase() as any).from('client_interactions').update({ follow_up_done: true }).eq('id', id)
}

export function ClientFollowUps({ clientId }: { clientId: string }) {
  const t = useT()
  const today = todayISODate()
  const rows = useClientInteractions(clientId)
    .filter((r) => r.next_follow_up)
    .slice()
    .sort((a, b) => {
      if (a.follow_up_done !== b.follow_up_done) return a.follow_up_done ? 1 : -1 // pending first
      const cmp = (a.next_follow_up ?? '') < (b.next_follow_up ?? '') ? -1 : 1
      return a.follow_up_done ? -cmp : cmp // pending: soonest first; done: latest first
    })

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{t('Follow-up')} ({rows.length})</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>{t('Belum ada follow-up.')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r: ClientInteraction) => {
            const tone = r.follow_up_done ? 'none' : followUpTone(r.next_follow_up as string, today)
            const color = r.follow_up_done ? 'var(--text3)' : tone === 'overdue' ? '#ff6b6b' : tone === 'due' ? '#ffc542' : 'var(--text2)'
            return (
              <div key={r.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color }}>⏰ {fmt(r.next_follow_up as string)}</span>
                  {r.next_follow_up_via && <span style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, padding: '1px 9px' }}>{t('via')} {r.next_follow_up_via}{r.next_follow_up_target ? ` · ${r.next_follow_up_target}` : ''}</span>}
                  {r.follow_up_done ? (
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>({t('selesai')})</span>
                  ) : (
                    <button onClick={() => markDone(r.id)} style={{ marginLeft: 'auto', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--text)' }}>{t('Selesai')}</button>
                  )}
                </div>
                {r.next_follow_up_note && (
                  <div style={{ fontSize: 12.5, color: 'var(--text)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.next_follow_up_note}</div>
                )}
                {r.summary && (
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4, whiteSpace: 'pre-wrap' }}>
                    <span style={{ color: 'var(--text3)' }}>{TYPE_LABEL[r.type] ?? ''}{TYPE_LABEL[r.type] ? ': ' : ''}</span>{r.summary}
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
