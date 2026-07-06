'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'
import { formatRupiah } from '@/lib/utils'
import { CRM_STAGES, STAGE_LABELS } from '@/lib/constants'
import { ConfirmDialog } from '@/components/shared/Modal'
import { ClientModal, ClientFormModal } from '@/components/CRM'
import { LeadFormModal, inputToRow, leadToInput, type NewLeadInput } from './LeadFormModal'
import { ActivityButton } from './ActivityButton'
import { useLogActivity } from '@/hooks/useData'
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

const LIFE_TABS = [
  { key: 'all' as const,      label: 'Semua',         color: '#8b8fa8' },
  { key: 'lead' as const,     label: 'Lead',          color: '#6c8fd5' },
  { key: 'prospect' as const, label: 'Prospect',      color: '#a78bfa' },
  { key: 'active' as const,   label: 'Active Client', color: '#2bb673' },
  { key: 'churned' as const,  label: 'Churned',       color: '#ff6b6b' },
]
export function ClientDatabase() {
  const t = useT()
  const router = useRouter()
  const { clients, projects } = useStore(useShallow((s) => ({ clients: s.clients, projects: s.projects })))
  const removeClient = useStore((s) => s.removeClient)
  const logActivity = useLogActivity()
  const [leads, setLeads] = useState<BsiLead[]>([])
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [fKota, setFKota] = useState('')
  const [fProvinsi, setFProvinsi] = useState('')
  const [fTier, setFTier] = useState('')
  const [fIndustri, setFIndustri] = useState('')
  const [fLifecycle, setFLifecycle] = useState<'all' | 'lead' | 'prospect' | 'active' | 'churned'>('all')
  const [sortKey, setSortKey] = useState<'brand' | 'date'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showAdd, setShowAdd] = useState(false)
  const [editLead, setEditLead] = useState<BsiLead | null>(null)
  const [editClient, setEditClient] = useState<Client | null>(null)
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

  // Contacts = every lead (incl. fresh website leads, minus spam) that hasn't
  // become a client yet, plus all clients. Leads + Contacts live in one place.
  useEffect(() => {
    let cancelled = false
    getSupabase()
      .from('bsi_leads')
      .select('*')
      .is('converted_client_id', null)
      .is('deleted_at', null)
      .neq('status', 'spam')
      .order('submitted_at', { ascending: false })
      .then(({ data }) => { if (!cancelled) setLeads((data as BsiLead[] | null) ?? []) })
    return () => { cancelled = true }
  }, [])

  // Live: a new website lead pops into the list the moment it's submitted —
  // realtime needs the JWT on the socket before the channel subscribes.
  useEffect(() => {
    const supabase = getSupabase()
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    const apply = (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
      if (cancelled) return
      if (payload.eventType === 'DELETE') {
        const id = payload.old.id as string | undefined
        if (id) setLeads((xs) => xs.filter((x) => x.id !== id))
        return
      }
      const nl = payload.new as unknown as BsiLead
      // Mirror the initial query: drop converted/spam/deleted, upsert everything else.
      // A restore (deleted_at → null) fires an UPDATE and re-adds the contact live.
      if (nl.converted_client_id || nl.status === 'spam' || nl.deleted_at) { setLeads((xs) => xs.filter((x) => x.id !== nl.id)); return }
      setLeads((xs) => [nl, ...xs.filter((x) => x.id !== nl.id)])
    }
    const build = () => supabase.channel('contacts-bsi-leads')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'bsi_leads' } as any, apply as any)
      .subscribe()
    const ensure = (token: string) => {
      if (cancelled) return
      ;(supabase.realtime as unknown as { setAuth: (t: string) => void }).setAuth(token)
      if (!channel) channel = build()
    }
    supabase.auth.getSession().then(({ data }) => { const tok = data.session?.access_token; if (tok) ensure(tok) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (s?.access_token) ensure(s.access_token) })
    return () => { cancelled = true; sub.subscription.unsubscribe(); if (channel) supabase.removeChannel(channel) }
  }, [])

  // A website lead is "new" until someone opens it (we then stamp in_database).
  const isNewLead = (l: BsiLead) => l.origin === 'website' && !l.in_database
  const newCount = useMemo(() => leads.filter(isNewLead).length, [leads])
  async function acknowledgeLead(id: string) {
    setLeads((xs) => xs.map((x) => (x.id === id ? { ...x, in_database: true } : x)))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (getSupabase() as any).from('bsi_leads').update({ in_database: true }).eq('id', id)
  }

  // The contact-detail PAGE (/clients/database/<id>) sends Edit / + Prospect
  // back here as ?edit=<id> / ?convert=<id> so those flows keep their existing
  // modals + save logic. Resolve once the leads are loaded, then clean the URL.
  const intentDone = useRef(false)
  useEffect(() => {
    if (intentDone.current || !leads.length) return
    const params = new URLSearchParams(window.location.search)
    const editId = params.get('edit'), convertId = params.get('convert')
    if (!editId && !convertId) { intentDone.current = true; return }
    const lead = leads.find((l) => l.id === (editId || convertId))
    if (!lead) return // wait for the leads list (or it isn't a database contact)
    intentDone.current = true
    if (editId) setEditLead(lead); else setConvertLead(lead)
    router.replace('/clients/database')
  }, [leads, router])

  async function handleAddContact(input: NewLeadInput) {
    // A contact added here stays a contact only (it does NOT enter the pipeline).
    const row = { ...inputToRow(input), origin: 'manual', in_database: true, submitted_at: new Date().toISOString() }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (getSupabase() as any).from('bsi_leads').insert(row).select().single()
    if (error) { alert(error.message); return }
    if (data) setLeads((xs) => [data as BsiLead, ...xs])
    logActivity(`Kontak baru: "${input.brand_name || input.full_name || 'Tanpa nama'}"`, 'contact')
    setShowAdd(false)
  }

  async function handleEditSave(input: NewLeadInput) {
    if (!editLead) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (getSupabase() as any).from('bsi_leads').update(inputToRow(input)).eq('id', editLead.id).select().single()
    if (error) { alert(error.message); return }
    if (data) setLeads((xs) => xs.map((x) => (x.id === editLead.id ? (data as BsiLead) : x)))
    logActivity(`Kontak diupdate: "${input.brand_name || input.full_name || 'Tanpa nama'}"`, 'contact')
    setEditLead(null)
  }

  async function doDelete(r: Contact) {
    const supabase = getSupabase()
    const name = r.brand || r.pic || 'Tanpa nama'
    // Soft-delete everywhere so the contact is recoverable from the Activity feed
    // (Pulihkan). The row stays in the DB with deleted_at set; nothing is lost.
    if (r.kind === 'client' && r.client) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('clients').update({ deleted_at: new Date().toISOString() }).eq('id', r.client.id)
      removeClient(r.client.id)
      logActivity(`Kontak dihapus: "${name}"`, 'contact', { kind: 'client', id: r.client.id })
    } else if (r.lead) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('bsi_leads').update({ deleted_at: new Date().toISOString() }).eq('id', r.lead.id)
      setLeads((xs) => xs.filter((x) => x.id !== r.lead!.id))
      logActivity(`Kontak dihapus: "${name}"`, 'contact', { kind: 'lead', id: r.lead.id })
    }
  }

  async function handleConverted(clientId: string) {
    const lead = convertLead
    if (!lead) return
    await getSupabase().from('bsi_leads').update({ converted_client_id: clientId }).eq('id', lead.id)
    setLeads((xs) => xs.filter((x) => x.id !== lead.id)) // now shown as its client row
    logActivity(`Kontak dikonversi jadi client: "${lead.brand_name || lead.full_name || 'Tanpa nama'}"`, 'contact')
    setConvertLead(null)
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
    items.push({ label: t('Edit'), icon: '✏️', onClick: () => (r.kind === 'client' ? setEditClient(r.client!) : setEditLead(r.lead!)) })
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

  // Lifecycle bucket per contact: Lead → Prospect → Active Client → Churned.
  const lifecycleOf = (r: (typeof allContacts)[number]): 'lead' | 'prospect' | 'active' | 'churned' => {
    if (r.kind === 'client' && r.client) {
      const s = r.client.stage
      if (s === 'client') return 'active'
      if (s === 'lost') return 'churned'
      if (s === 'qualified' || s === 'discovery' || s === 'proposal' || s === 'negotiation' || s === 'won') return 'prospect'
      return 'lead' // prospect / contacted — still being qualified
    }
    return 'lead' // raw bsi_leads contacts
  }
  const lifeCounts = useMemo(() => {
    const c = { all: allContacts.length, lead: 0, prospect: 0, active: 0, churned: 0 }
    for (const r of allContacts) c[lifecycleOf(r)]++
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allContacts])

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
      if (fLifecycle !== 'all' && lifecycleOf(r) !== fLifecycle) return false
      if (fKota && r.kota !== fKota) return false
      if (fProvinsi && r.provinsi !== fProvinsi) return false
      if (fTier && r.tier !== fTier) return false
      if (fIndustri && r.industri !== fIndustri) return false
      if (q && !`${r.brand} ${r.pic} ${r.contact}`.toLowerCase().includes(q)) return false
      return true
    })
    const dir = sortDir === 'asc' ? 1 : -1
    return filtered.sort((a, b) => (sortKey === 'brand' ? a.brand.localeCompare(b.brand) : String(a.date).localeCompare(String(b.date))) * dir)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allContacts, query, fLifecycle, fKota, fProvinsi, fTier, fIndustri, sortKey, sortDir])

  function toggleSort(k: 'brand' | 'date') {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir(k === 'brand' ? 'asc' : 'desc') }
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {newCount > 0 && (
          <span title={t('Lead baru dari website yang belum dibuka')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: '#2bb673', background: 'rgba(43,182,115,0.12)', border: '1px solid rgba(43,182,115,0.4)', borderRadius: 16, padding: '5px 11px' }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, background: '#2bb673' }} />
            {newCount} {t('baru dari website')}
          </span>
        )}
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
          <ActivityButton scope="contact" />
          <DatabaseFilter
            t={t}
            fLifecycle={fLifecycle} setFLifecycle={setFLifecycle} lifeCounts={lifeCounts}
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
                onClick={() => {
                  // Open the contact's full detail page.
                  if (r.kind === 'client') { router.push(r.client!.lead_id ? `/clients/database/${r.client!.lead_id}` : `/clients/${r.client!.id}`); return }
                  const lead = r.lead!
                  if (isNewLead(lead)) acknowledgeLead(lead.id) // opening clears the "Baru" mark
                  router.push(`/clients/database/${lead.id}`)
                }}
                style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg2)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    {r.brand || '—'}
                    {r.kind === 'lead' && r.lead && isNewLead(r.lead) && (
                      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#fff', background: '#2bb673', borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap' }}>{t('Baru')}</span>
                    )}
                  </span>
                </td>
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

      <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
        {rows.length} {t('kontak')}{fLifecycle !== 'all' && ` · ${t(LIFE_TABS.find((x) => x.key === fLifecycle)?.label ?? '')}`}
      </div>


      {showAdd && <LeadFormModal title={t('Tambah kontak')} onClose={() => setShowAdd(false)} onSave={handleAddContact} />}
      {editLead && <LeadFormModal title={t('Edit kontak')} saveLabel={t('Simpan perubahan')} initial={leadToInput(editLead)} onClose={() => setEditLead(null)} onSave={handleEditSave} />}
      {editClient && <ClientFormModal client={editClient} onClose={() => setEditClient(null)} />}
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
type LifeKey = 'all' | 'lead' | 'prospect' | 'active' | 'churned'
function DatabaseFilter({ t, fLifecycle, setFLifecycle, lifeCounts, fKota, setFKota, fProvinsi, setFProvinsi, fTier, setFTier, fIndustri, setFIndustri, options }: {
  t: (s: string) => string
  fLifecycle: LifeKey; setFLifecycle: (v: LifeKey) => void; lifeCounts: Record<string, number>
  fKota: string; setFKota: (v: string) => void
  fProvinsi: string; setFProvinsi: (v: string) => void
  fTier: string; setFTier: (v: string) => void
  fIndustri: string; setFIndustri: (v: string) => void
  options: { kota: string[]; provinsi: string[]; tier: string[]; industri: string[] }
}) {
  const [open, setOpen] = useState(false)
  const count = (fLifecycle !== 'all' ? 1 : 0) + (fKota ? 1 : 0) + (fProvinsi ? 1 : 0) + (fTier ? 1 : 0) + (fIndustri ? 1 : 0)
  function reset() { setFLifecycle('all'); setFKota(''); setFProvinsi(''); setFTier(''); setFIndustri('') }
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
              <button onClick={reset} style={{ background: 'none', border: 'none', color: 'var(--link)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{t('Reset')}</button>
            </div>

            <FilterSection label={t('Status')} empty={false}>
              {LIFE_TABS.map((tab) => (
                <FilterChip key={tab.key} label={`${t(tab.label)} (${lifeCounts[tab.key] ?? 0})`} active={fLifecycle === tab.key} onClick={() => setFLifecycle(tab.key)} />
              ))}
            </FilterSection>

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
