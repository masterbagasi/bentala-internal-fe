'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useStore } from '@/hooks/useStore'
import { useWebsiteLeadSync } from '@/hooks/useWebsiteLeadSync'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'
import { useLogActivity } from '@/hooks/useData'
import { formatRupiah } from '@/lib/utils'
import { ConfirmDialog, Modal } from '@/components/shared/Modal'
import { DEAL_STAGES, DEAL_OPEN_STAGES, STAGE_LABEL, STAGE_COLOR, LOST_REASON_LABEL } from '@/lib/crm/schema'
import { DealFormModal } from './DealFormModal'
import { DealLostModal } from './DealLostModal'
import { PipelineActivity, PIPELINE_SCOPE } from './ContactsActivity'
import type { Deal, DealStage, CrmInvoice } from '@/lib/types'

// Short explanation of each pipeline stage — shown in the per-column info popup.
const STAGE_INFO: Record<string, string> = {
  prospect: 'Prospek baru yang belum dikualifikasi. Kontak awal masuk ke sini.',
  contacted: 'Sudah dihubungi — menunggu respons atau penjadwalan lanjutan.',
  qualified: 'Kebutuhan & anggaran sudah tervalidasi — layak dilanjutkan.',
  discovery: 'Pertemuan penggalian kebutuhan untuk menyusun solusi.',
  proposal: 'Penawaran/proposal sudah dikirim, menunggu tanggapan.',
  negotiation: 'Sedang membahas harga, scope, atau termin sebelum deal ditutup.',
  won: 'Deal disetujui. Project (CRM) & brand socmed otomatis dibuat.',
  lost: 'Deal batal atau ditolak. Alasan dicatat untuk evaluasi.',
  client: 'Sudah menjadi klien aktif — hubungan berjalan/berulang.',
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function DealsPipeline() {
  const t = useT()
  // Auto-pull public-website leads into the pipeline (prospects + contacts).
  useWebsiteLeadSync()
  const logActivity = useLogActivity()
  const { deals, contacts, crmProjects, crmInvoices, upsertDeal, removeDeal } = useStore(useShallow(s => ({ deals: s.deals, contacts: s.contacts, crmProjects: s.crmProjects, crmInvoices: s.crmInvoices, upsertDeal: s.upsertDeal, removeDeal: s.removeDeal })))
  // Deal → its project → invoice. Board only *previews* an existing invoice
  // (read-only link); creating one happens from the deal detail modal.
  const invoiceByDeal = useMemo(() => {
    const projById = new Map(crmProjects.map(p => [p.id, p] as const))
    const m = new Map<string, CrmInvoice>()
    for (const inv of crmInvoices) {
      const p = inv.project_id ? projById.get(inv.project_id) : null
      if (p?.deal_id && !m.has(p.deal_id)) m.set(p.deal_id, inv)
    }
    return m
  }, [crmProjects, crmInvoices])
  const [add, setAdd] = useState<{ stage?: DealStage } | null>(null)
  const [edit, setEdit] = useState<Deal | null>(null)
  const [lost, setLost] = useState<Deal | null>(null)
  const [won, setWon] = useState<Deal | null>(null)
  const [wonBusy, setWonBusy] = useState(false)
  const [del, setDel] = useState<Deal | null>(null)
  const [delBusy, setDelBusy] = useState(false)
  const [infoStage, setInfoStage] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  // Multi-select: pick deals across columns, then bulk-delete.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [confirmBulkDel, setConfirmBulkDel] = useState(false)
  const selectedCount = selectedIds.size
  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function exitSelect() { setSelectMode(false); setSelectedIds(new Set()) }
  async function confirmDeleteSelected() {
    const ids = Array.from(selectedIds)
    if (!ids.length) { setConfirmBulkDel(false); return }
    const blocked = ids.filter(id => dealDependents(id).blocked)
    if (blocked.length) {
      alert(t('Tidak bisa dihapus: ') + blocked.length + t(' deal terpilih sudah punya contract/invoice. Lepas invoice & contract-nya dulu.'))
      setConfirmBulkDel(false)
      return
    }
    setBulkBusy(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (getSupabase() as any).from('deals').delete().in('id', ids)
      if (error) throw error
      ids.forEach(id => removeDeal(id))
      setConfirmBulkDel(false)
      exitSelect()
    } catch (e) {
      alert('Gagal menghapus: ' + ((e as { message?: string })?.message || 'coba lagi'))
    } finally { setBulkBusy(false) }
  }

  const nameOf = useMemo(() => {
    const m = new Map(contacts.map(c => [c.id, c] as const))
    return (id: string) => m.get(id)
  }, [contacts])

  // A deal can't be deleted once it has a Contract (project) or Invoice — those
  // would be orphaned. Count dependents so we can block with a clear message.
  const dealDependents = (dealId: string) => {
    const projs = crmProjects.filter(p => p.deal_id === dealId)
    const projIds = new Set(projs.map(p => p.id))
    const invs = crmInvoices.filter(i => i.project_id != null && projIds.has(i.project_id))
    return { projects: projs.length, invoices: invs.length, blocked: projs.length > 0 || invs.length > 0 }
  }

  const byStage = useMemo(() => {
    const m: Record<string, Deal[]> = {}
    for (const s of DEAL_STAGES) m[s] = []
    for (const d of deals) (m[d.stage] ?? (m[d.stage] = [])).push(d)
    return m
  }, [deals])

  const today = todayISO()

  // Move a deal to a stage. Open stages update directly; won/lost route to
  // their dialogs (won auto-creates project + brand via the DB trigger).
  async function moveTo(deal: Deal, stage: DealStage) {
    if (deal.stage === stage) return
    if (stage === 'lost') { setLost(deal); return }
    if (stage === 'won') { setWon(deal); return }
    upsertDeal({ ...deal, stage } as Deal) // optimistic
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (getSupabase() as any).from('deals').update({ stage }).eq('id', deal.id)
    if (error) { upsertDeal(deal); return }
    logActivity(`Deal "${deal.name}" dipindah ke ${STAGE_LABEL[stage]}`, PIPELINE_SCOPE)
  }

  // ── Mobile long-press touch drag (same pattern as the old CRM board) ──
  const boardRef = useRef<HTMLDivElement>(null)
  const draggedRef = useRef(false)
  const touchRef = useRef<{ deal: Deal; startX: number; startY: number; dragging: boolean; overCol: string | null; timer: ReturnType<typeof setTimeout> | null } | null>(null)
  const liveRef = useRef({ moveTo })
  liveRef.current = { moveTo }

  function startTouchDrag(deal: Deal, e: React.TouchEvent) {
    const tch = e.touches[0]
    if (!tch) return
    const st = { deal, startX: tch.clientX, startY: tch.clientY, dragging: false, overCol: null as string | null, timer: null as ReturnType<typeof setTimeout> | null }
    st.timer = setTimeout(() => {
      if (touchRef.current !== st) return
      st.dragging = true
      setDragId(deal.id)
      try { navigator.vibrate?.(12) } catch { /* not supported */ }
    }, 200)
    touchRef.current = st
  }

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const clear = () => {
      const st = touchRef.current
      if (st?.timer) clearTimeout(st.timer)
      if (st?.dragging) { setDragId(null); setOverCol(null) }
      touchRef.current = null
    }
    const onMove = (e: TouchEvent) => {
      const st = touchRef.current
      if (!st) return
      const tch = e.touches[0]
      if (!tch) return
      if (!st.dragging) {
        if (Math.abs(tch.clientX - st.startX) > 12 || Math.abs(tch.clientY - st.startY) > 12) clear()
        return
      }
      e.preventDefault()
      const tEl = document.elementFromPoint(tch.clientX, tch.clientY) as HTMLElement | null
      const key = tEl?.closest('[data-col-key]')?.getAttribute('data-col-key') ?? null
      st.overCol = key
      setOverCol(key)
    }
    const onEnd = (e: TouchEvent) => {
      const st = touchRef.current
      if (st?.dragging) {
        e.preventDefault()
        if (st.overCol && st.deal.stage !== st.overCol) liveRef.current.moveTo(st.deal, st.overCol as DealStage)
      }
      clear()
    }
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: false })
    el.addEventListener('touchcancel', clear)
    return () => {
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', clear)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function confirmWon() {
    if (!won) return
    setWonBusy(true)
    upsertDeal({ ...won, stage: 'won' } as Deal) // optimistic; trigger fills project_id/socmed_slug
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (getSupabase() as any).from('deals').update({ stage: 'won' }).eq('id', won.id)
    setWonBusy(false)
    if (error) { upsertDeal(won); return }
    logActivity(`Deal "${won.name}" ditandai Won`, PIPELINE_SCOPE)
    setWon(null)
  }

  async function confirmDelete() {
    if (!del) return
    const dep = dealDependents(del.id)
    if (dep.blocked) {
      alert(t('Tidak bisa dihapus: deal ini sudah punya contract/invoice terkait. Hapus invoice & contract-nya dulu.'))
      setDel(null)
      return
    }
    setDelBusy(true)
    const snapshot = del
    removeDeal(del.id) // optimistic
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (getSupabase() as any).from('deals').delete().eq('id', del.id)
    setDelBusy(false)
    if (error) { upsertDeal(snapshot); return } // rollback
    logActivity(`Deal dihapus: "${snapshot.name}"`, PIPELINE_SCOPE)
    setDel(null)
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>{t('Total deal')}: <strong style={{ color: 'var(--text)' }}>{deals.length}</strong></div>
        <div style={{ flex: 1 }} />
        {selectMode ? (
          <>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', padding: '0 4px', whiteSpace: 'nowrap' }}>{selectedCount} dipilih</span>
            <button onClick={() => setConfirmBulkDel(true)} disabled={bulkBusy || selectedCount === 0} title="Hapus deal terpilih" style={{ height: 38, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b55', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: bulkBusy || selectedCount === 0 ? 'default' : 'pointer', opacity: bulkBusy || selectedCount === 0 ? 0.5 : 1, whiteSpace: 'nowrap' }}>🗑 Hapus</button>
            <button onClick={exitSelect} disabled={bulkBusy} title="Keluar mode pilih" style={{ height: 38, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>✕ Batal</button>
          </>
        ) : (
          <>
            <PipelineActivity />
            <button onClick={() => setSelectMode(true)} title="Pilih beberapa deal untuk dihapus" style={{ height: 38, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>☑ Pilih</button>
            <button onClick={() => setAdd({})} style={{ height: 38, padding: '0 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Prospect</button>
          </>
        )}
      </div>

      {/* Kanban — full-bleed scroll row: break out of the page padding, then pad
          INSIDE the scroll container so the first/last column never gets clipped. */}
      <div ref={boardRef} style={{ display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -24px', padding: '0 24px 8px', alignItems: 'flex-start', scrollPaddingLeft: 24 }}>
        {DEAL_STAGES.map(stage => {
          const list = byStage[stage] ?? []
          const color = STAGE_COLOR[stage]
          const isOver = overCol === stage && !!dragId
          return (
            <div
              key={stage}
              data-col-key={stage}
              onDragOver={e => { e.preventDefault(); if (overCol !== stage) setOverCol(stage) }}
              onDrop={e => { e.preventDefault(); const d = deals.find(x => x.id === dragId); setDragId(null); setOverCol(null); if (d && d.stage !== stage) moveTo(d, stage as DealStage) }}
              style={{
                minWidth: 265, maxWidth: 265, flexShrink: 0,
                background: isOver ? `${color}14` : 'var(--bg2)',
                border: `1px solid ${isOver ? color : 'var(--border)'}`,
                borderRadius: 12, padding: '14px 12px 10px',
                boxShadow: isOver ? `0 0 0 2px ${color}55` : 'none',
                transition: 'border-color 0.12s, background 0.12s, box-shadow 0.12s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ fontWeight: 600, color, fontSize: 14 }}>{STAGE_LABEL[stage]}</span>
                <span style={{ fontSize: 12, color, background: color + '22', borderRadius: 20, padding: '1px 7px' }}>{list.length}</span>
                <button type="button" onClick={() => setInfoStage(stage)} title={t('Penjelasan stage')} aria-label={t('Info')} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                </button>
              </div>

              {list.map(d => {
                const c = nameOf(d.contact_id)
                const isPicked = dragId === d.id
                const isSel = selectedIds.has(d.id)
                const isOpen = (DEAL_OPEN_STAGES as readonly string[]).includes(d.stage)
                const overdue = isOpen && !!d.expected_close_date && d.expected_close_date < today
                return (
                  <div key={d.id}
                    draggable={!selectMode}
                    onDragStart={e => { if (selectMode) { e.preventDefault(); return } e.dataTransfer.effectAllowed = 'move'; draggedRef.current = false; setDragId(d.id) }}
                    onDragEnd={() => { draggedRef.current = true; setDragId(null); setOverCol(null) }}
                    onTouchStart={e => { if (!selectMode) startTouchDrag(d, e) }}
                    onClick={e => {
                      if (selectMode) { toggleSelect(d.id); return }
                      if (draggedRef.current || isPicked) { draggedRef.current = false; e.preventDefault(); return }
                      setEdit(d)
                    }}
                    style={{
                      background: selectMode && isSel ? 'color-mix(in srgb, var(--accent) 12%, var(--bg3))' : 'var(--bg3)',
                      border: `1px solid ${(selectMode && isSel) || isPicked ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 8, padding: '10px 12px', marginBottom: 8,
                      cursor: selectMode ? 'pointer' : 'grab', opacity: isPicked ? 0.55 : 1,
                      WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none',
                      transition: 'border-color 0.15s, opacity 0.15s, background 0.15s',
                    }}
                  >
                    {selectMode && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <input type="checkbox" checked={isSel} onChange={() => toggleSelect(d.id)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{isSel ? 'Dipilih' : 'Pilih'}</span>
                      </div>
                    )}
                    {/* Brand/company highlighted → contact person → services. */}
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(c?.company_name || c?.name || d.name)}</div>
                    {!!(c?.company_name || '').trim() && !!(c?.name || '').trim() && (c!.name).trim().toLowerCase() !== (c!.company_name || '').trim().toLowerCase() && (
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        👤 {c!.name}
                      </div>
                    )}
                    {(d.services || []).length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                        {(d.services || []).slice(0, 3).map(s => (
                          <span key={s} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--link)', background: 'color-mix(in srgb, var(--accent) 12%, var(--bg2))', border: '1px solid color-mix(in srgb, var(--accent) 30%, var(--border))', borderRadius: 20, padding: '1px 8px', whiteSpace: 'nowrap' }}>{s}</span>
                        ))}
                        {(d.services || []).length > 3 && <span style={{ fontSize: 10.5, color: 'var(--text3)', alignSelf: 'center' }}>+{(d.services || []).length - 3}</span>}
                      </div>
                    )}
                    {d.value > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--accent4)', fontWeight: 600, marginBottom: 6 }}>{formatRupiah(d.value)}</div>
                    )}
                    {d.expected_close_date && (
                      <div style={{ fontSize: 11, color: overdue ? '#ff6b6b' : 'var(--text2)', marginBottom: 4 }}>
                        🎯 {new Date(d.expected_close_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}{overdue ? ` · ${t('lewat')}` : ''}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
                      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {invoiceByDeal.get(d.id) && (
                          <Link href={`/crm/invoices/${invoiceByDeal.get(d.id)!.id}`} onClick={e => e.stopPropagation()}
                            title={t('Lihat invoice (preview)')}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 600, color: 'var(--text2)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', textDecoration: 'none' }}>
                            🧾 {invoiceByDeal.get(d.id)!.number || t('Invoice')}
                          </Link>
                        )}
                        {d.stage === 'won' && d.crm_project_id && (
                          <Link href={`/crm/projects/${d.crm_project_id}`} onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: 'var(--link)', textDecoration: 'none', fontWeight: 600 }}>→ {t('Project')}</Link>
                        )}
                        {d.stage === 'lost' && d.lost_reason && (
                          <span style={{ fontSize: 10.5, color: STAGE_COLOR.lost, background: STAGE_COLOR.lost + '22', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{LOST_REASON_LABEL[d.lost_reason] ?? d.lost_reason}</span>
                        )}
                      </div>
                      {!selectMode && (
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button onClick={e => { e.stopPropagation(); setEdit(d) }} title={t('Edit')} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--text)' }}>✏️</button>
                          <button onClick={e => { e.stopPropagation(); setDel(d) }} title={t('Hapus')} style={{ background: 'var(--accent2)', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11, color: '#fff' }}>✕</button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              <button onClick={() => setAdd({ stage: stage as DealStage })}
                style={{ width: '100%', background: 'none', border: '1px dashed var(--border)', borderRadius: 8, padding: '8px 4px', cursor: 'pointer', fontSize: 12, color: 'var(--text2)', marginTop: 4, transition: 'all 0.15s' }}
                onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = color; (e.currentTarget as HTMLElement).style.color = color }}
                onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text2)' }}
              >
                {t('+ Tambah')}
              </button>
            </div>
          )
        })}
      </div>

      {add && <DealFormModal open prefillStage={add.stage} onClose={() => setAdd(null)} />}
      {edit && <DealFormModal open deal={edit} onClose={() => setEdit(null)} />}
      {lost && <DealLostModal open deal={lost} onClose={() => setLost(null)} />}

      <ConfirmDialog
        open={!!won}
        title={t('Tandai sebagai Won?')}
        message={t('Deal ditandai Won. Project (CRM) dan brand socmed akan otomatis dibuat & terhubung ke contact ini.')}
        confirmLabel={wonBusy ? t('Memproses…') : t('Ya, Won')}
        cancelLabel={t('Batal')}
        onConfirm={confirmWon}
        onCancel={() => { if (!wonBusy) setWon(null) }}
      />

      <ConfirmDialog
        open={!!del}
        danger
        title={t('Hapus deal ini?')}
        message={t('Deal akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.')}
        confirmLabel={delBusy ? t('Menghapus…') : t('Hapus')}
        cancelLabel={t('Batal')}
        onConfirm={confirmDelete}
        onCancel={() => { if (!delBusy) setDel(null) }}
      />

      <ConfirmDialog
        open={confirmBulkDel}
        danger
        title={`Hapus ${selectedCount} deal terpilih?`}
        message="Deal terpilih akan dihapus permanen. Tindakan ini tidak bisa dibatalkan."
        confirmLabel={bulkBusy ? t('Menghapus…') : t('Hapus')}
        cancelLabel={t('Batal')}
        onConfirm={confirmDeleteSelected}
        onCancel={() => { if (!bulkBusy) setConfirmBulkDel(false) }}
      />

      {infoStage && (
        <Modal open onClose={() => setInfoStage(null)} title={STAGE_LABEL[infoStage] ?? infoStage} maxWidth={420}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '4px 2px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: STAGE_COLOR[infoStage] ?? 'var(--text3)' }} />
            <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.65, margin: 0 }}>{STAGE_INFO[infoStage] ? t(STAGE_INFO[infoStage]) : t('Belum ada penjelasan.')}</p>
          </div>
        </Modal>
      )}
    </div>
  )
}
