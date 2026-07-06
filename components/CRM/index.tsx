'use client'

import { useState, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { ClientProfile } from './ClientProfile'
import { useT } from '@/lib/i18n/LanguageProvider'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { getSupabase } from '@/lib/supabase'
import { CRM_STAGES, CRM_BOARD_STAGES, STAGE_LABELS, SERVICE_OPTIONS, TEMPERATURES, CLOSED_STAGES } from '@/lib/constants'
import { formatRupiah } from '@/lib/utils'
import { useLogActivity } from '@/hooks/useData'
import { logStageChange } from '@/lib/log-interaction'
import { followUpTone, todayISODate } from '@/lib/follow-up'
import { StageReasonModal } from './StageReasonModal'
import { StageSelect } from './StageSelect'
import { LeadFormModal, inputToRow, type NewLeadInput } from './LeadFormModal'
import { confirmDialog } from '@/lib/confirm-dialog'
import type { Client, ClientStage } from '@/lib/types'

// ── Bridge the rich Add-Contact form (LeadFormModal) to the pipeline `clients`
// table. The flat columns drive the kanban; the full form is kept in lead_details. ──
const BUDGET_VALUE: Record<string, number> = {
  '< Rp 5 juta': 5_000_000, 'Rp 5 — 15 juta': 10_000_000, 'Rp 15 — 30 juta': 22_500_000,
  'Rp 30 — 50 juta': 40_000_000, 'Rp 50 — 100 juta': 75_000_000, '> Rp 100 juta': 100_000_000,
}
// Free-typed budgets ("Rp 7,5 juta", "10jt", "7500000") → a rupiah number.
function parseBudget(s: string): number {
  if (!s) return 0
  const lower = s.toLowerCase().replace(/\./g, '').replace(/\s+/g, '')
  const num = parseFloat((lower.match(/[\d,]+/)?.[0] ?? '0').replace(',', '.'))
  if (!num) return 0
  if (/miliar|milyar/.test(lower)) return Math.round(num * 1_000_000_000)
  if (/juta|jt/.test(lower)) return Math.round(num * 1_000_000)
  if (/ribu|rb/.test(lower)) return Math.round(num * 1_000)
  return Math.round(num)
}
const STATUS_TO_STAGE: Record<string, ClientStage> = {
  'New lead': 'prospect', 'Contacted': 'contacted', 'Qualified': 'qualified', 'Prospek': 'prospect',
  'Penawaran': 'proposal', 'Negosiasi': 'negotiation', 'Won': 'won', 'Lost': 'lost',
}
const STAGE_TO_STATUS: Record<string, string> = {
  prospect: 'New lead', contacted: 'Contacted', qualified: 'Qualified', discovery: 'Qualified',
  proposal: 'Penawaran', negotiation: 'Negosiasi', won: 'Won', lost: 'Lost', client: 'Won',
}
const PRIORITAS_TO_TEMP: Record<string, string> = { 'Hot — sekarang': 'hot', 'Warm': 'warm', 'Cold': 'cold' }
const TEMP_TO_PRIORITAS: Record<string, string> = { hot: 'Hot — sekarang', warm: 'Warm', cold: 'Cold' }

// Short explanation of each pipeline stage — shown in the per-column info popup.
const STAGE_INFO: Record<string, string> = {
  prospect: 'Calon klien yang baru masuk / teridentifikasi — belum dihubungi. Awal funnel.',
  contacted: 'Sudah dihubungi pertama kali (telepon / WA / email), menunggu respons.',
  qualified: 'Sudah dipastikan cocok & berpotensi — ada kebutuhan, budget, wewenang, dan waktu.',
  discovery: 'Sesi menggali kebutuhan lebih dalam lewat meeting / diskusi (Discovery Meeting).',
  proposal: 'Penawaran / proposal sudah dikirim ke klien, menunggu keputusan.',
  negotiation: 'Tahap negosiasi harga, scope, atau termin sebelum kesepakatan.',
  won: 'Kesepakatan tercapai — peluang menang, siap jadi klien.',
  lost: 'Peluang gagal / tidak jadi — ditutup sebagai kalah.',
  client: 'Sudah menjadi klien aktif (proyek berjalan / berlangganan).',
}

function leadInputToClient(input: NewLeadInput, opts: { stage?: ClientStage }) {
  return {
    name:           (input.brand_name || input.full_name || '').trim(),
    contact:        input.contact_value || '',
    pic:            input.full_name || '',          // PIC Client = the person we talk to
    internal:       input.pic || '',                // PIC Internal = assigned account
    service:        (input.jenis_project || []).join(', '),
    source:         input.source || 'manual',
    stage:          opts.stage ?? STATUS_TO_STAGE[input.status] ?? 'prospect',
    temperature:    PRIORITAS_TO_TEMP[input.prioritas] ?? null,
    value:          BUDGET_VALUE[input.budget_range] ?? parseBudget(input.budget_range),
    expected_close: input.follow_up_date || null,
    notes:          input.notes || '',
    lead_details:   input,
  }
}

/**
 * Add a contact everywhere at once. There is one thing being created — a contact
 * — and it must appear in BOTH the Contacts database and the Pipeline. So we
 * always write the rich contact (`bsi_leads`) AND a linked pipeline entry
 * (`clients`), and cross-link them. Used by both "+ Tambah" buttons so adding is
 * identical wherever you do it.
 */
export async function addContactEverywhere(input: NewLeadInput, stage?: ClientStage): Promise<{ leadId: string; clientId: string } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = getSupabase() as any
  // Client first, so the pipeline entry appears immediately…
  const clientRow = leadInputToClient(input, { stage })
  const { data: client, error: e1 } = await sb.from('clients').insert(clientRow).select().single()
  if (e1 || !client) { alert('Gagal menyimpan ke pipeline: ' + (e1?.message ?? '')); return null }
  // …then the rich contact, born already linked so it never flickers as a raw lead.
  const leadRow = { ...inputToRow(input), origin: 'manual', in_database: true, submitted_at: new Date().toISOString(), converted_client_id: client.id }
  const { data: lead, error: e2 } = await sb.from('bsi_leads').insert(leadRow).select().single()
  if (e2 || !lead) { alert('Gagal menyimpan kontak: ' + (e2?.message ?? '')); return null }
  await sb.from('clients').update({ lead_id: lead.id }).eq('id', client.id)
  return { leadId: lead.id as string, clientId: client.id as string }
}

function clientToLeadInput(client: Client): Partial<NewLeadInput> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ld = (client as any).lead_details
  if (ld && typeof ld === 'object' && Object.keys(ld).length > 0) return ld as NewLeadInput
  // Older clients (saved before the full form) — map the flat columns back.
  return {
    brand_name: client.name || '',
    full_name: client.pic || '',
    pic: client.internal || '',
    contact_value: client.contact || '',
    notes: client.notes || '',
    jenis_project: client.service ? client.service.split(',').map(s => s.trim()).filter(Boolean) : [],
    follow_up_date: client.expected_close || '',
    prioritas: TEMP_TO_PRIORITAS[client.temperature || ''] || 'Warm',
    status: STAGE_TO_STATUS[client.stage] || 'New lead',
  }
}

/** Imperative handle so the page's "+ Tambah Client" button (rendered up in the
 *  PageHeader, exactly like All Project's "+ Tambah Task") can open the form. */
export interface CRMPageHandle { openAdd: () => void }

/** Header meta the page needs to drive the PageHeader tab row: the shared stage
 *  filter (stored globally), per-stage counts, and the due follow-up count for
 *  the "Follow-up (n)" tab badge. Reactive to the store, so realtime keeps it live. */
export function useCrmMeta() {
  const { clients, crmFilter, setCrmFilter, followUps } = useStore(useShallow((s) => ({ clients: s.clients, crmFilter: s.crmFilter, setCrmFilter: s.setCrmFilter, followUps: s.followUps })))
  const pipelineClients = clients.filter((c) => !c.pipeline_hidden)
  const stageCounts = pipelineClients.reduce<Record<string, number>>((acc, c) => {
    acc.all = (acc.all || 0) + 1
    acc[c.stage] = (acc[c.stage] || 0) + 1
    return acc
  }, {})
  const today = todayISODate()
  const followUpDueCount = followUps.filter(
    (f) => followUpTone(f.next_follow_up, today) !== 'none' && pipelineClients.some((x) => x.id === f.client_id),
  ).length
  return { crmFilter, setCrmFilter, stageCounts, followUpDueCount }
}

export const CRMPage = forwardRef<CRMPageHandle, { activeTab: 'list' | 'board' | 'followup' }>(function CRMPage({ activeTab }, ref) {
  const t = useT()
  const { clients, crmFilter, followUps, upsertClient } = useStore(useShallow((s) => ({ clients: s.clients, crmFilter: s.crmFilter, followUps: s.followUps, upsertClient: s.upsertClient })))
  const [showModal, setShowModal] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  // Stage the new client lands in when "+ Tambah" is clicked inside a column.
  const [addStage, setAddStage] = useState<ClientStage | undefined>(undefined)
  const [reasonReq, setReasonReq] = useState<{ client: Client; toStage: string; required: boolean } | null>(null)
  // Client detail opens as a popup (not a separate page) when a card is clicked.
  const [detailId, setDetailId] = useState<string | null>(null)
  const [infoStage, setInfoStage] = useState<string | null>(null)
  // Top-level view tab is controlled by the page (rendered in the PageHeader).
  const pipeTab = activeTab
  const logActivity = useLogActivity()
  useImperativeHandle(ref, () => ({ openAdd: () => openModal() }), [])

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

  function openModal(client?: Client, stage?: ClientStage) {
    setEditClient(client || null)
    setAddStage(client ? undefined : stage)
    setShowModal(true)
  }

  // The pipeline board only shows clients not removed from it; the rest still
  // live in the Database tab. (Soft-deleted ones are already gone from the store.)
  const pipelineClients = clients.filter(c => !c.pipeline_hidden)
  const filtered = crmFilter === 'all' ? pipelineClients : pipelineClients.filter(c => c.stage === crmFilter)

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

  // Earliest upcoming follow-up date per client — shown in the List view.
  const nextFuByClient = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of followUps) {
      const cur = m.get(f.client_id)
      if (!cur || f.next_follow_up < cur) m.set(f.client_id, f.next_follow_up)
    }
    return m
  }, [followUps])

  // Due/overdue follow-ups, resolved to their client — shared by the tab badge
  // and the Follow-up tab list.
  const dueFollowUps = followUps
    .map(f => ({ f, tone: followUpTone(f.next_follow_up, today), c: pipelineClients.find(x => x.id === f.client_id) }))
    .filter((x): x is { f: typeof x.f; tone: 'overdue' | 'due'; c: Client } => x.tone !== 'none' && !!x.c)
    .sort((a, b) => (a.f.next_follow_up < b.f.next_follow_up ? -1 : 1))

  async function handleDelete(id: string) {
    if (!(await confirmDialog(t('Hapus client ini dari pipeline?'), { danger: true, confirmLabel: t('Hapus'), cancelLabel: t('Batal') }))) return
    const supabase = getSupabase()
    // Pipeline-only removal: hide the card from the board but KEEP the record in
    // the database (it still shows in the Database tab). A real delete only
    // happens from the Database tab.
    const client = clients.find(c => c.id === id)
    if (client) upsertClient({ ...client, pipeline_hidden: true }) // optimistic
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('clients').update({ pipeline_hidden: true }).eq('id', id)
    logActivity('Client dihapus dari pipeline', 'pipeline')
  }

  async function applyStageMove(client: Client, toStage: string, reason?: string) {
    const supabase = getSupabase()
    const updates: { stage: string; close_reason?: string | null } = { stage: toStage }
    if (reason !== undefined) updates.close_reason = reason || null
    upsertClient({ ...client, ...updates } as Client) // optimistic
    const { error } = await supabase.from('clients').update(updates).eq('id', client.id)
    if (error) { upsertClient(client); return } // rollback
    logActivity(`${client.name} dipindah ke ${STAGE_LABELS[toStage] ?? toStage}`, 'pipeline')
    if (client.stage !== toStage) logStageChange(client.id, client.stage, toStage, reason || undefined)
  }

  function moveToStage(client: Client, toStage: string) {
    if (client.stage === toStage) return
    if (toStage === 'lost') { setReasonReq({ client, toStage, required: true }); return }
    if (toStage === 'won' || toStage === 'client') { setReasonReq({ client, toStage, required: false }); return }
    void applyStageMove(client, toStage)
  }

  return (
    <div style={{ padding: 24 }}>
      {pipeTab === 'list' && (
        <ClientListView rows={filtered} today={today} toneByClient={toneByClient} nextFu={nextFuByClient} onRowClick={setDetailId} onEdit={openModal} onDelete={handleDelete} t={t} />
      )}

      {pipeTab === 'board' && (<>
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
                <button type="button" onClick={() => setInfoStage(stage.key)} title={t('Penjelasan stage')} aria-label={t('Info')} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                </button>
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

              <button onClick={() => { openModal(undefined, stage.key as ClientStage); }}
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
      </>)}

      {pipeTab === 'followup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {dueFollowUps.length === 0 ? (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
              {t('Tidak ada follow-up yang jatuh tempo.')}
            </div>
          ) : dueFollowUps.map(({ f, tone, c }) => (
            <button key={f.id} onClick={() => setDetailId(f.client_id)} style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone === 'overdue' ? '#ff6b6b' : '#ffc542', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              <span style={{ fontSize: 11, color: tone === 'overdue' ? '#ff6b6b' : 'var(--text2)' }}>{new Date(f.next_follow_up).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
            </button>
          ))}
        </div>
      )}

      {showModal && (
        <ClientFormModal
          client={editClient}
          prefillStage={addStage}
          onClose={() => { setShowModal(false); setEditClient(null); setAddStage(undefined) }}
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
        <Modal open onClose={() => setDetailId(null)} title={t('Detail Client')} maxWidth={1040} className="h-[88vh]"
          headerRight={(() => { const dc = clients.find(c => c.id === detailId); return dc ? <StageSelect client={dc} /> : null })()}>
          <ClientProfile id={detailId} onClose={() => setDetailId(null)} />
        </Modal>
      )}

      {infoStage && (
        <Modal open onClose={() => setInfoStage(null)} title={STAGE_LABELS[infoStage] ?? infoStage} maxWidth={420}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '4px 2px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: (CRM_STAGES.find(s => s.key === infoStage)?.color) ?? 'var(--text3)' }} />
            <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.65, margin: 0 }}>{STAGE_INFO[infoStage] ?? t('Belum ada penjelasan.')}</p>
          </div>
        </Modal>
      )}
    </div>
  )
})

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
      logActivity(`Client diupdate: "${form.name}"`, 'contact')
      if (client.stage !== form.stage) logStageChange(client.id, client.stage, form.stage)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: created, error } = await (supabase as any)
        .from('clients').insert({ ...data, lead_id: leadId || null }).select().single()
      if (error) { setLoading(false); alert(t('Gagal menyimpan: ') + error.message); return }
      logActivity(`Client baru: "${form.name}" (${STAGE_LABELS[form.stage]})`, 'contact')
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

// Add/Edit a pipeline client using the full Add-Contact form. Saves the rich
// form to clients.lead_details and derives the flat pipeline columns from it.
export function ClientFormModal({ client, prefillStage, leadId, onClose, onCreated }: {
  client: Client | null
  prefillStage?: ClientStage
  leadId?: string
  onClose: () => void
  onCreated?: (id: string) => void
}) {
  const t = useT()
  const logActivity = useLogActivity()
  const initial = useMemo<Partial<NewLeadInput> | undefined>(() => {
    if (client) return clientToLeadInput(client)
    if (prefillStage) return { status: STAGE_TO_STATUS[prefillStage] }
    return undefined
  }, [client, prefillStage])

  async function handleSave(input: NewLeadInput) {
    const supabase = getSupabase()
    const stage = (client?.stage as ClientStage | undefined) ?? prefillStage
    const row = leadInputToClient(input, { stage })
    if (client) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('clients').update(row).eq('id', client.id)
      // Keep the linked contact (bsi_leads) in sync so brand/address stay current.
      if (client.lead_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('bsi_leads').update(inputToRow(input)).eq('id', client.lead_id)
      }
      logActivity(`Client diupdate: "${row.name}"`, 'pipeline')
      if (client.stage !== row.stage) logStageChange(client.id, client.stage, row.stage)
    } else if (leadId) {
      // Converting an existing contact (lead) into a pipeline client.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: created, error } = await (supabase as any)
        .from('clients').insert({ ...row, lead_id: leadId }).select().single()
      if (error) { alert(t('Gagal menyimpan: ') + error.message); throw error }
      logActivity(`Client baru: "${row.name}" (${STAGE_LABELS[row.stage] ?? row.stage})`, 'pipeline')
      if (created?.id) onCreated?.(created.id as string)
    } else {
      // Brand-new: one contact, created in both Contacts and Pipeline at once.
      const res = await addContactEverywhere(input, stage)
      if (!res) return
      logActivity(`Client baru: "${row.name}" (${STAGE_LABELS[row.stage] ?? row.stage})`, 'pipeline')
      onCreated?.(res.clientId)
    }
    onClose()
  }

  return (
    <LeadFormModal
      title={client ? t('Edit Client') : t('Tambah Client Baru')}
      saveLabel={t('Simpan')}
      initial={initial}
      onClose={onClose}
      onSave={handleSave}
    />
  )
}

function CSection({ children }: { title?: string; children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
}

// Pill filter — same style as the Contacts (ClientDatabase) FilterChip so the
// pipeline stage filter reads consistent with the rest of the CRM.
function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ padding: '4px 10px', borderRadius: 16, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'rgba(108,99,255,0.15)' : 'var(--bg3)', color: active ? 'var(--accent)' : 'var(--text2)', fontWeight: active ? 600 : 400 }}
    >
      {label}
    </button>
  )
}

// Single "Filter" button + dropdown — mirrors the Contacts (DatabaseFilter)
// pattern so the pipeline stage filter looks and behaves the same.
export function StageFilter({ t, crmFilter, setCrmFilter, counts }: {
  t: (s: string) => string
  crmFilter: string
  setCrmFilter: (v: string) => void
  counts: Record<string, number>
}) {
  const [open, setOpen] = useState(false)
  const active = crmFilter !== 'all'
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid', borderColor: active || open ? 'var(--accent)' : 'var(--border)', background: active ? 'rgba(108,99,255,0.12)' : 'var(--bg2)', color: active ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        {t('Filter')}{active ? ` (1)` : ''}
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 70, width: 320, maxWidth: 'min(320px, 92vw)', maxHeight: '64vh', overflowY: 'auto', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('Filter')}</span>
              <button onClick={() => setCrmFilter('all')} style={{ background: 'none', border: 'none', color: 'var(--link)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{t('Reset')}</button>
            </div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', fontWeight: 700, marginBottom: 8 }}>{t('Stage')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <FilterChip label={`${t('Semua')} (${counts.all ?? 0})`} active={crmFilter === 'all'} onClick={() => setCrmFilter('all')} />
              {CRM_STAGES.map(s => (
                <FilterChip key={s.key} label={`${s.label} (${counts[s.key] ?? 0})`} active={crmFilter === s.key} onClick={() => setCrmFilter(crmFilter === s.key ? 'all' : s.key)} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── List view — BPI-style table of pipeline clients ──
function ClientListView({ rows, today, toneByClient, nextFu, onRowClick, onEdit, onDelete, t }: {
  rows: Client[]
  today: string
  toneByClient: Map<string, 'overdue' | 'due'>
  nextFu: Map<string, string>
  onRowClick: (id: string) => void
  onEdit: (client: Client) => void
  onDelete: (id: string) => void
  t: (s: string) => string
}) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <table>
        <thead>
          <tr>
            <th>{t('Nama')}</th>
            <th>{t('PIC')}</th>
            <th>{t('Kontak')}</th>
            <th>{t('Stage')}</th>
            <th>{t('Value')}</th>
            <th>{t('Temp')}</th>
            <th>{t('Next Follow-up')}</th>
            <th style={{ width: 96, whiteSpace: 'nowrap' }}>{t('Aksi')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8}>
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text2)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📇</div>
                  {t('Belum ada client. Klik "+ Tambah Client" untuk mulai.')}
                </div>
              </td>
            </tr>
          ) : rows.map(c => {
            const stage = CRM_STAGES.find(s => s.key === c.stage)
            const temp = TEMPERATURES.find(x => x.key === c.temperature)
            const fu = nextFu.get(c.id)
            const tone = toneByClient.get(c.id)
            const fuOverdue = !!fu && fu < today && !(CLOSED_STAGES as readonly string[]).includes(c.stage)
            return (
              <tr key={c.id} onClick={() => onRowClick(c.id)} style={{ cursor: 'pointer' }}>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    {tone && <span title={tone === 'overdue' ? t('Follow-up lewat tenggat') : t('Follow-up jatuh tempo')} style={{ width: 8, height: 8, borderRadius: '50%', background: tone === 'overdue' ? '#ff6b6b' : '#ffc542', flexShrink: 0 }} />}
                    <span style={{ fontWeight: 500, fontSize: 13 }}>{c.name}</span>
                  </span>
                </td>
                <td style={{ color: 'var(--text2)', fontSize: 12 }}>{c.pic || '—'}</td>
                <td style={{ color: 'var(--text2)', fontSize: 12 }}>{c.contact || '—'}</td>
                <td>{stage ? <span style={{ fontSize: 11, fontWeight: 600, color: stage.color, background: stage.color + '22', borderRadius: 20, padding: '2px 10px', whiteSpace: 'nowrap' }}>{stage.label}</span> : '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--accent4)', fontWeight: 600 }}>{c.value > 0 ? formatRupiah(c.value) : '—'}</td>
                <td>{temp ? <span style={{ fontSize: 11, fontWeight: 600, color: temp.color, background: temp.color + '22', padding: '2px 9px', borderRadius: 20 }}>{temp.label}</span> : '—'}</td>
                <td style={{ fontSize: 12, color: fuOverdue ? '#ff6b6b' : 'var(--text2)' }}>
                  {fu ? new Date(fu).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={() => onEdit(c)} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--text)', whiteSpace: 'nowrap' }}>{t('Edit')}</button>
                    <button onClick={() => onDelete(c.id)} style={{ background: 'var(--accent2)', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: '#fff', lineHeight: 1 }}>✕</button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
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
