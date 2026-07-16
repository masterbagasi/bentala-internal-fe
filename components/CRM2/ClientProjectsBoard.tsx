'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'
import { formatRupiah } from '@/lib/utils'
import { useSocmedProjects } from '@/lib/socmed-projects'
import { ConfirmDialog } from '@/components/shared/Modal'
import type { CrmProject, CrmProjectStatus } from '@/lib/types'
import { invoiceTotals } from '@/lib/crm/schema'
import { promoteContactToClient } from '@/lib/crm/promoteClient'

type Col = 'WAITING' | 'TODO' | 'ONPROGRESS' | 'DONE' | 'CANCELED'

const COLS: { key: Col; label: string; color: string; hint: string }[] = [
  { key: 'WAITING', label: 'Waiting', color: '#8b8fa8', hint: 'Invoice terkirim, belum dibayar' },
  { key: 'TODO', label: 'To Do', color: '#5b9bd5', hint: 'Sudah dibayar — siap digarap' },
  { key: 'ONPROGRESS', label: 'On Progress', color: '#c084fc', hint: 'Sedang dikerjakan' },
  { key: 'DONE', label: 'Done', color: '#43d9a2', hint: 'Selesai' },
  { key: 'CANCELED', label: 'Canceled', color: '#ff6b6b', hint: 'Dibatalkan' },
]
// Board column → stored crm_projects.status. Waiting/To Do are auto-derived from
// invoice payment, so both map back to BELUM_MULAI when dropped there.
const COL_STATUS: Record<Col, CrmProjectStatus> = { WAITING: 'BELUM_MULAI', TODO: 'BELUM_MULAI', ONPROGRESS: 'BERJALAN', DONE: 'SELESAI', CANCELED: 'BATAL' }

const initial = (v?: string | null) => (v && v.trim() ? v.trim()[0]!.toUpperCase() : '?')

export function ClientProjectsBoard({ header }: { header?: ReactNode } = {}) {
  const t = useT()
  const router = useRouter()
  const { crmProjects, crmInvoices, crmInvoiceItems, deals, contacts, upsertCrmProject, removeCrmProject } = useStore(useShallow(s => ({
    crmProjects: s.crmProjects, crmInvoices: s.crmInvoices, crmInvoiceItems: s.crmInvoiceItems, deals: s.deals, contacts: s.contacts, upsertCrmProject: s.upsertCrmProject, removeCrmProject: s.removeCrmProject,
  })))
  const brands = useSocmedProjects()
  const brandBySlug = useMemo(() => new Map(brands.map(b => [b.slug, b] as const)), [brands])
  const contactOf = useMemo(() => new Map(contacts.map(c => [c.id, c] as const)), [contacts])
  const invByProject = useMemo(() => {
    const m = new Map<string, typeof crmInvoices>()
    for (const i of crmInvoices) { if (!i.project_id) continue; (m.get(i.project_id) ?? m.set(i.project_id, []).get(i.project_id)!).push(i) }
    return m
  }, [crmInvoices])

  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<Col | null>(null)
  const [infoCol, setInfoCol] = useState<Col | null>(null) // which column's info popover is open
  // Close the info popover on any outside click / Escape.
  useEffect(() => {
    if (!infoCol) return
    const close = () => setInfoCol(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setInfoCol(null) }
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey) }
  }, [infoCol])
  const [linkFor, setLinkFor] = useState<CrmProject | null>(null) // create-tracking confirm (On Progress)
  const [busy, setBusy] = useState(false)
  const [delFor, setDelFor] = useState<CrmProject | null>(null) // delete-contract confirm
  const [delBusy, setDelBusy] = useState(false)

  // Delete a contract from the board. Its manual tasks go too; linked invoices
  // are unlinked (project_id → null via FK), not deleted, so finances are kept.
  async function deleteContract() {
    if (!delFor) return
    setDelBusy(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = getSupabase() as any
    await s.from('crm_tasks').delete().eq('project_id', delFor.id)
    const { error } = await s.from('crm_projects').delete().eq('id', delFor.id)
    setDelBusy(false)
    if (error) { alert(t('Gagal menghapus contract') + ': ' + error.message); return }
    removeCrmProject(delFor.id)
    setDelFor(null)
  }

  // Contract value is derived like the detail page: sum the project's invoice
  // totals (what's billed), else the linked deal's pipeline value, else stored.
  const valueOf = (p: CrmProject): number => {
    const invs = invByProject.get(p.id) ?? []
    const invoiceTotal = invs.reduce((sum, inv) => {
      const items = crmInvoiceItems.filter(it => it.invoice_id === inv.id)
      return sum + invoiceTotals(items, inv.discount ?? 0, !!inv.tax_enabled).total
    }, 0)
    if (invoiceTotal > 0) return invoiceTotal
    const deal = deals.find(d => d.id === p.deal_id)
    return deal?.value || p.contract_value || 0
  }

  // Tracking project name = the client's brand/company (else contact name).
  const brandNameOf = (p: CrmProject) => {
    const c = contactOf.get(p.contact_id ?? '')
    return ((c?.company_name || c?.name || p.name) || '').trim()
  }

  const colOf = (p: CrmProject): Col => {
    if (p.status === 'BATAL') return 'CANCELED'
    if (p.status === 'SELESAI') return 'DONE'
    if (p.status === 'BERJALAN' || p.status === 'REVIEW' || p.status === 'ON_HOLD') return 'ONPROGRESS'
    // BELUM_MULAI → derive from invoice payment
    const invs = invByProject.get(p.id) ?? []
    const paid = invs.some(i => i.status === 'LUNAS' || i.status === 'SEBAGIAN' || (i.paid_amount || 0) > 0)
    return paid ? 'TODO' : 'WAITING'
  }

  // Only projects that already have an invoice (or were manually advanced) appear.
  const byCol = useMemo(() => {
    const m: Record<Col, CrmProject[]> = { WAITING: [], TODO: [], ONPROGRESS: [], DONE: [], CANCELED: [] }
    for (const p of crmProjects) {
      const hasInvoice = (invByProject.get(p.id)?.length ?? 0) > 0
      const manual = ['BERJALAN', 'SELESAI', 'BATAL', 'REVIEW', 'ON_HOLD'].includes(p.status)
      if (!hasInvoice && !manual) continue
      m[colOf(p)].push(p)
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crmProjects, invByProject])

  async function persist(p: CrmProject, patch: Partial<CrmProject>) {
    upsertCrmProject({ ...p, ...patch } as CrmProject)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (getSupabase() as any).from('crm_projects').update(patch).eq('id', p.id)
    if (error) { upsertCrmProject(p); alert(t('Gagal memindahkan') + ': ' + error.message) }
  }

  async function moveTo(p: CrmProject, col: Col) {
    if (colOf(p) === col) return
    // Moving to On Progress spins up a NEW socmed tracking project (brand) for it.
    if (col === 'ONPROGRESS') {
      if (p.socmed_slug) { await persist(p, { status: 'BERJALAN' }); promoteContactToClient(p.contact_id); return }
      setLinkFor(p) // confirm creating the tracking project
      return
    }
    await persist(p, { status: COL_STATUS[col] })
  }

  // Create a brand-new socmed project (appears in the SMM menu) and attach it.
  async function confirmCreate() {
    if (!linkFor) return
    const name = brandNameOf(linkFor)
    if (!name) return
    setBusy(true)
    try {
      const res = await fetch('/api/socmed-projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, grantAccess: true }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.project?.slug) { alert(t('Gagal membuat project tracking') + ': ' + (json.error || res.status)); return }
      await persist(linkFor, { status: 'BERJALAN', socmed_slug: json.project.slug as string })
      promoteContactToClient(linkFor.contact_id)
      setLinkFor(null)
    } finally { setBusy(false) }
  }

  const draggedRef = useState({ v: false })[0]

  return (
    <div style={{ padding: 24 }}>
      {header}
      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', alignItems: 'flex-start', margin: '0 -24px', padding: '0 24px 8px', scrollPaddingLeft: 24 }}>
        {COLS.map(c => {
          const list = byCol[c.key]
          const sum = list.reduce((n, p) => n + valueOf(p), 0)
          const isOver = overCol === c.key
          return (
            <div key={c.key} data-col-key={c.key}
              onDragOver={e => { e.preventDefault(); setOverCol(c.key) }}
              onDragLeave={() => setOverCol(o => (o === c.key ? null : o))}
              onDrop={e => {
                e.preventDefault(); setOverCol(null)
                const p = crmProjects.find(x => x.id === dragId); setDragId(null)
                if (p) moveTo(p, c.key)
              }}
              style={{ flex: '0 0 280px', width: 280, background: isOver ? 'color-mix(in srgb, ' + c.color + ' 12%, var(--bg2))' : 'var(--bg2)', border: `1px solid ${isOver ? c.color : 'var(--border)'}`, borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: c.color }}>{c.label}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 20, padding: '1px 8px', fontVariantNumeric: 'tabular-nums' }}>{list.length}</span>
                <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                  <button type="button" aria-label={c.hint}
                    onClick={e => { e.stopPropagation(); setInfoCol(o => (o === c.key ? null : c.key)) }}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, padding: 0, borderRadius: '50%', border: `1px solid ${infoCol === c.key ? c.color : 'var(--border)'}`, background: infoCol === c.key ? c.color : 'transparent', color: infoCol === c.key ? '#fff' : 'var(--text3)', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontStyle: 'italic', fontFamily: 'Georgia, serif', lineHeight: 1 }}>i</button>
                  {infoCol === c.key && (
                    <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, width: 180, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', boxShadow: '0 6px 20px rgba(0,0,0,0.28)', fontSize: 11, color: 'var(--text2)', lineHeight: 1.5, fontWeight: 400 }}>{c.hint}</div>
                  )}
                </span>
                {sum > 0 && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{formatRupiah(sum)}</span>}
              </div>

              {list.length === 0 && (
                <div style={{ display: 'grid', placeItems: 'center', gap: 6, textAlign: 'center', padding: '22px 10px', border: `1.5px dashed ${isOver ? c.color : 'var(--border)'}`, borderRadius: 10, color: 'var(--text3)', background: isOver ? `color-mix(in srgb, ${c.color} 8%, transparent)` : 'transparent', transition: 'background .12s, border-color .12s' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /></svg>
                  <span style={{ fontSize: 11, fontWeight: 500 }}>{t('Kosong')}</span>
                </div>
              )}

              {list.map(p => {
                const c2 = contactOf.get(p.contact_id ?? '')
                const client = c2 ? (c2.company_name || c2.name) : null
                const brand = p.socmed_slug ? brandBySlug.get(p.socmed_slug) : undefined
                const services = p.services || []
                const isPicked = dragId === p.id
                return (
                  <div key={p.id}
                    draggable
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; draggedRef.v = false; setDragId(p.id) }}
                    onDragEnd={() => { draggedRef.v = true; setDragId(null); setOverCol(null) }}
                    onClick={() => { if (!draggedRef.v && !isPicked) router.push(`/crm/projects/${p.id}`) }}
                    style={{ position: 'relative', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, cursor: 'grab', opacity: isPicked ? 0.5 : 1, userSelect: 'none' }}>
                    <button draggable={false}
                      onClick={e => { e.stopPropagation(); setDelFor(p) }}
                      title={t('Hapus contract')}
                      style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, display: 'grid', placeItems: 'center', padding: 0, borderRadius: 6, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)', cursor: 'pointer' }}
                      onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = '#ff6b6b'; (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, #ff6b6b 45%, var(--border))' }}
                      onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', paddingRight: 28 }}>{p.name}</div>
                    {client && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <span style={{ width: 17, height: 17, flexShrink: 0, borderRadius: 5, background: 'var(--bg2)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', fontSize: 9.5, fontWeight: 700, color: 'var(--text2)' }}>{initial(client)}</span>
                        <span style={{ fontSize: 11.5, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client}</span>
                      </div>
                    )}
                    <div style={{ marginTop: 9, fontSize: 14, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{formatRupiah(valueOf(p))}</div>
                    {services.length > 0 && (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
                        {services.slice(0, 2).map(s => (
                          <span key={s} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text2)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s}</span>
                        ))}
                        {services.length > 2 && <span style={{ fontSize: 10.5, color: 'var(--text3)', alignSelf: 'center' }}>+{services.length - 2}</span>}
                      </div>
                    )}
                    {/* On Progress: linked socmed brand — click opens its tracking (Projects) view */}
                    {c.key === 'ONPROGRESS' && brand && (
                      <button draggable={false}
                        onClick={e => { e.stopPropagation(); router.push(`/smm/${brand.slug}`) }}
                        title={t('Buka tracking') + ' — ' + brand.name}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 9, fontSize: 11, fontWeight: 600, cursor: 'pointer', color: 'var(--text)', background: `color-mix(in srgb, ${brand.color || '#6c63ff'} 14%, var(--bg2))`, border: `1px solid color-mix(in srgb, ${brand.color || '#6c63ff'} 40%, var(--border))`, borderRadius: 8, padding: '3px 9px' }}>
                        <span>{brand.glyph || '📣'}</span> {brand.name} <span style={{ color: 'var(--text3)' }}>· tracking</span>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Confirm creating a socmed tracking project when moving to On Progress */}
      <ConfirmDialog
        open={!!linkFor}
        title={t('Pindahkan ke On Progress?')}
        message={linkFor ? `${t('Project tracking')} “${brandNameOf(linkFor)}” ${t('akan dibuat di menu Project Socmed, lalu project ini pindah ke On Progress.')}` : ''}
        confirmLabel={busy ? t('Memproses…') : t('Ya, Pindahkan')}
        cancelLabel={t('Batal')}
        onConfirm={confirmCreate}
        onCancel={() => { if (!busy) setLinkFor(null) }}
      />

      {/* Confirm deleting a contract from the board */}
      <ConfirmDialog
        open={!!delFor}
        danger
        title={t('Hapus contract?')}
        message={delFor
          ? (crmInvoices.some(i => i.project_id === delFor.id)
            ? t('Contract ini punya invoice terkait. Invoice tidak ikut terhapus, hanya dilepas. Lanjut hapus?')
            : `“${delFor.name}” ${t('akan dihapus permanen. Lanjut?')}`)
          : ''}
        confirmLabel={delBusy ? t('Menghapus…') : t('Hapus')}
        cancelLabel={t('Batal')}
        onConfirm={deleteContract}
        onCancel={() => { if (!delBusy) setDelFor(null) }}
      />
    </div>
  )
}
