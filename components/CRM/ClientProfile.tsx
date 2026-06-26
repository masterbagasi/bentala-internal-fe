'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'
import { formatRupiah } from '@/lib/utils'
import { SERVICE_OPTIONS } from '@/lib/constants'
import { ClientTimeline } from './ClientTimeline'
import { ClientFollowUps } from './ClientFollowUps'
import { InteractionComposer } from './InteractionComposer'
import { ContactDetails } from './ContactDetails'
import { StageSelect } from './StageSelect'

export function ClientProfile({ id, onClose }: { id: string; onClose?: () => void }) {
  const t = useT()
  const router = useRouter()
  // In a popup (onClose set) the modal frame owns the padding + close affordance;
  // as a full page it pads itself and shows a back-to-CRM link.
  const inModal = !!onClose
  const { clients, projects, invoices } = useStore(useShallow((s) => ({ clients: s.clients, projects: s.projects, invoices: s.invoices })))
  const client = clients.find(c => c.id === id)

  // The contact form's rich fields live on the linked bsi_leads row (set when
  // the contact was promoted via "+ Prospect"). Fetch it so Detail Client shows
  // the same content as Add Contact.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [leadRow, setLeadRow] = useState<any | null>(null)
  const leadId = client?.lead_id
  useEffect(() => {
    if (!leadId) { setLeadRow(null); return }
    let off = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(getSupabase() as any).from('bsi_leads').select('*').eq('id', leadId).maybeSingle()
      .then(({ data }: { data: unknown }) => { if (!off) setLeadRow(data) })
    return () => { off = true }
  }, [leadId])

  const clientProjects = useMemo(() => projects.filter(p => p.client_id === id), [projects, id])
  const clientInvoices = useMemo(() => invoices.filter(i => i.client_id === id), [invoices, id])
  const fin = useMemo(() => {
    const total = clientInvoices.reduce((n, i) => n + (i.value || 0), 0)
    const paid = clientInvoices.filter(i => i.status === 'paid').reduce((n, i) => n + (i.value || 0), 0)
    return { total, paid, outstanding: total - paid }
  }, [clientInvoices])

  if (!client) {
    return <div style={{ padding: 24, color: 'var(--text2)' }}>{t('Client tidak ditemukan.')} <button onClick={() => router.push('/clients')} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>← {t('Kembali ke CRM')}</button></div>
  }

  const serviceLabel = SERVICE_OPTIONS.find(o => o.value === client.service)?.label ?? client.service
  const initials = String(client.name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  const cIsEmail = (client.contact || '').includes('@')
  const contactHref = !client.contact ? null : cIsEmail ? `mailto:${client.contact}` : `https://wa.me/${(client.contact || '').replace(/[^\d]/g, '')}`

  return (
    <div style={{ flex: 1, height: '100%', minHeight: 0, boxSizing: 'border-box', padding: inModal ? 0 : 24, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
      {/* Top bar (full page only) — breadcrumb left; editable status + back on the
          right. In a modal the status lives in the modal header (headerRight). */}
      {!inModal && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <button onClick={() => router.push('/clients')} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', padding: 0, fontSize: 12.5 }}>CRM</button>
            <span>›</span>
            <span style={{ color: 'var(--text2)' }}>{t('Detail Client')}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StageSelect client={client} />
            <button onClick={() => router.push('/clients')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 9, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← {t('Kembali')}</button>
          </div>
        </div>
      )}

      {/* Header card */}
      <div style={{ flexShrink: 0, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 700, color: 'var(--accent)', background: 'rgba(108,99,255,0.14)', border: '1px solid rgba(108,99,255,0.28)' }}>{initials}</div>
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, color: 'var(--text)', wordBreak: 'break-word' }}>{client.name}</div>
            <div style={{ marginTop: 12 }}>
              {/* Compact label/value facts — packed left, only those with a value. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 36px' }}>
                {client.pic && <Meta label={t('PIC')} value={client.pic} />}
                {client.contact && <Meta label={t('Kontak')} value={client.contact} />}
                {client.internal && <Meta label={t('PIC Internal')} value={client.internal} />}
                {serviceLabel && <Meta label={t('Layanan')} value={serviceLabel} />}
                <Meta label={t('Sumber')} value={client.source === 'website' ? 'Website' : client.source === 'referral' ? 'Referral' : 'Manual'} />
              </div>
              {client.notes && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 4 }}>{t('Catatan')}</div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{client.notes}</div>
                </div>
              )}
            </div>
          </div>
          {contactHref && (
            <a href={contactHref} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, height: 36, padding: '0 16px', background: cIsEmail ? 'var(--accent)' : '#25D366', color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              {cIsEmail ? t('Kirim Email') : t('Buka WhatsApp')}
            </a>
          )}
        </div>
      </div>

      {/* Quick-fact stat cards */}
      <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <StatCard label={t('Total Deal')} value={formatRupiah(fin.total)} accent="#6c63ff" />
        <StatCard label={t('Dibayar')} value={formatRupiah(fin.paid)} accent="#43d9a2" />
        <StatCard label={t('Outstanding')} value={formatRupiah(fin.outstanding)} accent="#ffc542" />
        <StatCard label={t('Project')} value={String(clientProjects.length)} accent="#54a0ff" />
      </div>

      {/* Content fills the remaining height as two independent scroll columns —
          the page itself never scrolls; each column scrolls inside. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16, alignItems: 'stretch', overflow: 'hidden' }}>
        {/* Left column — scrolls as one pane: composer, deal info, then history. */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, paddingRight: 2 }}>
          {/* Record an interaction (primary action). */}
          <InteractionComposer clientId={client.id} />
          {/* Project + Invoice, side by side. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <Panel title={`${t('Project')} (${clientProjects.length})`}>
              {clientProjects.length === 0 ? <Empty t={t('Belum ada project.')} /> : clientProjects.map(p => (
                <Link key={p.id} href="/projects-all" style={rowStyle}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>{p.status} · {p.progress}%</span>
                </Link>
              ))}
            </Panel>
            <Panel title={`${t('Invoice')} (${clientInvoices.length})`}>
              {clientInvoices.length === 0 ? <Empty t={t('Belum ada invoice.')} /> : clientInvoices.map(i => (
                <Link key={i.id} href="/invoices" style={rowStyle}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.num} · {i.project}</span>
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>{formatRupiah(i.value)} · {i.status}</span>
                </Link>
              ))}
            </Panel>
          </div>
          {/* Follow-up — its own box, separate from the history. */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
            <ClientFollowUps clientId={client.id} />
          </div>
          {/* Riwayat Interaksi — inside its own box, like the other panels. */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
            <ClientTimeline clientId={client.id} />
          </div>
        </div>

        {/* Right column — contact, full height, scrolls inside its own box. */}
        <div style={{ flex: '0 0 320px', minHeight: 0, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0, fontSize: 13, fontWeight: 600 }}>{t('Informasi Kontak')}</div>
          <div style={{ padding: 14, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {/* Full readout; this box scrolls inside one screen (the page itself
                doesn't scroll), so all fields stay available. */}
            <ContactDetails lead={leadRow ?? {}} hideHeader showEmpty />
          </div>
        </div>
      </div>
    </div>
  )
}

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)', fontSize: 13, marginBottom: 6 }

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: 'var(--text)', wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ position: 'relative', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', overflow: 'hidden', minWidth: 0 }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent }} />
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value || '—'}</div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )
}

function Empty({ t }: { t: string }) {
  return <div style={{ fontSize: 12, color: 'var(--text2)' }}>{t}</div>
}
