'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useStore } from '@/hooks/useStore'
import { getSupabase } from '@/lib/supabase'
import { useLogActivity } from '@/hooks/useData'
import type { Contact } from '@/lib/types'
import {
  contactSchema, zodErrors, CONTACT_TYPES, CONTACT_CATEGORIES, CONTACT_SOURCES,
  CATEGORY_LABEL, SOURCE_LABEL, CLIENT_TIERS, INDUSTRIES, type ContactInput,
} from '@/lib/crm/schema'
import { Field, Row, Input, Select, Err, taStyle } from './ui'
import { Combo, PROVINSI, NEGARA } from '@/components/CRM/LeadFormModal'
import { KABUPATEN_BY_PROVINSI, ALL_KABUPATEN } from '@/lib/id-regions'

const EMPTY: ContactInput = {
  name: '', type: 'INDIVIDU', company_name: '', category: 'LEAD', job_title: '',
  email: '', phone: '', instagram: '', source: 'INSTAGRAM', owner_email: '',
  client_tier: '', industry: '',
  address: '', city: '', province: '', country: 'Indonesia', tags: [], notes: '',
}

/** Create/edit a Contact. Master data — the only place client names are typed. */
export function ContactFormModal({ open, contact, onClose, onSaved }: {
  open: boolean
  contact?: Contact | null
  onClose: () => void
  onSaved?: (c: Contact) => void
}) {
  const t = useT()
  const upsertContact = useStore(s => s.upsertContact)
  const logActivity = useLogActivity()
  const [form, setForm] = useState<ContactInput>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [accounts, setAccounts] = useState<{ email: string; name: string }[]>([])

  useEffect(() => {
    if (!open) return
    setErrors({}); setTagInput('')
    setForm(contact ? {
      name: contact.name, type: contact.type, company_name: contact.company_name || '',
      category: contact.category, job_title: contact.job_title || '', email: contact.email,
      phone: contact.phone, instagram: contact.instagram || '', source: contact.source,
      owner_email: contact.owner_email || '', client_tier: contact.client_tier || '', industry: contact.industry || '',
      address: contact.address || '',
      city: contact.city || '', province: contact.province || '', country: contact.country || 'Indonesia',
      tags: contact.tags || [], notes: contact.notes || '',
    } : EMPTY)
  }, [open, contact])

  useEffect(() => {
    fetch('/api/accounts').then(r => (r.ok ? r.json() : { accounts: [] }))
      .then((d: { accounts?: { email: string; name: string }[] }) => setAccounts(d.accounts ?? []))
      .catch(() => {})
  }, [])

  const set = <K extends keyof ContactInput>(k: K, v: ContactInput[K]) => setForm(f => ({ ...f, [k]: v }))
  const isCompany = form.type === 'PERUSAHAAN'

  function addTag() {
    const v = tagInput.trim()
    if (!v) return
    setForm(f => (f.tags.includes(v) ? f : { ...f, tags: [...f.tags, v] }))
    setTagInput('')
  }

  async function save() {
    const parsed = contactSchema.safeParse(form)
    if (!parsed.success) { setErrors(zodErrors(parsed.error)); return }
    setSaving(true)
    const data = {
      ...parsed.data,
      company_name: parsed.data.company_name || null,
      job_title: parsed.data.job_title || null,
      instagram: parsed.data.instagram || null,
      owner_email: parsed.data.owner_email || null,
      client_tier: parsed.data.client_tier || null,
      industry: parsed.data.industry || null,
      address: parsed.data.address || null,
      city: parsed.data.city || null,
      province: parsed.data.province || null,
      country: parsed.data.country || null,
      notes: parsed.data.notes || null,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = getSupabase() as any
    const { data: saved, error } = contact
      ? await sb.from('contacts').update(data).eq('id', contact.id).select().single()
      : await sb.from('contacts').insert(data).select().single()
    setSaving(false)
    if (error) { setErrors({ _: error.message }); return }
    if (saved) {
      upsertContact(saved as Contact); onSaved?.(saved as Contact)
      const nm = (saved as Contact).name
      logActivity(contact ? `Contact diupdate: "${nm}"` : `Contact baru: "${nm}"`, 'crm-contact')
    }
    onClose()
  }

  const sourceOptions = useMemo(() => CONTACT_SOURCES.map(s => ({ v: s, l: SOURCE_LABEL[s] })), [])

  return (
    <Modal open={open} onClose={onClose} maxWidth={720}
      title={contact ? t('Edit Contact') : t('Tambah Contact')}
      footer={<>
        <BtnSecondary onClick={onClose}>{t('Batal')}</BtnSecondary>
        <BtnPrimary onClick={save} loading={saving} disabled={saving}>{t('Simpan')}</BtnPrimary>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {errors._ && <Err>{errors._}</Err>}
        <Field label={t('Nama') + ' *'} error={errors.name}>
          <Input value={form.name} onChange={v => set('name', v)} placeholder={t('Nama kontak')} />
        </Field>
        <Row>
          <Field label={t('Tipe') + ' *'} error={errors.type}>
            <Select value={form.type} onChange={v => set('type', v as ContactInput['type'])}
              options={CONTACT_TYPES.map(x => ({ v: x, l: x === 'INDIVIDU' ? t('Individu') : t('Perusahaan') }))} />
          </Field>
          <Field label={t('Kategori') + ' *'} error={errors.category}>
            <Select value={form.category} onChange={v => set('category', v as ContactInput['category'])}
              options={CONTACT_CATEGORIES.map(x => ({ v: x, l: CATEGORY_LABEL[x] }))} />
          </Field>
        </Row>
        {isCompany && (
          <Field label={t('Nama Perusahaan') + ' *'} error={errors.company_name}>
            <Input value={form.company_name} onChange={v => set('company_name', v)} placeholder="PT / CV …" />
          </Field>
        )}
        <Row>
          <Field label="Email" error={errors.email}>
            <Input value={form.email} onChange={v => set('email', v)} placeholder="nama@domain.com" />
          </Field>
          <Field label={t('Telepon') + ' *'} error={errors.phone}>
            <Input value={form.phone} onChange={v => set('phone', v)} placeholder="08…" />
          </Field>
        </Row>
        <Row>
          <Field label={t('Jabatan')} error={errors.job_title}>
            <Input value={form.job_title} onChange={v => set('job_title', v)} placeholder={t('mis. Owner / Manager')} />
          </Field>
          <Field label="Instagram" error={errors.instagram}>
            <Input value={form.instagram} onChange={v => set('instagram', v)} placeholder="@handle" />
          </Field>
        </Row>
        <Row>
          <Field label={t('Sumber') + ' *'} error={errors.source}>
            <Select value={form.source} onChange={v => set('source', v as ContactInput['source'])} options={sourceOptions} />
          </Field>
          <Field label={t('Owner')} error={errors.owner_email}>
            <Select value={form.owner_email} onChange={v => set('owner_email', v)}
              options={[{ v: '', l: t('— Pilih —') }, ...accounts.map(a => ({ v: a.email, l: a.name || a.email }))]} />
          </Field>
        </Row>
        <Row>
          <Field label={t('Client Tier')} error={errors.client_tier}>
            <Select value={form.client_tier} onChange={v => set('client_tier', v)}
              options={[{ v: '', l: t('— Pilih —') }, ...CLIENT_TIERS.map(x => ({ v: x, l: x }))]} />
          </Field>
          <Field label={t('Industri')} error={errors.industry}>
            <Select value={form.industry} onChange={v => set('industry', v)}
              options={[{ v: '', l: t('— Pilih —') }, ...INDUSTRIES.map(x => ({ v: x, l: x }))]} />
          </Field>
        </Row>
        <Field label={t('Alamat')} error={errors.address}>
          <Input value={form.address} onChange={v => set('address', v)} placeholder={t('Jalan / detail alamat')} />
        </Field>
        <Row>
          <Field label={t('Provinsi')} error={errors.province}>
            <Combo value={form.province} onChange={v => setForm(f => ({ ...f, province: v, city: '' }))} options={PROVINSI} placeholder={t('Cari / pilih provinsi...')} />
          </Field>
          <Field label={t('Kota / Kabupaten')} error={errors.city}>
            <Combo value={form.city} onChange={v => set('city', v)} options={form.province ? (KABUPATEN_BY_PROVINSI[form.province] ?? ALL_KABUPATEN) : ALL_KABUPATEN} placeholder={t('Cari / pilih kota...')} />
          </Field>
        </Row>
        <Field label={t('Negara')} error={errors.country}>
          <Combo value={form.country} onChange={v => set('country', v)} options={NEGARA} placeholder={t('Cari / pilih negara...')} />
        </Field>
        <Field label="Tags">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: form.tags.length ? 8 : 0 }}>
            {form.tags.map(tg => (
              <span key={tg} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 6px 3px 10px' }}>
                {tg}
                <button type="button" onClick={() => set('tags', form.tags.filter(x => x !== tg))} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>✕</button>
              </span>
            ))}
          </div>
          <Input value={tagInput} onChange={setTagInput} onEnter={addTag} placeholder={t('Ketik tag lalu Enter')} />
        </Field>
        <Field label={t('Catatan')} error={errors.notes}>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
            style={taStyle} placeholder={t('Catatan…')} />
        </Field>
      </div>
    </Modal>
  )
}

