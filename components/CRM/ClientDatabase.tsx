'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'
import { formatRupiah } from '@/lib/utils'
import { CRM_STAGES, STAGE_LABELS } from '@/lib/constants'
import { Modal, ConfirmDialog, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { ClientProfile } from './ClientProfile'
import { ClientModal } from '@/components/CRM'
import { LeadFormModal, CONTACT_CHANNELS, type NewLeadInput } from './LeadFormModal'
import { ContactDetails } from './ContactDetails'
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
  brand: string
  pic: string
  contact: string
  contactType: 'whatsapp' | 'email'
  statusLabel: string
  statusColor: string
  value: number | null
  source: string
  date: string
  kota: string
  provinsi: string
  tier: string
  industri: string
  orders: number
  lastContacted?: string | null
  client?: Client
  lead?: BsiLead
}

const digits = (s: string) => (s || '').replace(/[^\d]/g, '')
const isEmail = (s: string) => (s || '').includes('@')
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const cap = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—')

// --- form <-> bsi_leads row mapping (shared by add & edit) ---
const slugify = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const STATUS_TO_DB: Record<string, string> = {
  'New lead': 'new', Contacted: 'contacted', Qualified: 'qualified',
  Prospek: 'qualified', Penawaran: 'qualified', Negosiasi: 'qualified', Won: 'closed', Lost: 'closed',
}
const STATUS_FROM_DB: Record<string, string> = { new: 'New lead', contacted: 'Contacted', qualified: 'Qualified', closed: 'Won', spam: 'Lost' }

// Build the bsi_leads column object from form input (excludes origin/in_database/submitted_at).
function inputToRow(input: NewLeadInput) {
  return {
    full_name: input.full_name.trim(), jabatan: input.jabatan.trim(), brand_name: input.brand_name.trim(),
    tier_klien: input.tier_klien, industri: input.industri,
    contact_type: slugify(input.contact_type) || 'whatsapp', contact_value: input.contact_value.trim(), kontak_lainnya: input.kontak_lainnya,
    source: input.source, detail_sumber: input.detail_sumber.trim(),
    // project_type is the legacy NOT NULL column; mirror the jenis_project list into it.
    project_type: input.jenis_project.join(', ') || '-',
    jenis_project: input.jenis_project, objektif: input.objektif, budget_range: input.budget_range, timeline: input.timeline,
    status: STATUS_TO_DB[input.status] ?? 'new', prioritas: input.prioritas, pic: input.pic, next_action: input.next_action.trim(),
    follow_up_date: input.follow_up_date || null, tags: input.tags, notes: input.notes.trim(), lampiran: input.lampiran,
    nama_lokasi: input.nama_lokasi.trim(), alamat_jalan: input.alamat_jalan.trim(), alamat_rtrw: input.alamat_rtrw.trim(),
    alamat_blok: input.alamat_blok.trim(), kelurahan: input.kelurahan.trim(), kecamatan: input.kecamatan.trim(),
    kota: input.kota.trim(), provinsi: input.provinsi, kode_pos: input.kode_pos.trim(), negara: input.negara,
  }
}

// Reverse a stored lead row into form input for editing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function leadToInput(l: any): Partial<NewLeadInput> {
  const channel = CONTACT_CHANNELS.find((c) => slugify(c) === l.contact_type) ?? 'WhatsApp'
  return {
    full_name: l.full_name ?? '', jabatan: l.jabatan ?? '', brand_name: l.brand_name ?? '',
    tier_klien: l.tier_klien ?? 'UMKM', industri: l.industri ?? 'Food & beverage',
    contact_type: channel, contact_value: l.contact_value ?? '',
    kontak_lainnya: Array.isArray(l.kontak_lainnya) ? l.kontak_lainnya : [],
    source: l.source ?? 'Instagram', detail_sumber: l.detail_sumber ?? '',
    jenis_project: Array.isArray(l.jenis_project) ? l.jenis_project : [],
    objektif: l.objektif ?? '', budget_range: l.budget_range ?? '', timeline: l.timeline ?? '',
    status: STATUS_FROM_DB[l.status] ?? 'New lead', prioritas: l.prioritas ?? 'Warm',
    pic: l.pic ?? '', next_action: l.next_action ?? '', follow_up_date: l.follow_up_date ?? '',
    tags: Array.isArray(l.tags) ? l.tags : [], notes: l.notes ?? '', lampiran: Array.isArray(l.lampiran) ? l.lampiran : [],
    nama_lokasi: l.nama_lokasi ?? '', alamat_jalan: l.alamat_jalan ?? '', alamat_rtrw: l.alamat_rtrw ?? '',
    alamat_blok: l.alamat_blok ?? '', kelurahan: l.kelurahan ?? '', kecamatan: l.kecamatan ?? '',
    kota: l.kota ?? '', provinsi: l.provinsi ?? '', kode_pos: l.kode_pos ?? '', negara: l.negara ?? 'Indonesia',
  }
}

function clientToContact(c: Client): Contact {
  const stage = CRM_STAGES.find((x) => x.key === c.stage)
  return {
    id: `c:${c.id}`, kind: 'client', brand: c.name, pic: c.pic || '—', contact: c.contact || '',
    contactType: isEmail(c.contact || '') ? 'email' : 'whatsapp',
    statusLabel: STAGE_LABELS[c.stage] ?? c.stage, statusColor: stage?.color ?? 'var(--text2)',
    value: c.value || 0, source: c.source || 'manual', date: c.created_at, kota: '', provinsi: '', tier: '', industri: '', orders: 0, client: c,
  }
}
function leadToContact(l: BsiLead): Contact {
  const st = LEAD_STATUS[l.status] ?? { label: l.status, color: 'var(--text2)' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const any = l as any
  return {
    id: `l:${l.id}`, kind: 'lead', brand: l.brand_name, pic: l.full_name, contact: l.contact_value || '',
    contactType: l.contact_type, statusLabel: st.label, statusColor: st.color,
    value: null, source: l.source || l.origin || 'website', date: l.submitted_at,
    kota: any.kota || '', provinsi: any.provinsi || '', tier: any.tier_klien || '', industri: any.industri || '', orders: 0, lead: l,
  }
}

export function ClientDatabase() {
  const t = useT()
  const { clients, projects } = useStore(useShallow((s) => ({ clients: s.clients, projects: s.projects })))
  const removeClient = useStore((s) => s.removeClient)
  const [leads, setLeads] = useState<BsiLead[]>([])
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [fKota, setFKota] = useState('')
  const [fProvinsi, setFProvinsi] = useState('')
  const [fTier, setFTier] = useState('')
  const [fIndustri, setFIndustri] = useState('')
  const [sortKey, setSortKey] = useState<'brand' | 'date'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [detailClientId, setDetailClientId] = useState<string | null>(null)
  const [peekLead, setPeekLead] = useState<BsiLead | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editLead, setEditLead] = useState<BsiLead | null>(null)
  const [convertLead, setConvertLead] = useState<BsiLead | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Contact | null>(null)
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
    const row = { ...inputToRow(input), origin: 'manual', in_database: true, submitted_at: new Date().toISOString() }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (getSupabase() as any).from('bsi_leads').insert(row).select().single()
    if (error) { alert(error.message); return }
    if (data) setLeads((xs) => [data as BsiLead, ...xs])
    setShowAdd(false)
  }

  async function handleEditSave(input: NewLeadInput) {
    if (!editLead) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (getSupabase() as any).from('bsi_leads').update(inputToRow(input)).eq('id', editLead.id).select().single()
    if (error) { alert(error.message); return }
    if (data) setLeads((xs) => xs.map((x) => (x.id === editLead.id ? (data as BsiLead) : x)))
    setEditLead(null)
  }

  async function doDelete(r: Contact) {
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

  function actionsFor(r: Contact): MenuItem[] {
    const items: MenuItem[] = []
    if (r.contact) {
      const wa = !(r.contactType === 'email' || isEmail(r.contact))
      items.push({
        label: wa ? t('Buka WhatsApp') : t('Kirim Email'), icon: wa ? '💬' : '✉️',
        onClick: () => window.open(wa ? `https://wa.me/${digits(r.contact)}` : `mailto:${r.contact}`, '_blank', 'noopener'),
      })
    }
    items.push({ label: t('Edit'), icon: '✏️', onClick: () => (r.kind === 'client' ? setDetailClientId(r.client!.id) : setEditLead(r.lead!)) })
    if (r.kind === 'lead') items.push({ label: t('Add Prospect'), onClick: () => setConvertLead(r.lead!) })
    items.push({ label: t('Delete'), danger: true, onClick: () => setConfirmDelete(r) })
    return items
  }

  // Jumlah order per client = number of projects linked to that client.
  const ordersByClient = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of projects) if (p.client_id) m.set(p.client_id, (m.get(p.client_id) ?? 0) + 1)
    return m
  }, [projects])

  const allContacts = useMemo<Contact[]>(() => [
    ...clients.map((c) => ({ ...clientToContact(c), lastContacted: lastContact.get(c.id) ?? null, orders: ordersByClient.get(c.id) ?? 0 })),
    ...leads.map(leadToContact),
  ], [clients, leads, lastContact, ordersByClient])

  // Distinct, sorted values present in the data → drive the filter dropdowns.
  const uniq = (vals: string[]) => Array.from(new Set(vals.filter(Boolean))).sort((a, b) => a.localeCompare(b))
  const options = useMemo(() => ({
    kota: uniq(allContacts.map((r) => r.kota)),
    provinsi: uniq(allContacts.map((r) => r.provinsi)),
    tier: uniq(allContacts.map((r) => r.tier)),
    industri: uniq(allContacts.map((r) => r.industri)),
  }), [allContacts])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = allContacts.filter((r) => {
      if (fKota && r.kota !== fKota) return false
      if (fProvinsi && r.provinsi !== fProvinsi) return false
      if (fTier && r.tier !== fTier) return false
      if (fIndustri && r.industri !== fIndustri) return false
      if (q && !`${r.brand} ${r.pic} ${r.contact}`.toLowerCase().includes(q)) return false
      return true
    })
    const dir = sortDir === 'asc' ? 1 : -1
    return filtered.sort((a, b) => (sortKey === 'brand' ? a.brand.localeCompare(b.brand) : String(a.date).localeCompare(String(b.date))) * dir)
  }, [allContacts, query, fKota, fProvinsi, fTier, fIndustri, sortKey, sortDir])

  function toggleSort(k: 'brand' | 'date') {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir(k === 'brand' ? 'asc' : 'desc') }
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{rows.length} {t('kontak')}</span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Search: a button until clicked, then an inline input. Collapses on blur when empty. */}
          {searchOpen ? (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => { if (!query.trim()) setSearchOpen(false) }}
              placeholder={t('Cari nama / brand / kontak...')}
              style={{ width: 240, fontSize: 13, padding: '7px 12px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--accent)', color: 'var(--text)' }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              title={t('Cari')}
              style={{ width: 34, height: 34, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}
              onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text)' }}
              onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text2)' }}
            >
              🔍
            </button>
          )}
          <DatabaseFilter
            t={t}
            fKota={fKota} setFKota={setFKota}
            fProvinsi={fProvinsi} setFProvinsi={setFProvinsi}
            fTier={fTier} setFTier={setFTier}
            fIndustri={fIndustri} setFIndustri={setFIndustri}
            options={options}
          />
          <button type="button" onClick={() => setShowAdd(true)} style={{ fontSize: 13, fontWeight: 500, padding: '7px 14px', borderRadius: 8, background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ {t('Tambah Kontak')}</button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1180 }}>
          <thead>
            <tr style={{ background: 'var(--bg2)' }}>
              <Th label={t('Brand')} onClick={() => toggleSort('brand')} active={sortKey === 'brand'} dir={sortDir} />
              <Th label="PIC" />
              <Th label={t('Kontak')} />
              <Th label={t('Kota')} />
              <Th label={t('Provinsi')} />
              <Th label="Status" />
              <Th label={t('Jumlah Order')} align="right" />
              <Th label={t('Nilai')} align="right" />
              <Th label="Source" />
              <Th label={t('Masuk')} onClick={() => toggleSort('date')} active={sortKey === 'date'} dir={sortDir} />
              <Th label={t('Terakhir Dihubungi')} />
              <Th label={t('Aksi')} align="center" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={12} style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>{t('Belum ada kontak.')}</td></tr>
            ) : rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => (r.kind === 'client' ? setDetailClientId(r.client!.id) : setPeekLead(r.lead!))}
                style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg2)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text)' }}>{r.brand || '—'}</td>
                <td style={{ padding: '9px 12px', color: 'var(--text2)' }}>{r.pic || '—'}</td>
                <td style={{ padding: '9px 12px', color: 'var(--text2)', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5 }}>{r.contact || '—'}</td>
                <td style={{ padding: '9px 12px', color: 'var(--text2)' }}>{r.kota || '—'}</td>
                <td style={{ padding: '9px 12px', color: 'var(--text2)' }}>{r.provinsi || '—'}</td>
                <td style={{ padding: '9px 12px' }}>
                  {r.kind === 'client'
                    ? <span style={{ fontSize: 11, color: r.statusColor, background: r.statusColor + '22', borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>{r.statusLabel}</span>
                    : <span style={{ color: 'var(--text3)' }}>—</span>}
                </td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: r.orders ? 'var(--text)' : 'var(--text3)', whiteSpace: 'nowrap' }}>{r.orders || '—'}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--text)', whiteSpace: 'nowrap' }}>{r.value ? formatRupiah(r.value) : '—'}</td>
                <td style={{ padding: '9px 12px', color: 'var(--text2)' }}>{cap(r.source)}</td>
                <td style={{ padding: '9px 12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                <td style={{ padding: '9px 12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{r.lastContacted ? fmtDate(r.lastContacted) : '—'}</td>
                <td style={{ padding: '9px 12px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <KebabMenu items={actionsFor(r)} />
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
      {peekLead && <LeadPeek lead={peekLead} onClose={() => setPeekLead(null)} onConvert={() => setConvertLead(peekLead)} onEdit={() => { setEditLead(peekLead); setPeekLead(null) }} t={t} />}
      {showAdd && <LeadFormModal title={t('Tambah kontak')} onClose={() => setShowAdd(false)} onSave={handleAddContact} />}
      {editLead && <LeadFormModal title={t('Edit kontak')} saveLabel={t('Simpan perubahan')} initial={leadToInput(editLead)} onClose={() => setEditLead(null)} onSave={handleEditSave} />}
      <ConfirmDialog
        open={!!confirmDelete}
        title={t('Hapus dari database')}
        message={confirmDelete?.kind === 'client' ? t('Hapus client ini dari database?') : t('Hapus kontak ini dari database?')}
        confirmLabel={t('Hapus')}
        cancelLabel={t('Batal')}
        danger
        onConfirm={() => { if (confirmDelete) doDelete(confirmDelete); setConfirmDelete(null) }}
        onCancel={() => setConfirmDelete(null)}
      />
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

// Filter button + popup — mirrors the Socmed board's BoardFilter.
function DatabaseFilter({ t, fKota, setFKota, fProvinsi, setFProvinsi, fTier, setFTier, fIndustri, setFIndustri, options }: {
  t: (s: string) => string
  fKota: string; setFKota: (v: string) => void
  fProvinsi: string; setFProvinsi: (v: string) => void
  fTier: string; setFTier: (v: string) => void
  fIndustri: string; setFIndustri: (v: string) => void
  options: { kota: string[]; provinsi: string[]; tier: string[]; industri: string[] }
}) {
  const [open, setOpen] = useState(false)
  const count = (fKota ? 1 : 0) + (fProvinsi ? 1 : 0) + (fTier ? 1 : 0) + (fIndustri ? 1 : 0)
  function reset() { setFKota(''); setFProvinsi(''); setFTier(''); setFIndustri('') }
  // Single-select chips: clicking the active value clears it.
  const pick = (cur: string, set: (v: string) => void, v: string) => set(cur === v ? '' : v)

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid', borderColor: count || open ? 'var(--accent)' : 'var(--border)', background: count ? 'rgba(108,99,255,0.12)' : 'var(--bg2)', color: count ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        {t('Filter')}{count ? ` (${count})` : ''}
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 70, width: 320, maxWidth: 'min(320px, 92vw)', maxHeight: '64vh', overflowY: 'auto', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('Filter')}</span>
              <button onClick={reset} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{t('Reset')}</button>
            </div>

            <FilterSection label={t('Kota')} empty={options.kota.length === 0}>
              {options.kota.map((o) => <FilterChip key={o} label={o} active={fKota === o} onClick={() => pick(fKota, setFKota, o)} />)}
            </FilterSection>

            <FilterSection label={t('Provinsi')} empty={options.provinsi.length === 0}>
              {options.provinsi.map((o) => <FilterChip key={o} label={o} active={fProvinsi === o} onClick={() => pick(fProvinsi, setFProvinsi, o)} />)}
            </FilterSection>

            <FilterSection label={t('Tier Klien')} empty={options.tier.length === 0}>
              {options.tier.map((o) => <FilterChip key={o} label={o} active={fTier === o} onClick={() => pick(fTier, setFTier, o)} />)}
            </FilterSection>

            <FilterSection label={t('Industri')} empty={options.industri.length === 0}>
              {options.industri.map((o) => <FilterChip key={o} label={o} active={fIndustri === o} onClick={() => pick(fIndustri, setFIndustri, o)} />)}
            </FilterSection>
          </div>
        </>
      )}
    </div>
  )
}

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

function FilterSection({ label, children, empty }: { label: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', fontWeight: 700, marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{empty ? <span style={{ fontSize: 12, color: 'var(--text3)' }}>—</span> : children}</div>
    </div>
  )
}

interface MenuItem { label: string; icon?: string; onClick: () => void; danger?: boolean }

// Three-dot (kebab) row menu. The dropdown is portaled to <body> with
// position:fixed so the table's overflow never clips it.
function KebabMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // Close on scroll/resize so the fixed menu never drifts away from its button.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    const r = btnRef.current!.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 184) })
    setOpen((o) => !o)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        onMouseOver={(e) => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text)' }}
        onMouseOut={(e) => { e.currentTarget.style.background = open ? 'var(--bg3)' : 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = open ? 'var(--text)' : 'var(--text2)' }}
        title="Aksi"
        style={{ width: 30, height: 30, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: open ? 'var(--text)' : 'var(--text2)', background: open ? 'var(--bg3)' : 'transparent', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 16, lineHeight: 1, transition: 'background 0.12s, border-color 0.12s, color 0.12s' }}
      >
        ⋯
      </button>
      {open && pos && createPortal(
        <>
          {/* Transparent backdrop: a click anywhere (including back on the ⋯
              button, which it covers) closes the menu — no event-race. */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1999 }} />
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 184, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.45)', padding: 4, zIndex: 2000 }}
        >
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick() }}
              style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', padding: '8px 12px', borderRadius: 6, background: 'transparent', border: 'none', color: it.danger ? '#ff6b6b' : 'var(--text)', cursor: 'pointer', fontSize: 12.5, fontWeight: 500 }}
              onMouseOver={(e) => (e.currentTarget.style.background = it.danger ? 'rgba(255,107,107,0.1)' : 'var(--bg3)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {it.label}
            </button>
          ))}
        </div>
        </>,
        document.body,
      )}
    </>
  )
}

// Detail Kontak — wraps the shared ContactDetails (synced with the add/edit form).
function LeadPeek({ lead, onClose, onConvert, onEdit, t }: { lead: BsiLead; onClose: () => void; onConvert: () => void; onEdit: () => void; t: (s: string) => string }) {
  return (
    <Modal
      open onClose={onClose} title={t('Detail Kontak')} maxWidth={560}
      footer={<><BtnSecondary onClick={onEdit}>{t('Edit')}</BtnSecondary><BtnPrimary onClick={onConvert}>+ Prospect</BtnPrimary></>}
    >
      <ContactDetails lead={lead} />
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
