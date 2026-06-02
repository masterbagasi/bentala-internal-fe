'use client'

import { useState } from 'react'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { useStore } from '@/hooks/useStore'
import { getSupabase } from '@/lib/supabase'
import { CRM_STAGES, STAGE_LABELS, SERVICE_OPTIONS } from '@/lib/constants'
import { formatRupiah } from '@/lib/utils'
import { useLogActivity } from '@/hooks/useData'
import type { Client, ClientStage } from '@/lib/types'

export function CRMPage() {
  const { clients, crmFilter, setCrmFilter } = useStore()
  const [showModal, setShowModal] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const logActivity = useLogActivity()

  function openModal(client?: Client) {
    setEditClient(client || null)
    setShowModal(true)
  }

  const filtered = crmFilter === 'all' ? clients : clients.filter(c => c.stage === crmFilter)

  async function handleDelete(id: string) {
    if (!confirm('Hapus client ini?')) return
    const supabase = getSupabase()
    await supabase.from('clients').delete().eq('id', id)
    logActivity('Client dihapus')
  }

  async function moveStage(id: string, stage: string) {
    const supabase = getSupabase()
    await supabase.from('clients').update({ stage }).eq('id', id)
    const c = clients.find(x => x.id === id)
    if (c) logActivity(`${c.name} dipindah ke ${STAGE_LABELS[stage]}`)
  }

  return (
    <div>
      {/* Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          onClick={() => setCrmFilter('all')}
          style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, background: crmFilter === 'all' ? 'var(--accent)' : 'var(--bg2)', color: crmFilter === 'all' ? '#fff' : 'var(--text2)', borderColor: crmFilter === 'all' ? 'var(--accent)' : 'var(--border)' }}
        >
          Semua
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
          + Tambah Client
        </button>
      </div>

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
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}
                >
                  <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>{c.name}</div>
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
                      <button onClick={() => openModal(c)}
                        style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--text)' }}>✏️</button>
                      <button onClick={() => handleDelete(c.id)}
                        style={{ background: 'var(--accent2)', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11, color: '#fff' }}>✕</button>
                    </div>
                  </div>
                  {/* Move buttons */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {CRM_STAGES.filter(x => x.key !== stage.key).map(x => (
                      <button key={x.key}
                        onClick={() => moveStage(c.id, x.key)}
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
                + Tambah
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
    if (!form.name.trim()) { alert('Nama client wajib diisi!'); return }
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
      title={client ? 'Edit Client' : 'Tambah Client Baru'}
      footer={<><BtnSecondary onClick={onClose}>Batal</BtnSecondary><BtnPrimary onClick={handleSave} loading={loading}>Simpan</BtnPrimary></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FG label="Nama Client / Brand *">
          <input type="text" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="PT. ..." />
        </FG>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FG label="PIC Client">
            <input type="text" value={form.pic} onChange={e => setForm(f=>({...f,pic:e.target.value}))} placeholder="Nama PIC" />
          </FG>
          <FG label="Kontak (WA/Email)">
            <input type="text" value={form.contact} onChange={e => setForm(f=>({...f,contact:e.target.value}))} placeholder="+62..." />
          </FG>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FG label="Stage">
            <select value={form.stage} onChange={e => setForm(f=>({...f,stage:e.target.value as ClientStage}))}>
              <option value="lead">Lead / Prospek</option>
              <option value="pitch">Pitching / Proposal</option>
              <option value="close">Closed / Deal</option>
              <option value="invoice">Invoice</option>
              <option value="inactive">Inactive</option>
            </select>
          </FG>
          <FG label="Nilai Deal (Rp)">
            <input type="number" value={form.value} onChange={e => setForm(f=>({...f,value:e.target.value}))} placeholder="0" />
          </FG>
        </div>
        <FG label="Jenis Layanan">
          <select value={form.service} onChange={e => setForm(f=>({...f,service:e.target.value}))}>
            {SERVICE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FG>
        <FG label="PIC Internal">
          <select value={form.internal} onChange={e => setForm(f=>({...f,internal:e.target.value}))}>
            <option value="Dandi">Dandi (CEO)</option>
            <option value="Naufal">Naufal (CCO)</option>
            <option value="Reinaldi">Reinaldi (CBO)</option>
            <option value="Faizal">Faizal (COO)</option>
          </select>
        </FG>
        <FG label="Catatan">
          <textarea value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} placeholder="Catatan terkait client..." />
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
