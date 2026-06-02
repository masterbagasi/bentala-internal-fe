'use client'

import { useState } from 'react'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { useStore } from '@/hooks/useStore'
import { getSupabase } from '@/lib/supabase'
import { INV_STATUS_LABELS } from '@/lib/constants'
import { formatRupiah, formatDate, generateInvoiceNum } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { useLogActivity } from '@/hooks/useData'
import type { Invoice } from '@/lib/types'

export function InvoicesPage() {
  const { invoices, clients } = useStore()
  const [showModal, setShowModal] = useState(false)
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null)
  const logActivity = useLogActivity()

  // KPIs
  let pending = 0, paid = 0, overdue = 0, total = 0
  invoices.forEach(i => {
    if (i.status === 'pending' || i.status === 'dp') pending += i.value
    if (i.status === 'paid') paid += i.value
    if (i.status === 'overdue') overdue += i.value
    total += i.value
  })

  async function handleDelete(id: string) {
    if (!confirm('Hapus invoice ini?')) return
    const supabase = getSupabase()
    await supabase.from('invoices').delete().eq('id', id)
    logActivity('Invoice dihapus')
  }

  async function updateStatus(id: string, status: string) {
    const supabase = getSupabase()
    await supabase.from('invoices').update({ status }).eq('id', id)
    const inv = invoices.find(i => i.id === id)
    if (inv) logActivity(`Invoice ${inv.num} diupdate: ${INV_STATUS_LABELS[status] || status}`)
  }

  return (
    <div>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Pending / DP', value: formatRupiah(pending), color: '#ffc542' },
          { label: 'Lunas',        value: formatRupiah(paid),    color: '#43d9a2' },
          { label: 'Overdue',      value: formatRupiah(overdue), color: '#ff6b6b' },
          { label: 'Total',        value: formatRupiah(total),   color: 'var(--text)' },
        ].map(k => (
          <div key={k.label}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Daftar Invoice ({invoices.length})</div>
        <button
          onClick={() => { setEditInvoice(null); setShowModal(true) }}
          style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
        >
          + Invoice Baru
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>No. Invoice</th>
              <th>Client</th>
              <th>Project</th>
              <th>Nilai</th>
              <th>Jatuh Tempo</th>
              <th>Status</th>
              <th style={{ width: 160 }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colSpan={7}>
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text2)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>💰</div>
                  Belum ada invoice.
                </div>
              </td></tr>
            ) : [...invoices].reverse().map(inv => (
              <tr key={inv.id}>
                <td style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{inv.num}</td>
                <td>{inv.client}</td>
                <td style={{ color: 'var(--text2)' }}>{inv.project || '—'}</td>
                <td style={{ color: 'var(--accent4)', fontWeight: 600 }}>{formatRupiah(inv.value)}</td>
                <td style={{ color: 'var(--text2)', fontSize: 12 }}>{formatDate(inv.due)}</td>
                <td><StatusBadge status={inv.status} type="inv" /></td>
                <td>
                  <select
                    value={inv.status}
                    onChange={e => updateStatus(inv.id, e.target.value)}
                    style={{ width: 100, padding: '3px 6px', fontSize: 12 }}
                    onClick={e => e.stopPropagation()}
                  >
                    {Object.entries(INV_STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => { setEditInvoice(inv); setShowModal(true) }}
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--text)', margin: '0 4px' }}
                  >Edit</button>
                  <button
                    onClick={() => handleDelete(inv.id)}
                    style={{ background: 'var(--accent2)', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: '#fff' }}
                  >✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <InvoiceModal
          open={showModal}
          invoice={editInvoice}
          clients={clients}
          invoiceCount={invoices.length}
          onClose={() => { setShowModal(false); setEditInvoice(null) }}
        />
      )}
    </div>
  )
}

function InvoiceModal({ open, invoice, clients, invoiceCount, onClose }: {
  open: boolean
  invoice: Invoice | null
  clients: ReturnType<typeof useStore>['clients']
  invoiceCount: number
  onClose: () => void
}) {
  const logActivity = useLogActivity()
  const [form, setForm] = useState({
    client:  invoice?.client || '',
    project: invoice?.project || '',
    value:   invoice?.value?.toString() || '',
    due:     invoice?.due || '',
    status:  invoice?.status || 'pending',
    notes:   invoice?.notes || '',
  })
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    if (!form.client || !form.value) { alert('Client dan nilai invoice wajib diisi!'); return }
    setLoading(true)
    const supabase = getSupabase()
    const num = invoice?.num || generateInvoiceNum(invoiceCount)
    const data = {
      num,
      client:  form.client,
      project: form.project,
      value:   parseFloat(form.value) || 0,
      due:     form.due || null,
      status:  form.status,
      notes:   form.notes,
    }
    if (invoice) {
      await supabase.from('invoices').update(data).eq('id', invoice.id)
    } else {
      await supabase.from('invoices').insert(data)
      logActivity(`Invoice baru: ${num} — ${form.client} (${formatRupiah(parseFloat(form.value)||0)})`)
    }
    setLoading(false)
    onClose()
  }

  return (
    <Modal
      open={open} onClose={onClose}
      title={invoice ? 'Edit Invoice' : 'Invoice Baru'}
      footer={<><BtnSecondary onClick={onClose}>Batal</BtnSecondary><BtnPrimary onClick={handleSave} loading={loading}>Simpan</BtnPrimary></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FG label="Client *">
            <select value={form.client} onChange={e => setForm(f=>({...f,client:e.target.value}))}>
              <option value="">— Pilih Client —</option>
              {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </FG>
          <FG label="Project">
            <input type="text" value={form.project} onChange={e => setForm(f=>({...f,project:e.target.value}))} placeholder="Nama project" />
          </FG>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FG label="Nilai Invoice (Rp) *">
            <input type="number" value={form.value} onChange={e => setForm(f=>({...f,value:e.target.value}))} placeholder="0" />
          </FG>
          <FG label="Jatuh Tempo">
            <input type="date" value={form.due} onChange={e => setForm(f=>({...f,due:e.target.value}))} />
          </FG>
        </div>
        <FG label="Status">
          <select value={form.status} onChange={e => setForm(f=>({...f,status:e.target.value}))}>
            {Object.entries(INV_STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </FG>
        <FG label="Catatan">
          <textarea value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} placeholder="Catatan..." />
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
