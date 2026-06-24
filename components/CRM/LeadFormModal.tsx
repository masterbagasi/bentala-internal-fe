'use client'

import { useEffect, useState } from 'react'
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
  kontak_alt: string
  source: string
  detail_sumber: string
  jenis_project: string[]
  objektif: string
  budget_range: string
  timeline: string
  brief_awal: string
  status: string
  prioritas: string
  pic: string
  next_action: string
  follow_up_date: string
  tags: string[]
  notes: string
  lampiran: string[]
}

const TIPE_KONTAK = ['WhatsApp', 'Email', 'Phone', 'IG DM', 'LinkedIn']
const TIER = ['UMKM', 'Mid-size', 'Corporate', 'Personal brand']
const INDUSTRI = ['Food & beverage', 'Beauty', 'Fashion', 'Personal', 'Tech', 'Health', 'Edu', 'Other']
const SUMBER = ['Instagram', 'TikTok', 'Website', 'Referral', 'Event', 'Cold', 'Ads', 'Lainnya']
const SUMBER_NEEDS_DETAIL = ['Referral', 'Event', 'Ads']
const JENIS_PROJECT = ['Social media mgmt', 'Meta ads', 'Branding', 'Content production', 'KOL management', 'Google ads', 'Web / design', 'Lainnya']
const OBJEKTIF = ['Awareness', 'Engagement', 'Leads / Sales', 'Followers growth', 'Content production', 'Branding', 'Launch campaign', 'Lainnya']
const BUDGET = ['< Rp 5 juta', 'Rp 5 — 15 juta', 'Rp 15 — 30 juta', 'Rp 30 — 50 juta', 'Rp 50 — 100 juta', '> Rp 100 juta']
const TIMELINE = ['Urgent — sekarang', '1 — 3 bulan', '3 — 6 bulan', 'Long-term', 'Belum tentu']
const STATUS8 = ['New lead', 'Contacted', 'Qualified', 'Prospek', 'Penawaran', 'Negosiasi', 'Won', 'Lost']
const STATUS_NEEDS_FOLLOWUP = ['Prospek', 'Penawaran', 'Negosiasi']
const PRIORITAS = ['Hot — sekarang', 'Warm', 'Cold']

const EMPTY: NewLeadInput = {
  full_name: '', jabatan: '', brand_name: '', tier_klien: 'UMKM', industri: 'Food & beverage',
  contact_type: 'WhatsApp', contact_value: '', kontak_alt: '', source: 'Instagram', detail_sumber: '',
  jenis_project: [], objektif: '', budget_range: '', timeline: '', brief_awal: '',
  status: 'New lead', prioritas: 'Warm', pic: '', next_action: '', follow_up_date: '',
  tags: [], notes: '', lampiran: [],
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

  const needDetail = SUMBER_NEEDS_DETAIL.includes(form.source)
  const needFollowUp = STATUS_NEEDS_FOLLOWUP.includes(form.status)

  function addTag() {
    const v = tagInput.trim().toLowerCase()
    if (!v) return
    setForm((f) => (f.tags.includes(v) ? f : { ...f, tags: [...f.tags, v] }))
    setTagInput('')
  }

  async function save() {
    if (form.full_name.trim().length < 2) { alert(t('Nama kontak minimal 2 karakter.')); return }
    if (!form.contact_value.trim()) { alert(t('Kontak utama wajib diisi.')); return }
    if (form.jenis_project.length === 0) { alert(t('Pilih minimal satu jenis project.')); return }
    if (!form.pic) { alert(t('Pilih PIC penanggung jawab.')); return }
    if (needDetail && !form.detail_sumber.trim()) { alert(t('Detail sumber wajib untuk Referral / Event / Ads.')); return }
    if (needFollowUp && !form.follow_up_date) { alert(t('Follow-up date wajib untuk status Prospek / Penawaran / Negosiasi.')); return }
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
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
          <Field label={t('Nama kontak')} required>
            <input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder={t('Nama lengkap')} />
          </Field>
          <Row>
            <Field label={t('Jabatan / posisi')}>
              <input value={form.jabatan} onChange={(e) => set('jabatan', e.target.value)} placeholder={t('Owner, Marketing Lead, dst')} />
            </Field>
            <Field label={t('Brand / perusahaan')}>
              <input value={form.brand_name} onChange={(e) => set('brand_name', e.target.value)} placeholder="PT. ... / @brandname" />
            </Field>
          </Row>
          <Row>
            <Field label={t('Tier klien')} hint={t('menentukan gaya komunikasi')}>
              <Select value={form.tier_klien} onChange={(v) => set('tier_klien', v)} options={TIER} />
            </Field>
            <Field label={t('Industri')}>
              <Select value={form.industri} onChange={(v) => set('industri', v)} options={INDUSTRI} />
            </Field>
          </Row>
        </Group>

        <Group label={t('Kontak & Sumber')}>
          <Row>
            <Field label={t('Tipe kontak')}>
              <Select value={form.contact_type} onChange={(v) => set('contact_type', v)} options={TIPE_KONTAK} />
            </Field>
            <Field label={t('Kontak utama')} required>
              <input value={form.contact_value} onChange={(e) => set('contact_value', e.target.value)} placeholder={form.contact_type === 'Email' ? 'email@domain.com' : '+62...'} />
            </Field>
          </Row>
          <Field label={t('Kontak alternatif')} hint={t('opsional')}>
            <input value={form.kontak_alt} onChange={(e) => set('kontak_alt', e.target.value)} placeholder={t('email atau nomor cadangan')} />
          </Field>
          <Row>
            <Field label={t('Sumber')} hint={t('dari mana kontak datang')}>
              <Select value={form.source} onChange={(v) => set('source', v)} options={SUMBER} />
            </Field>
            <Field label={t('Detail sumber')} required={needDetail} hint={t('nama event / referrer / campaign')}>
              <input value={form.detail_sumber} onChange={(e) => set('detail_sumber', e.target.value)} placeholder={t('Contoh: direferensikan Pak Andi')} />
            </Field>
          </Row>
        </Group>

        <Group label={t('Detail Project')}>
          <Field label={t('Jenis project')} required hint={t('bisa pilih lebih dari satu')}>
            <ChipMulti options={JENIS_PROJECT} value={form.jenis_project} onToggle={(o) => set('jenis_project', form.jenis_project.includes(o) ? form.jenis_project.filter((x) => x !== o) : [...form.jenis_project, o])} />
          </Field>
          <Field label={t('Tujuan / objektif')} hint={t('apa yang klien mau capai')}>
            <Select value={form.objektif} onChange={(v) => set('objektif', v)} options={OBJEKTIF} placeholder={t('Pilih objektif utama...')} />
          </Field>
          <Row>
            <Field label={t('Estimasi budget')} hint={t('per bulan')}>
              <Select value={form.budget_range} onChange={(v) => set('budget_range', v)} options={BUDGET} placeholder={t('Pilih range...')} />
            </Field>
            <Field label="Timeline">
              <Select value={form.timeline} onChange={(v) => set('timeline', v)} options={TIMELINE} placeholder={t('Pilih timeline...')} />
            </Field>
          </Row>
          <Field label={t('Brief awal')}>
            <textarea rows={3} value={form.brief_awal} onChange={(e) => set('brief_awal', e.target.value)} placeholder={t('Ringkas apa yang klien butuhkan, tantangan utama, expectation...')} style={{ fontFamily: 'inherit', resize: 'vertical' }} />
          </Field>
        </Group>

        <Group label={t('Status & Assignment')}>
          <Row3>
            <Field label="Status">
              <Select value={form.status} onChange={(v) => set('status', v)} options={STATUS8} />
            </Field>
            <Field label={t('Prioritas')}>
              <Select value={form.prioritas} onChange={(v) => set('prioritas', v)} options={PRIORITAS} />
            </Field>
            <Field label="PIC" required>
              <Select value={form.pic} onChange={(v) => set('pic', v)} options={team.map((m) => m.name)} placeholder={t('Pilih anggota tim...')} />
            </Field>
          </Row3>
          <Row>
            <Field label={t('Next action')}>
              <input value={form.next_action} onChange={(e) => set('next_action', e.target.value)} placeholder={t('Kirim proposal, jadwalkan call, dll')} />
            </Field>
            <Field label={t('Follow-up date')} required={needFollowUp}>
              <input type="date" value={form.follow_up_date} onChange={(e) => set('follow_up_date', e.target.value)} />
            </Field>
          </Row>
          <Field label="Tags" hint={t('label custom untuk filter cepat')}>
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
          <Field label={t('Lampiran')} hint={t('brief, proposal, mood board')}>
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
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
        {label}{required && <span style={{ color: 'var(--accent2)' }}>*</span>}
        {hint && <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>{hint}</span>}
      </span>
      {children}
    </label>
  )
}
function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
function ChipMulti({ options, value, onToggle }: { options: string[]; value: string[]; onToggle: (o: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 10, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)' }}>
      {options.map((o) => {
        const on = value.includes(o)
        return (
          <button key={o} type="button" onClick={() => onToggle(o)}
            style={{ fontSize: 12.5, fontWeight: 600, borderRadius: 16, padding: '5px 12px', cursor: 'pointer',
              border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
              background: on ? 'rgba(108,99,255,0.18)' : 'var(--bg2)', color: on ? 'var(--accent)' : 'var(--text2)' }}>
            {o}
          </button>
        )
      })}
    </div>
  )
}
