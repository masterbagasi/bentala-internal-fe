'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { ClientProfile } from './ClientProfile'
import { useT } from '@/lib/i18n/LanguageProvider'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { getSupabase } from '@/lib/supabase'
import { CRM_STAGES, CRM_BOARD_STAGES, STAGE_LABELS, SERVICE_OPTIONS, STAGE_PROBABILITY, TEMPERATURES, CLOSED_STAGES } from '@/lib/constants'
import { formatRupiah } from '@/lib/utils'
import { useLogActivity } from '@/hooks/useData'
import { logStageChange } from '@/lib/log-interaction'
import { followUpTone, todayISODate } from '@/lib/follow-up'
import { StageReasonModal } from './StageReasonModal'
import type { Client, ClientStage } from '@/lib/types'

export function CRMPage() {
  const t = useT()
  const { clients, crmFilter, setCrmFilter, followUps, upsertClient } = useStore(useShallow((s) => ({ clients: s.clients, crmFilter: s.crmFilter, setCrmFilter: s.setCrmFilter, followUps: s.followUps, upsertClient: s.upsertClient })))
  const [showModal, setShowModal] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [reasonReq, setReasonReq] = useState<{ client: Client; toStage: string; required: boolean } | null>(null)
  // Client detail opens as a popup (not a separate page) when a card is clicked.
  const [detailId, setDetailId] = useState<string | null>(null)
  const logActivity = useLogActivity()

  // ── Drag-and-drop state ──
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  // boardRef + touchRef power the mobile long-press touch DnD (same pattern as BPI KanbanBoard).
  const boardRef = useRef<HTMLDivElement>(null)
  const touchRef = useRef<{
    client: Client; startX: number; startY: number
    dragging: boolean; overCol: string | null
    timer: ReturnType<typeof setTimeout> | null
  } | null>(null)
  // Keep a stable ref to live values so the non-passive listeners don't need to re-bind.
  const liveRef = useRef({ moveToStage })
  liveRef.current = { moveToStage }
  // Set synchronously on drag end so the click that browsers fire right after a
  // desktop drag is suppressed regardless of React's state-update batching (the
  // `dragId` state may already be cleared by click time).
  const draggedRef = useRef(false)

  function startTouchDrag(client: Client, e: React.TouchEvent) {
    const tch = e.touches[0]
    if (!tch) return
    const st = {
      client, startX: tch.clientX, startY: tch.clientY,
      dragging: false, overCol: null as string | null,
      timer: null as ReturnType<typeof setTimeout> | null,
    }
    st.timer = setTimeout(() => {
      if (touchRef.current !== st) return
      st.dragging = true
      setDragId(client.id)
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
    const onMoveN = (e: TouchEvent) => {
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
    const onEndN = (e: TouchEvent) => {
      const st = touchRef.current
      if (st?.dragging) {
        e.preventDefault()
        if (st.overCol && st.client.stage !== st.overCol) {
          liveRef.current.moveToStage(st.client, st.overCol)
        }
      }
      clear()
    }
    el.addEventListener('touchmove', onMoveN, { passive: false })
    el.addEventListener('touchend', onEndN, { passive: false })
    el.addEventListener('touchcancel', clear)
    return () => {
      el.removeEventListener('touchmove', onMoveN)
      el.removeEventListener('touchend', onEndN)
      el.removeEventListener('touchcancel', clear)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openModal(client?: Client) {
    setEditClient(client || null)
    setShowModal(true)
  }

  const [closingThisMonth, setClosingThisMonth] = useState(false)
  const ym = (() => { const d = new Date(); return `${d.getFullYear()}-${`${d.getMonth()+1}`.padStart(2,'0')}` })()
  const openDeals = clients.filter(c => !CLOSED_STAGES.includes(c.stage as typeof CLOSED_STAGES[number]))
  const totalPipeline = openDeals.reduce((n, c) => n + (c.value || 0), 0)
  const weightedForecast = Math.round(openDeals.reduce((n, c) => n + (c.value || 0) * (STAGE_PROBABILITY[c.stage] ?? 0), 0))

  const filtered = (() => {
    let base = crmFilter === 'all' ? clients : clients.filter(c => c.stage === crmFilter)
    if (closingThisMonth) base = base.filter(c => (c.expected_close || '').slice(0, 7) === ym)
    return base
  })()

  const today = todayISODate()
  const toneByClient = useMemo(() => {
    const m = new Map<string, 'overdue' | 'due'>()
    for (const f of followUps) {
      const tone = followUpTone(f.next_follow_up, today)
      if (tone === 'none') continue
      const cur = m.get(f.client_id)
      if (tone === 'overdue' || !cur) m.set(f.client_id, tone)
    }
    return m
  }, [followUps, today])

  async function handleDelete(id: string) {
    if (!confirm(t('Hapus client ini?'))) return
    const supabase = getSupabase()
    await supabase.from('clients').delete().eq('id', id)
    // Don't lose the source contact: un-convert the linked bsi_leads row so it
    // reappears in the Database instead of being orphaned by the deleted client.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('bsi_leads').update({ converted_client_id: null }).eq('converted_client_id', id)
    logActivity('Client dihapus')
  }

  async function applyStageMove(client: Client, toStage: string, reason?: string) {
    const supabase = getSupabase()
    const updates: { stage: string; close_reason?: string | null } = { stage: toStage }
    if (reason !== undefined) updates.close_reason = reason || null
    upsertClient({ ...client, ...updates } as Client) // optimistic
    const { error } = await supabase.from('clients').update(updates).eq('id', client.id)
    if (error) { upsertClient(client); return } // rollback
    logActivity(`${client.name} dipindah ke ${STAGE_LABELS[toStage] ?? toStage}`)
    if (client.stage !== toStage) logStageChange(client.id, client.stage, toStage, reason || undefined)
  }

  function moveToStage(client: Client, toStage: string) {
    if (client.stage === toStage) return
    if (toStage === 'lost') { setReasonReq({ client, toStage, required: true }); return }
    if (toStage === 'won' || toStage === 'client') { setReasonReq({ client, toStage, required: false }); return }
    void applyStageMove(client, toStage)
  }

  return (
    <div>
      {/* Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          onClick={() => setCrmFilter('all')}
          style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, background: crmFilter === 'all' ? 'var(--accent)' : 'var(--bg2)', color: crmFilter === 'all' ? '#fff' : 'var(--text2)', borderColor: crmFilter === 'all' ? 'var(--accent)' : 'var(--border)' }}
        >
          {t('Semua')}
        </button>
        {CRM_STAGES.map(s => (
          <button key={s.key}
            onClick={() => setCrmFilter(s.key)}
            style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, background: crmFilter === s.key ? s.color : 'var(--bg2)', color: crmFilter === s.key ? '#fff' : 'var(--text2)', borderColor: crmFilter === s.key ? s.color : 'var(--border)' }}
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={() => openModal()}
          style={{ marginLeft: 'auto', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
        >
          {t('+ Tambah Client')}
        </button>
      </div>

      {/* Forecast strip */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div><span style={{ fontSize: 11, color: 'var(--text2)' }}>{t('Total Pipeline')}</span><div style={{ fontSize: 16, fontWeight: 700 }}>{formatRupiah(totalPipeline)}</div></div>
        <div><span style={{ fontSize: 11, color: 'var(--text2)' }}>{t('Weighted Forecast')}</span><div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent4)' }}>{formatRupiah(weightedForecast)}</div></div>
        <button
          onClick={() => setClosingThisMonth(v => !v)}
          style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
            border: '1px solid', borderColor: closingThisMonth ? 'var(--accent)' : 'var(--border)',
            background: closingThisMonth ? 'rgba(108,99,255,0.12)' : 'var(--bg3)', color: closingThisMonth ? 'var(--accent)' : 'var(--text2)' }}
        >{t('Closing bulan ini')}</button>
      </div>

      {followUps.length > 0 && (() => {
        const due = followUps
          .map(f => ({ f, tone: followUpTone(f.next_follow_up, today), c: clients.find(x => x.id === f.client_id) }))
          .filter(x => x.tone !== 'none' && x.c)
          .sort((a, b) => (a.f.next_follow_up < b.f.next_follow_up ? -1 : 1))
        if (due.length === 0) return null
        return (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t('Perlu Follow-up')} ({due.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {due.map(({ f, tone, c }) => (
                <button key={f.id} onClick={() => setDetailId(f.client_id)} style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone === 'overdue' ? '#ff6b6b' : '#ffc542', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c!.name}</span>
                  <span style={{ fontSize: 11, color: tone === 'overdue' ? '#ff6b6b' : 'var(--text2)' }}>{new Date(f.next_follow_up).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Kanban */}
      <div ref={boardRef} style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
        {CRM_BOARD_STAGES.map(stage => {
          const cols = filtered.filter(c => c.stage === stage.key)
          const isOver = overCol === stage.key
          return (
            <div key={stage.key}
              data-col-key={stage.key}
              onDragOver={(e) => { e.preventDefault(); if (overCol !== stage.key) setOverCol(stage.key) }}
              onDrop={(e) => {
                e.preventDefault()
                const c = clients.find(x => x.id === dragId)
                setDragId(null); setOverCol(null)
                if (c && c.stage !== stage.key) moveToStage(c, stage.key)
              }}
              style={{
                minWidth: 265, maxWidth: 265,
                background: isOver ? `${stage.color}14` : 'var(--bg2)',
                border: `1px solid ${isOver ? stage.color : 'var(--border)'}`,
                borderRadius: 12, padding: '14px 12px 10px', flexShrink: 0,
                boxShadow: isOver ? `0 0 0 2px ${stage.color}55` : 'none',
                transition: 'border-color 0.12s, background 0.12s, box-shadow 0.12s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ fontWeight: 600, color: stage.color, fontSize: 14 }}>{stage.label}</span>
                <span style={{ fontSize: 12, color: stage.color, background: stage.color + '22', borderRadius: 20, padding: '1px 7px' }}>
                  {cols.length}
                </span>
              </div>

              {cols.map(c => {
                const isPicked = dragId === c.id
                return (
                <div key={c.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; draggedRef.current = false; setDragId(c.id) }}
                  onDragEnd={() => { draggedRef.current = true; setDragId(null); setOverCol(null) }}
                  onTouchStart={(e) => startTouchDrag(c, e)}
                  onClick={(e) => {
                    // Suppress navigate if a drag just ended (desktop: draggedRef set
                    // synchronously in onDragEnd; touch: onEndN preventDefaults the click).
                    if (draggedRef.current || isPicked) { draggedRef.current = false; e.preventDefault(); return }
                    setDetailId(c.id)
                  }}
                  style={{
                    background: 'var(--bg3)',
                    border: `1px solid ${isPicked ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 8, padding: '10px 12px', marginBottom: 8,
                    cursor: 'grab', opacity: isPicked ? 0.55 : 1,
                    WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none',
                    transition: 'border-color 0.15s, opacity 0.15s',
                  }}
                >
                  <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>
                    {toneByClient.get(c.id) && (
                      <span title={toneByClient.get(c.id) === 'overdue' ? t('Follow-up lewat tenggat') : t('Follow-up jatuh tempo')}
                        style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 6, background: toneByClient.get(c.id) === 'overdue' ? '#ff6b6b' : '#ffc542' }} />
                    )}
                    {c.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>
                    {c.pic || '—'} · {c.contact || '—'}
                  </div>
                  {c.value > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--accent4)', fontWeight: 600, marginBottom: 6 }}>
                      {formatRupiah(c.value)}
                    </div>
                  )}
                  {c.expected_close && (() => {
                    const open = !CLOSED_STAGES.includes(c.stage as typeof CLOSED_STAGES[number])
                    const overdue = open && c.expected_close < today
                    return (
                      <div style={{ fontSize: 11, color: overdue ? '#ff6b6b' : 'var(--text2)', marginBottom: 4 }}>
                        🎯 {new Date(c.expected_close).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}{overdue ? ` · ${t('lewat')}` : ''}
                      </div>
                    )
                  })()}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    {/* Deal temperature (cold/warm/hot). The stage is already the
                        column, so this slot shows qualification instead of repeating it. */}
                    {(() => {
                      const temp = TEMPERATURES.find(x => x.key === c.temperature)
                      return temp
                        ? <span style={{ fontSize: 11, fontWeight: 600, color: temp.color, background: temp.color + '22', padding: '2px 9px', borderRadius: 20 }}>{temp.label}</span>
                        : <span />
                    })()}
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={(e) => { e.stopPropagation(); openModal(c) }}
                        style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--text)' }}>✏️</button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id) }}
                        style={{ background: 'var(--accent2)', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11, color: '#fff' }}>✕</button>
                    </div>
                  </div>
                </div>
              )})}

              <button onClick={() => { openModal(); }}
                style={{ width: '100%', background: 'none', border: '1px dashed var(--border)', borderRadius: 8, padding: '8px 4px', cursor: 'pointer', fontSize: 12, color: 'var(--text2)', marginTop: 4, transition: 'all 0.15s' }}
                onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = stage.color; (e.currentTarget as HTMLElement).style.color = stage.color }}
                onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text2)' }}
              >
                {t('+ Tambah')}
              </button>
            </div>
          )
        })}
      </div>

      {showModal && (
        <ClientModal
          open={showModal}
          client={editClient}
          onClose={() => { setShowModal(false); setEditClient(null) }}
        />
      )}
      {reasonReq && (
        <StageReasonModal
          open
          toStageLabel={STAGE_LABELS[reasonReq.toStage] ?? reasonReq.toStage}
          required={reasonReq.required}
          onSubmit={(reason) => { const r = reasonReq; setReasonReq(null); void applyStageMove(r.client, r.toStage, reason) }}
          onClose={() => setReasonReq(null)}
        />
      )}

      {detailId && (
        <Modal open onClose={() => setDetailId(null)} title={t('Detail Client')} maxWidth={1040}>
          <ClientProfile id={detailId} onClose={() => setDetailId(null)} />
        </Modal>
      )}
    </div>
  )
}

// ── Client Modal ──
export function ClientModal({ open, client, onClose, prefill, source: sourceProp, leadId, onCreated }: {
  open: boolean
  client: Client | null
  onClose: () => void
  prefill?: Partial<{ name: string; pic: string; contact: string; stage: ClientStage; service: string; notes: string }>
  source?: string
  leadId?: string
  onCreated?: (clientId: string) => void
}) {
  const t = useT()
  const logActivity = useLogActivity()
  const [form, setForm] = useState({
    name:     client?.name    || prefill?.name    || '',
    pic:      client?.pic     || prefill?.pic     || '',
    contact:  client?.contact || prefill?.contact || '',
    stage:    client?.stage   || prefill?.stage   || 'prospect',
    value:          client?.value?.toString() || '',
    service:        client?.service || prefill?.service || '',
    internal:       client?.internal || '',
    notes:          client?.notes   || prefill?.notes   || '',
    source:         client?.source  || sourceProp       || 'manual',
    expected_close: client?.expected_close || '',
    temperature: client?.temperature || '',
  })
  const [loading, setLoading] = useState(false)
  // Internal PIC = registered accounts; Service Type = active website services.
  const [accounts, setAccounts] = useState<string[]>([])
  const [services, setServices] = useState<string[]>([])
  useEffect(() => {
    let off = false
    fetch('/api/accounts').then((r) => (r.ok ? r.json() : { accounts: [] }))
      .then((d: { accounts?: { name: string }[] }) => { if (!off) setAccounts((d.accounts ?? []).map((a) => a.name).filter(Boolean)) }).catch(() => {})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(getSupabase() as any).from('bsi_services').select('name, sort_order').eq('is_published', true).order('sort_order', { ascending: true })
      .then(({ data }: { data: { name: string }[] | null }) => { if (!off) setServices((data ?? []).map((s) => s.name).filter(Boolean)) })
    return () => { off = true }
  }, [])

  async function handleSave() {
    if (!form.name.trim()) { alert(t('Nama client wajib diisi!')); return }
    setLoading(true)
    const supabase = getSupabase()
    const data = {
      name:           form.name.trim(),
      pic:            form.pic,
      contact:        form.contact,
      stage:          form.stage,
      value:          parseFloat(form.value) || 0,
      service:        form.service,
      internal:       form.internal,
      notes:          form.notes,
      source:         form.source,
      expected_close: form.expected_close || null,
      temperature: form.temperature || null,
    }
    if (client) {
      await supabase.from('clients').update(data).eq('id', client.id)
      logActivity(`Client diupdate: "${form.name}"`)
      if (client.stage !== form.stage) logStageChange(client.id, client.stage, form.stage)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: created, error } = await (supabase as any)
        .from('clients').insert({ ...data, lead_id: leadId || null }).select().single()
      if (error) { setLoading(false); alert(t('Gagal menyimpan: ') + error.message); return }
      logActivity(`Client baru: "${form.name}" (${STAGE_LABELS[form.stage]})`)
      if (created?.id) onCreated?.(created.id as string)
    }
    setLoading(false)
    onClose()
  }

  return (
    <Modal
      open={open} onClose={onClose}
      title={client ? 'Edit Client' : t('Tambah Client Baru')}
      footer={<><BtnSecondary onClick={onClose}>{t('Batal')}</BtnSecondary><BtnPrimary onClick={handleSave} loading={loading}>{t('Simpan')}</BtnPrimary></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <CSection title={t('Klien')}>
          <FG label={t('Nama Client / Brand')} required>
            <input type="text" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="PT. ..." />
          </FG>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FG label={t('PIC Client')}>
              <input type="text" value={form.pic} onChange={e => setForm(f=>({...f,pic:e.target.value}))} placeholder={t('Nama PIC')} />
            </FG>
            <FG label={t('Kontak (WA/Email)')}>
              <input type="text" value={form.contact} onChange={e => setForm(f=>({...f,contact:e.target.value}))} placeholder="+62..." />
            </FG>
          </div>
        </CSection>

        <CSection title={t('Deal')}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FG label="Stage">
              <select value={form.stage} onChange={e => setForm(f=>({...f,stage:e.target.value as ClientStage}))}>
                {CRM_BOARD_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </FG>
            <FG label={t('Nilai Deal (Rp)')}>
              <input type="number" value={form.value} onChange={e => setForm(f=>({...f,value:e.target.value}))} placeholder="0" />
            </FG>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FG label={t('Perkiraan Closing')}>
              <input type="date" value={form.expected_close} onChange={e => setForm(f=>({...f,expected_close:e.target.value}))} />
            </FG>
            <FG label={t('Temperature')}>
              <select value={form.temperature} onChange={e => setForm(f=>({...f,temperature:e.target.value}))}>
                <option value="">—</option>
                {TEMPERATURES.map(tp => <option key={tp.key} value={tp.key}>{tp.label}</option>)}
              </select>
            </FG>
          </div>
        </CSection>

        <CSection title={t('Layanan & Assignment')}>
          <FG label={t('Jenis Layanan')}>
            <select value={form.service} onChange={e => setForm(f=>({...f,service:e.target.value}))}>
              <option value="">{t('Pilih layanan...')}</option>
              {form.service && !services.includes(form.service) && (
                <option value={form.service}>{SERVICE_OPTIONS.find(o => o.value === form.service)?.label ?? form.service}</option>
              )}
              {services.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </FG>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FG label={t('PIC Internal')}>
              <select value={form.internal} onChange={e => setForm(f=>({...f,internal:e.target.value}))}>
                <option value="">{t('Pilih PIC...')}</option>
                {form.internal && !accounts.includes(form.internal) && <option value={form.internal}>{form.internal}</option>}
                {accounts.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </FG>
            <FG label={t('Sumber')}>
              <select value={form.source} onChange={e => setForm(f=>({...f,source:e.target.value}))}>
                <option value="manual">Manual</option>
                <option value="website">Website</option>
                <option value="referral">Referral</option>
              </select>
            </FG>
          </div>
        </CSection>

        <CSection title={t('Catatan')}>
          <FG label={t('Catatan')}>
            <textarea value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} placeholder={t('Catatan terkait client...')} style={{ fontFamily: 'inherit', resize: 'vertical' }} />
          </FG>
        </CSection>
      </div>
    </Modal>
  )
}

function CSection({ children }: { title?: string; children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
}

function FG({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--text2)', marginBottom: 7 }}>
        {label}{required && <span style={{ color: 'var(--accent2)', marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  )
}
