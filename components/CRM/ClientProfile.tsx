'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/lib/i18n/LanguageProvider'
import { formatRupiah } from '@/lib/utils'
import { CRM_STAGES, STAGE_LABELS, SERVICE_OPTIONS } from '@/lib/constants'
import { ClientTimeline } from './ClientTimeline'
import { ClientTasks } from './ClientTasks'
import { ClientComms } from './ClientComms'

export function ClientProfile({ id, onClose }: { id: string; onClose?: () => void }) {
  const t = useT()
  const router = useRouter()
  // In a popup (onClose set) the modal frame owns the padding + close affordance;
  // as a full page it pads itself and shows a back-to-CRM link.
  const inModal = !!onClose
  const { clients, projects, invoices } = useStore(useShallow((s) => ({ clients: s.clients, projects: s.projects, invoices: s.invoices })))
  const client = clients.find(c => c.id === id)

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
  const stageColor = CRM_STAGES.find(s => s.key === client.stage)?.color ?? 'var(--text2)'

  return (
    <div style={{ padding: inModal ? 0 : 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!inModal && (
        <button onClick={() => router.push('/clients')} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>← {t('Kembali ke CRM')}</button>
      )}

      {/* Two-column on desktop, stacked on mobile via flexWrap. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Header */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{client.name}</span>
              <span style={{ fontSize: 12, color: stageColor, background: stageColor + '22', borderRadius: 20, padding: '2px 10px' }}>{STAGE_LABELS[client.stage] ?? client.stage}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', display: 'grid', gap: 4 }}>
              <div>{t('PIC')}: {client.pic || '—'} · {client.contact || '—'}</div>
              <div>{t('PIC Internal')}: {client.internal || '—'} · {t('Layanan')}: {serviceLabel}</div>
              {client.value > 0 && <div>{t('Nilai Deal')}: {formatRupiah(client.value)}</div>}
              {client.notes && <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{client.notes}</div>}
              <div>
                {t('Sumber')}: {client.source === 'website' ? 'Website' : client.source === 'referral' ? 'Referral' : 'Manual'}
                {client.lead_id && (
                  <>
                    {' · '}
                    <Link href="/website/leads" style={{ color: 'var(--accent)', textDecoration: 'none' }}>{t('dari Lead website')}</Link>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Financial summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <Kpi label={t('Total Deal')} value={formatRupiah(fin.total)} />
            <Kpi label={t('Dibayar')} value={formatRupiah(fin.paid)} color="var(--accent3)" />
            <Kpi label={t('Outstanding')} value={formatRupiah(fin.outstanding)} color="#ffc542" />
          </div>

          {/* Projects */}
          <Panel title={`${t('Project')} (${clientProjects.length})`}>
            {clientProjects.length === 0 ? <Empty t={t('Belum ada project.')} /> : clientProjects.map(p => (
              <Link key={p.id} href="/projects-all" style={rowStyle}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{p.status} · {p.progress}%</span>
              </Link>
            ))}
          </Panel>

          {/* Invoices */}
          <Panel title={`${t('Invoice')} (${clientInvoices.length})`}>
            {clientInvoices.length === 0 ? <Empty t={t('Belum ada invoice.')} /> : clientInvoices.map(i => (
              <Link key={i.id} href="/invoices" style={rowStyle}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.num} · {i.project}</span>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{formatRupiah(i.value)} · {i.status}</span>
              </Link>
            ))}
          </Panel>

          {/* Tasks */}
          <ClientTasks clientId={client.id} />

          {/* Communications */}
          <ClientComms client={client} />
        </div>

        {/* Timeline (added in Task 4) */}
        <div style={{ flex: '2 1 420px', minWidth: 0 }}>
          <ClientTimeline clientId={client.id} />
        </div>
      </div>
    </div>
  )
}

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)', fontSize: 13, marginBottom: 6 }

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
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
