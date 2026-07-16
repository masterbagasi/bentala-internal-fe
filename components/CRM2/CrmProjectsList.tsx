'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/lib/i18n/LanguageProvider'
import { formatRupiah } from '@/lib/utils'
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, PROJECT_STATUS_COLOR, invoiceTotals } from '@/lib/crm/schema'
import { CrmProjectFormModal } from './CrmProjectFormModal'
import { ClientProjectsBoard } from './ClientProjectsBoard'
import type { CrmProject } from '@/lib/types'

const initial = (v?: string | null) => (v && v.trim() ? v.trim()[0]!.toUpperCase() : '?')
const fmtDay = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })

/** View + Add-modal state are owned by the page (so the tabs live in PageHeader,
 *  like the SMM "All Project" view). This component just renders the content. */
export function CrmProjectsList({ view, addOpen, onAddOpenChange }: {
  view: 'board' | 'list'
  addOpen: boolean
  onAddOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const router = useRouter()
  const { crmProjects, crmInvoices, crmInvoiceItems, deals, contacts } = useStore(useShallow(s => ({ crmProjects: s.crmProjects, crmInvoices: s.crmInvoices, crmInvoiceItems: s.crmInvoiceItems, deals: s.deals, contacts: s.contacts })))
  const contactOf = useMemo(() => new Map(contacts.map(c => [c.id, c] as const)), [contacts])

  // Contract value derived like the board/detail: invoice total, else deal value, else stored.
  const valueOf = (p: CrmProject): number => {
    const invTot = crmInvoices.filter(i => i.project_id === p.id)
      .reduce((sum, inv) => sum + invoiceTotals(crmInvoiceItems.filter(it => it.invoice_id === inv.id), inv.discount ?? 0, !!inv.tax_enabled).total, 0)
    if (invTot > 0) return invTot
    return deals.find(d => d.id === p.deal_id)?.value || p.contract_value || 0
  }

  // A project is "fixed" and belongs here only once it has an invoice with
  // payment recorded (DP/Lunas). Deals flow Pipeline → Invoice → Projects; an
  // unpaid or un-invoiced project stays out of this list.
  const projects = useMemo(() => {
    const paid = new Set(
      crmInvoices
        .filter(i => i.project_id && (i.status === 'LUNAS' || i.status === 'SEBAGIAN' || (i.paid_amount || 0) > 0))
        .map(i => i.project_id as string),
    )
    return crmProjects.filter(p => paid.has(p.id))
  }, [crmProjects, crmInvoices])

  const byStatus = useMemo(() => {
    const m: Record<string, CrmProject[]> = {}
    for (const s of PROJECT_STATUSES) m[s] = []
    for (const p of projects) (m[p.status] ?? (m[p.status] = [])).push(p)
    return m
  }, [projects])

  // Add-project modal — rendered in both views (the Add button lives in the page header).
  const addModal = addOpen && <CrmProjectFormModal open onClose={() => onAddOpenChange(false)} onSaved={p => router.push(`/crm/projects/${p.id}`)} />

  // Board view — early return AFTER all hooks are called (Rules of Hooks).
  if (view === 'board') return <><ClientProjectsBoard />{addModal}</>

  const activeStatuses = PROJECT_STATUSES.filter(s => (byStatus[s] ?? []).length > 0)

  return (
    <div style={{ padding: 24 }}>
      {projects.length === 0 ? (
        <div style={{ display: 'grid', placeItems: 'center', gap: 14, textAlign: 'center', padding: '56px 24px', border: '1.5px dashed var(--border)', borderRadius: 16, background: 'var(--bg2)' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'var(--bg3)', color: 'var(--text3)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{t('Belum ada proyek berjalan')}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 440, lineHeight: 1.6 }}>{t('Proyek muncul di sini setelah deal-nya dibuatkan invoice dan pembayaran mulai masuk.')}</div>
          </div>
          <button onClick={() => router.push('/pipeline')} style={{ height: 38, padding: '0 16px', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t('Buka Pipeline')} →</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          {activeStatuses.map(status => {
            const list = byStatus[status] ?? []
            const color = PROJECT_STATUS_COLOR[status]
            const sum = list.reduce((n, p) => n + valueOf(p), 0)
            return (
              <section key={status} style={{ borderLeft: `2px solid ${color}`, paddingLeft: 16 }}>
                <header style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: color, marginLeft: -21, boxShadow: '0 0 0 3px var(--bg)' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color, letterSpacing: 0.2 }}>{PROJECT_STATUS_LABEL[status]}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 20, padding: '1px 8px', fontVariantNumeric: 'tabular-nums' }}>{list.length}</span>
                  {sum > 0 && <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{formatRupiah(sum)}</span>}
                </header>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {list.map(p => (
                    <ProjectCard key={p.id} p={p} color={color} value={valueOf(p)} contact={contactOf.get(p.contact_id ?? '')} onOpen={() => router.push(`/crm/projects/${p.id}`)} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {addModal}
    </div>
  )
}

function ProjectCard({ p, color, contact, value, onOpen }: {
  p: CrmProject
  color: string
  contact?: { name: string; company_name?: string | null }
  value: number
  onOpen: () => void
}) {
  const t = useT()
  const [hover, setHover] = useState(false)
  const client = contact ? (contact.company_name || contact.name) : null
  const services = p.services || []
  const team = Array.from(new Set([p.manager_email, ...(p.member_emails || [])].filter(Boolean) as string[]))
  const overdue = !!p.deadline && new Date(p.deadline) < new Date() && p.status !== 'SELESAI' && p.status !== 'BATAL'

  return (
    <button onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        textAlign: 'left', display: 'flex', flexDirection: 'column', minHeight: 168,
        background: 'var(--bg2)', borderRadius: 14, padding: 15, cursor: 'pointer',
        border: `1px solid ${hover ? 'color-mix(in srgb, var(--accent) 45%, var(--border))' : 'var(--border)'}`,
        boxShadow: hover ? '0 8px 22px rgba(0,0,0,0.18)' : 'none',
        transform: hover ? 'translateY(-2px)' : 'none',
        transition: 'transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease',
      }}>
      {/* Name */}
      <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, color: 'var(--text)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.name}</div>

      {/* Client */}
      {client && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7 }}>
          <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: 5, background: 'var(--bg3)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text2)' }}>{initial(client)}</span>
          <span style={{ fontSize: 12, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client}</span>
        </div>
      )}

      {/* Value */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 2 }}>{t('Nilai Kontrak')}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{formatRupiah(value)}</div>
      </div>

      {/* Services */}
      {services.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
          {services.slice(0, 2).map(s => (
            <span key={s} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text2)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s}</span>
          ))}
          {services.length > 2 && <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text3)', alignSelf: 'center' }}>+{services.length - 2}</span>}
        </div>
      )}

      {/* Footer: deadline + team, pinned to the bottom so cards line up */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 12 }}>
        {p.deadline ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, borderRadius: 8, padding: '3px 8px', whiteSpace: 'nowrap', color: overdue ? '#ff6b6b' : 'var(--text2)', background: overdue ? 'color-mix(in srgb, #ff6b6b 14%, var(--bg2))' : 'var(--bg3)', border: `1px solid ${overdue ? '#ff6b6b55' : 'var(--border)'}` }}>
            <CalIcon /> {fmtDay(p.deadline)}{overdue ? ` · ${t('lewat')}` : ''}
          </span>
        ) : <span style={{ fontSize: 11, color: 'var(--text3)' }}>{t('Tanpa deadline')}</span>}
        <span style={{ flex: 1 }} />
        {team.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {team.slice(0, 3).map((e, i) => (
              <span key={e} title={e} style={{ width: 22, height: 22, borderRadius: '50%', marginLeft: i ? -7 : 0, background: 'var(--bg3)', border: '2px solid var(--bg2)', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text2)' }}>{initial(e)}</span>
            ))}
            {team.length > 3 && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginLeft: 4 }}>+{team.length - 3}</span>}
          </div>
        )}
      </div>
    </button>
  )
}

function CalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
