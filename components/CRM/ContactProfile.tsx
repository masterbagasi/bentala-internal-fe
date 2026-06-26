'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'
import { ContactDetails } from './ContactDetails'

// Full-PAGE contact detail (replaces the old "Detail Kontak" popup). Opened at
// /clients/database/<id>; the Database list row navigates here instead of
// opening a modal. Mirrors the visual language of the User/Client detail page:
// breadcrumb + back, a header card with avatar and status chips, a row of
// quick-fact stat cards, then the full field readout (shared ContactDetails).

const LEAD_STATUS_LABEL: Record<string, string> = {
  new: 'Baru', contacted: 'Sudah Dihubungi', qualified: 'Qualified', closed: 'Closed', spam: 'Spam',
}
const digits = (s: string) => (s || '').replace(/[^\d]/g, '')
const isEmail = (s: string) => (s || '').includes('@')
const cap = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
const daysSince = (iso?: string | null) => {
  if (!iso) return null
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return Number.isFinite(d) && d >= 0 ? d : null
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      position: 'relative', background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '14px 16px', overflow: 'hidden', minWidth: 0,
    }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent }} />
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value || '—'}</div>
    </div>
  )
}

export function ContactProfile({ id }: { id: string }) {
  const t = useT()
  const router = useRouter()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [lead, setLead] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let off = false
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(getSupabase() as any).from('bsi_leads').select('*').eq('id', id).maybeSingle()
      .then(({ data }: { data: unknown }) => { if (!off) { setLead(data); setLoading(false) } })
    return () => { off = true }
  }, [id])

  const backToList = () => router.push('/clients/database')

  if (loading) return <div style={{ padding: 24, color: 'var(--text2)' }}>{t('Memuat…')}</div>
  if (!lead) {
    return (
      <div style={{ padding: 24, color: 'var(--text2)' }}>
        {t('Kontak tidak ditemukan.')}{' '}
        <button onClick={backToList} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>← {t('Kembali ke Database')}</button>
      </div>
    )
  }

  const L = lead
  const title = L.brand_name || L.full_name || t('Tanpa nama')
  const initials = String(L.brand_name || L.full_name || '?').trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
  const ct = String(L.contact_type ?? '')
  const isEmailC = ct === 'email' || isEmail(L.contact_value)
  const isWaC = ct === 'whatsapp' || ct === 'phone'
  const channelLabel = isWaC ? 'WhatsApp' : isEmailC ? 'Email' : cap(ct) || t('Kontak')
  const href = !L.contact_value ? null : isEmailC ? `mailto:${L.contact_value}` : isWaC ? `https://wa.me/${digits(L.contact_value)}` : (/^https?:\/\//.test(L.contact_value) ? L.contact_value : null)
  const statusLabel = LEAD_STATUS_LABEL[L.status] ?? L.status
  const prio = String(L.prioritas || '')
  const prioColor = /hot/i.test(prio) ? '#ff6b6b' : /warm/i.test(prio) ? '#ffc542' : /cold/i.test(prio) ? '#54a0ff' : 'var(--text2)'
  const days = daysSince(L.submitted_at || L.created_at)

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
      {/* Breadcrumb + back */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <button onClick={backToList} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', padding: 0, fontSize: 12.5 }}>{t('Database')}</button>
          <span>›</span>
          <span style={{ color: 'var(--text2)' }}>{t('Detail Kontak')}</span>
        </div>
        <button onClick={backToList} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 9, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← {t('Kembali')}</button>
      </div>

      {/* Header card */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 700, color: 'var(--accent)', background: 'rgba(108,99,255,0.14)', border: '1px solid rgba(108,99,255,0.28)' }}>{initials}</div>
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, color: 'var(--text)', wordBreak: 'break-word' }}>{title}</span>
              {days !== null && (
                <span style={{ fontSize: 11.5, color: 'var(--text3)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 10px', whiteSpace: 'nowrap' }}>
                  {days === 0 ? t('masuk hari ini') : `${days} ${t('hari sejak masuk')}`}
                </span>
              )}
            </div>
            {(L.full_name || L.jabatan) && L.brand_name && (
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{[L.full_name, L.jabatan].filter(Boolean).join(' · ')}</div>
            )}
            {/* Contact value inline */}
            {L.contact_value && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--text3)' }}>{channelLabel}</span>
                <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13.5, color: 'var(--text)', wordBreak: 'break-all' }}>{L.contact_value}</span>
              </div>
            )}
            {/* Status / priority / tier / industry chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              {statusLabel && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'rgba(84,160,255,0.16)', color: '#54a0ff', border: '1px solid rgba(84,160,255,0.3)' }}>{statusLabel}</span>}
              {prio && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: `${prioColor}24`, color: prioColor, border: `1px solid ${prioColor}66` }}>{prio}</span>}
              {L.tier_klien && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'rgba(108,99,255,0.16)', color: 'var(--accent)', border: '1px solid rgba(108,99,255,0.3)' }}>{L.tier_klien}</span>}
              {L.industri && <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)' }}>{L.industri}</span>}
            </div>
          </div>
          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            {href && (
              <a href={href} target="_blank" rel="noopener noreferrer" style={{ height: 36, padding: '0 16px', background: isWaC ? '#25D366' : 'var(--accent)', color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                {isWaC ? t('Buka WhatsApp') : isEmailC ? t('Kirim Email') : t('Buka link')}
              </a>
            )}
            <button onClick={() => (L.converted_client_id ? router.push(`/clients/${L.converted_client_id}`) : router.push(`/clients/database?edit=${encodeURIComponent(id)}`))} style={{ height: 36, padding: '0 16px', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{t('Edit')}</button>
            {/* Already a client → no re-convert; offer "+ Prospect" only for raw leads. */}
            {!L.converted_client_id && (
              <button onClick={() => router.push(`/clients/database?convert=${encodeURIComponent(id)}`)} style={{ height: 36, padding: '0 16px', background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Prospect</button>
            )}
          </div>
        </div>
      </div>

      {/* Quick-fact stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <StatCard label={t('Status')} value={statusLabel} accent="#54a0ff" />
        <StatCard label={t('Prioritas')} value={prio} accent={prio ? prioColor : 'var(--border)'} />
        <StatCard label={t('Sumber')} value={cap(L.source)} accent="#6c63ff" />
        <StatCard label={t('Kota')} value={L.kota || ''} accent="#43d9a2" />
        <StatCard label={t('Masuk')} value={fmtDate(L.submitted_at || L.created_at)} accent="#ffc542" />
      </div>

      {/* Full field readout (shared with the Add/Edit form) */}
      <ContactDetails lead={L} hideHeader showEmpty />
    </div>
  )
}
