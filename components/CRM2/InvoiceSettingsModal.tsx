'use client'

import { useEffect, useRef, useState } from 'react'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'
import { INDONESIAN_BANKS, findBank } from '@/lib/banks'
import { SOCIAL_PLATFORMS } from '@/lib/socials'
import { inStyle, taStyle } from './ui'
import type { InvoiceSettings, SocialLink, BankAccount } from '@/lib/types'

/** Existing accounts, or one seeded from the legacy single-bank fields. */
function seedBanks(s: InvoiceSettings | null): BankAccount[] {
  if (s?.bank_accounts && s.bank_accounts.length) return s.bank_accounts
  if (s?.bank_name || s?.bank_account || s?.bank_holder) return [{ bank_name: s.bank_name || '', bank_account: s.bank_account || '', bank_holder: s.bank_holder || '' }]
  return []
}

/** Company / payment / social settings used by the invoice PDF (invoice_settings
 *  table — shared with the legacy Invoices tab). */
export function InvoiceSettingsModal({ open, settings, onClose, onSaved }: {
  open: boolean
  settings: InvoiceSettings | null
  onClose: () => void
  onSaved: (s: InvoiceSettings) => void
}) {
  const t = useT()
  const [form, setForm] = useState({
    company_name: settings?.company_name || 'PT Bentala Project Indonesia',
    address: settings?.address || '', phone: settings?.phone || '', email: settings?.email || '',
    terms: settings?.terms || '',
  })
  const [banks, setBanks] = useState<BankAccount[]>(seedBanks(settings))
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(settings?.social_links ?? [])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({
      company_name: settings?.company_name || 'PT Bentala Project Indonesia',
      address: settings?.address || '', phone: settings?.phone || '', email: settings?.email || '',
      terms: settings?.terms || '',
    })
    setBanks(seedBanks(settings))
    setSocialLinks(settings?.social_links ?? [])
  }, [open, settings])

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))
  const addBank = () => setBanks(x => [...x, { bank_name: '', bank_account: '', bank_holder: '' }])
  const setBank = (i: number, patch: Partial<BankAccount>) => setBanks(x => x.map((b, idx) => idx === i ? { ...b, ...patch } : b))
  const delBank = (i: number) => setBanks(x => x.filter((_, idx) => idx !== i))
  const addSocial = () => setSocialLinks(x => [...x, { platform: 'instagram', value: '' }])
  const setSocial = (i: number, patch: Partial<SocialLink>) => setSocialLinks(x => x.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  const delSocial = (i: number) => setSocialLinks(x => x.filter((_, idx) => idx !== i))

  async function handleSave() {
    setLoading(true)
    const bankAccounts = banks.filter(b => (b.bank_name || b.bank_account).trim())
    const primary = bankAccounts[0] || { bank_name: '', bank_account: '', bank_holder: '' }
    const payload = {
      ...form,
      bank_accounts: bankAccounts,
      // Keep the legacy single-bank fields in sync (old Invoices tab reads them).
      bank_name: primary.bank_name, bank_account: primary.bank_account, bank_holder: primary.bank_holder,
      social_links: socialLinks.filter(s => s.value.trim()),
      updated_at: new Date().toISOString(),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = getSupabase() as any
    const { data } = settings?.id
      ? await sb.from('invoice_settings').update(payload).eq('id', settings.id).select().single()
      : await sb.from('invoice_settings').insert(payload).select().single()
    setLoading(false)
    if (data) onSaved(data as InvoiceSettings)
  }

  return (
    <Modal open={open} onClose={onClose} title={t('Pengaturan Invoice')} maxWidth={620}
      footer={<><BtnSecondary onClick={onClose}>{t('Batal')}</BtnSecondary><BtnPrimary onClick={handleSave} loading={loading} disabled={loading}>{t('Simpan')}</BtnPrimary></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.6 }}>
          {t('Info ini muncul di PDF invoice yang dikirim ke klien.')}
        </p>
        <FG label={t('Nama perusahaan')}>
          <input style={inStyle} value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="PT Bentala Project Indonesia" />
        </FG>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FG label={t('Telepon')}><input style={inStyle} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+62 …" /></FG>
          <FG label="Email"><input style={inStyle} value={form.email} onChange={e => set('email', e.target.value)} placeholder="hello@…" /></FG>
        </div>
        <FG label={t('Alamat')}>
          <textarea value={form.address} onChange={e => set('address', e.target.value)} placeholder={t('Alamat perusahaan')} style={{ ...taStyle, minHeight: 60 }} />
        </FG>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>{t('Rekening bank')}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {banks.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('Belum ada rekening.')}</div>}
            {banks.map((b, i) => (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--bg3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text3)' }}>{t('Rekening')} {i + 1}</span>
                  <button type="button" onClick={() => delBank(i)} title={t('Hapus')} style={{ marginLeft: 'auto', height: 24, width: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text3)', cursor: 'pointer', fontSize: 12 }}>✕</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <BankSelect value={b.bank_name} onChange={name => setBank(i, { bank_name: name })} />
                  <input style={inStyle} value={b.bank_account} onChange={e => setBank(i, { bank_account: e.target.value })} placeholder={t('No. rekening')} />
                </div>
                <input style={{ ...inStyle, marginTop: 10 }} value={b.bank_holder} onChange={e => setBank(i, { bank_holder: e.target.value })} placeholder={t('Atas nama')} />
              </div>
            ))}
            <button type="button" onClick={addBank} style={{ alignSelf: 'flex-start', height: 34, padding: '0 12px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>
              + {t('Tambah rekening')}
            </button>
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>{t('Sosial media')}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {socialLinks.map((sl, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 34px', gap: 8, alignItems: 'center' }}>
                <select value={sl.platform} onChange={e => setSocial(i, { platform: e.target.value })} style={{ ...inStyle, height: 40 }}>
                  {SOCIAL_PLATFORMS.map(p => <option key={p.key} value={p.key} style={{ background: 'var(--bg2)', color: 'var(--text)' }}>{p.label}</option>)}
                </select>
                <input value={sl.value} onChange={e => setSocial(i, { value: e.target.value })} placeholder={sl.platform === 'whatsapp' ? '+62 …' : sl.platform === 'website' ? 'bentala.studio' : '@handle'} style={{ ...inStyle, height: 40 }} />
                <button type="button" onClick={() => delSocial(i)} title={t('Hapus')} style={{ height: 32, width: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 15 }}>✕</button>
              </div>
            ))}
            <button type="button" onClick={addSocial} style={{ alignSelf: 'flex-start', height: 34, padding: '0 12px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>
              + {t('Tambah sosial media')}
            </button>
          </div>
        </div>
        <FG label={t('Catatan / syarat pembayaran')}>
          <textarea value={form.terms} onChange={e => set('terms', e.target.value)} placeholder={t('mis. Pembayaran DP 50% di muka…')} style={{ ...taStyle, minHeight: 60 }} />
        </FG>
      </div>
    </Modal>
  )
}

function FG({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  )
}

/** Searchable bank picker (100+ options) — a native select is unusable here. */
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
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ ...inStyle, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`, color: value ? 'var(--text)' : 'var(--text3)', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          {value && <span style={{ width: 11, height: 11, borderRadius: 3, flexShrink: 0, background: findBank(value)?.color || '#334155' }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || t('— Pilih bank —')}</span>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 70, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 14px 36px rgba(0,0,0,0.45)', overflow: 'hidden' }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t('Cari bank...')} style={{ ...inStyle, height: 36 }} />
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {list.length === 0 ? (
              <div style={{ padding: '16px 12px', fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>{t('Bank tidak ditemukan')}</div>
            ) : list.map(b => {
              const active = b.name === value
              return (
                <button key={b.slug} type="button" onClick={() => { onChange(b.name); setOpen(false); setQ('') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 12px', background: active ? 'var(--bg3)' : 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}
                  onMouseOver={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg3)' }}
                  onMouseOut={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
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
