'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/lib/i18n/LanguageProvider'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { MultiFileUploader } from '@/components/website/FileUploader'
import { getSupabase } from '@/lib/supabase'

export interface NewLeadInput {
  full_name: string
  jabatan: string
  brand_name: string
  tier_klien: string
  industri: string
  contact_type: string
  contact_value: string
  kontak_lainnya: { channel: string; value: string }[]
  source: string
  detail_sumber: string
  jenis_project: string[]
  objektif: string
  budget_range: string
  timeline: string
  status: string
  prioritas: string
  pic: string
  next_action: string
  follow_up_date: string
  tags: string[]
  notes: string
  lampiran: string[]
  // Address
  nama_lokasi: string
  alamat_jalan: string
  alamat_rtrw: string
  alamat_blok: string
  kelurahan: string
  kecamatan: string
  kota: string
  provinsi: string
  kode_pos: string
  negara: string
}

const CONTACT_CHANNELS = ['WhatsApp', 'Email', 'Instagram', 'Facebook', 'X (Twitter)', 'TikTok', 'YouTube', 'LinkedIn', 'Telegram', 'Phone', 'Website', 'Threads', 'Snapchat', 'Pinterest', 'Lainnya']
const TIER = ['UMKM', 'Small Business', 'Mid Market', 'Enterprise']
const INDUSTRI = ['Food & beverage', 'Beauty', 'Fashion', 'Personal', 'Tech', 'Health', 'Edu', 'Other']
const SUMBER = ['Instagram', 'TikTok', 'Website', 'Referral', 'Event', 'Cold', 'Ads', 'Lainnya']
const JENIS_PROJECT = ['Social media mgmt', 'Meta ads', 'Branding', 'Content production', 'KOL management', 'Google ads', 'Web / design', 'Lainnya']
const OBJEKTIF = ['Awareness', 'Engagement', 'Leads / Sales', 'Followers growth', 'Content production', 'Branding', 'Launch campaign', 'Lainnya']
const BUDGET = ['< Rp 5 juta', 'Rp 5 — 15 juta', 'Rp 15 — 30 juta', 'Rp 30 — 50 juta', 'Rp 50 — 100 juta', '> Rp 100 juta']
const TIMELINE = ['Urgent — sekarang', '1 — 3 bulan', '3 — 6 bulan', 'Long-term', 'Belum tentu']
const STATUS8 = ['New lead', 'Contacted', 'Qualified', 'Prospek', 'Penawaran', 'Negosiasi', 'Won', 'Lost']
const PRIORITAS = ['Hot — sekarang', 'Warm', 'Cold']
const PROVINSI = ['Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Kepulauan Riau', 'Jambi', 'Sumatera Selatan', 'Bangka Belitung', 'Bengkulu', 'Lampung', 'DKI Jakarta', 'Jawa Barat', 'Banten', 'Jawa Tengah', 'DI Yogyakarta', 'Jawa Timur', 'Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur', 'Kalimantan Barat', 'Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara', 'Sulawesi Utara', 'Gorontalo', 'Sulawesi Tengah', 'Sulawesi Barat', 'Sulawesi Selatan', 'Sulawesi Tenggara', 'Maluku', 'Maluku Utara', 'Papua', 'Papua Barat', 'Papua Selatan', 'Papua Tengah', 'Papua Pegunungan', 'Papua Barat Daya']
const NEGARA = [
  'Indonesia', 'Malaysia', 'Singapura', 'Brunei Darussalam', 'Filipina', 'Thailand', 'Vietnam', 'Myanmar', 'Kamboja', 'Laos', 'Timor Leste',
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan',
  'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Bulgaria', 'Burkina Faso', 'Burundi',
  'Cabo Verde', 'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica', "Côte d'Ivoire", 'Croatia', 'Cuba', 'Cyprus', 'Czechia',
  'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'DR Congo',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia',
  'Fiji', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana',
  'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan',
  'Kazakhstan', 'Kenya', 'Kiribati', 'Kosovo', 'Kuwait', 'Kyrgyzstan', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg',
  'Madagascar', 'Malawi', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique',
  'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway', 'Oman',
  'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria',
  'Taiwan', 'Tajikistan', 'Tanzania', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu',
  'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu', 'Vatican City', 'Venezuela', 'Yemen', 'Zambia', 'Zimbabwe', 'Lainnya',
]

const EMPTY: NewLeadInput = {
  full_name: '', jabatan: '', brand_name: '', tier_klien: 'UMKM', industri: 'Food & beverage',
  contact_type: 'WhatsApp', contact_value: '', kontak_lainnya: [], source: 'Instagram', detail_sumber: '',
  jenis_project: [], objektif: '', budget_range: '', timeline: '',
  status: 'New lead', prioritas: 'Warm', pic: '', next_action: '', follow_up_date: '',
  tags: [], notes: '', lampiran: [],
  nama_lokasi: '', alamat_jalan: '', alamat_rtrw: '', alamat_blok: '', kelurahan: '', kecamatan: '',
  kota: '', provinsi: '', kode_pos: '', negara: 'Indonesia',
}

export function LeadFormModal({ onClose, onSave, title }: {
  onClose: () => void
  onSave: (input: NewLeadInput) => Promise<void>
  title?: string
}) {
  const t = useT()
  const [form, setForm] = useState<NewLeadInput>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [team, setTeam] = useState<{ name: string }[]>([])
  const [tagInput, setTagInput] = useState('')
  const set = <K extends keyof NewLeadInput>(k: K, v: NewLeadInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    let off = false
    fetch('/api/accounts').then((r) => (r.ok ? r.json() : { accounts: [] }))
      .then((d: { accounts?: { name: string }[] }) => { if (!off) setTeam(d.accounts ?? []) }).catch(() => {})
    return () => { off = true }
  }, [])

  function addTag() {
    const v = tagInput.trim().toLowerCase()
    if (!v) return
    setForm((f) => (f.tags.includes(v) ? f : { ...f, tags: [...f.tags, v] }))
    setTagInput('')
  }

  async function save() {
    if (!form.brand_name.trim()) { alert(t('Brand / perusahaan wajib diisi.')); return }
    if (!form.contact_value.trim()) { alert(t('Kontak utama wajib diisi.')); return }
    setSaving(true)
    try { await onSave({ ...form, kontak_lainnya: form.kontak_lainnya.filter((c) => c.value.trim()) }) } finally { setSaving(false) }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title ?? t('Tambah kontak')}
      maxWidth={760}
      footer={<><BtnSecondary onClick={onClose}>{t('Batal')}</BtnSecondary><BtnPrimary onClick={save} loading={saving}>{t('Simpan kontak')}</BtnPrimary></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <Group label={t('Identitas')}>
          <Row>
            <Field label={t('Nama kontak')}>
              <input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder={t('Nama lengkap')} />
            </Field>
            <Field label={t('Brand / perusahaan')} required>
              <input value={form.brand_name} onChange={(e) => set('brand_name', e.target.value)} placeholder="PT. ... / @brandname" />
            </Field>
          </Row>
          <Field label={t('Posisi')}>
            <input value={form.jabatan} onChange={(e) => set('jabatan', e.target.value)} placeholder={t('Owner, Marketing Lead, dst')} />
          </Field>
          <Row>
            <Field label={t('Tier klien')}>
              <Combo searchable={false} value={form.tier_klien} onChange={(v) => set('tier_klien', v)} options={TIER} />
            </Field>
            <Field label={t('Industri')}>
              <Combo searchable={false} value={form.industri} onChange={(v) => set('industri', v)} options={INDUSTRI} />
            </Field>
          </Row>
        </Group>

        <Group label={t('Kontak & Sumber')}>
          <Row>
            <Field label={t('Tipe kontak')}>
              <Combo searchable={false} value={form.contact_type} onChange={(v) => set('contact_type', v)} options={CONTACT_CHANNELS} />
            </Field>
            <Field label={t('Kontak utama')} required>
              <input value={form.contact_value} onChange={(e) => set('contact_value', e.target.value)} placeholder={form.contact_type === 'Email' ? 'email@domain.com' : '+62...'} />
            </Field>
          </Row>

          {/* Kontak lainnya — repeatable social / channel rows */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
              {t('Kontak lainnya')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {form.kontak_lainnya.map((c, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '150px 1fr auto', gap: 8 }}>
                  <Combo searchable={false} value={c.channel} placeholder={t('Channel...')} options={CONTACT_CHANNELS}
                    onChange={(v) => set('kontak_lainnya', form.kontak_lainnya.map((x, j) => (j === i ? { ...x, channel: v } : x)))} />
                  <input value={c.value} placeholder={t('username / link / nomor')}
                    onChange={(e) => set('kontak_lainnya', form.kontak_lainnya.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                  <button type="button" onClick={() => set('kontak_lainnya', form.kontak_lainnya.filter((_, j) => j !== i))}
                    style={{ width: 38, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: '#ff6b6b', cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>
              ))}
              <button type="button" onClick={() => set('kontak_lainnya', [...form.kontak_lainnya, { channel: 'Instagram', value: '' }])}
                style={{ alignSelf: 'flex-start', fontSize: 12.5, fontWeight: 600, color: 'var(--accent)', background: 'rgba(108,99,255,0.1)', border: '1px dashed rgba(108,99,255,0.4)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>
                + {t('Tambah kontak')}
              </button>
            </div>
          </div>

          <Row>
            <Field label={t('Sumber')}>
              <Combo searchable={false} value={form.source} onChange={(v) => set('source', v)} options={SUMBER} />
            </Field>
            <Field label={t('Detail sumber')}>
              <input value={form.detail_sumber} onChange={(e) => set('detail_sumber', e.target.value)} placeholder={t('Contoh: direferensikan Pak Andi')} />
            </Field>
          </Row>
        </Group>

        <Group label={t('Informasi Alamat')}>
          <Field label={t('Nama Lokasi / Kantor')}>
            <input value={form.nama_lokasi} onChange={(e) => set('nama_lokasi', e.target.value)} placeholder={t('Contoh: Kantor Pusat PT Maju Bersama')} />
          </Field>
          <Field label={t('Alamat Lengkap')}>
            <input value={form.alamat_jalan} onChange={(e) => set('alamat_jalan', e.target.value)} placeholder={t('Jalan / Nomor Gedung')} />
          </Field>
          <Row>
            <Field label={t('RT / RW')}>
              <input value={form.alamat_rtrw} onChange={(e) => set('alamat_rtrw', e.target.value)} placeholder="001 / 002" />
            </Field>
            <Field label={t('Blok / Unit / Lantai')}>
              <input value={form.alamat_blok} onChange={(e) => set('alamat_blok', e.target.value)} placeholder={t('Blok A / Lt. 3')} />
            </Field>
          </Row>
          <Row>
            <Field label={t('Kelurahan / Desa')}>
              <input value={form.kelurahan} onChange={(e) => set('kelurahan', e.target.value)} placeholder={t('Kelurahan / Desa')} />
            </Field>
            <Field label={t('Kecamatan')}>
              <input value={form.kecamatan} onChange={(e) => set('kecamatan', e.target.value)} placeholder={t('Kecamatan')} />
            </Field>
          </Row>
          <Row>
            <Field label={t('Kota / Kabupaten')}>
              <input value={form.kota} onChange={(e) => set('kota', e.target.value)} placeholder={t('Kota / Kabupaten')} />
            </Field>
            <Field label={t('Provinsi / State')}>
              <Combo value={form.provinsi} onChange={(v) => set('provinsi', v)} options={PROVINSI} placeholder={t('Cari / pilih provinsi...')} />
            </Field>
          </Row>
          <Row>
            <Field label={t('Kode Pos')}>
              <input value={form.kode_pos} onChange={(e) => set('kode_pos', e.target.value)} placeholder="40123" />
            </Field>
            <Field label={t('Negara')}>
              <Combo value={form.negara} onChange={(v) => set('negara', v)} options={NEGARA} placeholder={t('Cari / pilih negara...')} />
            </Field>
          </Row>
        </Group>

        <Group label={t('Detail Project')}>
          <Field label={t('Jenis project')}>
            <ChipMulti options={JENIS_PROJECT} value={form.jenis_project} onToggle={(o) => set('jenis_project', form.jenis_project.includes(o) ? form.jenis_project.filter((x) => x !== o) : [...form.jenis_project, o])} />
          </Field>
          <Field label={t('Tujuan / objektif')}>
            <Combo searchable={false} value={form.objektif} onChange={(v) => set('objektif', v)} options={OBJEKTIF} placeholder={t('Pilih objektif utama...')} />
          </Field>
          <Row>
            <Field label={t('Estimasi budget')}>
              <Combo searchable={false} value={form.budget_range} onChange={(v) => set('budget_range', v)} options={BUDGET} placeholder={t('Pilih range...')} />
            </Field>
            <Field label="Timeline">
              <Combo searchable={false} value={form.timeline} onChange={(v) => set('timeline', v)} options={TIMELINE} placeholder={t('Pilih timeline...')} />
            </Field>
          </Row>
        </Group>

        <Group label={t('Status & Assignment')}>
          <Row3>
            <Field label="Status">
              <Combo searchable={false} value={form.status} onChange={(v) => set('status', v)} options={STATUS8} />
            </Field>
            <Field label={t('Prioritas')}>
              <Combo searchable={false} value={form.prioritas} onChange={(v) => set('prioritas', v)} options={PRIORITAS} />
            </Field>
            <Field label="PIC">
              <Combo searchable={false} value={form.pic} onChange={(v) => set('pic', v)} options={team.map((m) => m.name)} placeholder={t('Pilih anggota tim...')} />
            </Field>
          </Row3>
          <Row>
            <Field label={t('Next action')}>
              <input value={form.next_action} onChange={(e) => set('next_action', e.target.value)} placeholder={t('Kirim proposal, jadwalkan call, dll')} />
            </Field>
            <Field label={t('Follow-up date')}>
              <input type="date" value={form.follow_up_date} onChange={(e) => set('follow_up_date', e.target.value)} />
            </Field>
          </Row>
          <Field label="Tags">
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', background: 'var(--bg3)' }}>
              {form.tags.map((tag) => (
                <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'rgba(108,99,255,0.16)', borderRadius: 16, padding: '3px 9px' }}>
                  {tag}<button type="button" onClick={() => set('tags', form.tags.filter((x) => x !== tag))} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                </span>
              ))}
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                placeholder={t('+ tambah tag')} style={{ flex: 1, minWidth: 110, border: 'none', background: 'none', padding: '2px 4px', color: 'var(--text)', fontSize: 13 }} />
            </div>
          </Field>
        </Group>

        <Group label={t('Notes & Lampiran')}>
          <Field label={t('Catatan')}>
            <textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder={t('Konteks penting, hasil call, hal yang perlu diingat...')} style={{ fontFamily: 'inherit', resize: 'vertical' }} />
          </Field>
          <Field label={t('Lampiran')}>
            <MultiFileUploader value={form.lampiran} onChange={(urls) => set('lampiran', urls)} prefix="leads/files" accept="all" />
          </Field>
        </Group>
      </div>
    </Modal>
  )
}

// ── Layout helpers ──
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>{label}</div>
      {children}
    </section>
  )
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
}
function Row3({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>{children}</div>
}
function Field({ label, children, required, hint }: { label: string; children: React.ReactNode; required?: boolean; hint?: string }) {
  // A <div>, not a <label>: a <label> forwards clicks to its first labelable
  // descendant, which double-toggles the first chip in multi-select groups.
  return (
    <div>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
        {label}{required && <span style={{ color: 'var(--accent2)' }}>*</span>}
        {hint && <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>{hint}</span>}
      </span>
      {children}
    </div>
  )
}
// Dropdown for every form field: type to filter, and the panel is rendered in a
// portal with position:fixed so it never moves with the modal scroll — it stays
// anchored to the field and only scrolls internally. Closes on outside click or
// when the page behind it scrolls.
function Combo({ value, onChange, options, placeholder, searchable = true }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; searchable?: boolean }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  function openPanel() {
    const r = inputRef.current?.getBoundingClientRect()
    if (r) setRect({ top: r.bottom + 5, left: r.left, width: r.width })
    setQ('')
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const tgt = e.target as Node
      if (inputRef.current?.contains(tgt) || panelRef.current?.contains(tgt)) return
      setOpen(false)
    }
    function onScroll(e: Event) {
      if (panelRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    function onResize() { setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const shown = searchable ? options.filter((o) => o.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 80) : options

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={open && searchable ? q : value}
        placeholder={placeholder || ''}
        readOnly={!searchable}
        onChange={(e) => { setQ(e.target.value); if (!open) openPanel() }}
        onMouseDown={() => (open ? setOpen(false) : openPanel())}
        style={{ paddingRight: 34, cursor: 'pointer', color: value ? 'var(--text)' : 'var(--text3)' }}
      />
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        style={{ position: 'absolute', right: 11, top: '50%', transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`, pointerEvents: 'none', transition: 'transform 0.15s' }}>
        <polyline points="6 9 12 15 18 9" />
      </svg>
      {open && rect && createPortal(
        <div ref={panelRef} style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width, zIndex: 3000, maxHeight: 260, overflowY: 'auto', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 14px 40px rgba(0,0,0,0.55)' }}>
          {shown.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text2)' }}>Tidak ada hasil</div>
          ) : shown.map((o) => (
            <div key={o}
              onMouseDown={(e) => { e.preventDefault(); onChange(o); setOpen(false); setQ('') }}
              style={{ padding: '9px 12px', fontSize: 13.5, cursor: 'pointer', color: o === value ? 'var(--accent)' : 'var(--text)', background: o === value ? 'rgba(108,99,255,0.12)' : 'transparent' }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg3)')}
              onMouseOut={(e) => (e.currentTarget.style.background = o === value ? 'rgba(108,99,255,0.12)' : 'transparent')}>
              {o}
            </div>
          ))}
        </div>, document.body)}
    </div>
  )
}

function ChipMulti({ options, value, onToggle }: { options: string[]; value: string[]; onToggle: (o: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = value.includes(o)
        return (
          <button key={o} type="button" onClick={() => onToggle(o)} aria-pressed={on}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
              borderRadius: 999, padding: on ? '7px 14px 7px 11px' : '7px 14px', cursor: 'pointer',
              border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
              background: on ? 'var(--accent)' : 'var(--bg3)',
              color: on ? '#fff' : 'var(--text2)',
              transition: 'background 0.14s, border-color 0.14s, color 0.14s, transform 0.1s',
            }}
            onMouseOver={(e) => { if (!on) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text)' } }}
            onMouseOut={(e) => { if (!on) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text2)' } }}
            onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {on && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {o}
          </button>
        )
      })}
    </div>
  )
}
