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
  source: string
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

// Acquisition channel.
export const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'email', label: 'Email' },
  { value: 'other', label: 'Lainnya' },
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
    full_name: '', brand_name: '', contact_type: 'whatsapp', contact_value: '',
    source: 'instagram', project_type: '', notes: '', status: defaultStatus,
  })
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!form.full_name.trim() || !form.contact_value.trim()) { alert(t('Nama dan kontak wajib diisi.')); return }
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }
  const set = <K extends keyof NewLeadInput>(k: K, v: NewLeadInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <Modal
      open
      onClose={onClose}
      title={title ?? t('Tambah Kontak')}
      maxWidth={500}
      footer={<><BtnSecondary onClick={onClose}>{t('Batal')}</BtnSecondary><BtnPrimary onClick={save} loading={saving}>{t('Simpan kontak')}</BtnPrimary></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Group label={t('Identitas')}>
          <Field label={t('Nama')} required>
            <input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder={t('Nama kontak')} />
          </Field>
          <Field label={t('Brand / Perusahaan')}>
            <input value={form.brand_name} onChange={(e) => set('brand_name', e.target.value)} placeholder="PT. ..." />
          </Field>
        </Group>

        <Group label={t('Kontak & Sumber')}>
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 10 }}>
            <Field label={t('Tipe')}>
              <select value={form.contact_type} onChange={(e) => set('contact_type', e.target.value as BsiLead['contact_type'])}>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
              </select>
            </Field>
            <Field label={t('Kontak')} required>
              <input value={form.contact_value} onChange={(e) => set('contact_value', e.target.value)} placeholder={form.contact_type === 'whatsapp' ? '+62...' : 'email@domain.com'} />
            </Field>
          </div>
          <Field label={t('Sumber')} hint={t('Dari mana kontak ini datang')}>
            <select value={form.source} onChange={(e) => set('source', e.target.value)}>
              {SOURCE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        </Group>

        <Group label={t('Detail')}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label={t('Jenis Project')}>
              <input value={form.project_type} onChange={(e) => set('project_type', e.target.value)} placeholder={t('Social Media, Ads...')} />
            </Field>
            <Field label={t('Status')}>
              <select value={form.status} onChange={(e) => set('status', e.target.value as BsiLead['status'])}>
                {STATUS_CHOICES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label={t('Catatan')}>
            <textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder={t('Catatan singkat...')} style={{ fontFamily: 'inherit', resize: 'vertical' }} />
          </Field>
        </Group>
      </div>
    </Modal>
  )
}

// A labelled group with a quiet eyebrow — the three real sections of a contact:
// who they are, how to reach them + where they came from, and how to classify them.
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)' }}>{label}</div>
      {children}
    </section>
  )
}

function Field({ label, children, required, hint }: { label: string; children: React.ReactNode; required?: boolean; hint?: string }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>
        {label}{required && <span style={{ color: 'var(--accent2)' }}>*</span>}
        {hint && <span style={{ fontSize: 10.5, color: 'var(--text3)', fontWeight: 400 }}>· {hint}</span>}
      </span>
      {children}
    </label>
  )
}
