'use client'

import { useEffect, useState } from 'react'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { getSupabase } from '@/lib/supabase'
import type { CrmProject, Deal } from '@/lib/types'
import { projectSchema, zodErrors, PROJECT_STATUSES, PROJECT_STATUS_LABEL, SERVICE_OPTIONS, type ProjectInput } from '@/lib/crm/schema'
import { Field, Row, Input, Select, Err, inStyle, taStyle, CRM_DATE_TRIGGER } from './ui'
import { SingleDatePicker } from '@/components/Social/DateRangePicker'

/** Create/edit a CRM project. When `prefillDeal` is set (from a deal) the name,
 *  contact, services and contract value are pre-filled; contact stays locked. */
export function CrmProjectFormModal({ open, project, prefillDeal, onClose, onSaved }: {
  open: boolean
  project?: CrmProject | null
  prefillDeal?: Deal | null
  onClose: () => void
  onSaved?: (p: CrmProject) => void
}) {
  const t = useT()
  const { contacts, deals, upsertCrmProject, upsertDeal } = useStore(useShallow(s => ({ contacts: s.contacts, deals: s.deals, upsertCrmProject: s.upsertCrmProject, upsertDeal: s.upsertDeal })))
  const [form, setForm] = useState<ProjectInput>(blank())
  const [contactId, setContactId] = useState<string | null>(null)
  const [dealId, setDealId] = useState<string | null>(null)
  const [valueStr, setValueStr] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [accounts, setAccounts] = useState<{ email: string; name: string }[]>([])

  useEffect(() => {
    fetch('/api/accounts').then(r => (r.ok ? r.json() : { accounts: [] }))
      .then((d: { accounts?: { email: string; name: string }[] }) => setAccounts(d.accounts ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!open) return
    setErrors({})
    if (project) {
      setForm({
        name: project.name, services: project.services || [], contract_value: project.contract_value,
        start_date: project.start_date || '', deadline: project.deadline || '', manager_email: project.manager_email || '',
        member_emails: project.member_emails || [], scope: project.scope || '', status: project.status,
      })
      setContactId(project.contact_id ?? null); setDealId(project.deal_id ?? null)
      setValueStr(String(project.contract_value ?? ''))
    } else if (prefillDeal) {
      setForm({ ...blank(), name: prefillDeal.name, services: prefillDeal.services || [], contract_value: prefillDeal.value })
      setContactId(prefillDeal.contact_id); setDealId(prefillDeal.id); setValueStr(String(prefillDeal.value ?? ''))
    } else {
      setForm(blank()); setContactId(null); setDealId(null); setValueStr('')
    }
  }, [open, project, prefillDeal])

  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => setForm(f => ({ ...f, [k]: v }))
  const contact = contacts.find(c => c.id === contactId)
  const contactLocked = !!(project?.contact_id || prefillDeal)

  function toggleSvc(s: string) { setForm(f => ({ ...f, services: f.services.includes(s) ? f.services.filter(x => x !== s) : [...f.services, s] })) }
  function toggleMember(email: string) { setForm(f => ({ ...f, member_emails: f.member_emails.includes(email) ? f.member_emails.filter(x => x !== email) : [...f.member_emails, email] })) }

  async function save() {
    const contract_value = Number(valueStr.replace(/[^0-9.]/g, '')) || 0
    const parsed = projectSchema.safeParse({ ...form, contract_value, contact_id: contactId ?? undefined, deal_id: dealId ?? undefined })
    if (!parsed.success) { setErrors(zodErrors(parsed.error)); return }
    setSaving(true)
    const data = {
      name: parsed.data.name, contact_id: contactId, deal_id: dealId, services: parsed.data.services,
      contract_value, start_date: parsed.data.start_date, deadline: parsed.data.deadline,
      manager_email: parsed.data.manager_email || null, member_emails: parsed.data.member_emails,
      scope: parsed.data.scope, status: parsed.data.status,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = getSupabase() as any
    const { data: saved, error } = project
      ? await sb.from('crm_projects').update(data).eq('id', project.id).select().single()
      : await sb.from('crm_projects').insert(data).select().single()
    setSaving(false)
    if (error) { setErrors({ _: error.message }); return }
    if (saved) {
      upsertCrmProject(saved as CrmProject); onSaved?.(saved as CrmProject)
      // Keep the linked deal name in sync when the project is renamed.
      const nm = (saved as CrmProject).name
      if (project && dealId && nm !== project.name) {
        const d = deals.find(x => x.id === dealId)
        if (d) { upsertDeal({ ...d, name: nm }); await sb.from('deals').update({ name: nm }).eq('id', dealId) }
      }
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={720}
      title={project ? t('Edit Project') : t('Tambah Project')}
      footer={<>
        <BtnSecondary onClick={onClose}>{t('Batal')}</BtnSecondary>
        <BtnPrimary onClick={save} loading={saving} disabled={saving}>{t('Simpan')}</BtnPrimary>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {errors._ && <Err>{errors._}</Err>}
        <Field label={t('Nama Project') + ' *'} error={errors.name}>
          <Input value={form.name} onChange={v => set('name', v)} placeholder={t('Nama project')} />
        </Field>
        <Row>
          <Field label={t('Contact')} error={errors.contact_id}>
            {contactLocked ? (
              <div style={{ ...inStyle, opacity: 0.85 }}>{contact?.name ?? '—'}{contact?.company_name ? ` · ${contact.company_name}` : ''} 🔒</div>
            ) : (
              <Select value={contactId ?? ''} onChange={v => setContactId(v || null)}
                options={[{ v: '', l: t('— Pilih contact —') }, ...contacts.map(c => ({ v: c.id, l: c.company_name || c.name, sub: c.company_name ? c.name : undefined }))]} />
            )}
          </Field>
          <Field label={t('Nilai Kontrak') + ' *'} error={errors.contract_value}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: 13.5, fontWeight: 600, pointerEvents: 'none' }}>Rp</span>
              <input value={groupID(valueStr)} onChange={e => setValueStr(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="0" style={{ ...inStyle, paddingLeft: 36 }} />
            </div>
          </Field>
        </Row>
        <Field label={t('Layanan')} error={errors.services}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[...SERVICE_OPTIONS, ...form.services.filter(s => !SERVICE_OPTIONS.includes(s as typeof SERVICE_OPTIONS[number]))].map(s => {
              const on = form.services.includes(s)
              return <button key={s} type="button" onClick={() => toggleSvc(s)} style={chip(on)}>{s}</button>
            })}
          </div>
        </Field>
        <Row>
          <Field label={t('Tanggal Mulai') + ' *'} error={errors.start_date}>
            <SingleDatePicker value={form.start_date} onChange={v => set('start_date', v)} triggerStyle={CRM_DATE_TRIGGER} />
          </Field>
          <Field label="Deadline *" error={errors.deadline}>
            <SingleDatePicker value={form.deadline} onChange={v => set('deadline', v)} triggerStyle={CRM_DATE_TRIGGER} />
          </Field>
        </Row>
        <Row>
          <Field label={t('Manager') + ' *'} error={errors.manager_email}>
            <Select value={form.manager_email} onChange={v => set('manager_email', v)}
              options={[{ v: '', l: t('— Pilih —') }, ...accounts.map(a => ({ v: a.email, l: a.name || a.email }))]} />
          </Field>
          <Field label="Status" error={errors.status}>
            <Select value={form.status} onChange={v => set('status', v as ProjectInput['status'])}
              options={PROJECT_STATUSES.map(s => ({ v: s, l: PROJECT_STATUS_LABEL[s] }))} />
          </Field>
        </Row>
        <Field label={t('Anggota Tim')}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {accounts.map(a => {
              const on = form.member_emails.includes(a.email)
              return <button key={a.email} type="button" onClick={() => toggleMember(a.email)} style={chip(on)}>{a.name || a.email}</button>
            })}
          </div>
        </Field>
        <Field label={t('Scope') + ' *'} error={errors.scope}>
          <textarea value={form.scope} onChange={e => set('scope', e.target.value)} rows={3} style={taStyle} placeholder={t('Ruang lingkup pekerjaan…')} />
        </Field>
        {dealId && <div style={{ fontSize: 12, color: 'var(--text3)' }}>🔗 {t('Dari deal')} — {t('read-only')}</div>}
      </div>
    </Modal>
  )
}

function blank(): ProjectInput {
  return { name: '', services: [], contract_value: 0, start_date: '', deadline: '', manager_email: '', member_emails: [], scope: '', status: 'BELUM_MULAI' }
}
/** "1000000" → "1.000.000" (Indonesian thousands). */
const groupID = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
function chip(on: boolean): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 20, padding: '4px 11px', border: `1px solid ${on ? 'color-mix(in srgb, var(--accent) 45%, var(--border))' : 'var(--border)'}`, background: on ? 'color-mix(in srgb, var(--accent) 14%, var(--bg2))' : 'var(--bg3)', color: on ? 'var(--link)' : 'var(--text2)' }
}
