'use client'

import { useState } from 'react'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { useT } from '@/lib/i18n/LanguageProvider'

export function StageReasonModal({ open, toStageLabel, required, onSubmit, onClose }: {
  open: boolean
  toStageLabel: string
  required: boolean
  onSubmit: (reason: string) => void
  onClose: () => void
}) {
  const t = useT()
  const [reason, setReason] = useState('')
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${t('Pindah ke')} ${toStageLabel}`}
      footer={<>
        <BtnSecondary onClick={onClose}>{t('Batal')}</BtnSecondary>
        <BtnPrimary onClick={() => { if (required && !reason.trim()) { alert(t('Alasan wajib diisi.')); return } onSubmit(reason.trim()) }}>
          {t('Simpan')}
        </BtnPrimary>
      </>}
    >
      <div>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>
          {required ? t('Alasan (wajib)') : t('Catatan (opsional)')}
        </label>
        <textarea
          rows={3}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={required ? t('Kenapa deal ini tidak jadi?') : t('Catatan kemenangan...')}
          style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
        />
      </div>
    </Modal>
  )
}
