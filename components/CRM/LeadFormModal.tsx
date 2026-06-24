'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import type { BsiLead } from '@/lib/website-types'

export interface NewLeadInput {
  full_name: string
  brand_name: string
  contact_type: BsiLead['contact_type']
  contact_value: string
  project_type: string
  notes: string
  status: BsiLead['status']
}

const STATUS_CHOICES: { value: BsiLead['status']; label: string }[] = [
  { value: 'new', label: 'Baru' },
  { value: 'contacted', label: 'Sudah Dihubungi' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'closed', label: 'Closed' },
  { value: 'spam', label: 'Spam' },
]

/** Shared add-contact form. Defaults the status (e.g. 'qualified' for a manual
 *  database contact) via `defaultStatus`. */
export function LeadFormModal({
  onClose,
  onSave,
  title,
  defaultStatus = 'new',
}: {
  onClose: () => void
  onSave: (input: NewLeadInput) => Promise<void>
  title?: string
  defaultStatus?: BsiLead['status']
}) {
  const t = useT()
  const [form, setForm] = useState<NewLeadInput>({
    full_name: '', brand_name: '', contact_type: 'whatsapp', contact_value: '', project_type: '', notes: '', status: defaultStatus,
  })
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!form.full_name.trim() || !form.contact_value.trim()) { alert(t('Nama & kontak wajib diisi.')); return }
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={title ?? t('Tambah Kontak')}
      maxWidth={480}
      footer={<><BtnSecondary onClick={onClose}>{t('Batal')}</BtnSecondary><BtnPrimary onClick={save} loading={saving}>{t('Simpan')}</BtnPrimary></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label={t('Nama *')}>
          <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} placeholder={t('Nama kontak')} />
        </Field>
        <Field label={t('Brand / Perusahaan')}>
          <input value={form.brand_name} onChange={(e) => setForm((f) => ({ ...f, brand_name: e.target.value }))} placeholder="PT. ..." />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 10 }}>
          <Field label={t('Tipe Kontak')}>
            <select value={form.contact_type} onChange={(e) => setForm((f) => ({ ...f, contact_type: e.target.value as BsiLead['contact_type'] }))}>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
            </select>
          </Field>
          <Field label={t('Kontak *')}>
            <input value={form.contact_value} onChange={(e) => setForm((f) => ({ ...f, contact_value: e.target.value }))} placeholder={form.contact_type === 'whatsapp' ? '+62...' : 'email@domain.com'} />
          </Field>
        </div>
        <Field label={t('Jenis Project')}>
          <input value={form.project_type} onChange={(e) => setForm((f) => ({ ...f, project_type: e.target.value }))} placeholder={t('mis. Social Media, Content, Ads')} />
        </Field>
        <Field label={t('Status')}>
          <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as BsiLead['status'] }))}>
            {STATUS_CHOICES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label={t('Catatan')}>
          <textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder={t('Catatan...')} style={{ fontFamily: 'inherit', resize: 'vertical' }} />
        </Field>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  )
}
