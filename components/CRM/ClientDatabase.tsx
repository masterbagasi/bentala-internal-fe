'use client'

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'
import { formatRupiah } from '@/lib/utils'
import { CRM_STAGES, STAGE_LABELS, TEMPERATURES } from '@/lib/constants'
import { Modal } from '@/components/shared/Modal'
import { ClientProfile } from './ClientProfile'
import { ClientModal } from '@/components/CRM'
import { LeadFormModal, type NewLeadInput } from './LeadFormModal'
import type { Client } from '@/lib/types'
import type { BsiLead } from '@/lib/website-types'

const LEAD_STATUS: Record<string, { label: string; color: string }> = {
  new:       { label: 'Baru',            color: '#6c63ff' },
  contacted: { label: 'Sudah Dihubungi', color: '#ffc542' },
  qualified: { label: 'Qualified',       color: '#43d9a2' },
  closed:    { label: 'Closed',          color: '#43d9a2' },
  spam:      { label: 'Spam',            color: '#ff6b6b' },
}

interface Contact {
  id: string
  kind: 'client' | 'lead'
  name: string
  brand: string
  contact: string
  contactType: 'whatsapp' | 'email'
  statusLabel: string
  statusColor: string
  pic: string
  value: number | null
  source: string
  date: string
  lastContacted?: string | null
  client?: Client
  lead?: BsiLead
}

const digits = (s: string) => (s || '').replace(/[^\d]/g, '')
const isEmail = (s: string) => (s || '').includes('@')
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const cap = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—')

function clientToContact(c: Client): Contact {
  const stage = CRM_STAGES.find((x) => x.key === c.stage)
  return {
    id: `c:${c.id}`, kind: 'client', name: c.name, brand: c.name, contact: c.contact || '',
    contactType: isEmail(c.contact || '') ? 'email' : 'whatsapp',
    statusLabel: STAGE_LABELS[c.stage] ?? c.stage, statusColor: stage?.color ?? 'var(--text2)',
    pic: c.internal || '—', value: c.value || 0, source: c.source || 'manual', date: c.created_at, client: c,
  }
}
function leadToContact(l: BsiLead): Contact {
  const st = LEAD_STATUS[l.status] ?? { label: l.status, color: 'var(--text2)' }
  return {
    id: `l:${l.id}`, kind: 'lead', name: l.full_name, brand: l.brand_name, contact: l.contact_value || '',
    contactType: l.contact_type, statusLabel: st.label, statusColor: st.color,
    pic: '—', value: null, source: l.source || l.origin || 'website', date: l.submitted_at, lead: l,
  }
}

export function ClientDatabase() {
  const t = useT()
  const clients = useStore(useShallow((s) => s.clients))
  const removeClient = useStore((s) => s.removeClient)
  const [leads, setLeads] = useState<BsiLead[]>([])
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | 'client' | 'lead'>('all')
  const [sortKey, setSortKey] = useState<'name' | 'date'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [detailClientId, setDetailClientId] = useState<string | null>(null)
  const [peekLead, setPeekLead] = useState<BsiLead | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [convertLead, setConvertLead] = useState<BsiLead | null>(null)
  const [lastContact, setLastContact] = useState<Map<string, string>>(new Map())

  // Last-contacted per client = the most recent interaction or message.
  useEffect(() => {
    let cancelled = false
    const sb = getSupabase()
    Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).from('client_interactions').select('client_id, occurred_at'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).from('client_messages').select('client_id, created_at'),
    ]).then(([ia, msg]: [{ data: { client_id: string; occurred_at: string }[] | null }, { data: { client_id: string; created_at: string }[] | null }]) => {
      if (cancelled) return
      const m = new Map<string, string>()
      const put = (cid: string, ts: string) => { const cur = m.get(cid); if (cid && ts && (!cur || ts > cur)) m.set(cid, ts) }
      for (const r of ia.data ?? []) put(r.client_id, r.occurred_at)
      for (const r of msg.data ?? []) put(r.client_id, r.created_at)
      setLastContact(m)
    })
    return () => { cancelled = true }
  }, [])

  // Database = curated contacts: every promoted lead (in_database, not yet a
  // client) + all clients. Clients come from the realtime store.
  useEffect(() => {
    let cancelled = false
    getSupabase()
      .from('bsi_leads')
      .select('*')
      .eq('in_database', true)
      .is('converted_client_id', null)
      .order('submitted_at', { ascending: false })
      .then(({ data }) => { if (!cancelled) setLeads((data as BsiLead[] | null) ?? []) })
    return () => { cancelled = true }
  }, [])

  async function handleAddContact(input: NewLeadInput) {
    const row = {
      full_name: input.full_name.trim(), brand_name: input.brand_name.trim(), contact_type: input.contact_type,
      contact_value: input.contact_value.trim(), source: input.source, project_type: input.project_type.trim(),
      notes: input.notes.trim(), status: input.status, origin: 'manual', in_database: true, submitted_at: new Date().toISOString(),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (getSupabase() as any).from('bsi_leads').insert(row).select().single()
    if (error) { alert(error.message); return }
    if (data) setLeads((xs) => [data as BsiLead, ...xs])
    setShowAdd(false)
  }

  async function handleDelete(r: Contact) {
    const label = r.kind === 'client' ? t('Hapus client ini dari database?') : t('Hapus kontak ini dari database?')
    if (!confirm(label)) return
    const supabase = getSupabase()
    if (r.kind === 'client' && r.client) {
      await supabase.from('clients').delete().eq('id', r.client.id)
      removeClient(r.client.id)
    } else if (r.lead) {
      await supabase.from('bsi_leads').delete().eq('id', r.lead.id)
      setLeads((xs) => xs.filter((x) => x.id !== r.lead!.id))
    }
  }

  async function handleConverted(clientId: string) {
    const lead = convertLead
    if (!lead) return
    await getSupabase().from('bsi_leads').update({ converted_client_id: clientId }).eq('id', lead.id)
    setLeads((xs) => xs.filter((x) => x.id !== lead.id)) // now shown as its client row
    setConvertLead(null)
    setPeekLead(null)
  }

  const rows = useMemo(() => {
    const all: Contact[] = [
      ...clients.map((c) => ({ ...clientToContact(c), lastContacted: lastContact.get(c.id) ?? null })),
      ...leads.map(leadToContact),
    ]
    const q = query.trim().toLowerCase()
    const filtered = all.filter((r) => {
      if (kind !== 'all' && r.kind !== kind) return false
      if (q && !`${r.name} ${r.brand} ${r.contact}`.toLowerCase().includes(q)) return false
      return true
    })
    const dir = sortDir === 'asc' ? 1 : -1
    return filtered.sort((a, b) => (sortKey === 'name' ? a.name.localeCompare(b.name) : String(a.date).localeCompare(String(b.date))) * dir)
  }, [clients, leads, lastContact, query, kind, sortKey, sortDir])

  const counts = useMemo(() => ({ client: clients.length, lead: leads.length }), [clients.length, leads.length])

  function exportCsv() {
    const headers = ['Nama', 'Brand', 'Kontak', 'Tipe', 'Status', 'PIC', 'Nilai', 'Source', 'Masuk', 'Terakhir Dihubungi']
    const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = rows.map((r) => [r.name, r.brand, r.contact, r.kind === 'client' ? 'Client' : 'Kontak', r.statusLabel, r.pic, r.value ?? '', r.source, (r.date || '').slice(0, 10), (r.lastContacted || '').slice(0, 10)].map(esc).join(','))
    const csv = [headers.map(esc).join(','), ...lines].join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `database-kontak-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function toggleSort(k: 'name' | 'date') {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir(k === 'name' ? 'asc' : 'desc') }
  }

  const selectStyle: React.CSSProperties = { fontSize: 12, padding: '6px 8px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Cari nama / brand / kontak...')}
          style={{ flex: '1 1 220px', minWidth: 180, fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        <select value={kind} onChange={(e) => setKind(e.target.value as 'all' | 'client' | 'lead')} style={selectStyle}>
          <option value="all">{t('Semua')} ({counts.client + counts.lead})</option>
          <option value="client">Client ({counts.client})</option>
          <option value="lead">Kontak ({counts.lead})</option>
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{rows.length} {t('kontak')}</span>
          <button type="button" onClick={exportCsv} style={{ fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', whiteSpace: 'nowrap' }}>↓ Export CSV</button>
          <button type="button" onClick={() => setShowAdd(true)} style={{ fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 8, background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ {t('Tambah Kontak')}</button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 940 }}>
          <thead>
            <tr style={{ background: 'var(--bg2)' }}>
              <Th label={t('Nama')} onClick={() => toggleSort('name')} active={sortKey === 'name'} dir={sortDir} />
              <Th label={t('Brand')} />
              <Th label={t('Kontak')} />
              <Th label="Tipe" />
              <Th label="Status" />
              <Th label="PIC" />
              <Th label={t('Nilai')} align="right" />
              <Th label="Source" />
              <Th label={t('Masuk')} onClick={() => toggleSort('date')} active={sortKey === 'date'} dir={sortDir} />
              <Th label={t('Terakhir Dihubungi')} />
              <Th label={t('Aksi')} align="center" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={11} style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>{t('Belum ada kontak.')}</td></tr>
            ) : rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => (r.kind === 'client' ? setDetailClientId(r.client!.id) : setPeekLead(r.lead!))}
                style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg2)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text)' }}>{r.name}</td>
                <td style={{ padding: '9px 12px', color: 'var(--text2)' }}>{r.brand || '—'}</td>
                <td style={{ padding: '9px 12px', color: 'var(--text2)', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5 }}>{r.contact || '—'}</td>
                <td style={{ padding: '9px 12px' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: r.kind === 'client' ? 'var(--accent)' : '#ffa94d', background: (r.kind === 'client' ? 'var(--accent)' : '#ffa94d') + '22', borderRadius: 20, padding: '2px 8px' }}>
                    {r.kind === 'client' ? 'Client' : 'Kontak'}
                  </span>
                </td>
                <td style={{ padding: '9px 12px' }}>
                  <span style={{ fontSize: 11, color: r.statusColor, background: r.statusColor + '22', borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>{r.statusLabel}</span>
                </td>
                <td style={{ padding: '9px 12px', color: 'var(--text2)' }}>{r.pic}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--text)', whiteSpace: 'nowrap' }}>{r.value ? formatRupiah(r.value) : '—'}</td>
                <td style={{ padding: '9px 12px', color: 'var(--text2)' }}>{cap(r.source)}</td>
                <td style={{ padding: '9px 12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                <td style={{ padding: '9px 12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{r.lastContacted ? fmtDate(r.lastContacted) : '—'}</td>
                <td style={{ padding: '9px 12px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <ContactAction contact={r.contact} type={r.contactType} t={t} />
                    {r.kind === 'lead' && (
                      <button
                        type="button"
                        onClick={() => setConvertLead(r.lead!)}
                        title={t('Tambah ke CRM Pipeline (Prospect)')}
                        style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'rgba(108,99,255,0.12)', border: '1px solid rgba(108,99,255,0.3)', borderRadius: 6, padding: '5px 9px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        + Prospect
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(r)}
                      title={t('Hapus dari database')}
                      style={{ width: 30, height: 30, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#ff6b6b', background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.25)', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detailClientId && (
        <Modal open onClose={() => setDetailClientId(null)} title={t('Detail Client')} maxWidth={1040}>
          <ClientProfile id={detailClientId} onClose={() => setDetailClientId(null)} />
        </Modal>
      )}
      {peekLead && <LeadPeek lead={peekLead} onClose={() => setPeekLead(null)} onConvert={() => setConvertLead(peekLead)} t={t} />}
      {showAdd && <LeadFormModal title={t('Tambah Kontak')} defaultStatus="qualified" onClose={() => setShowAdd(false)} onSave={handleAddContact} />}
      {convertLead && (
        <ClientModal
          open
          client={null}
          source="website"
          leadId={convertLead.id}
          prefill={{
            name: convertLead.brand_name || convertLead.full_name,
            pic: convertLead.full_name,
            contact: convertLead.contact_value,
            notes: [convertLead.project_type, convertLead.notes].filter(Boolean).join(' · '),
            stage: 'prospect',
          }}
          onCreated={handleConverted}
          onClose={() => setConvertLead(null)}
        />
      )}
    </div>
  )
}

function ContactAction({ contact, type, t }: { contact: string; type: 'whatsapp' | 'email'; t: (s: string) => string }) {
  if (!contact) return <span style={{ color: 'var(--text3)' }}>—</span>
  const wa = !(type === 'email' || isEmail(contact))
  const href = wa ? `https://wa.me/${digits(contact)}` : `mailto:${contact}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={wa ? t('Buka WhatsApp') : t('Kirim Email')}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, textDecoration: 'none', background: wa ? 'rgba(37,211,102,0.14)' : 'rgba(108,99,255,0.14)', color: wa ? '#25D366' : 'var(--accent)', border: `1px solid ${wa ? 'rgba(37,211,102,0.25)' : 'rgba(108,99,255,0.25)'}` }}
    >
      {wa ? '💬' : '✉️'}
    </a>
  )
}

function LeadPeek({ lead, onClose, onConvert, t }: { lead: BsiLead; onClose: () => void; onConvert: () => void; t: (s: string) => string }) {
  const wa = lead.contact_type === 'whatsapp'
  const href = wa ? `https://wa.me/${digits(lead.contact_value)}` : `mailto:${lead.contact_value}`
  return (
    <Modal open onClose={onClose} title={t('Detail Kontak')} maxWidth={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{lead.full_name}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>{lead.brand_name}</div>
        </div>
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>{lead.contact_value}</span>
          <a href={href} target="_blank" rel="noopener noreferrer" style={{ alignSelf: 'flex-start', height: 32, padding: '0 14px', background: wa ? '#25D366' : 'var(--accent)', color: '#fff', borderRadius: 8, fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            {wa ? t('Buka WhatsApp') : t('Kirim Email')}
          </a>
        </div>
        {lead.project_type && <div style={{ fontSize: 13 }}><span style={{ color: 'var(--text2)' }}>{t('Project')}: </span>{lead.project_type}</div>}
        {lead.notes && <div style={{ fontSize: 12.5, lineHeight: 1.6, padding: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, whiteSpace: 'pre-line' }}>{lead.notes}</div>}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>{t('Masuk pipeline sebagai Prospect')}</span>
          <button onClick={onConvert} style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>+ Prospect</button>
        </div>
      </div>
    </Modal>
  )
}

function Th({ label, onClick, active, dir, align }: { label: string; onClick?: () => void; active?: boolean; dir?: 'asc' | 'desc'; align?: 'right' | 'center' }) {
  return (
    <th
      onClick={onClick}
      style={{ padding: '10px 12px', textAlign: align ?? 'left', fontSize: 11, fontWeight: 600, color: active ? 'var(--text)' : 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', cursor: onClick ? 'pointer' : 'default', userSelect: 'none' }}
    >
      {label}{active ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )
}
