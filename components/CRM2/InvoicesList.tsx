'use client'

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'
import { formatRupiah, formatDate } from '@/lib/utils'
import { INVOICE_STATUSES_MANUAL, INVOICE_STATUS_LABEL, INVOICE_STATUS_COLOR, invoiceTotals, effectiveInvoiceStatus } from '@/lib/crm/schema'
import { ConfirmDialog } from '@/components/shared/Modal'
import { StageBadge, inStyle } from './ui'
import { InvoiceFormModal } from './InvoiceFormModal'
import { InvoiceDetail } from './InvoiceDetail'
import { InvoiceSettingsModal } from './InvoiceSettingsModal'
import type { CrmInvoice, InvoiceSettings } from '@/lib/types'

export function InvoicesList() {
  const t = useT()
  const { crmInvoices, crmInvoiceItems, contacts, removeCrmInvoice } = useStore(useShallow(s => ({
    crmInvoices: s.crmInvoices, crmInvoiceItems: s.crmInvoiceItems, contacts: s.contacts, removeCrmInvoice: s.removeCrmInvoice,
  })))
  const [add, setAdd] = useState(false)
  const [settings, setSettings] = useState<InvoiceSettings | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(getSupabase() as any).from('invoice_settings').select('*').limit(1).maybeSingle().then(({ data }: { data: InvoiceSettings | null }) => setSettings(data))
  }, [])
  const [view, setView] = useState<string | null>(null)
  const [editInv, setEditInv] = useState<CrmInvoice | null>(null)
  const [delInv, setDelInv] = useState<CrmInvoice | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('all')
  const [contact, setContact] = useState('all')
  const [due, setDue] = useState('all')

  async function confirmDelete() {
    if (!delInv) return
    setBusy(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = getSupabase() as any
      await sb.from('crm_invoice_items').delete().eq('invoice_id', delInv.id)
      const { error } = await sb.from('crm_invoices').delete().eq('id', delInv.id)
      if (error) throw error
      removeCrmInvoice(delInv.id)
      setDelInv(null)
    } catch (e) {
      alert('Gagal menghapus: ' + ((e as { message?: string })?.message || 'coba lagi'))
    } finally { setBusy(false) }
  }

  const totalOf = useMemo(() => {
    const byInv = new Map<string, typeof crmInvoiceItems>()
    for (const it of crmInvoiceItems) (byInv.get(it.invoice_id) ?? byInv.set(it.invoice_id, []).get(it.invoice_id)!)!.push(it)
    return (inv: (typeof crmInvoices)[number]) => invoiceTotals(byInv.get(inv.id) ?? [], inv.discount, inv.tax_enabled).total
  }, [crmInvoiceItems, crmInvoices])

  const nameOf = useMemo(() => new Map(contacts.map(c => [c.id, c] as const)), [contacts])
  const today = new Date().toISOString().slice(0, 10)

  const filtered = useMemo(() => crmInvoices.filter(i => {
    if (status !== 'all' && i.status !== status) return false
    if (contact !== 'all' && i.contact_id !== contact) return false
    if (due === 'overdue' && !(i.due_date && i.due_date < today && i.status !== 'LUNAS')) return false
    if (due === 'unpaid' && (i.status === 'LUNAS')) return false
    return true
  }), [crmInvoices, status, contact, due, today])

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <Sel value={status} onChange={setStatus} options={[{ v: 'all', l: t('Semua status') }, ...INVOICE_STATUSES_MANUAL.map(s => ({ v: s, l: INVOICE_STATUS_LABEL[s] }))]} />
        <Sel value={contact} onChange={setContact} options={[{ v: 'all', l: t('Semua klien') }, ...contacts.map(c => ({ v: c.id, l: c.company_name || c.name }))]} />
        <Sel value={due} onChange={setDue} options={[{ v: 'all', l: t('Semua') }, { v: 'unpaid', l: t('Belum lunas') }, { v: 'overdue', l: t('Jatuh tempo') }]} />
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowSettings(true)} title={t('Pengaturan Invoice')} style={{ height: 38, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>⚙ {t('Pengaturan')}</button>
        <button onClick={() => setAdd(true)} style={{ height: 38, padding: '0 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ {t('Buat Invoice')}</button>
      </div>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <table>
          <thead><tr><th>No.</th><th>{t('Klien')}</th><th>{t('Tanggal')}</th><th>{t('Jatuh Tempo')}</th><th style={{ textAlign: 'right' }}>Total</th><th>Status</th><th style={{ textAlign: 'right' }}>{t('Aksi')}</th></tr></thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7}><div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text2)' }}><div style={{ fontSize: 32, marginBottom: 8 }}>🧾</div>{t('Belum ada invoice.')}</div></td></tr>
            ) : filtered.map(i => {
              const c = nameOf.get(i.contact_id ?? '')
              const overdue = i.due_date && i.due_date < today && i.status !== 'LUNAS'
              return (
                <tr key={i.id} onClick={() => setView(i.id)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600, fontSize: 12.5 }}>{i.number}</td>
                  <td style={{ fontSize: 12.5 }}>{c ? (c.company_name || c.name) : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text2)' }}>{formatDate(i.invoice_date)}</td>
                  <td style={{ fontSize: 12, color: overdue ? '#ff6b6b' : 'var(--text2)' }}>{i.due_date ? formatDate(i.due_date) : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 12.5 }}>{formatRupiah(totalOf(i))}</td>
                  {(() => { const ds = effectiveInvoiceStatus(i.status, i.due_date, today); return (
                  <td><StageBadge label={INVOICE_STATUS_LABEL[ds]} color={INVOICE_STATUS_COLOR[ds]} /></td>
                  ) })()}
                  <td onClick={e => e.stopPropagation()} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setEditInv(i)} title={t('Edit')} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontSize: 12, color: 'var(--text)', marginRight: 6 }}>✏️</button>
                    <button onClick={() => setDelInv(i)} title={t('Hapus')} style={{ background: 'transparent', border: '1px solid #ff6b6b55', borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontSize: 12, color: '#ff6b6b' }}>✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {add && <InvoiceFormModal open onClose={() => setAdd(false)} onSaved={i => setView(i.id)} />}
      {showSettings && <InvoiceSettingsModal open settings={settings} onClose={() => setShowSettings(false)} onSaved={s => { setSettings(s); setShowSettings(false) }} />}
      {editInv && <InvoiceFormModal open invoice={editInv} onClose={() => setEditInv(null)} />}
      {view && <InvoiceDetail id={view} onClose={() => setView(null)} />}

      <ConfirmDialog
        open={!!delInv}
        danger
        title={`${t('Hapus invoice')} ${delInv?.number ?? ''}?`}
        message={t('Invoice beserta item-nya akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.')}
        confirmLabel={busy ? t('Menghapus…') : t('Hapus')}
        cancelLabel={t('Batal')}
        onConfirm={confirmDelete}
        onCancel={() => { if (!busy) setDelInv(null) }}
      />
    </div>
  )
}

function Sel({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inStyle, width: 'auto', cursor: 'pointer' }}>{options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
}
