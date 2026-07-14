'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { getSupabase } from '@/lib/supabase'
import { formatRupiah } from '@/lib/utils'
import type { CrmInvoice, CrmInvoiceItem, CrmProject } from '@/lib/types'
import {
  invoiceSchema, zodErrors, invoiceTotals, INVOICE_TERMINS, TERMIN_LABEL, INVOICE_STATUSES,
  INVOICE_STATUS_LABEL, TAX_RATE, type InvoiceInput,
} from '@/lib/crm/schema'
import { promoteContactToClient } from '@/lib/crm/promoteClient'
import { Field, Row, Input, Select, Err, inStyle, taStyle, CRM_DATE_TRIGGER } from './ui'
import { SingleDatePicker } from '@/components/Social/DateRangePicker'

type Line = { description: string; qty: string; unit_price: string }
const blankLine = (): Line => ({ description: '', qty: '1', unit_price: '' })

export function InvoiceFormModal({ open, invoice, prefillProject, onClose, onSaved }: {
  open: boolean
  invoice?: CrmInvoice | null
  prefillProject?: CrmProject | null
  onClose: () => void
  onSaved?: (i: CrmInvoice) => void
}) {
  const t = useT()
  const { contacts, crmProjects, crmInvoiceItems, upsertCrmInvoice } = useStore(useShallow(s => ({
    contacts: s.contacts, crmProjects: s.crmProjects, crmInvoiceItems: s.crmInvoiceItems, upsertCrmInvoice: s.upsertCrmInvoice,
  })))
  const [form, setForm] = useState<InvoiceInput>(blankForm())
  const [contactId, setContactId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [discountStr, setDiscountStr] = useState('')
  const [lines, setLines] = useState<Line[]>([blankLine()])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setErrors({})
    if (invoice) {
      setForm({
        invoice_date: invoice.invoice_date, due_date: invoice.due_date || '', discount: invoice.discount,
        tax_enabled: invoice.tax_enabled, termin: invoice.termin, bank_account: invoice.bank_account || '',
        status: invoice.status, notes: invoice.notes || '',
      })
      setContactId(invoice.contact_id ?? null); setProjectId(invoice.project_id ?? null); setDiscountStr(String(invoice.discount ?? ''))
      const its = crmInvoiceItems.filter(i => i.invoice_id === invoice.id).sort((a, b) => a.sort_order - b.sort_order)
      setLines(its.length ? its.map(i => ({ description: i.description, qty: String(i.qty), unit_price: String(i.unit_price) })) : [blankLine()])
    } else if (prefillProject) {
      setForm({ ...blankForm() })
      setContactId(prefillProject.contact_id ?? null); setProjectId(prefillProject.id); setDiscountStr('')
      // Seed one line from the project (which carries the deal's services & value).
      const svc = (prefillProject.services || []).join(', ')
      setLines([{ description: svc ? `${prefillProject.name} — ${svc}` : prefillProject.name, qty: '1', unit_price: String(prefillProject.contract_value || '') }])
    } else {
      setForm(blankForm()); setContactId(null); setProjectId(null); setDiscountStr(''); setLines([blankLine()])
    }
  }, [open, invoice, prefillProject, crmInvoiceItems])

  const set = <K extends keyof InvoiceInput>(k: K, v: InvoiceInput[K]) => setForm(f => ({ ...f, [k]: v }))
  const contact = contacts.find(c => c.id === contactId)
  const project = crmProjects.find(p => p.id === projectId)
  const locked = !!(invoice?.contact_id || prefillProject)

  const numLines = useMemo(() => lines.map(l => ({ description: l.description, qty: Number(l.qty) || 0, unit_price: Number(l.unit_price.replace(/[^0-9.]/g, '')) || 0 })), [lines])
  const discount = Number(discountStr.replace(/[^0-9.]/g, '')) || 0
  const { subtotal, tax, total } = invoiceTotals(numLines, discount, form.tax_enabled)

  const setLine = (i: number, k: keyof Line, v: string) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l))
  const addLine = () => setLines(ls => [...ls, blankLine()])
  const rmLine = (i: number) => setLines(ls => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls)

  async function save() {
    const parsed = invoiceSchema.safeParse({ ...form, discount, contact_id: contactId ?? undefined, project_id: projectId ?? undefined })
    if (!parsed.success) { setErrors(zodErrors(parsed.error)); return }
    const validLines = numLines.filter(l => l.description.trim() && (l.qty > 0))
    if (validLines.length === 0) { setErrors({ items: t('Minimal 1 item dengan deskripsi & qty.') }); return }
    setSaving(true)
    const header = {
      contact_id: contactId, project_id: projectId, invoice_date: parsed.data.invoice_date, due_date: parsed.data.due_date,
      discount, tax_enabled: parsed.data.tax_enabled, termin: parsed.data.termin, bank_account: parsed.data.bank_account || null,
      status: parsed.data.status, notes: parsed.data.notes || null,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = getSupabase() as any
    const { data: saved, error } = invoice
      ? await sb.from('crm_invoices').update(header).eq('id', invoice.id).select().single()
      : await sb.from('crm_invoices').insert(header).select().single()
    if (error) { setSaving(false); setErrors({ _: error.message }); return }
    const invId = (saved as CrmInvoice).id
    if (invoice) await sb.from('crm_invoice_items').delete().eq('invoice_id', invId)
    await sb.from('crm_invoice_items').insert(validLines.map((l, idx) => ({ invoice_id: invId, description: l.description, qty: l.qty, unit_price: l.unit_price, sort_order: idx })))
    setSaving(false)
    upsertCrmInvoice(saved as CrmInvoice)
    if (contactId) promoteContactToClient(contactId) // flips only if already paid + project running
    onSaved?.(saved as CrmInvoice)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={820}
      title={invoice ? `${t('Edit Invoice')} ${invoice.number ?? ''}` : t('Buat Invoice')}
      footer={<>
        <BtnSecondary onClick={onClose}>{t('Batal')}</BtnSecondary>
        <BtnPrimary onClick={save} loading={saving} disabled={saving}>{t('Simpan')}</BtnPrimary>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {errors._ && <Err>{errors._}</Err>}
        <Row>
          <Field label={t('Contact')} error={errors.contact_id}>
            {locked ? <div style={{ ...inStyle, opacity: 0.85 }}>{contact?.name ?? '—'} 🔒</div>
              : <Select value={contactId ?? ''} onChange={v => setContactId(v || null)} options={[{ v: '', l: t('— Pilih contact —') }, ...contacts.map(c => ({ v: c.id, l: c.company_name || c.name, sub: c.company_name ? c.name : undefined }))]} />}
          </Field>
          <Field label={t('Project')}>
            <div style={{ ...inStyle, opacity: 0.85 }}>{project?.name ?? t('— tanpa project —')}{project ? ' 🔗' : ''}</div>
          </Field>
        </Row>
        <Row>
          <Field label={t('Tanggal Invoice') + ' *'} error={errors.invoice_date}><SingleDatePicker value={form.invoice_date} onChange={v => set('invoice_date', v)} triggerStyle={CRM_DATE_TRIGGER} /></Field>
          <Field label={t('Jatuh Tempo') + ' *'} error={errors.due_date}><SingleDatePicker value={form.due_date} onChange={v => set('due_date', v)} triggerStyle={CRM_DATE_TRIGGER} /></Field>
        </Row>

        {/* Items */}
        <Field label={t('Item') + ' *'} error={errors.items}>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 8, padding: '7px 10px', background: 'var(--bg3)', fontSize: 11.5, fontWeight: 700, color: 'var(--text3)' }}>
              <span style={{ flex: 1 }}>{t('Deskripsi')}</span>
              <span style={{ width: 60, textAlign: 'right' }}>Qty</span>
              <span style={{ width: 120, textAlign: 'right' }}>{t('Harga')}</span>
              <span style={{ width: 120, textAlign: 'right' }}>{t('Subtotal')}</span>
              <span style={{ width: 22 }} />
            </div>
            {lines.map((l, i) => {
              const line = numLines[i]
              return (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 10px', alignItems: 'center', borderTop: '1px solid var(--border)' }}>
                  <input value={l.description} onChange={e => setLine(i, 'description', e.target.value)} placeholder={t('Deskripsi item')} style={{ ...inStyle, flex: 1 }} />
                  <input value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)} style={{ ...inStyle, width: 60, textAlign: 'right' }} />
                  <input value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)} placeholder="0" style={{ ...inStyle, width: 120, textAlign: 'right' }} />
                  <span style={{ width: 120, textAlign: 'right', fontSize: 12.5 }}>{formatRupiah(line.qty * line.unit_price)}</span>
                  <button onClick={() => rmLine(i)} style={{ width: 22, background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}>✕</button>
                </div>
              )
            })}
          </div>
          <button onClick={addLine} style={{ marginTop: 8, background: 'none', border: '1px dashed var(--border)', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, color: 'var(--link)', cursor: 'pointer', width: '100%' }}>+ {t('Tambah Item')}</button>
        </Field>

        {/* Totals */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label={t('Diskon')}><Input value={discountStr} onChange={setDiscountStr} placeholder="0" /></Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.tax_enabled} onChange={e => set('tax_enabled', e.target.checked)} />
              {t('PPN')} {Math.round(TAX_RATE * 100)}%
            </label>
            <Row>
              <Field label={t('Termin')}><Select value={form.termin} onChange={v => set('termin', v as InvoiceInput['termin'])} options={INVOICE_TERMINS.map(x => ({ v: x, l: TERMIN_LABEL[x] }))} /></Field>
              <Field label="Status"><Select value={form.status} onChange={v => set('status', v as InvoiceInput['status'])} options={INVOICE_STATUSES.map(x => ({ v: x, l: INVOICE_STATUS_LABEL[x] }))} /></Field>
            </Row>
            <Field label={t('Bank / Rekening')}><Input value={form.bank_account} onChange={v => set('bank_account', v)} placeholder={t('mis. BCA 123456 a.n. …')} /></Field>
            <Field label={t('Catatan')}><textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} style={taStyle} /></Field>
          </div>
          <div style={{ flex: '0 0 240px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, alignSelf: 'flex-start' }}>
            <TotalRow label={t('Subtotal')} value={subtotal} />
            <TotalRow label={t('Diskon')} value={-discount} />
            {form.tax_enabled && <TotalRow label={`${t('PPN')} ${Math.round(TAX_RATE * 100)}%`} value={tax} />}
            <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}>
              <span>Total</span><span>{formatRupiah(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text2)', padding: '3px 0' }}><span>{label}</span><span>{formatRupiah(value)}</span></div>
}
function blankForm(): InvoiceInput {
  const today = new Date().toISOString().slice(0, 10)
  return { invoice_date: today, due_date: '', discount: 0, tax_enabled: false, termin: 'FULL', bank_account: '', status: 'DRAFT', notes: '' }
}
