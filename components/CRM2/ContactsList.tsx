'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/hooks/useStore'
import { useWebsiteLeadSync } from '@/hooks/useWebsiteLeadSync'
import { promoteContactToClient } from '@/lib/crm/promoteClient'
import { buildContactSnapshot, hardDeleteContact } from '@/lib/crm/contactRestore'
import { useLogActivity } from '@/hooks/useData'
import { ConfirmDialog } from '@/components/shared/Modal'
import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'
import { CATEGORY_LABEL, CATEGORY_COLOR, CONTACT_CATEGORIES } from '@/lib/crm/schema'
import { ContactFormModal } from './ContactFormModal'
import { ContactDetailPanel } from './ContactDetailPanel'
import { ContactsActivity, CONTACT_SCOPE } from './ContactsActivity'
import { StageBadge } from './ui'

export function ContactsList() {
  const t = useT()
  // Auto-pull public-website leads into the new CRM (contacts + prospects).
  useWebsiteLeadSync()
  const contacts = useStore(s => s.contacts)
  const deals = useStore(s => s.deals)
  const crmProjects = useStore(s => s.crmProjects)
  const crmInvoices = useStore(s => s.crmInvoices)
  const upsertDeal = useStore(s => s.upsertDeal)
  const logActivity = useLogActivity()

  const [selected, setSelected] = useState<string | null>(null)
  const tableBoxRef = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [owner, setOwner] = useState('all')
  const [tag, setTag] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  // Multi-select mode: pick contacts (one-by-one or all) then Hapus / + Prospect.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  // When the detail panel closes the table box widens back to full width; reset
  // any horizontal scroll left over from the narrow (panel-open) state so the
  // first columns aren't stuck off-screen.
  useEffect(() => { if (!selected) tableBoxRef.current?.scrollTo({ left: 0 }) }, [selected])

  // Auto-promote: a lead becomes a Client once an invoice is paid AND a project is
  // on progress. Reconciles existing data; live transitions are also promoted at
  // the point they happen (payment recorded, project → On Progress).
  useEffect(() => {
    for (const c of contacts) if (c.category === 'LEAD') promoteContactToClient(c.id)
  }, [contacts, crmProjects, crmInvoices])

  const owners = useMemo(() => Array.from(new Set(contacts.map(c => c.owner_email).filter(Boolean))) as string[], [contacts])
  const tags = useMemo(() => Array.from(new Set(contacts.flatMap(c => c.tags || []))).sort(), [contacts])

  const filtered = useMemo(() => contacts.filter(c => {
    if (q && !c.name.toLowerCase().includes(q.toLowerCase()) && !(c.company_name || '').toLowerCase().includes(q.toLowerCase())) return false
    if (cat !== 'all' && c.category !== cat) return false
    if (owner !== 'all' && c.owner_email !== owner) return false
    if (tag !== 'all' && !(c.tags || []).includes(tag)) return false
    return true
  }), [contacts, q, cat, owner, tag])

  const filterCount = (cat !== 'all' ? 1 : 0) + (owner !== 'all' ? 1 : 0) + (tag !== 'all' ? 1 : 0)

  // ── Selection ──
  const allSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))
  const selectedCount = selectedIds.size
  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(filtered.map(c => c.id)))
  }
  function exitSelect() { setSelectMode(false); setSelectedIds(new Set()) }

  async function confirmDeleteSelected() {
    const ids = Array.from(selectedIds)
    if (!ids.length) { setConfirmDel(false); return }
    setBusy(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = getSupabase() as any
      const idSet = new Set(ids)
      // Contact-values (email/phone) of what we're deleting — used to mark the
      // source website leads so the auto-sync never recreates them (zombies).
      const values = contacts
        .filter(x => idSet.has(x.id))
        .flatMap(x => [(x.email || '').trim(), (x.phone || '').trim()])
        .filter(Boolean)

      // Delete each contact WHOLE — its pipeline, contracts and invoices go too.
      // A full snapshot is logged to the activity feed so the delete can be undone
      // (Pulihkan), bringing everything back exactly as it was.
      for (const id of ids) {
        const snap = buildContactSnapshot(id)
        if (!snap) continue
        // Log the restorable snapshot FIRST, then delete — so a failed log never
        // leaves data deleted with no way back.
        await logActivity(
          `Contact dihapus: "${snap.contact.company_name || snap.contact.name}"`,
          CONTACT_SCOPE,
          { kind: 'contact-crm', id, snapshot: snap, restored: false },
        )
        await hardDeleteContact(snap)
      }

      // Tombstone the originating website leads (converted_client_id != null ⇒
      // the sync skips them) so a deleted contact stays deleted.
      if (values.length) {
        await sb.from('bsi_leads')
          .update({ converted_client_id: '00000000-0000-0000-0000-000000000000' })
          .eq('origin', 'website')
          .in('contact_value', values)
      }

      setConfirmDel(false)
      exitSelect()
    } catch (e) {
      alert('Gagal menghapus: ' + ((e as { message?: string })?.message || 'coba lagi'))
    } finally { setBusy(false) }
  }

  async function handleProspectSelected() {
    const ids = Array.from(selectedIds)
    if (!ids.length) return
    setBusy(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = getSupabase() as any
      const hasDeal = new Set(deals.map(d => d.contact_id))
      let created = 0
      for (const id of ids) {
        if (hasDeal.has(id)) continue // already in the pipeline
        const contact = contacts.find(c => c.id === id)
        if (!contact) continue
        const { data: deal } = await sb.from('deals').insert({
          name: contact.company_name || contact.name,
          contact_id: id, services: [], value: 0, stage: 'prospect',
          source: contact.source || '', description: '',
        }).select().single()
        if (deal) { upsertDeal(deal); created += 1 }
      }
      alert(created > 0 ? `${created} prospect ditambahkan ke Pipeline.` : 'Contact terpilih sudah ada di Pipeline.')
      exitSelect()
    } catch {
      alert('Gagal membuat prospect. Coba lagi.')
    } finally { setBusy(false) }
  }

  return (
    <div style={{ padding: 24, height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '0 0 auto' }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', display: 'grid', placeItems: 'center', color: 'var(--text3)', pointerEvents: 'none' }}>
            <SearchIcon />
          </span>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t('Cari nama…')}
            style={{ height: 38, width: 240, boxSizing: 'border-box', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '0 30px 0 34px', color: 'var(--text)', fontSize: 13, outline: 'none', boxShadow: 'none' }}
          />
          {q && (
            <button onClick={() => setQ('')} aria-label={t('Hapus')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 22, height: 22, display: 'grid', placeItems: 'center', border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', fontSize: 16, lineHeight: 1, borderRadius: 6 }}>×</button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <ContactsActivity />

        {/* Filter button + popover */}
        <div style={{ position: 'relative', flex: '0 0 auto' }}>
          <button
            onClick={() => setShowFilter(v => !v)}
            style={{
              height: 38, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', cursor: 'pointer',
              background: filterCount > 0 ? 'color-mix(in srgb, var(--accent) 14%, var(--bg2))' : 'var(--bg2)',
              border: `1px solid ${filterCount > 0 ? 'color-mix(in srgb, var(--accent) 45%, var(--border))' : 'var(--border)'}`,
              borderRadius: 10, color: filterCount > 0 ? 'var(--link)' : 'var(--text)', fontSize: 13, fontWeight: 600,
            }}
          >
            <FilterIcon /> {t('Filter')}
            {filterCount > 0 && (
              <span style={{ minWidth: 18, height: 18, padding: '0 5px', display: 'grid', placeItems: 'center', background: 'var(--accent)', color: '#fff', borderRadius: 20, fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{filterCount}</span>
            )}
          </button>

          {showFilter && (
            <>
              <div onClick={() => setShowFilter(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div style={{ position: 'absolute', right: 0, top: 44, zIndex: 41, width: 260, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-card)', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{t('Filter')}</span>
                  <span style={{ flex: 1 }} />
                  {filterCount > 0 && (
                    <button onClick={() => { setCat('all'); setOwner('all'); setTag('all') }} style={{ background: 'transparent', border: 'none', color: 'var(--link)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                      {t('Reset')}
                    </button>
                  )}
                </div>
                <FilterField label={t('Kategori')}>
                  <Sel block value={cat} onChange={setCat} options={[{ v: 'all', l: t('Semua kategori') }, ...CONTACT_CATEGORIES.map(c => ({ v: c, l: CATEGORY_LABEL[c] }))]} />
                </FilterField>
                <FilterField label={t('Owner')}>
                  <Sel block value={owner} onChange={setOwner} options={[{ v: 'all', l: t('Semua owner') }, ...owners.map(o => ({ v: o, l: o }))]} />
                </FilterField>
                <FilterField label="Tags">
                  <Sel block value={tag} onChange={setTag} options={[{ v: 'all', l: t('Semua tag') }, ...tags.map(tg => ({ v: tg, l: tg }))]} />
                </FilterField>
              </div>
            </>
          )}
        </div>

        {selectMode ? (
          <>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', padding: '0 4px', whiteSpace: 'nowrap' }}>{selectedCount} dipilih</span>
            <button onClick={handleProspectSelected} disabled={busy || selectedCount === 0} title="Tambahkan contact terpilih ke Pipeline sebagai prospect" style={{ height: 38, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: busy || selectedCount === 0 ? 'default' : 'pointer', opacity: busy || selectedCount === 0 ? 0.5 : 1, whiteSpace: 'nowrap' }}>
              + Prospect
            </button>
            <button onClick={() => setConfirmDel(true)} disabled={busy || selectedCount === 0} title="Hapus contact terpilih" style={{ height: 38, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b55', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: busy || selectedCount === 0 ? 'default' : 'pointer', opacity: busy || selectedCount === 0 ? 0.5 : 1, whiteSpace: 'nowrap' }}>
              🗑 Hapus
            </button>
            <button onClick={exitSelect} disabled={busy} title="Keluar mode pilih" style={{ height: 38, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ✕ Batal
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setSelectMode(true)} title="Pilih beberapa contact" style={{ height: 38, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ☑ Pilih
            </button>

            <button onClick={() => setShowForm(true)} style={{ height: 38, padding: '0 16px', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> {t('Tambah Contact')}
            </button>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div ref={tableBoxRef} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'auto', flex: 1, minHeight: 0, width: '100%' }}>
        {/* Fixed intrinsic width (no width:100%) so the columns stay the SAME size
            whether the detail panel is open or closed — the box scrolls instead of
            squeezing the columns. */}
        <style>{`.ct-table th { white-space: nowrap; }`}</style>
        <table className="ct-table" style={{ width: 1500, minWidth: 1500, tableLayout: 'auto' }}>
          <thead>
            <tr>
              {selectMode && (
                <th style={{ width: 40, textAlign: 'center' }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} title="Pilih semua" style={{ cursor: 'pointer', width: 15, height: 15 }} />
                </th>
              )}
              <th>{t('Nama')}</th>
              <th>{t('Kategori')}</th>
              <th>{t('Client Tier')}</th>
              <th>{t('Industri')}</th>
              <th>{t('Kota / Kabupaten')}</th>
              <th>{t('Provinsi')}</th>
              <th>{t('Kontak')}</th>
              <th>{t('Owner')}</th>
              <th>Tags</th>
              <th>{t('Ditambahkan')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={selectMode ? 11 : 10}>
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text2)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>👤</div>
                  {t('Belum ada contact. Klik "+ Tambah Contact" untuk mulai.')}
                </div>
              </td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className={(selectMode ? selectedIds.has(c.id) : selected === c.id) ? 'is-selected' : undefined} onClick={() => (selectMode ? toggleSelect(c.id) : setSelected(c.id))} style={{ cursor: 'pointer', height: 64 }}>
                {selectMode && (
                  <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                  </td>
                )}
                <td style={{ maxWidth: 220 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.type === 'PERUSAHAAN' ? (c.company_name || t('Perusahaan')) : t('Individu')}{c.job_title ? ` · ${c.job_title}` : ''}
                  </div>
                </td>
                <td><StageBadge label={CATEGORY_LABEL[c.category]} color={CATEGORY_COLOR[c.category]} /></td>
                <td style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{c.client_tier || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{c.industry || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{c.city || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{c.province || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text2)', maxWidth: 200 }}>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</div>
                  <div style={{ color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.phone}</div>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text2)' }}>{c.owner_email || '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(c.tags || []).slice(0, 3).map(tg => (
                      <span key={tg} style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, padding: '1px 8px' }}>{tg}</span>
                    ))}
                  </div>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                  {c.created_at ? new Date(c.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      </div>{/* /table column */}

      {selected && (
        <div style={{ flex: '0 0 clamp(340px, 34vw, 430px)', minWidth: 0 }}>
          <ContactDetailPanel id={selected} onClose={() => setSelected(null)} />
        </div>
      )}
      </div>{/* /split row */}

      {showForm && <ContactFormModal open onClose={() => setShowForm(false)} />}

      <ConfirmDialog
        open={confirmDel}
        danger
        title={`Hapus ${selectedCount} contact terpilih?`}
        message="Contact terpilih beserta pipeline, contract & invoice-nya akan dihapus. Bisa dipulihkan kembali lewat menu Activity."
        confirmLabel={busy ? 'Menghapus…' : 'Hapus'}
        cancelLabel="Batal"
        onConfirm={confirmDeleteSelected}
        onCancel={() => { if (!busy) setConfirmDel(false) }}
      />
    </div>
  )
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  )
}

function Sel({ value, onChange, options, block }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[]; block?: boolean }) {
  const active = value !== 'all'
  return (
    <div style={{ position: 'relative', flex: block ? undefined : '0 0 auto', width: block ? '100%' : undefined }}>
      <select
        className="ui-select"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          height: 38, boxSizing: 'border-box', cursor: 'pointer', width: block ? '100%' : undefined,
          background: active ? 'color-mix(in srgb, var(--accent) 14%, var(--bg2))' : 'var(--bg3)',
          border: `1px solid ${active ? 'color-mix(in srgb, var(--accent) 45%, var(--border))' : 'var(--border)'}`,
          borderRadius: 10, padding: '0 30px 0 12px', color: active ? 'var(--link)' : 'var(--text)',
          fontSize: 13, fontWeight: active ? 600 : 400, outline: 'none',
        }}
      >
        {options.map(o => <option key={o.v} value={o.v} style={{ background: 'var(--bg2)', color: 'var(--text)' }}>{o.l}</option>)}
      </select>
      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'grid', placeItems: 'center', color: active ? 'var(--link)' : 'var(--text3)' }}>
        <ChevronIcon />
      </span>
    </div>
  )
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
