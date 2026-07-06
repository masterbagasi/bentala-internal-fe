'use client'

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { getSupabase } from '@/lib/supabase'
import { INV_STATUS_LABELS, CLOSED_STAGES } from '@/lib/constants'
import { formatRupiah, formatDate } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { useLogActivity } from '@/hooks/useData'
import { useT } from '@/lib/i18n/LanguageProvider'
import { confirmDialog } from '@/lib/confirm-dialog'
import { openInvoicePrint } from './invoicePrint'
import { INDONESIAN_BANKS, findBank } from '@/lib/banks'
import { SOCIAL_PLATFORMS } from '@/lib/socials'
import type { Invoice, InvoiceStatus, InvoiceItem, InvoiceSettings, SocialLink, Client } from '@/lib/types'

// Uniform control height so native <select> and <input> line up (selects
// otherwise render shorter than inputs on most browsers).
const CTRL: React.CSSProperties = { height: 44 }
const rpDigits = (s: string) => s.replace(/\D/g, '')
// Shared column template so the line-item header and rows stay aligned.
const ROW_COLS = '1fr 64px 152px 108px 32px'

/** Next invoice number = highest existing sequence for the current year + 1.
 *  Derived from existing rows (not a plain count) so deletions never cause a
 *  duplicate `num` — the column is UNIQUE, and a collision fails the insert. */
function nextInvoiceNum(invoices: Invoice[]): string {
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`
  let max = 0
  for (const inv of invoices) {
    if (inv.num?.startsWith(prefix)) {
      const n = parseInt(inv.num.slice(prefix.length), 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

/** Resolve the "Billed To" details live from the contact record so the invoice
 *  always reflects current data: phone from the client, address from the linked
 *  website lead (where the structured address lives). */
async function billToFromClient(client: Client | undefined): Promise<{ name: string; phone: string; address: string; pic: string }> {
  const phone = client?.contact || ''
  const pic = client?.pic || ''
  let address = ''
  // Prefer the brand / company name from the contact form (brand_name); this is
  // resolved live so a later rename shows on existing invoices too.
  let name = client?.name || ''
  if (client?.lead_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (getSupabase() as any)
      .from('bsi_leads')
      .select('brand_name, alamat_jalan, alamat_blok, alamat_rtrw, kota, provinsi')
      .eq('id', client.lead_id)
      .maybeSingle()
    if (data) {
      if (data.brand_name) name = data.brand_name
      address = [data.alamat_jalan, data.alamat_blok, data.alamat_rtrw, data.kota, data.provinsi].filter(Boolean).join(', ')
    }
  }
  return { name, phone, address, pic }
}

/** Lets the page's header buttons (rendered up in the PageHeader) open the
 *  new-invoice form and the company/payment settings. */
export interface InvoicesPageHandle { openNew: () => void; openSettings: () => void }

export const InvoicesPage = forwardRef<InvoicesPageHandle>(function InvoicesPage(_props, ref) {
  const t = useT()
  const { invoices, clients } = useStore(useShallow((s) => ({ invoices: s.invoices, clients: s.clients })))
  const [showModal, setShowModal] = useState(false)
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<InvoiceSettings | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [bankLogoUrl, setBankLogoUrl] = useState<string | null>(null)
  const logActivity = useLogActivity()

  useImperativeHandle(ref, () => ({
    openNew: () => { setEditInvoice(null); setShowModal(true) },
    openSettings: () => setShowSettings(true),
  }), [])

  // Company/payment info for the PDF. The logo is embedded as a base64 data URI
  // so it always renders in the print window (an about:blank popup can't reliably
  // load an http subresource, and timing/CORS never bite a data URI).
  useEffect(() => {
    const sb = getSupabase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(sb as any).from('invoice_settings').select('*').limit(1).maybeSingle().then(({ data }: { data: InvoiceSettings | null }) => setSettings(data))
    fetch(`/logos/${encodeURIComponent('Logo Bentala Studio Landscape Black.png')}`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('logo ' + r.status))))
      .then((b) => new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(b) }))
      .then(setLogoUrl)
      .catch(() => setLogoUrl(null))
  }, [])

  // Bank logo for the "Transfer ke" block: use a real file at public/banks/<slug>.png
  // (embedded as a data URI so it prints); otherwise the PDF shows a brand badge.
  useEffect(() => {
    const bank = findBank(settings?.bank_name)
    if (!bank) { setBankLogoUrl(null); return }
    let cancelled = false
    fetch(`/banks/${bank.slug}.png`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('no bank logo'))))
      .then((b) => new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(b) }))
      .then((u) => { if (!cancelled) setBankLogoUrl(u) })
      .catch(() => { if (!cancelled) setBankLogoUrl(null) })
    return () => { cancelled = true }
  }, [settings])

  // Value summary — mirrors the Client Dashboard "Nilai" cards so both views
  // agree: Down Payment (dp) · Kurang bayar (pending+overdue) · Lunas (paid) ·
  // Potensi (open-pipeline value — a projection, not yet invoiced).
  const sumInv = (pred: (i: Invoice) => boolean) => {
    const rows = invoices.filter(pred)
    return { value: rows.reduce((n, i) => n + (i.value || 0), 0), count: rows.length }
  }
  const dp = sumInv(i => i.status === 'dp')
  const kurang = sumInv(i => i.status === 'pending' || i.status === 'overdue')
  const lunas = sumInv(i => i.status === 'paid')
  const openDeals = clients.filter(c => !c.pipeline_hidden && !(CLOSED_STAGES as readonly string[]).includes(c.stage))
  const potensi = openDeals.reduce((n, c) => n + (c.value || 0), 0)

  const valueCards: { label: string; value: string; sub: string; color: string; hint?: string }[] = [
    { label: t('Down Payment'), value: formatRupiah(dp.value),     sub: `${dp.count} invoice`,          color: '#5b9bd5' },
    { label: t('Kurang bayar'), value: formatRupiah(kurang.value), sub: `${kurang.count} invoice`,      color: '#ffa94d' },
    { label: t('Lunas'),        value: formatRupiah(lunas.value),  sub: `${lunas.count} invoice`,       color: '#43d9a2' },
    { label: t('Potensi'),      value: formatRupiah(potensi),      sub: `${openDeals.length} peluang`,  color: '#8b7fff', hint: t('Nilai peluang yang masih berjalan — proyeksi, belum tentu masuk') },
  ]

  async function handleDelete(id: string) {
    if (!(await confirmDialog(t('Hapus invoice ini?'), { danger: true, confirmLabel: t('Hapus'), cancelLabel: t('Batal') }))) return
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
      {/* Value summary — same breakdown as the Client Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        {valueCards.map(k => (
          <div key={k.label} title={k.hint}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>{t('No. Invoice')}</th>
              <th>Client</th>
              <th>Project</th>
              <th>{t('Nilai')}</th>
              <th>{t('Jatuh Tempo')}</th>
              <th>Status</th>
              <th style={{ width: 260 }}>{t('Aksi')}</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colSpan={7}>
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text2)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>💰</div>
                  {t('Belum ada invoice.')}
                </div>
              </td></tr>
            ) : [...invoices].reverse().map(inv => (
              <tr key={inv.id}>
                <td style={{ fontFamily: 'monospace', color: '#60a5fa', fontWeight: 500 }}>{inv.num}</td>
                <td style={{ fontWeight: 500 }}>{inv.client}</td>
                <td style={{ color: 'var(--text2)' }}>{inv.project || '—'}</td>
                <td style={{ color: 'var(--text)', fontWeight: 700 }}>{formatRupiah(inv.value)}</td>
                <td style={{ color: 'var(--text2)', fontSize: 12 }}>{formatDate(inv.due)}</td>
                <td><StatusBadge status={inv.status} type="inv" /></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                    <select
                      value={inv.status}
                      onChange={e => updateStatus(inv.id, e.target.value)}
                      onClick={e => e.stopPropagation()}
                      title={t('Ubah status')}
                      style={{ height: 28, padding: '0 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer' }}
                    >
                      {Object.entries(INV_STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <button
                      onClick={async () => {
                        const w = window.open('', '_blank', 'width=900,height=1040')
                        const billTo = await billToFromClient(clients.find(c => c.id === inv.client_id))
                        openInvoicePrint(inv, settings, logoUrl, bankLogoUrl, billTo, w)
                      }}
                      title={t('Simpan / kirim sebagai PDF')}
                      style={{ height: 28, padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--accent)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#fff', whiteSpace: 'nowrap' }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      PDF
                    </button>
                    <button
                      onClick={() => { setEditInvoice(inv); setShowModal(true) }}
                      style={{ height: 28, padding: '0 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap' }}
                    >{t('Edit')}</button>
                    <button
                      onClick={() => handleDelete(inv.id)}
                      title={t('Hapus')}
                      style={{ height: 28, width: 28, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent2)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#fff', lineHeight: 1 }}
                    >✕</button>
                  </div>
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
          nextNum={nextInvoiceNum(invoices)}
          settings={settings}
          logoUrl={logoUrl}
          bankLogoUrl={bankLogoUrl}
          onClose={() => { setShowModal(false); setEditInvoice(null) }}
        />
      )}
      {showSettings && (
        <InvoiceSettingsModal
          open={showSettings}
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={(s) => { setSettings(s); setShowSettings(false) }}
        />
      )}
    </div>
  )
})

function InvoiceModal({ open, invoice, clients, nextNum, settings, logoUrl, bankLogoUrl, onClose }: {
  open: boolean
  invoice: Invoice | null
  clients: Client[]
  nextNum: string
  settings: InvoiceSettings | null
  logoUrl: string | null
  bankLogoUrl: string | null
  onClose: () => void
}) {
  const t = useT()
  const logActivity = useLogActivity()
  const [form, setForm] = useState({
    client:    invoice?.client || '',
    client_id: invoice?.client_id ?? null as string | null,
    project:   invoice?.project || '',
    due:       invoice?.due || '',
    status:    invoice?.status || 'pending',
    notes:     invoice?.notes || '',
  })
  // Line items — seed old invoices (no items) with a single row from the flat value.
  const [items, setItems] = useState<InvoiceItem[]>(
    invoice?.items?.length
      ? invoice.items
      : invoice
        ? [{ desc: invoice.project || 'Layanan', qty: 1, price: invoice.value || 0 }]
        : [{ desc: '', qty: 1, price: 0 }],
  )
  const [services, setServices] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  // Active services from the public website (+ Full Package), for quick-add.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(getSupabase() as any).from('bsi_services').select('name').eq('is_published', true).order('sort_order')
      .then(({ data }: { data: { name: string }[] | null }) => {
        const names = (data ?? []).map(r => r.name).filter(Boolean)
        setServices([...names, 'Full Package'])
      })
  }, [])

  // Brand / company name per contact (brand_name), so the Client picker and the
  // invoice show the company — not whatever the CRM record was renamed to.
  const [brandByLead, setBrandByLead] = useState<Record<string, string>>({})
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(getSupabase() as any).from('bsi_leads').select('id, brand_name')
      .then(({ data }: { data: { id: string; brand_name: string | null }[] | null }) => {
        const m: Record<string, string> = {}
        ;(data ?? []).forEach(r => { if (r.brand_name) m[r.id] = r.brand_name })
        setBrandByLead(m)
      })
  }, [])
  const clientBrand = (c: Client) => (c.lead_id && brandByLead[c.lead_id]) || c.name

  const total = items.reduce((n, it) => n + (it.qty || 0) * (it.price || 0), 0)
  const nameRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const [focusIdx, setFocusIdx] = useState<number | null>(null)
  // After adding a row, drop the cursor into its service field so you can type.
  useEffect(() => {
    if (focusIdx == null) return
    nameRefs.current[focusIdx]?.focus()
    setFocusIdx(null)
  }, [focusIdx])

  const addItem = () => { setItems(x => [...x, { desc: '', qty: 1, price: 0 }]); setFocusIdx(items.length) }
  const setItem = (i: number, patch: Partial<InvoiceItem>) => setItems(x => x.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  const delItem = (i: number) => setItems(x => x.filter((_, idx) => idx !== i))

  async function handleSave() {
    if (!form.client) { alert(t('Client wajib dipilih!')); return }
    const clean = items.filter(it => it.desc.trim() || it.price > 0)
    if (!clean.length) { alert(t('Tambahkan minimal satu layanan.')); return }
    setLoading(true)
    const supabase = getSupabase()
    const num = invoice?.num || nextNum
    const value = clean.reduce((n, it) => n + (it.qty || 0) * (it.price || 0), 0)
    const data = {
      num,
      client:    form.client,
      client_id: form.client_id || null,
      project:   form.project,
      value,
      due:       form.due || null,
      status:    form.status,
      notes:     form.notes,
      items:     clean,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const { error } = invoice
      ? await sb.from('invoices').update(data).eq('id', invoice.id)
      : await sb.from('invoices').insert(data)
    setLoading(false)
    if (error) { alert(t('Gagal menyimpan invoice') + `: ${error.message}`); return }
    if (!invoice) logActivity(`Invoice baru: ${num} — ${form.client} (${formatRupiah(value)})`)
    onClose()
  }

  // Save first if this is a brand-new invoice? Keep it simple: print uses current
  // form state so the preview always reflects what's on screen.
  const printNow = async () => {
    const w = window.open('', '_blank', 'width=900,height=1040')
    const billTo = await billToFromClient(clients.find(c => c.id === form.client_id))
    openInvoicePrint(
      { ...(invoice ?? {} as Invoice), num: invoice?.num || t('DRAFT'), created_at: invoice?.created_at || new Date().toISOString(), client: form.client, project: form.project, due: form.due, status: form.status as InvoiceStatus, notes: form.notes, value: total, items } as Invoice,
      settings, logoUrl, bankLogoUrl, billTo, w,
    )
  }

  return (
    <Modal
      open={open} onClose={onClose}
      title={invoice ? 'Edit Invoice' : t('Invoice Baru')}
      maxWidth={720}
      footer={<>
        <BtnSecondary onClick={printNow}>{t('Lihat PDF')}</BtnSecondary>
        <div style={{ flex: 1 }} />
        <BtnSecondary onClick={onClose}>{t('Batal')}</BtnSecondary>
        <BtnPrimary onClick={handleSave} loading={loading}>{t('Simpan')}</BtnPrimary>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FG label="Client" required>
            <select style={CTRL} value={form.client_id ?? ''} onChange={e => {
              const id = e.target.value
              const c = clients.find(x => x.id === id)
              setForm(f => ({ ...f, client_id: id || null, client: c ? clientBrand(c) : '' }))
            }}>
              <option value="">{t('— Pilih klien —')}</option>
              {clients.map(c => <option key={c.id} value={c.id}>{clientBrand(c)}</option>)}
            </select>
          </FG>
          <FG label="Project">
            <input style={CTRL} type="text" value={form.project} onChange={e => setForm(f=>({...f,project:e.target.value}))} placeholder="Nama project" />
          </FG>
        </div>

        {/* Line items — one unified table; type or pick a service, set the price */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 2 }}>
            Layanan<span style={{ color: 'var(--accent2)', marginLeft: 3 }}>*</span>
          </label>
          <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 11 }}>Ketik atau pilih layanan pada kolom pertama, lalu isi harganya.</div>

          <datalist id="svc-options">
            {services.map(name => <option key={name} value={name} />)}
          </datalist>

          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: ROW_COLS, gap: 10, padding: '10px 14px', background: 'var(--bg3)', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text3)' }}>
              <span>Layanan</span><span style={{ textAlign: 'center' }}>Qty</span><span>Harga</span><span style={{ textAlign: 'right' }}>Jumlah</span><span />
            </div>
            {items.map((it, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: ROW_COLS, gap: 10, padding: '9px 14px', alignItems: 'center', borderTop: '1px solid var(--border)' }}>
                <input ref={el => { nameRefs.current[i] = el }} list="svc-options" value={it.desc} onChange={e => setItem(i, { desc: e.target.value })} placeholder="Ketik / pilih layanan…" style={{ height: 40, fontSize: 14 }} />
                <input value={it.qty || ''} onChange={e => setItem(i, { qty: Number(rpDigits(e.target.value)) || 0 })} inputMode="numeric" style={{ height: 40, fontSize: 14, textAlign: 'center' }} />
                <input value={it.price ? `Rp ${it.price.toLocaleString('id-ID')}` : ''} onChange={e => setItem(i, { price: Number(rpDigits(e.target.value)) || 0 })} inputMode="numeric" placeholder="Rp 0" style={{ height: 40, fontSize: 14 }} />
                <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{formatRupiah((it.qty || 0) * (it.price || 0))}</span>
                <button type="button" onClick={() => delItem(i)} title="Hapus baris" disabled={items.length === 1} style={{ height: 30, width: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--text3)', cursor: items.length === 1 ? 'not-allowed' : 'pointer', opacity: items.length === 1 ? 0.35 : 1, fontSize: 16, borderRadius: 6 }}
                  onMouseOver={e => { if (items.length > 1) (e.currentTarget as HTMLElement).style.color = 'var(--accent2)' }}
                  onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text3)' }}>✕</button>
              </div>
            ))}
            <button type="button" onClick={() => addItem()} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '12px 14px', borderTop: '1px solid var(--border)', background: 'transparent', border: 'none', color: 'var(--accent4)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Tambah layanan
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, padding: '14px 18px', borderRadius: 12, background: 'var(--bg3)', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Total</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#60a5fa' }}>{formatRupiah(total)}</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FG label="Jatuh Tempo">
            <input style={CTRL} type="date" value={form.due} onChange={e => setForm(f=>({...f,due:e.target.value}))} />
          </FG>
          <FG label="Status">
            <select style={CTRL} value={form.status} onChange={e => setForm(f=>({...f,status:e.target.value as InvoiceStatus}))}>
              {Object.entries(INV_STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </FG>
        </div>
        <FG label="Catatan">
          <textarea value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} placeholder="Catatan untuk klien (opsional)…" style={{ minHeight: 80 }} />
        </FG>
      </div>
    </Modal>
  )
}

function InvoiceSettingsModal({ open, settings, onClose, onSaved }: {
  open: boolean
  settings: InvoiceSettings | null
  onClose: () => void
  onSaved: (s: InvoiceSettings) => void
}) {
  const t = useT()
  const [form, setForm] = useState({
    company_name: settings?.company_name || 'PT Bentala Project Indonesia',
    address:      settings?.address || '',
    phone:        settings?.phone || '',
    email:        settings?.email || '',
    bank_name:    settings?.bank_name || '',
    bank_account: settings?.bank_account || '',
    bank_holder:  settings?.bank_holder || '',
    terms:        settings?.terms || '',
  })
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(settings?.social_links ?? [])
  const [loading, setLoading] = useState(false)
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))
  const addSocial = () => setSocialLinks(x => [...x, { platform: 'instagram', value: '' }])
  const setSocial = (i: number, patch: Partial<SocialLink>) => setSocialLinks(x => x.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  const delSocial = (i: number) => setSocialLinks(x => x.filter((_, idx) => idx !== i))

  async function handleSave() {
    setLoading(true)
    const supabase = getSupabase()
    const payload = { ...form, social_links: socialLinks.filter(s => s.value.trim()), updated_at: new Date().toISOString() }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    let saved: InvoiceSettings | null = null
    if (settings?.id) {
      const { data } = await sb.from('invoice_settings').update(payload).eq('id', settings.id).select().single()
      saved = data
    } else {
      const { data } = await sb.from('invoice_settings').insert(payload).select().single()
      saved = data
    }
    setLoading(false)
    if (saved) onSaved(saved)
  }

  return (
    <Modal
      open={open} onClose={onClose}
      title={t('Pengaturan Invoice')}
      maxWidth={620}
      footer={<><BtnSecondary onClick={onClose}>{t('Batal')}</BtnSecondary><BtnPrimary onClick={handleSave} loading={loading}>{t('Simpan')}</BtnPrimary></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.6 }}>
          {t('Info ini muncul di PDF invoice yang dikirim ke klien. Logo diambil otomatis dari Website → Navbar.')}
        </p>
        <FG label={t('Nama perusahaan')}>
          <input style={CTRL} value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="PT Bentala Project Indonesia" />
        </FG>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FG label={t('Telepon')}>
            <input style={CTRL} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+62 …" />
          </FG>
          <FG label="Email">
            <input style={CTRL} value={form.email} onChange={e => set('email', e.target.value)} placeholder="hello@…" />
          </FG>
        </div>
        <FG label={t('Alamat')}>
          <textarea value={form.address} onChange={e => set('address', e.target.value)} placeholder={t('Alamat perusahaan')} style={{ minHeight: 60 }} />
        </FG>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FG label={t('Nama bank')}>
            <BankSelect value={form.bank_name} onChange={(name) => set('bank_name', name)} />
          </FG>
          <FG label={t('No. rekening')}>
            <input style={CTRL} value={form.bank_account} onChange={e => set('bank_account', e.target.value)} placeholder="1234567890" />
          </FG>
        </div>
        <FG label={t('Atas nama')}>
          <input style={CTRL} value={form.bank_holder} onChange={e => set('bank_holder', e.target.value)} placeholder={t('Nama pemilik rekening')} />
        </FG>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>{t('Sosial media')}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {socialLinks.map((sl, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 34px', gap: 8, alignItems: 'center' }}>
                <select value={sl.platform} onChange={e => setSocial(i, { platform: e.target.value })} style={{ height: 40, fontSize: 13 }}>
                  {SOCIAL_PLATFORMS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
                <input value={sl.value} onChange={e => setSocial(i, { value: e.target.value })} placeholder={sl.platform === 'whatsapp' ? '+62 …' : sl.platform === 'website' ? 'bentala.studio' : '@handle'} style={{ height: 40, fontSize: 13 }} />
                <button type="button" onClick={() => delSocial(i)} title={t('Hapus')} style={{ height: 32, width: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 15 }}>✕</button>
              </div>
            ))}
            <button type="button" onClick={addSocial} style={{ alignSelf: 'flex-start', height: 34, padding: '0 12px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>
              + {t('Tambah sosial media')}
            </button>
          </div>
        </div>
        <FG label={t('Catatan / syarat pembayaran')}>
          <textarea value={form.terms} onChange={e => set('terms', e.target.value)} placeholder={t('mis. Pembayaran DP 50% di muka…')} style={{ minHeight: 60 }} />
        </FG>
      </div>
    </Modal>
  )
}

/** Searchable, dark-themed bank picker — a native <select> with 100+ options
 *  renders as an unusable full-screen list, so this is a filterable combobox. */
function BankSelect({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const needle = q.trim().toLowerCase()
  const list = needle ? INDONESIAN_BANKS.filter(b => b.name.toLowerCase().includes(needle)) : INDONESIAN_BANKS

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ ...CTRL, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 12px', background: 'var(--bg3)', border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, color: value ? 'var(--text)' : 'var(--text3)', cursor: 'pointer', fontSize: 14, textAlign: 'left' }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          {value && <span style={{ width: 11, height: 11, borderRadius: 3, flexShrink: 0, background: findBank(value)?.color || '#334155' }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || t('— Pilih bank —')}</span>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 70, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 14px 36px rgba(0,0,0,0.45)', overflow: 'hidden' }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t('Cari bank...')} style={{ height: 36, fontSize: 13 }} />
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {list.length === 0 ? (
              <div style={{ padding: '16px 12px', fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>{t('Bank tidak ditemukan')}</div>
            ) : list.map(b => {
              const active = b.name === value
              return (
                <button
                  key={b.slug}
                  type="button"
                  onClick={() => { onChange(b.name); setOpen(false); setQ('') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 12px', background: active ? 'var(--bg3)' : 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}
                  onMouseOver={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg3)' }}
                  onMouseOut={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <span style={{ width: 11, height: 11, borderRadius: 3, flexShrink: 0, background: b.color || '#334155' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function FG({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>
        {label}{required && <span style={{ color: 'var(--accent2)', marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  )
}
