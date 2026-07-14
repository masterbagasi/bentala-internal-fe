'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/lib/i18n/LanguageProvider'
import { formatRupiah } from '@/lib/utils'
import { CATEGORY_LABEL, CATEGORY_COLOR, STAGE_LABEL, STAGE_COLOR, SOURCE_LABEL, PROJECT_STATUS_LABEL, INVOICE_STATUS_LABEL, invoiceTotals } from '@/lib/crm/schema'
import { StageBadge } from './ui'
import { ContactFormModal } from './ContactFormModal'
import { DealFormModal } from './DealFormModal'
import type { Deal } from '@/lib/types'

/** Right-side slide-over showing a contact's detail — opened from the Contacts
 *  list without navigating away. Closes on scrim click or Escape. */
export function ContactDetailPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT()
  const { contacts, deals, crmProjects, crmInvoices, crmInvoiceItems } = useStore(useShallow(s => ({
    contacts: s.contacts, deals: s.deals, crmProjects: s.crmProjects, crmInvoices: s.crmInvoices, crmInvoiceItems: s.crmInvoiceItems,
  })))
  const contact = contacts.find(c => c.id === id)
  const [edit, setEdit] = useState(false)
  const [newDeal, setNewDeal] = useState(false)
  const [editDeal, setEditDeal] = useState<Deal | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const myDeals = useMemo(() => deals.filter(d => d.contact_id === id), [deals, id])
  const myProjects = useMemo(() => crmProjects.filter(p => p.contact_id === id), [crmProjects, id])
  const projIds = useMemo(() => new Set(myProjects.map(p => p.id)), [myProjects])
  const myInvoices = useMemo(
    () => crmInvoices.filter(i => i.contact_id === id || (i.project_id && projIds.has(i.project_id))),
    [crmInvoices, id, projIds],
  )
  const invoiceTotalOf = (invId: string, discount: number, tax: boolean) =>
    invoiceTotals(crmInvoiceItems.filter(it => it.invoice_id === invId), discount, tax).total

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Click on empty space hides the panel. Clicking a row, a button, an input, or
  // the panel itself does NOT close it (a row click just switches contacts). A
  // modal (Edit / Deal) owns its own interaction, so skip while one is open.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (edit || newDeal || editDeal) return
      const target = e.target as Element | null
      if (!target || target.closest('.crm-detail-panel, table, button, a, input, select, textarea, [role="dialog"]')) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [edit, newDeal, editDeal, onClose])

  if (!contact) return null

  const info: { label: string; value?: string | null; href?: string }[] = [
    { label: t('Perusahaan'), value: contact.company_name },
    { label: t('Jabatan'), value: contact.job_title },
    { label: 'Email', value: contact.email, href: contact.email ? `mailto:${contact.email}` : undefined },
    { label: t('Telepon'), value: contact.phone, href: contact.phone ? `https://wa.me/${contact.phone.replace(/[^0-9]/g, '')}` : undefined },
    { label: 'Instagram', value: contact.instagram, href: contact.instagram ? `https://instagram.com/${contact.instagram.replace(/^@/, '')}` : undefined },
    { label: t('Sumber'), value: SOURCE_LABEL[contact.source] },
    { label: t('Client Tier'), value: contact.client_tier },
    { label: t('Industri'), value: contact.industry },
    { label: t('Owner'), value: contact.owner_email },
    { label: t('Alamat'), value: contact.address },
    { label: t('Kota / Kabupaten'), value: contact.city },
    { label: t('Provinsi'), value: contact.province },
    { label: t('Negara'), value: contact.country },
    { label: t('Ditambahkan'), value: contact.created_at ? new Date(contact.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '' },
  ].filter(r => (r.value ?? '').toString().trim().length > 0)

  return (
    <>
      <div className="crm-detail-panel" ref={panelRef}
        style={{ height: '100%', maxHeight: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: 'var(--text3)', letterSpacing: 0.3, textTransform: 'uppercase' }}>{t('Detail Contact')}</span>
            <button onClick={() => setEdit(true)} style={btnGhost}>{t('Edit')}</button>
            <button onClick={onClose} aria-label={t('Tutup')} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text2)', cursor: 'pointer', fontSize: 17, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
            <span style={{ width: 46, height: 46, borderRadius: 12, background: CATEGORY_COLOR[contact.category], color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
              {(contact.name.trim()[0] || '?').toUpperCase()}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{contact.name}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <StageBadge label={CATEGORY_LABEL[contact.category]} color={CATEGORY_COLOR[contact.category]} />
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{contact.type === 'PERUSAHAAN' ? t('Perusahaan') : t('Individu')}</span>
              </div>
            </div>
          </div>
          <button onClick={() => setNewDeal(true)} style={{ ...btnPrimary, width: '100%', marginTop: 14 }}>+ Prospect</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Contact info */}
          <Panel title={t('Informasi Kontak')}>
            {info.map(r => (
              <div key={r.label} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ flex: '0 0 96px', fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>{r.label}</span>
                {r.href
                  ? <a href={r.href} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--link)', wordBreak: 'break-word', textDecoration: 'none' }}>{r.value}</a>
                  : <span style={{ flex: 1, minWidth: 0, fontSize: 13, wordBreak: 'break-word' }}>{r.value}</span>}
              </div>
            ))}
            {(contact.tags || []).length > 0 && (
              <div style={{ padding: '10px 0' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 6 }}>Tags</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {contact.tags.map(tg => <span key={tg} style={{ fontSize: 11.5, color: 'var(--text2)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 9px' }}>{tg}</span>)}
                </div>
              </div>
            )}
            {contact.notes && (
              <div style={{ padding: '10px 0' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 6 }}>{t('Catatan')}</div>
                <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{contact.notes}</div>
              </div>
            )}
          </Panel>

          {/* History */}
          <Panel title={`${t('Deals')} (${myDeals.length})`}>
            {myDeals.length === 0 ? <Empty text={t('Belum ada deal.')} /> : myDeals.map(d => (
              <button key={d.id} onClick={() => setEditDeal(d)} style={rowBtn}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{d.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>{formatRupiah(d.value)}</span>
                <StageBadge label={STAGE_LABEL[d.stage]} color={STAGE_COLOR[d.stage]} />
              </button>
            ))}
          </Panel>

          <Panel title={`${t('Projects')} (${myProjects.length})`}>
            {myProjects.length === 0 ? <Empty text={t('Belum ada project.')} /> : myProjects.map(p => (
              <Link key={p.id} href={`/crm/projects/${p.id}`} style={rowLink}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{PROJECT_STATUS_LABEL[p.status]}</span>
              </Link>
            ))}
          </Panel>

          <Panel title={`${t('Invoices')} (${myInvoices.length})`}>
            {myInvoices.length === 0 ? <Empty text={t('Belum ada invoice.')} /> : myInvoices.map(i => (
              <Link key={i.id} href={`/crm/invoices/${i.id}`} style={rowLink}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.number || t('Draft')}</span>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{formatRupiah(invoiceTotalOf(i.id, i.discount, i.tax_enabled))} · {INVOICE_STATUS_LABEL[i.status]}</span>
              </Link>
            ))}
          </Panel>
        </div>
      </div>

      {edit && <ContactFormModal open contact={contact} onClose={() => setEdit(false)} />}
      {newDeal && <DealFormModal open lockContactId={contact.id} onClose={() => setNewDeal(false)} />}
      {editDeal && <DealFormModal open deal={editDeal} lockContactId={editDeal.contact_id} onClose={() => setEditDeal(null)} />}
    </>
  )
}

const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer' }
const btnPrimary: React.CSSProperties = { background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: 'pointer' }
const rowBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 11px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, cursor: 'pointer', marginBottom: 6 }
const rowLink: React.CSSProperties = { ...rowBtn, textDecoration: 'none' }

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )
}
function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>{text}</div>
}
