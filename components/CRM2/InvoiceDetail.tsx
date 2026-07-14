'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'
import { uploadFileWithProgress } from '@/lib/storage'
import { findBank } from '@/lib/banks'
import { formatRupiah, formatDate, formatDateTime } from '@/lib/utils'
import { INVOICE_STATUSES_MANUAL, INVOICE_STATUS_LABEL, INVOICE_STATUS_COLOR, TERMIN_LABEL, invoiceTotals, TAX_RATE, isInvoiceOverdue } from '@/lib/crm/schema'
import { openCrmInvoicePrint } from '@/lib/crm/invoicePrintOld'
import { promoteContactToClient } from '@/lib/crm/promoteClient'
import { Modal, BtnPrimary, BtnSecondary, ConfirmDialog } from '@/components/shared/Modal'
import { inStyle } from './ui'
import { InvoiceFormModal } from './InvoiceFormModal'
import type { CrmInvoice, CrmInvoiceStatus, PaymentProof, InvoiceSettings } from '@/lib/types'

/** Group digits with Indonesian thousand separators ("."): "1000000" → "1.000.000". */
const groupID = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** A proof file in the payment modal. `file` is set for newly-picked uploads;
 *  existing proofs (when editing) come in already 'done' with an uploadedUrl. */
type PayFile = { id: string; file?: File; name: string; preview: string; percent: number; status: 'uploading' | 'done' | 'error'; uploadedUrl?: string; error?: string; abort?: () => void }

/** Invoice detail. As a page (default) or, when `onClose` is passed, as a popup. */
export function InvoiceDetail({ id, onClose }: { id: string; onClose?: () => void }) {
  const t = useT()
  const { crmInvoices, crmInvoiceItems, contacts, crmProjects, upsertCrmInvoice, meName, meEmail } = useStore(useShallow(s => ({
    crmInvoices: s.crmInvoices, crmInvoiceItems: s.crmInvoiceItems, contacts: s.contacts, crmProjects: s.crmProjects, upsertCrmInvoice: s.upsertCrmInvoice, meName: s.meName, meEmail: s.meEmail,
  })))
  const me = meName || meEmail || undefined
  const inv = crmInvoices.find(i => i.id === id)
  const [edit, setEdit] = useState(false)
  const [paySaving, setPaySaving] = useState(false)
  // "Catat Pembayaran" modal: amount + optional proof files.
  const [payOpen, setPayOpen] = useState(false)
  const [payAmountStr, setPayAmountStr] = useState('')
  // Proof files upload the moment they're picked (progress shown live); Save then
  // only records the payment using the already-uploaded URLs.
  const [payFiles, setPayFiles] = useState<PayFile[]>([])
  const idRef = useRef(0)
  const [payErr, setPayErr] = useState('')
  const [payEditGroup, setPayEditGroup] = useState<PaymentProof[] | null>(null) // set = editing that payment
  const [confirmDel, setConfirmDel] = useState<PaymentProof[] | null>(null)
  const [preview, setPreview] = useState<PaymentProof | null>(null)
  // Company/payment settings + logos for the legacy-style PDF (same source as the
  // old Invoices tab). Logo/bank embedded as data URIs so they print reliably.
  const [settings, setSettings] = useState<InvoiceSettings | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [bankLogos, setBankLogos] = useState<Record<string, string>>({}) // slug → data URI
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(getSupabase() as any).from('invoice_settings').select('*').limit(1).maybeSingle().then(({ data }: { data: InvoiceSettings | null }) => setSettings(data))
    fetch(`/logos/${encodeURIComponent('Logo Bentala Studio Landscape Black.png')}`)
      .then(r => (r.ok ? r.blob() : Promise.reject(new Error('logo'))))
      .then(b => new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(b) }))
      .then(setLogoUrl).catch(() => setLogoUrl(null))
  }, [])
  // Load the real logo for every bank referenced by the settings, embedded as a
  // data URI so it prints — keyed by bank slug.
  useEffect(() => {
    const accounts = (settings?.bank_accounts && settings.bank_accounts.length)
      ? settings.bank_accounts
      : (settings?.bank_name ? [{ bank_name: settings.bank_name }] : [])
    const slugs = Array.from(new Set(accounts.map(a => findBank(a.bank_name)?.slug).filter(Boolean))) as string[]
    if (!slugs.length) { setBankLogos({}); return }
    let cancelled = false
    Promise.all(slugs.map(slug =>
      fetch(`/banks/${slug}.png`)
        .then(r => (r.ok ? r.blob() : Promise.reject(new Error('no logo'))))
        .then(b => new Promise<[string, string]>((res, rej) => { const fr = new FileReader(); fr.onload = () => res([slug, fr.result as string]); fr.onerror = rej; fr.readAsDataURL(b) }))
        .catch(() => null),
    )).then(pairs => { if (!cancelled) setBankLogos(Object.fromEntries(pairs.filter(Boolean) as [string, string][])) })
    return () => { cancelled = true }
  }, [settings])
  const items = useMemo(() => crmInvoiceItems.filter(i => i.invoice_id === id).sort((a, b) => a.sort_order - b.sort_order), [crmInvoiceItems, id])

  if (!inv) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>{t('Invoice tidak ditemukan.')}</div>
  const contact = contacts.find(c => c.id === inv.contact_id)
  const project = crmProjects.find(p => p.id === inv.project_id)
  const { subtotal, tax, total } = invoiceTotals(items, inv.discount, inv.tax_enabled)
  const remaining = Math.max(0, Math.round(total - (inv.paid_amount || 0))) // unpaid balance
  // Proofs uploaded together in one Record-Payment submit share the same at/amount/by —
  // group them into a single list entry.
  const proofGroups = useMemo(() => {
    const m = new Map<string, PaymentProof[]>()
    for (const p of inv.payment_proofs || []) {
      const key = `${p.at}|${p.amount ?? ''}|${p.by ?? ''}`
      ;(m.get(key) ?? m.set(key, []).get(key)!).push(p)
    }
    return Array.from(m.values())
  }, [inv.payment_proofs])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = () => getSupabase() as any
  async function patch(u: Partial<CrmInvoice>) {
    upsertCrmInvoice({ ...(inv as CrmInvoice), ...u } as CrmInvoice)
    await sb().from('crm_invoices').update(u).eq('id', id)
  }
  // Open the modal for a NEW payment, or (with a group) to EDIT an existing one.
  function openPayment(group?: PaymentProof[]) {
    setPayFiles(prev => { prev.forEach(x => { x.preview && URL.revokeObjectURL(x.preview); if (x.status === 'uploading') x.abort?.() }); return [] })
    setPayErr('')
    if (group && group.length) {
      setPayEditGroup(group)
      setPayAmountStr(String(Math.round(group[0].amount || 0)))
      // Existing proofs load as already-uploaded entries.
      setPayFiles(group.map((p, i) => ({
        id: `e${i}`, name: p.name, preview: /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(p.url) ? p.url : '',
        percent: 100, status: 'done', uploadedUrl: p.url,
      })))
    } else {
      setPayEditGroup(null)
      setPayAmountStr('') // start empty → shows "0"
    }
    setPayOpen(true)
  }
  const setPF = (fid: string, u: Partial<PayFile>) => setPayFiles(list => list.map(x => x.id === fid ? { ...x, ...u } : x))
  // Kick off a file's upload the instant it's picked; store the resulting URL.
  function startProofUpload(pf: PayFile) {
    if (!pf.file) return
    const { promise, abort } = uploadFileWithProgress(pf.file, 'invoice-proofs', p => setPF(pf.id, { percent: p.percent }))
    setPF(pf.id, { abort })
    promise.then(
      ({ url }) => setPF(pf.id, { status: 'done', percent: 100, uploadedUrl: url }),
      (err) => setPF(pf.id, { status: 'error', error: (err as { message?: string })?.message || t('Upload gagal') }),
    )
  }
  // Save records/updates the payment in ONE combined write (paid_amount + status
  // + payment_proofs), avoiding the realtime clobber from split updates.
  async function submitPayment() {
    // In edit mode the remaining balance excludes this payment's own amount.
    const editAmt = payEditGroup ? (payEditGroup[0].amount || 0) : 0
    const cap = remaining + editAmt
    const add = Math.min(Number(payAmountStr.replace(/\D/g, '')) || 0, cap)
    if (add <= 0) { setPayErr(t('Masukkan nominal pembayaran.')); return }
    if (payFiles.length === 0) { setPayErr(t('Wajib lampirkan minimal 1 bukti pembayaran.')); return }
    if (payFiles.some(f => f.status === 'uploading')) { setPayErr(t('Tunggu upload bukti selesai.')); return }
    if (payFiles.some(f => f.status === 'error')) { setPayErr(t('Ada bukti gagal diunggah — hapus dulu.')); return }
    setPayErr(''); setPaySaving(true)
    try {
      const stamp = payEditGroup ? payEditGroup[0].at : new Date().toISOString()
      const newProofs: PaymentProof[] = payFiles
        .filter(f => f.uploadedUrl)
        .map(f => ({ url: f.uploadedUrl!, name: f.name, at: stamp, by: payEditGroup ? (payEditGroup[0].by ?? me) : me, amount: add }))
      const cur = useStore.getState().crmInvoices.find(x => x.id === id) as CrmInvoice | undefined
      // Drop the old group's proofs (edit) then append the fresh set.
      const oldUrls = new Set((payEditGroup || []).map(p => p.url))
      const base = (cur?.payment_proofs || []).filter(p => !oldUrls.has(p.url))
      const proofs = [...base, ...newProofs]
      const paidBase = Math.max(0, (cur?.paid_amount || 0) - editAmt)
      const paid = Math.min(total, paidBase + add)
      const upd = { paid_amount: paid, status: statusFor(paid) as CrmInvoiceStatus, payment_proofs: proofs }
      upsertCrmInvoice({ ...(cur as CrmInvoice), ...upd } as CrmInvoice)
      const { error } = await sb().from('crm_invoices').update(upd).eq('id', id)
      if (error) { upsertCrmInvoice(cur as CrmInvoice); throw error }
      if (paid > 0) promoteContactToClient(inv?.contact_id) // paid invoice + running project → Client
      setPayOpen(false)
    } catch (e) {
      setPayErr(t('Gagal menyimpan pembayaran') + ': ' + ((e as { message?: string })?.message || 'coba lagi'))
    } finally { setPaySaving(false) }
  }
  const statusFor = (paid: number): CrmInvoiceStatus => paid >= total ? 'LUNAS' : paid > 0 ? 'SEBAGIAN' : 'TERKIRIM'
  // Delete a whole payment: remove its proofs and subtract its amount.
  async function deletePayment(group: PaymentProof[]) {
    const urls = new Set(group.map(p => p.url))
    const cur = useStore.getState().crmInvoices.find(x => x.id === id) as CrmInvoice | undefined
    const proofs = (cur?.payment_proofs || []).filter(p => !urls.has(p.url))
    const paid = Math.max(0, (cur?.paid_amount || 0) - (group[0].amount || 0))
    const upd = { paid_amount: paid, status: statusFor(paid) as CrmInvoiceStatus, payment_proofs: proofs }
    upsertCrmInvoice({ ...(cur as CrmInvoice), ...upd } as CrmInvoice)
    setConfirmDel(null)
    const { error } = await sb().from('crm_invoices').update(upd).eq('id', id)
    if (error) { upsertCrmInvoice(cur as CrmInvoice); alert(t('Gagal menghapus pembayaran') + ': ' + error.message) }
  }

  async function removeProof(url: string) {
    await patch({ payment_proofs: (inv!.payment_proofs || []).filter(p => p.url !== url) })
  }
  async function downloadProof(p: PaymentProof) {
    try {
      const res = await fetch(p.url)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = p.name
      a.click()
      URL.revokeObjectURL(a.href)
    } catch { window.open(p.url, '_blank') }
  }

  // Change status directly. Lunas fills the paid amount; leaving Lunas restores
  // the amount actually recorded via payment proofs (never wipes payment history).
  async function changeStatus(s: CrmInvoice['status']) {
    if (s === inv!.status) return
    if (s === 'LUNAS') { await patch({ status: s, paid_amount: total }); promoteContactToClient(inv!.contact_id) }
    else if (inv!.status === 'LUNAS') {
      const recorded = (inv!.payment_proofs || []).reduce((n, p) => n + (p.amount || 0), 0)
      await patch({ status: s, paid_amount: recorded })
    } else await patch({ status: s })
  }

  const actionButtons = (
    <>
      <button onClick={() => { const w = window.open('', '_blank', 'width=900,height=1040'); openCrmInvoicePrint(inv, items, contact, project?.name ?? null, settings, logoUrl, bankLogos, w) }} style={btn}>{t('Download PDF')}</button>
      <button onClick={() => setEdit(true)} style={btnPrimary}>{t('Edit')}</button>
    </>
  )

  const card = (
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{inv.number}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>{TERMIN_LABEL[inv.termin]}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--text2)' }}>
            <div>{t('Tanggal')}: {formatDate(inv.invoice_date)}</div>
            <div>{t('Jatuh Tempo')}: {inv.due_date ? formatDate(inv.due_date) : '—'}</div>
          </div>
        </div>

        <div style={{ margin: '18px 0', fontSize: 13 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: 4 }}>{t('Ditagihkan kepada')}</div>
          {contact ? <Link href={`/contacts/${contact.id}`} style={{ color: 'var(--link)', textDecoration: 'none', fontWeight: 600 }}>{contact.company_name || contact.name}</Link> : '—'}
          {project && <span style={{ color: 'var(--text3)' }}> · <Link href={`/crm/projects/${project.id}`} style={{ color: 'var(--link)', textDecoration: 'none' }}>{project.name}</Link></span>}
        </div>

        <table>
          <thead><tr><th>{t('Deskripsi')}</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>{t('Harga')}</th><th style={{ textAlign: 'right' }}>{t('Subtotal')}</th></tr></thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id}>
                <td>{i.description}</td>
                <td style={{ textAlign: 'right' }}>{i.qty}</td>
                <td style={{ textAlign: 'right' }}>{formatRupiah(i.unit_price)}</td>
                <td style={{ textAlign: 'right' }}>{formatRupiah(i.qty * i.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginLeft: 'auto', width: 260, marginTop: 14 }}>
          <TR label={t('Subtotal')} v={subtotal} />
          {inv.discount > 0 && <TR label={t('Diskon')} v={-inv.discount} />}
          {inv.tax_enabled && <TR label={`${t('PPN')} ${Math.round(TAX_RATE * 100)}%`} v={tax} />}
          <div style={{ height: 2, background: 'var(--text)', margin: '8px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700 }}><span>Total</span><span>{formatRupiah(total)}</span></div>
          {inv.paid_amount > 0 && inv.status !== 'LUNAS' && <TR label={t('Dibayar')} v={inv.paid_amount} />}
        </div>

        {inv.bank_account && <div style={{ marginTop: 18, fontSize: 12.5, color: 'var(--text2)' }}><b>{t('Pembayaran')}:</b> {inv.bank_account}</div>}
        {inv.notes && <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--text2)' }}>{inv.notes}</div>}

        {/* Payment proofs — a compact payment ledger: one row per recorded payment. */}
        <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)' }}>{t('Bukti Pembayaran')}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text3)', display: 'flex', gap: 12, alignItems: 'baseline' }}>
              <span>{t('Dibayar')} <span style={{ color: '#43d9a2', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatRupiah(inv.paid_amount || 0)}</span></span>
              <span>{t('Kurang')} <span style={{ color: remaining > 0 ? '#ff6b6b' : 'var(--text2)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatRupiah(remaining)}</span></span>
            </span>
          </div>
          {proofGroups.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text3)', padding: '14px 0' }}>{t('Belum ada bukti pembayaran.')}</div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {proofGroups.map((g, gi) => {
                const head = g[0]
                return (
                  <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderTop: gi ? '1px solid var(--border)' : 'none' }}>
                    {/* Amount + when/who */}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{head.amount ? formatRupiah(head.amount) : '—'}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {formatDateTime(head.at)}{head.by ? ` · ${head.by}` : ''}
                      </div>
                    </div>
                    {/* Thumbnail cluster + file count */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {g.slice(0, 4).map(p => {
                          const img = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(p.url)
                          return (
                            <button key={p.url} onClick={() => setPreview(p)} title={p.name}
                              style={{ width: 40, height: 40, padding: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg3)', cursor: 'pointer' }}>
                              {img
                                ? <img src={p.url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 18 }}>📄</div>}
                            </button>
                          )
                        })}
                        {g.length > 4 && (
                          <button onClick={() => setPreview(g[4])} style={{ width: 40, height: 40, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>+{g.length - 4}</button>
                        )}
                      </div>
                      <button onClick={() => openPayment(g)} title={t('Edit pembayaran')} style={iconBtn}><EditIcon /></button>
                      <button onClick={() => setConfirmDel(g)} title={t('Hapus pembayaran')} style={{ ...iconBtn, color: '#ff6b6b', borderColor: '#ff6b6b55' }}><TrashIcon /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <button onClick={() => openPayment()}
            style={{ marginTop: 10, width: '100%', border: '1px dashed var(--border)', borderRadius: 10, background: 'var(--bg2)', color: 'var(--link)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: '10px' }}>
            + {t('Payment')}
          </button>
        </div>
      </div>
  )

  // Single status control (like Projects) — placed by the close button / toolbar.
  // JATUH_TEMPO is derived from the due date (never a manual option); when overdue
  // we show a read-only red pill next to the manual-status select.
  const overdue = isInvoiceOverdue(inv.status, inv.due_date, new Date().toISOString().slice(0, 10))
  const statusSelect = (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {overdue && (
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', background: INVOICE_STATUS_COLOR.JATUH_TEMPO, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>{INVOICE_STATUS_LABEL.JATUH_TEMPO}</span>
      )}
      <select value={inv.status} onChange={e => changeStatus(e.target.value as CrmInvoiceStatus)} title={t('Ubah status')}
        style={{ height: 32, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 26px 0 10px', color: 'var(--text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
        {INVOICE_STATUSES_MANUAL.map(s => <option key={s} value={s} style={{ background: 'var(--bg2)', color: 'var(--text)' }}>{INVOICE_STATUS_LABEL[s]}</option>)}
      </select>
    </div>
  )

  const editModal = edit && <InvoiceFormModal open invoice={inv} onClose={() => setEdit(false)} />

  const payCap = remaining + (payEditGroup ? (payEditGroup[0].amount || 0) : 0)
  const paymentModal = payOpen && (
    <Modal open onClose={() => { if (!paySaving) setPayOpen(false) }} maxWidth={460} title={payEditGroup ? t('Edit Pembayaran') : t('Catat Pembayaran')}
      footer={<>
        <BtnSecondary onClick={() => { if (!paySaving) setPayOpen(false) }}>{t('Batal')}</BtnSecondary>
        <BtnPrimary onClick={submitPayment} loading={paySaving} disabled={paySaving || payFiles.some(f => f.status === 'uploading')}>{t('Simpan')}</BtnPrimary>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>{t('Jumlah diterima')}</div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: 13.5, fontWeight: 600, pointerEvents: 'none' }}>Rp</span>
            <input value={groupID(payAmountStr)}
              onChange={e => { const n = Math.min(Number(e.target.value.replace(/\D/g, '')) || 0, payCap); setPayAmountStr(n ? String(n) : '') }}
              inputMode="numeric" placeholder="0" style={{ ...inStyle, paddingLeft: 36 }} />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 5 }}>
            {t('Maks. (sisa tagihan)')}: {formatRupiah(payCap)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>{t('Bukti pembayaran')} <span style={{ color: '#ff6b6b' }}>*</span></div>
          <div style={{ position: 'relative', width: '100%' }}>
            <div style={{ ...btn, width: '100%', boxSizing: 'border-box', textAlign: 'center', pointerEvents: 'none' }}>
              📎 {payFiles.length ? `${payFiles.length} ${t('file dipilih')}` : t('Pilih file…')}
            </div>
            <input type="file" accept="image/*,application/pdf" multiple
              onChange={e => {
                const added: PayFile[] = Array.from(e.target.files || []).map(file => ({
                  id: String(++idRef.current), file, name: file.name, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '', percent: 0, status: 'uploading',
                }))
                setPayFiles(prev => [...prev, ...added]); setPayErr(''); e.target.value = ''
                added.forEach(startProofUpload) // upload immediately
              }}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
          </div>
          {payFiles.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
              {payFiles.map(s => (
                <div key={s.id} style={{ position: 'relative', width: 92, border: `1px solid ${s.status === 'error' ? '#ff6b6b55' : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden', background: 'var(--bg3)' }}>
                  <div style={{ position: 'relative', height: 64 }}>
                    {s.preview
                      ? <img src={s.preview} alt={s.name} style={{ width: '100%', height: 64, objectFit: 'cover', display: 'block' }} />
                      : <div style={{ height: 64, display: 'grid', placeItems: 'center', fontSize: 24 }}>📄</div>}
                    {/* Upload overlay */}
                    {s.status === 'uploading' && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>{Math.round(s.percent)}%</div>
                    )}
                    {s.status === 'done' && (
                      <div style={{ position: 'absolute', bottom: 3, left: 3, width: 16, height: 16, borderRadius: '50%', background: '#43d9a2', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10 }}>✓</div>
                    )}
                    {s.status === 'error' && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,107,107,0.85)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 10, fontWeight: 700, padding: 4, textAlign: 'center' }}>{t('Gagal')}</div>
                    )}
                  </div>
                  <div style={{ padding: '4px 6px', fontSize: 10, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                  <button onClick={() => setPayFiles(list => { const it = list.find(x => x.id === s.id); if (it) { it.preview && URL.revokeObjectURL(it.preview); if (it.status === 'uploading') it.abort?.() } return list.filter(x => x.id !== s.id) })} title={t('Hapus')} style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 11, lineHeight: 1 }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
        {payFiles.some(f => f.status === 'uploading') && (
          <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{t('Mengunggah bukti…')}</div>
        )}
        {payErr && <div style={{ fontSize: 12, color: '#ff6b6b' }}>{payErr}</div>}
      </div>
    </Modal>
  )

  const previewModal = preview && (() => {
    const p = preview
    const isImg = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(p.url)
    const isPdf = /\.pdf(\?|$)/i.test(p.url)
    return (
      <Modal open onClose={() => setPreview(null)} maxWidth={760} title={p.name}
        footer={<>
          {p.amount ? <span style={{ marginRight: 'auto', fontSize: 12.5, color: 'var(--text3)' }}>{t('Nominal')}: {formatRupiah(p.amount)}</span> : null}
          <button onClick={() => downloadProof(p)} style={btn}>⬇ {t('Download')}</button>
          <button onClick={() => { removeProof(p.url); setPreview(null) }} style={{ ...btn, color: '#ff6b6b', borderColor: '#ff6b6b55' }}>{t('Hapus')}</button>
        </>}>
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 200, maxHeight: '70vh', overflow: 'auto' }}>
          {isImg
            ? <img src={p.url} alt={p.name} style={{ maxWidth: '100%', maxHeight: '68vh', borderRadius: 8 }} />
            : isPdf
              ? <iframe src={p.url} title={p.name} style={{ width: '100%', height: '68vh', border: 'none', borderRadius: 8 }} />
              : <div style={{ textAlign: 'center', color: 'var(--text2)' }}>
                  <div style={{ fontSize: 44, marginBottom: 10 }}>📄</div>
                  <a href={p.url} target="_blank" rel="noreferrer" style={{ color: 'var(--link)' }}>{t('Buka file')}</a>
                </div>}
        </div>
      </Modal>
    )
  })()

  const deleteDialog = (
    <ConfirmDialog
      open={!!confirmDel}
      danger
      title={t('Hapus pembayaran ini?')}
      message={confirmDel ? `${t('Pembayaran')} ${formatRupiah(confirmDel[0].amount || 0)} ${t('beserta buktinya akan dihapus dan jumlah terbayar dikurangi.')}` : ''}
      confirmLabel={t('Hapus')}
      cancelLabel={t('Batal')}
      onConfirm={() => confirmDel && deletePayment(confirmDel)}
      onCancel={() => setConfirmDel(null)}
    />
  )

  // Popup mode — opened from the invoices table.
  if (onClose) {
    return (
      <>
        <Modal open onClose={onClose} maxWidth={880} title={inv.number ?? t('Invoice')} headerRight={statusSelect}
          footer={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', width: '100%' }}>{actionButtons}</div>}>
          {card}
        </Modal>
        {editModal}
        {paymentModal}
        {previewModal}
        {deleteDialog}
      </>
    )
  }

  // Page mode — /crm/invoices/[id].
  return (
    <div style={{ padding: 24, maxWidth: 820, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <Link href="/crm/invoices" style={{ fontSize: 12.5, color: 'var(--text3)', textDecoration: 'none' }}>← {t('Invoices')}</Link>
        <span style={{ flex: 1 }} />
        {statusSelect}
        {actionButtons}
      </div>
      {card}
      {editModal}
      {paymentModal}
      {previewModal}
      {deleteDialog}
    </div>
  )
}

const btn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 13px', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer' }
const btnPrimary: React.CSSProperties = { ...btn, background: 'var(--accent)', border: 'none', color: '#fff' }
const iconBtn: React.CSSProperties = { width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text2)', cursor: 'pointer', flexShrink: 0 }
function EditIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
}
function TrashIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
}
function TR({ label, v }: { label: string; v: number }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text2)', padding: '3px 0' }}><span>{label}</span><span>{formatRupiah(v)}</span></div>
}
