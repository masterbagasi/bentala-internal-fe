'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/LanguageProvider'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { getSupabase } from '@/lib/supabase'
import { CRM_STAGES, STAGE_LABELS, SERVICE_OPTIONS } from '@/lib/constants'
import { formatRupiah } from '@/lib/utils'
import { useLogActivity } from '@/hooks/useData'
import { logStageChange } from '@/lib/log-interaction'
import { followUpTone, todayISODate } from '@/lib/follow-up'
import type { Client, ClientStage } from '@/lib/types'

export function CRMPage() {
  const t = useT()
  const router = useRouter()
  const { clients, crmFilter, setCrmFilter, followUps } = useStore(useShallow((s) => ({ clients: s.clients, crmFilter: s.crmFilter, setCrmFilter: s.setCrmFilter, followUps: s.followUps })))
  const [showModal, setShowModal] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const logActivity = useLogActivity()

  function openModal(client?: Client) {
    setEditClient(client || null)
    setShowModal(true)
  }

  const filtered = crmFilter === 'all' ? clients : clients.filter(c => c.stage === crmFilter)

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
    logActivity('Client dihapus')
  }

  async function moveStage(id: string, stage: string) {
    const supabase = getSupabase()
    const c = clients.find(x => x.id === id)
    const prev = c?.stage
    await supabase.from('clients').update({ stage }).eq('id', id)
    if (c) logActivity(`${c.name} dipindah ke ${STAGE_LABELS[stage]}`)
    if (prev && prev !== stage) logStageChange(id, prev, stage)
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
                <button key={f.id} onClick={() => router.push(`/clients/${f.client_id}`)} style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer' }}>
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
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
        {CRM_STAGES.map(stage => {
          const cols = filtered.filter(c => c.stage === stage.key)
          return (
            <div key={stage.key}
              style={{
                minWidth: 265, maxWidth: 265, background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '14px 12px 10px', flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ fontWeight: 600, color: stage.color, fontSize: 14 }}>{stage.label}</span>
                <span style={{ fontSize: 12, color: stage.color, background: stage.color + '22', borderRadius: 20, padding: '1px 7px' }}>
                  {cols.length}
                </span>
              </div>

              {cols.map(c => (
                <div key={c.id}
                  onClick={() => router.push(`/clients/${c.id}`)}
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, cursor: 'pointer' }}
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--bg2)', padding: '2px 8px', borderRadius: 20, border: '1px solid var(--border)' }}>
                      {stage.label}
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={(e) => { e.stopPropagation(); openModal(c) }}
                        style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--text)' }}>✏️</button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id) }}
                        style={{ background: 'var(--accent2)', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11, color: '#fff' }}>✕</button>
                    </div>
                  </div>
                  {/* Move buttons */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {CRM_STAGES.filter(x => x.key !== stage.key).map(x => (
                      <button key={x.key}
                        onClick={(e) => { e.stopPropagation(); moveStage(c.id, x.key) }}
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', fontSize: 10, color: 'var(--text2)' }}
                        onMouseOver={e => (e.currentTarget as HTMLElement).style.borderColor = x.color}
                        onMouseOut={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
                      >
                        → {x.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

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
    </div>
  )
}

// ── Client Modal ──
function ClientModal({ open, client, onClose }: { open: boolean; client: Client | null; onClose: () => void }) {
  const t = useT()
  const logActivity = useLogActivity()
  const [form, setForm] = useState({
    name: client?.name || '',
    pic: client?.pic || '',
    contact: client?.contact || '',
    stage: client?.stage || 'lead',
    value: client?.value?.toString() || '',
    service: client?.service || 'smm',
    internal: client?.internal || 'Dandi',
    notes: client?.notes || '',
  })
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    if (!form.name.trim()) { alert(t('Nama client wajib diisi!')); return }
    setLoading(true)
    const supabase = getSupabase()
    const data = {
      name:     form.name.trim(),
      pic:      form.pic,
      contact:  form.contact,
      stage:    form.stage,
      value:    parseFloat(form.value) || 0,
      service:  form.service,
      internal: form.internal,
      notes:    form.notes,
    }
    if (client) {
      await supabase.from('clients').update(data).eq('id', client.id)
      logActivity(`Client diupdate: "${form.name}"`)
      if (client.stage !== form.stage) logStageChange(client.id, client.stage, form.stage)
    } else {
      await supabase.from('clients').insert(data)
      logActivity(`Client baru: "${form.name}" (${STAGE_LABELS[form.stage]})`)
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FG label={t('Nama Client / Brand *')}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FG label="Stage">
            <select value={form.stage} onChange={e => setForm(f=>({...f,stage:e.target.value as ClientStage}))}>
              <option value="lead">{t('Lead / Prospek')}</option>
              <option value="pitch">{t('Pitching / Proposal')}</option>
              <option value="close">{t('Closed / Deal')}</option>
              <option value="invoice">Invoice</option>
              <option value="inactive">Inactive</option>
            </select>
          </FG>
          <FG label={t('Nilai Deal (Rp)')}>
            <input type="number" value={form.value} onChange={e => setForm(f=>({...f,value:e.target.value}))} placeholder="0" />
          </FG>
        </div>
        <FG label={t('Jenis Layanan')}>
          <select value={form.service} onChange={e => setForm(f=>({...f,service:e.target.value}))}>
            {SERVICE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FG>
        <FG label={t('PIC Internal')}>
          <select value={form.internal} onChange={e => setForm(f=>({...f,internal:e.target.value}))}>
            <option value="Dandi">Dandi (CEO)</option>
            <option value="Naufal">Naufal (CCO)</option>
            <option value="Reinaldi">Reinaldi (CBO)</option>
            <option value="Faizal">Faizal (COO)</option>
          </select>
        </FG>
        <FG label={t('Catatan')}>
          <textarea value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} placeholder={t('Catatan terkait client...')} />
        </FG>
      </div>
    </Modal>
  )
}

function FG({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  )
}
