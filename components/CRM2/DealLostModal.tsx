'use client'

import { useEffect, useState } from 'react'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useStore } from '@/hooks/useStore'
import { getSupabase } from '@/lib/supabase'
import { useLogActivity } from '@/hooks/useData'
import { PIPELINE_SCOPE } from './ContactsActivity'
import type { Deal } from '@/lib/types'
import { lostSchema, zodErrors, DEAL_LOST_REASONS, LOST_REASON_LABEL } from '@/lib/crm/schema'
import { Field, Select, Err, taStyle } from './ui'

/** "Tandai Lost" — capture the reason + notes, then move the deal to the lost stage. */
export function DealLostModal({ open, deal, onClose }: { open: boolean; deal: Deal; onClose: () => void }) {
  const t = useT()
  const logActivity = useLogActivity()
  const upsertDeal = useStore(s => s.upsertDeal)
  const [reason, setReason] = useState<string>('HARGA')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) { setReason(deal.lost_reason || 'HARGA'); setNotes(deal.lost_notes || ''); setErrors({}) } }, [open, deal])

  async function save() {
    const parsed = lostSchema.safeParse({ lost_reason: reason, lost_notes: notes })
    if (!parsed.success) { setErrors(zodErrors(parsed.error)); return }
    setSaving(true)
    const updates = { stage: 'lost', lost_reason: parsed.data.lost_reason, lost_notes: parsed.data.lost_notes || null }
    upsertDeal({ ...deal, ...updates } as Deal) // optimistic
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (getSupabase() as any).from('deals').update(updates).eq('id', deal.id)
    setSaving(false)
    if (error) { upsertDeal(deal); setErrors({ _: error.message }); return }
    logActivity(`Deal "${deal.name}" ditandai Lost (${LOST_REASON_LABEL[parsed.data.lost_reason] ?? parsed.data.lost_reason})`, PIPELINE_SCOPE)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={480} title={t('Tandai sebagai Lost')}
      footer={<>
        <BtnSecondary onClick={onClose}>{t('Batal')}</BtnSecondary>
        <BtnPrimary onClick={save} loading={saving} disabled={saving}>{t('Simpan')}</BtnPrimary>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {errors._ && <Err>{errors._}</Err>}
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          {t('Deal')} <strong style={{ color: 'var(--text)' }}>{deal.name}</strong> {t('akan ditandai Lost.')}
        </div>
        <Field label={t('Alasan') + ' *'} error={errors.lost_reason}>
          <Select value={reason} onChange={setReason} options={DEAL_LOST_REASONS.map(r => ({ v: r, l: LOST_REASON_LABEL[r] }))} />
        </Field>
        <Field label={t('Catatan')} error={errors.lost_notes}>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={taStyle} placeholder={t('Detail kenapa kalah…')} />
        </Field>
      </div>
    </Modal>
  )
}
