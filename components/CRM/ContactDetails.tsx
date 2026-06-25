'use client'

import { useT } from '@/lib/i18n/LanguageProvider'
import { CONTACT_CHANNELS } from './LeadFormModal'

// Renders every field captured by the Add/Edit contact form from a bsi_leads
// row. Shared by the Database "Detail Kontak" popup and the "Detail Client"
// view so both always show the same content.

const LEAD_STATUS_LABEL: Record<string, string> = {
  new: 'Baru', contacted: 'Sudah Dihubungi', qualified: 'Qualified', closed: 'Closed', spam: 'Spam',
}
const digits = (s: string) => (s || '').replace(/[^\d]/g, '')
const isEmail = (s: string) => (s || '').includes('@')
const slugify = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const cap = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '')

function DRow({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, fontSize: 13, lineHeight: 1.5, alignItems: 'baseline' }}>
      <span style={{ color: 'var(--text2)' }}>{label}</span>
      <span style={{ color: 'var(--text)', wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}
function DSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text2)', fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{children}</div>
    </div>
  )
}
function Chips({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((x, i) => <span key={i} style={{ fontSize: 11.5, fontWeight: 500, padding: '3px 10px', borderRadius: 16, background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.25)', color: 'var(--accent)' }}>{x}</span>)}
    </div>
  )
}
// Always-rendered row — shows a muted "—" placeholder when the value is empty.
function FRow({ label, value }: { label: string; value?: React.ReactNode }) {
  const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12, fontSize: 13, lineHeight: 1.5, alignItems: 'baseline' }}>
      <span style={{ color: 'var(--text2)' }}>{label}</span>
      <span style={{ color: empty ? 'var(--text3)' : 'var(--text)', wordBreak: 'break-word' }}>{empty ? '—' : value}</span>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ContactDetails({ lead, hideHeader, showEmpty }: { lead: any; hideHeader?: boolean; showEmpty?: boolean }) {
  const t = useT()
  const L = lead
  const ct = String(L.contact_type ?? '')
  const channel = CONTACT_CHANNELS.find((c) => slugify(c) === ct) ?? cap(ct)
  const isEmailC = ct === 'email' || isEmail(L.contact_value)
  const isWaC = ct === 'whatsapp' || ct === 'phone'
  const href = !L.contact_value ? null : isEmailC ? `mailto:${L.contact_value}` : isWaC ? `https://wa.me/${digits(L.contact_value)}` : (/^https?:\/\//.test(L.contact_value) ? L.contact_value : null)
  const statusLabel = LEAD_STATUS_LABEL[L.status] ?? L.status
  const jenis: string[] = Array.isArray(L.jenis_project) ? L.jenis_project : []
  const tags: string[] = Array.isArray(L.tags) ? L.tags : []
  const lainnya: { channel: string; value: string }[] = Array.isArray(L.kontak_lainnya) ? L.kontak_lainnya : []
  const lampiran: string[] = Array.isArray(L.lampiran) ? L.lampiran : []
  const addr = [L.alamat_jalan, L.alamat_blok, L.alamat_rtrw ? `RT/RW ${L.alamat_rtrw}` : '', L.kelurahan, L.kecamatan, L.kota, L.provinsi, L.kode_pos, L.negara].filter(Boolean).join(', ')
  const fileName = (u: string) => decodeURIComponent(u.split('/').pop()?.split('?')[0] ?? u)
  const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : null)
  const initials = (L.brand_name || L.full_name || '?').trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
  const prioColor = /hot/i.test(L.prioritas || '') ? '#ff6b6b' : /warm/i.test(L.prioritas || '') ? '#ffc542' : /cold/i.test(L.prioritas || '') ? '#54a0ff' : 'var(--text2)'
  const lampiranNode = lampiran.length === 0 ? null : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {lampiran.map((u, i) => {
        const safe = safeUrl(u)
        return safe
          ? <a key={i} href={safe} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none', wordBreak: 'break-all' }}>📎 {fileName(u)}</a>
          : <span key={i} style={{ fontSize: 12.5, color: 'var(--text2)', wordBreak: 'break-all' }}>📎 {fileName(u)}</span>
      })}
    </div>
  )

  // Full form readout — every field the Add Contact form has, blanks shown as
  // "—" so it's clear what still needs filling.
  if (showEmpty) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!hideHeader && (
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 700, color: 'var(--accent)', background: 'rgba(108,99,255,0.14)', border: '1px solid rgba(108,99,255,0.28)' }}>{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.25 }}>{L.brand_name || L.full_name || '—'}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {L.tier_klien && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: 'rgba(108,99,255,0.12)', color: 'var(--accent)', border: '1px solid rgba(108,99,255,0.25)' }}>{L.tier_klien}</span>}
                {L.industri && <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 9px', borderRadius: 20, background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)' }}>{L.industri}</span>}
                {L.prioritas && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: `${prioColor}1f`, color: prioColor, border: `1px solid ${prioColor}55` }}>{L.prioritas}</span>}
              </div>
            </div>
          </div>
        )}
        <DSection label={t('Identitas')}>
          <FRow label={t('Nama kontak')} value={L.full_name} />
          <FRow label={t('Posisi')} value={L.jabatan} />
          <FRow label={t('Brand / perusahaan')} value={L.brand_name} />
          <FRow label={t('Tier klien')} value={L.tier_klien} />
          <FRow label={t('Industri')} value={L.industri} />
        </DSection>
        <DSection label={t('Kontak & Sumber')}>
          <FRow label={t('Tipe kontak')} value={channel} />
          <FRow label={t('Kontak utama')} value={L.contact_value} />
          <FRow label={t('Kontak lainnya')} value={lainnya.length ? <Chips items={lainnya.map((c) => `${c.channel}: ${c.value}`)} /> : ''} />
          <FRow label={t('Sumber')} value={cap(L.source)} />
          <FRow label={t('Detail sumber')} value={L.detail_sumber} />
        </DSection>
        <DSection label={t('Informasi Alamat')}>
          <FRow label={t('Nama Lokasi / Kantor')} value={L.nama_lokasi} />
          <FRow label={t('Alamat Lengkap')} value={L.alamat_jalan} />
          <FRow label={t('RT / RW')} value={L.alamat_rtrw} />
          <FRow label={t('Blok / Unit / Lantai')} value={L.alamat_blok} />
          <FRow label={t('Kelurahan / Desa')} value={L.kelurahan} />
          <FRow label={t('Kecamatan')} value={L.kecamatan} />
          <FRow label={t('Kota / Kabupaten')} value={L.kota} />
          <FRow label={t('Provinsi')} value={L.provinsi} />
          <FRow label={t('Kode Pos')} value={L.kode_pos} />
          <FRow label={t('Negara')} value={L.negara} />
        </DSection>
        <DSection label={t('Detail Project')}>
          <FRow label={t('Jenis project')} value={jenis.length ? <Chips items={jenis} /> : ''} />
          <FRow label={t('Objektif')} value={L.objektif} />
          <FRow label={t('Budget')} value={L.budget_range} />
          <FRow label="Timeline" value={L.timeline} />
        </DSection>
        <DSection label={t('Status & Assignment')}>
          <FRow label="Status" value={statusLabel} />
          <FRow label={t('Prioritas')} value={L.prioritas} />
          <FRow label="PIC" value={L.pic} />
          <FRow label={t('Next action')} value={L.next_action} />
          <FRow label={t('Follow-up date')} value={L.follow_up_date ? fmtDate(L.follow_up_date) : ''} />
          <FRow label="Tags" value={tags.length ? <Chips items={tags} /> : ''} />
        </DSection>
        <DSection label={t('Notes & Lampiran')}>
          <FRow label="Notes" value={L.notes} />
          <FRow label={t('Lampiran')} value={lampiranNode} />
        </DSection>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!hideHeader && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 700, color: 'var(--accent)', background: 'rgba(108,99,255,0.14)', border: '1px solid rgba(108,99,255,0.28)' }}>{initials}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.25 }}>{L.brand_name || L.full_name || '—'}</div>
            {(L.full_name || L.jabatan) && (
              <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2 }}>{[L.full_name, L.jabatan].filter(Boolean).join(' · ')}</div>
            )}
          </div>
        </div>
      )}

      {(L.tier_klien || L.industri || L.prioritas) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: hideHeader ? 0 : -4 }}>
          {L.tier_klien && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'rgba(108,99,255,0.12)', color: 'var(--accent)', border: '1px solid rgba(108,99,255,0.25)' }}>{L.tier_klien}</span>}
          {L.industri && <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)' }}>{L.industri}</span>}
          {L.prioritas && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: `${prioColor}1f`, color: prioColor, border: `1px solid ${prioColor}55` }}>{L.prioritas}</span>}
        </div>
      )}

      <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text3)', fontWeight: 700, marginBottom: 3 }}>{channel}</div>
          <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13.5, color: 'var(--text)', wordBreak: 'break-all' }}>{L.contact_value || '—'}</div>
        </div>
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, height: 34, padding: '0 14px', background: isWaC ? '#25D366' : 'var(--accent)', color: '#fff', borderRadius: 8, fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {isWaC ? t('Buka WhatsApp') : isEmailC ? t('Kirim Email') : t('Buka link')}
          </a>
        )}
      </div>

      {lainnya.length > 0 && (
        <DSection label={t('Kontak lainnya')}>
          {lainnya.map((c, i) => <DRow key={i} label={c.channel} value={c.value} />)}
        </DSection>
      )}

      {(L.source || L.detail_sumber) && (
        <DSection label={t('Sumber')}>
          <DRow label={t('Sumber')} value={cap(L.source)} />
          <DRow label={t('Detail sumber')} value={L.detail_sumber} />
        </DSection>
      )}

      {(L.nama_lokasi || addr) && (
        <DSection label={t('Alamat')}>
          <DRow label={t('Nama lokasi')} value={L.nama_lokasi} />
          <DRow label={t('Alamat')} value={addr} />
        </DSection>
      )}

      {(jenis.length > 0 || L.objektif || L.budget_range || L.timeline) && (
        <DSection label={t('Detail Project')}>
          {jenis.length > 0 && <DRow label={t('Jenis project')} value={<Chips items={jenis} />} />}
          <DRow label={t('Objektif')} value={L.objektif} />
          <DRow label={t('Budget')} value={L.budget_range} />
          <DRow label="Timeline" value={L.timeline} />
        </DSection>
      )}

      {(statusLabel || L.pic || L.next_action || L.follow_up_date || tags.length > 0) && (
        <DSection label={t('Status & Assignment')}>
          <DRow label="Status" value={statusLabel} />
          <DRow label="PIC" value={L.pic} />
          <DRow label={t('Next action')} value={L.next_action} />
          <DRow label={t('Follow-up')} value={L.follow_up_date ? fmtDate(L.follow_up_date) : ''} />
          {tags.length > 0 && <DRow label="Tags" value={<Chips items={tags} />} />}
        </DSection>
      )}

      {L.notes && (
        <DSection label={t('Catatan')}>
          <div style={{ fontSize: 12.5, lineHeight: 1.6, padding: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, whiteSpace: 'pre-line' }}>{L.notes}</div>
        </DSection>
      )}

      {lampiran.length > 0 && (
        <DSection label={t('Lampiran')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lampiran.map((u, i) => {
              const safe = safeUrl(u)
              return safe
                ? <a key={i} href={safe} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none', wordBreak: 'break-all' }}>📎 {fileName(u)}</a>
                : <span key={i} style={{ fontSize: 12.5, color: 'var(--text2)', wordBreak: 'break-all' }}>📎 {fileName(u)}</span>
            })}
          </div>
        </DSection>
      )}
    </div>
  )
}
