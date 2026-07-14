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

export function CrmProjectsList() {
  const t = useT()
  const router = useRouter()
  const { crmProjects, crmInvoices, crmInvoiceItems, deals, contacts } = useStore(useShallow(s => ({ crmProjects: s.crmProjects, crmInvoices: s.crmInvoices, crmInvoiceItems: s.crmInvoiceItems, deals: s.deals, contacts: s.contacts })))
  const [add, setAdd] = useState(false)
  const [view, setView] = useState<'list' | 'board'>('board')
  const contactOf = useMemo(() => new Map(contacts.map(c => [c.id, c] as const)), [contacts])

  // Contract value derived like the board/detail: invoice total, else deal value, else stored.
  const valueOf = (p: CrmProject): number => {
    const invTot = crmInvoices.filter(i => i.project_id === p.id)
      .reduce((sum, inv) => sum + invoiceTotals(crmInvoiceItems.filter(it => it.invoice_id === inv.id), inv.discount ?? 0, !!inv.tax_enabled).total, 0)
    if (invTot > 0) return invTot
    return deals.find(d => d.id === p.deal_id)?.value || p.contract_value || 0
  }

  const toggle = (
    <div style={{ display: 'inline-flex', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, gap: 3 }}>
      {(['board', 'list'] as const).map(v => (
        <button key={v} onClick={() => setView(v)}
          style={{ padding: '5px 14px', fontSize: 12.5, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', background: view === v ? 'var(--bg2)' : 'transparent', color: view === v ? 'var(--text)' : 'var(--text3)' }}>
          {v === 'board' ? t('Board') : t('List')}
        </button>
      ))}
    </div>
  )

  if (view === 'board') {
    return (
      <div>
        <div style={{ padding: '18px 24px 0' }}>{toggle}</div>
        <ClientProjectsBoard />
      </div>
    )
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

  const totalValue = useMemo(() => projects.reduce((n, p) => n + valueOf(p), 0), [projects]) // eslint-disable-line react-hooks/exhaustive-deps
  const activeStatuses = PROJECT_STATUSES.filter(s => (byStatus[s] ?? []).length > 0)

  return (
    <div style={{ padding: 24 }}>
      {/* ── Summary header ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap', marginBottom: 22 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>{t('Ringkasan Proyek')}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{projects.length}</span>
            <span style={{ fontSize: 13.5, color: 'var(--text2)' }}>{t('proyek')}</span>
            {totalValue > 0 && (
              <span style={{ fontSize: 13.5, color: 'var(--text3)' }}>· {formatRupiah(totalValue)} {t('total nilai kontrak')}</span>
            )}
          </div>
          {/* Status distribution bar — width per segment tracks project count. */}
          {activeStatuses.length > 0 && (
            <div style={{ display: 'flex', gap: 3, marginTop: 12, height: 6, width: 260, maxWidth: '100%' }}>
              {activeStatuses.map(s => (
                <div key={s} title={`${PROJECT_STATUS_LABEL[s]}: ${(byStatus[s] ?? []).length}`}
                  style={{ flex: (byStatus[s] ?? []).length, background: PROJECT_STATUS_COLOR[s], borderRadius: 3, minWidth: 6 }} />
              ))}
            </div>
          )}
        </div>
        <span style={{ flex: 1 }} />
        {toggle}
        <button onClick={() => setAdd(true)}
          style={{ height: 40, padding: '0 18px', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> {t('Tambah Project')}
        </button>
      </div>

      {projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text2)', border: '1px dashed var(--border)', borderRadius: 14 }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>📁</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{t('Belum ada proyek berjalan')}</div>
          {t('Proyek muncul di sini setelah deal-nya dibuatkan invoice dan pembayaran mulai masuk. Buat invoice dari Pipeline.')}
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

      {add && <CrmProjectFormModal open onClose={() => setAdd(false)} onSaved={p => router.push(`/crm/projects/${p.id}`)} />}
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
