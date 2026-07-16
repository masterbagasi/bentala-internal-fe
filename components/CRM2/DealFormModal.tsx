'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { getSupabase } from '@/lib/supabase'
import { useLogActivity } from '@/hooks/useData'
import { PIPELINE_SCOPE } from './ContactsActivity'
import { InvoiceFormModal } from './InvoiceFormModal'
import type { Deal, CrmProject } from '@/lib/types'
import { dealSchema, zodErrors, DEAL_STAGES, STAGE_LABEL, SERVICE_OPTIONS, type DealInput } from '@/lib/crm/schema'
import { Field, Row, Input, Select, Err, inStyle, taStyle, CRM_DATE_TRIGGER } from './ui'
import { SingleDatePicker } from '@/components/Social/DateRangePicker'

/** Create/edit a Deal. Contact is chosen from Contacts (never typed). When
 *  `lockContactId` is set (opened from a Contact) the contact is fixed. */
export function DealFormModal({ open, deal, lockContactId, prefillStage, onClose, onSaved }: {
  open: boolean
  deal?: Deal | null
  lockContactId?: string
  prefillStage?: DealInput['stage']
  onClose: () => void
  onSaved?: (d: Deal) => void
}) {
  const t = useT()
  const router = useRouter()
  const logActivity = useLogActivity()
  const { contacts, upsertDeal, crmProjects, crmInvoices, upsertCrmProject } = useStore(useShallow(s => ({ contacts: s.contacts, upsertDeal: s.upsertDeal, crmProjects: s.crmProjects, crmInvoices: s.crmInvoices, upsertCrmProject: s.upsertCrmProject })))
  const [invoiceFor, setInvoiceFor] = useState<CrmProject | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [form, setForm] = useState<DealInput>({
    name: '', contact_id: lockContactId ?? '', services: [], value: 0, stage: 'prospect',
    expected_close_date: '', owner_email: '', source: '', description: '',
  })
  const [valueStr, setValueStr] = useState('')
  const [svcInput, setSvcInput] = useState('')
  const [showOther, setShowOther] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setErrors({}); setSvcInput(''); setShowOther(false)
    if (deal) {
      setForm({
        name: deal.name, contact_id: deal.contact_id, services: deal.services || [], value: deal.value,
        stage: deal.stage, expected_close_date: deal.expected_close_date || '', owner_email: deal.owner_email || '',
        source: deal.source || '', description: deal.description || '',
      })
      setValueStr(String(deal.value ?? ''))
    } else {
      setForm({ name: '', contact_id: lockContactId ?? '', services: [], value: 0, stage: prefillStage ?? 'prospect', expected_close_date: '', owner_email: '', source: '', description: '' })
      setValueStr('')
    }
  }, [open, deal, lockContactId, prefillStage])

  const set = <K extends keyof DealInput>(k: K, v: DealInput[K]) => setForm(f => ({ ...f, [k]: v }))
  const contact = contacts.find(c => c.id === form.contact_id)
  const locked = !!lockContactId

  // Invoicing is offered once the deal has moved past "contacted".
  const dealProject = deal
    ? crmProjects.find(p => p.deal_id === deal.id) || (deal.crm_project_id ? crmProjects.find(p => p.id === deal.crm_project_id) : undefined)
    : undefined
  const existingInvoice = dealProject ? crmInvoices.find(i => i.project_id === dealProject.id) : undefined
  const pastContacted = !!deal && deal.stage !== 'lost' && DEAL_STAGES.indexOf(deal.stage) > DEAL_STAGES.indexOf('contacted')

  // Ensure a project exists for this deal (reuse the Won-trigger's, else create
  // one), then open the invoice form locked to it. Creating from a non-Won deal
  // pre-links crm_project_id so the Won trigger won't make a duplicate later.
  async function openInvoice() {
    if (!deal) return
    setPushBusy(true)
    try {
      let project = dealProject
      if (!project) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = getSupabase() as any
        const { data: proj, error } = await sb.from('crm_projects').insert({
          name: deal.name, contact_id: deal.contact_id, deal_id: deal.id,
          services: deal.services || [], contract_value: deal.value || 0,
          scope: deal.description || '', status: 'BELUM_MULAI',
        }).select().single()
        if (error || !proj) { alert('Gagal menyiapkan project: ' + (error?.message || 'coba lagi')); return }
        upsertCrmProject(proj as CrmProject)
        upsertDeal({ ...deal, crm_project_id: (proj as CrmProject).id } as Deal)
        await sb.from('deals').update({ crm_project_id: (proj as CrmProject).id }).eq('id', deal.id)
        project = proj as CrmProject
      }
      setInvoiceFor(project)
    } finally { setPushBusy(false) }
  }

  function toggleSvc(s: string) {
    setForm(f => ({ ...f, services: f.services.includes(s) ? f.services.filter(x => x !== s) : [...f.services, s] }))
  }
  function addSvc() {
    const v = svcInput.trim()
    if (!v) return
    setForm(f => (f.services.includes(v) ? f : { ...f, services: [...f.services, v] }))
    setSvcInput(''); setShowOther(true)
  }

  async function save() {
    const value = Number(valueStr.replace(/[^0-9.]/g, '')) || 0
    // Fold any service still sitting in the "Lainnya" input (not yet Enter'd)
    // into the list so it counts — no need to press Enter before Save.
    const pending = svcInput.trim()
    const services = pending && !form.services.includes(pending) ? [...form.services, pending] : form.services
    if (pending) { setForm(f => ({ ...f, services })); setSvcInput('') }
    const parsed = dealSchema.safeParse({ ...form, services, value })
    if (!parsed.success) { setErrors(zodErrors(parsed.error)); return }
    setSaving(true)
    const data = {
      ...parsed.data,
      expected_close_date: parsed.data.expected_close_date || null,
      owner_email: parsed.data.owner_email || null,
      source: parsed.data.source || null,
      description: parsed.data.description || null,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = getSupabase() as any
    const { data: saved, error } = deal
      ? await sb.from('deals').update(data).eq('id', deal.id).select().single()
      : await sb.from('deals').insert(data).select().single()
    setSaving(false)
    if (error) { setErrors({ _: error.message }); return }
    if (saved) {
      upsertDeal(saved as Deal); onSaved?.(saved as Deal)
      const nm = (saved as Deal).name
      // Keep the linked project(s) in sync when the deal is renamed.
      if (deal && nm !== deal.name) {
        const linked = crmProjects.filter(p => p.deal_id === deal.id)
        if (linked.length) {
          linked.forEach(p => upsertCrmProject({ ...p, name: nm }))
          await sb.from('crm_projects').update({ name: nm }).eq('deal_id', deal.id)
        }
      }
      logActivity(deal ? `Deal diupdate: "${nm}"` : `Deal baru: "${nm}"`, PIPELINE_SCOPE)
    }
    onClose()
  }

  return (
    <>
    <Modal open={open} onClose={onClose} maxWidth={720}
      title={deal ? t('Edit Deal') : t('Tambah Deal')}
      footer={<>
        {pastContacted && (existingInvoice ? (
          <button onClick={() => { router.push(`/crm/invoices/${existingInvoice.id}`); onClose() }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            🧾 {t('Lihat Invoice')}
          </button>
        ) : (
          <button onClick={openInvoice} disabled={pushBusy}
            title={t('Buat invoice untuk deal ini')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', background: 'color-mix(in srgb, var(--accent) 12%, var(--bg2))', color: 'var(--link)', border: '1px solid color-mix(in srgb, var(--accent) 34%, var(--border))', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: pushBusy ? 'default' : 'pointer', opacity: pushBusy ? 0.6 : 1 }}>
            + {pushBusy ? t('Menyiapkan…') : t('Invoice')}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <BtnSecondary onClick={onClose}>{t('Batal')}</BtnSecondary>
        <BtnPrimary onClick={save} loading={saving} disabled={saving}>{t('Simpan')}</BtnPrimary>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {errors._ && <Err>{errors._}</Err>}
        <Field label={t('Contact') + ' *'} error={errors.contact_id}>
          {locked ? (
            <div style={{ ...inStyle, display: 'flex', alignItems: 'center', gap: 8, opacity: 0.85 }}>
              <span style={{ fontWeight: 600 }}>{contact?.name ?? '—'}</span>
              {contact?.company_name && <span style={{ color: 'var(--text3)', fontSize: 12 }}>· {contact.company_name}</span>}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>🔒 {t('terkunci')}</span>
            </div>
          ) : (
            <Select searchable placeholder={t('— Pilih contact —')} value={form.contact_id} onChange={v => set('contact_id', v)}
              options={contacts.map(c => ({ v: c.id, l: c.company_name || c.name, sub: c.company_name ? c.name : undefined }))} />
          )}
        </Field>
        <Field label={t('Nama Deal') + ' *'} error={errors.name}>
          <Input value={form.name} onChange={v => set('name', v)} placeholder={t('mis. Konten Bulanan — {name}').replace('{name}', contact?.company_name || contact?.name || '')} />
        </Field>
        <Field label={t('Layanan') + ' *'} error={errors.services}>
          {(() => {
            const custom = form.services.filter(s => !SERVICE_OPTIONS.includes(s as typeof SERVICE_OPTIONS[number]))
            const otherOn = showOther || custom.length > 0
            const chip = (on: boolean) => ({ fontSize: 12.5, fontWeight: 600, cursor: 'pointer', borderRadius: 20, padding: '5px 12px', border: `1px solid ${on ? 'color-mix(in srgb, var(--accent) 45%, var(--border))' : 'var(--border)'}`, background: on ? 'color-mix(in srgb, var(--accent) 14%, var(--bg2))' : 'var(--bg3)', color: on ? 'var(--link)' : 'var(--text2)' })
            return (
              <>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {SERVICE_OPTIONS.map(s => {
                    const on = form.services.includes(s)
                    return (
                      <button key={s} type="button" onClick={() => toggleSvc(s)} style={chip(on)}>{s}</button>
                    )
                  })}
                  <button type="button" onClick={() => setShowOther(v => !v)} style={chip(otherOn)}>
                    + {t('Lainnya')}
                  </button>
                </div>
                {custom.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {custom.map(s => (
                      <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, background: 'color-mix(in srgb, var(--accent) 14%, var(--bg2))', border: '1px solid color-mix(in srgb, var(--accent) 45%, var(--border))', color: 'var(--link)', borderRadius: 20, padding: '4px 7px 4px 11px' }}>
                        {s}<button type="button" onClick={() => toggleSvc(s)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
                {otherOn && (
                  <Input value={svcInput} onChange={setSvcInput} onEnter={addSvc} placeholder={t('Ketik layanan lain lalu Enter')} />
                )}
              </>
            )
          })()}
        </Field>
        <Row>
          <Field label={t('Nilai') + ' *'} error={errors.value}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: 13.5, fontWeight: 600, pointerEvents: 'none' }}>Rp</span>
              <input value={groupID(valueStr)} onChange={e => setValueStr(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="0" style={{ ...inStyle, paddingLeft: 36 }} />
            </div>
          </Field>
          <Field label="Stage" error={errors.stage}>
            <Select value={form.stage} onChange={v => set('stage', v as DealInput['stage'])}
              options={DEAL_STAGES.map(s => ({ v: s, l: STAGE_LABEL[s] }))} />
          </Field>
        </Row>
        <Row>
          <Field label={t('Perkiraan Closing')} error={errors.expected_close_date}>
            <SingleDatePicker value={form.expected_close_date} onChange={v => set('expected_close_date', v)} triggerStyle={CRM_DATE_TRIGGER} />
          </Field>
          <Field label={t('Sumber')} error={errors.source}>
            <Input value={form.source} onChange={v => set('source', v)} placeholder={t('mis. Referral')} />
          </Field>
        </Row>
        <Field label={t('Deskripsi')} error={errors.description}>
          <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} style={taStyle} placeholder={t('Detail deal…')} />
        </Field>
      </div>
    </Modal>
    {invoiceFor && <InvoiceFormModal open prefillProject={invoiceFor} onClose={() => setInvoiceFor(null)} onSaved={() => setInvoiceFor(null)} />}
    </>
  )
}

/** "1000000" → "1.000.000" (Indonesian thousands). */
const groupID = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
