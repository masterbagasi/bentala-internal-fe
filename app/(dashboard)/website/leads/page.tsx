'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'
import type { BsiLead } from '@/lib/website-types'
import { PageShell } from '@/components/shared/PageShell'
import { ListEmpty, ListError } from '@/components/website/SimpleList'
import { Section } from '@/components/website/Section'

const STATUS_LABELS: Record<BsiLead['status'], string> = {
  new: 'Baru',
  contacted: 'Sudah Dihubungi',
  qualified: 'Qualified',
  closed: 'Closed',
  spam: 'Spam',
}

const STATUS_COLORS: Record<BsiLead['status'], string> = {
  new: '#6c63ff',
  contacted: '#ffc542',
  qualified: '#43d9a2',
  closed: '#43d9a2',
  spam: '#ff6b6b',
}

const STATUS_OPTIONS: BsiLead['status'][] = ['new', 'contacted', 'qualified', 'closed', 'spam']

export default function LeadsAdminPage() {
  const t = useT()
  const supabase = getSupabase()
  const [items, setItems] = useState<BsiLead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<BsiLead['status'] | 'all'>('all')
  const [query, setQuery] = useState('')

  async function load() {
    const { data, error } = await supabase
      .from('bsi_leads')
      .select('*')
      .order('submitted_at', { ascending: false })
    if (error) setError(error.message)
    else setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function updateStatus(id: string, status: BsiLead['status']) {
    const { error } = await supabase.from('bsi_leads').update({ status }).eq('id', id)
    if (error) { alert(error.message); return }
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status } : x)))
  }

  const filtered = items
    .filter((x) => filter === 'all' || x.status === filter)
    .filter((x) => {
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return (
        x.full_name.toLowerCase().includes(q) ||
        x.brand_name.toLowerCase().includes(q) ||
        x.contact_value.toLowerCase().includes(q) ||
        x.project_type.toLowerCase().includes(q)
      )
    })

  const counts: Record<string, number> = items.reduce((acc, x) => {
    acc[x.status] = (acc[x.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <PageShell title="Leads">
      <div style={{ padding: 24 }}>
        {error && <ListError message={error} />}

        <Section
          title={t('Daftar Lead')}
          action={
            <div style={{ minWidth: 200, maxWidth: 320 }}>
              <SearchInput value={query} onChange={setQuery} />
            </div>
          }
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <FilterChip
              label={t('Semua')}
              count={items.length}
              active={filter === 'all'}
              onClick={() => setFilter('all')}
            />
            {STATUS_OPTIONS.map((s) => (
              <FilterChip
                key={s}
                label={STATUS_LABELS[s]}
                count={counts[s] ?? 0}
                active={filter === s}
                color={STATUS_COLORS[s]}
                onClick={() => setFilter(s)}
              />
            ))}
          </div>

          {loading ? (
            <div style={{ color: 'var(--text2)', fontSize: 13, padding: 24, textAlign: 'center' }}>
              {t('Memuat…')}
            </div>
          ) : filtered.length === 0 ? (
            <ListEmpty
              message={
                items.length === 0
                  ? t('Belum ada lead.')
                  : t('Tidak ada lead yang cocok dengan filter / pencarian.')
              }
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onUpdateStatus={(s) => updateStatus(lead.id, s)}
                />
              ))}
            </div>
          )}
        </Section>
      </div>
    </PageShell>
  )
}

/* ──────────────────────────────────────────────────────────── */
/* UI — Filter chips & search                                   */
/* ──────────────────────────────────────────────────────────── */

function FilterChip({
  label,
  count,
  active,
  color = 'var(--accent)',
  onClick,
}: {
  label: string
  count: number
  active: boolean
  color?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 30,
        padding: '0 12px',
        borderRadius: 15,
        background: active ? `${color}1a` : 'var(--bg3)',
        border: `1px solid ${active ? `${color}66` : 'var(--border)'}`,
        color: active ? color : 'var(--text2)',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        transition: 'all 0.15s ease',
      }}
    >
      <span>{label}</span>
      <span
        style={{
          fontSize: 11,
          padding: '1px 6px',
          borderRadius: 8,
          background: active ? `${color}26` : 'var(--bg2)',
          color: active ? color : 'var(--text2)',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 600,
          lineHeight: 1.4,
        }}
      >
        {count}
      </span>
    </button>
  )
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT()
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        style={{
          position: 'absolute',
          left: 10,
          color: 'var(--text2)',
          pointerEvents: 'none',
        }}
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('Cari nama, brand, kontak…')}
        style={{
          width: '100%',
          height: 30,
          padding: '0 30px 0 30px',
          borderRadius: 8,
          background: 'var(--bg3)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          fontSize: 12,
          outline: 'none',
        }}
        onFocus={(e) => {
          ;(e.currentTarget as HTMLInputElement).style.borderColor = 'var(--accent)'
        }}
        onBlur={(e) => {
          ;(e.currentTarget as HTMLInputElement).style.borderColor = 'var(--border)'
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('Hapus pencarian')}
          style={{
            position: 'absolute',
            right: 6,
            width: 18,
            height: 18,
            borderRadius: 9,
            background: 'transparent',
            border: 'none',
            color: 'var(--text2)',
            cursor: 'pointer',
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────── */
/* Lead card                                                    */
/* ──────────────────────────────────────────────────────────── */

function LeadCard({
  lead,
  onUpdateStatus,
}: {
  lead: BsiLead
  onUpdateStatus: (s: BsiLead['status']) => void
}) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const submittedAt = new Date(lead.submitted_at)
  const accent = STATUS_COLORS[lead.status]

  const hasMeta = !!(
    lead.notes ||
    lead.utm_source ||
    lead.utm_medium ||
    lead.utm_campaign ||
    lead.referrer
  )

  const phoneDigits = lead.contact_value.replace(/[^\d]/g, '')
  const primaryHref =
    lead.contact_type === 'whatsapp' ? `https://wa.me/${phoneDigits}` : `mailto:${lead.contact_value}`
  const primaryLabel = lead.contact_type === 'whatsapp' ? 'WhatsApp' : 'Email'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg2)',
        border: `1px solid ${hovered ? `${accent}40` : 'var(--border)'}`,
        borderRadius: 10,
        overflow: 'hidden',
        transition: 'border-color 0.15s ease, transform 0.15s ease',
      }}
    >
      {/* Header row — always visible */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto auto auto',
          alignItems: 'center',
          gap: 14,
          padding: '14px 16px',
        }}
      >
        <Avatar name={lead.full_name} />

        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Line 1: name + brand */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flexShrink: 1,
              }}
            >
              {lead.full_name}
            </span>
            <span
              style={{
                fontSize: 12,
                color: 'var(--text2)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flex: '0 1 auto',
              }}
            >
              · {lead.brand_name}
            </span>
          </div>
          {/* Line 2: contact + project type */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--text2)',
              minWidth: 0,
            }}
          >
            <ContactIcon type={lead.contact_type} />
            <span
              style={{
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, "Cascadia Code", monospace',
                fontSize: 11.5,
                color: 'var(--text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flexShrink: 1,
              }}
            >
              {lead.contact_value}
            </span>
            <span
              style={{
                width: 3,
                height: 3,
                borderRadius: 2,
                background: 'var(--text2)',
                opacity: 0.5,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flexShrink: 1,
              }}
              title={lead.project_type}
            >
              {lead.project_type}
            </span>
            {lead.notes && (
              <span
                title={t('Ada catatan project')}
                style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'rgba(255,197,66,0.12)',
                  color: '#ffc542',
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Note
              </span>
            )}
          </div>
        </div>

        {/* Status pill (clickable dropdown) */}
        <StatusPill status={lead.status} onChange={onUpdateStatus} />

        {/* Date — clean & tabular */}
        <div
          style={{
            fontSize: 11,
            color: 'var(--text2)',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            textAlign: 'right',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
          title={submittedAt.toLocaleString('id-ID', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        >
          <span style={{ color: 'var(--text)', fontWeight: 500 }}>{formatDay(submittedAt)}</span>
          <span style={{ opacity: 0.7 }}>
            {submittedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Primary action + expand */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <a
            href={primaryHref}
            target="_blank"
            rel="noopener noreferrer"
            title={`${t('Buka di')} ${primaryLabel}`}
            style={{
              height: 32,
              width: 32,
              borderRadius: 8,
              background:
                lead.contact_type === 'whatsapp'
                  ? 'rgba(37,211,102,0.14)'
                  : 'rgba(108,99,255,0.14)',
              color: lead.contact_type === 'whatsapp' ? '#25D366' : 'var(--accent)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              border: `1px solid ${
                lead.contact_type === 'whatsapp' ? 'rgba(37,211,102,0.25)' : 'rgba(108,99,255,0.25)'
              }`,
              transition: 'transform 0.15s ease',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLElement).style.transform = 'scale(1.06)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.transform = 'scale(1)'
            }}
          >
            {lead.contact_type === 'whatsapp' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a9.956 9.956 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <polyline points="3 7 12 13 21 7" />
              </svg>
            )}
          </a>
          {hasMeta && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? t('Tutup detail') : t('Lihat detail')}
              title={expanded ? t('Tutup detail') : t('Lihat detail')}
              style={{
                height: 32,
                width: 32,
                borderRadius: 8,
                background: expanded ? 'var(--bg3)' : 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text2)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 0.2s ease, background 0.15s ease',
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                style={{
                  transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && hasMeta && (
        <div
          style={{
            padding: '14px 16px 16px 16px',
            borderTop: '1px solid var(--border)',
            background: 'rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {lead.notes && (
            <div>
              <SectionLabel>{t('Catatan Project')}</SectionLabel>
              <div
                style={{
                  fontSize: 12.5,
                  color: 'var(--text)',
                  lineHeight: 1.6,
                  padding: 12,
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  whiteSpace: 'pre-line',
                }}
              >
                {lead.notes}
              </div>
            </div>
          )}

          {(lead.utm_source || lead.utm_medium || lead.utm_campaign || lead.referrer) && (
            <div>
              <SectionLabel>Tracking</SectionLabel>
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 8,
                  margin: 0,
                }}
              >
                {lead.utm_source && <MetaItem label="UTM Source" value={lead.utm_source} />}
                {lead.utm_medium && <MetaItem label="Medium" value={lead.utm_medium} />}
                {lead.utm_campaign && <MetaItem label="Campaign" value={lead.utm_campaign} />}
                {lead.referrer && <MetaItem label="Referrer" value={lead.referrer} mono />}
              </dl>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a
              href={primaryHref}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                height: 32,
                padding: '0 14px',
                background: lead.contact_type === 'whatsapp' ? '#25D366' : 'var(--accent)',
                color: '#fff',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                textDecoration: 'none',
              }}
            >
              {lead.contact_type === 'whatsapp' ? t('Buka WhatsApp') : t('Kirim Email')}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="7" y1="17" x2="17" y2="7" />
                <polyline points="7 7 17 7 17 17" />
              </svg>
            </a>
            <CopyButton value={lead.contact_value} />
          </div>
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────── */
/* Small components                                             */
/* ──────────────────────────────────────────────────────────── */

function Avatar({ name }: { name: string }) {
  const initials = getInitials(name)
  const hue = hashHue(name)
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        background: `linear-gradient(135deg, hsl(${hue}, 55%, 50%) 0%, hsl(${(hue + 35) % 360}, 60%, 38%) 100%)`,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.02em',
        flexShrink: 0,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
      }}
      aria-hidden="true"
    >
      {initials}
    </div>
  )
}

function ContactIcon({ type }: { type: BsiLead['contact_type'] }) {
  if (type === 'whatsapp') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="#25D366" style={{ flexShrink: 0 }}>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a9.956 9.956 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    )
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ flexShrink: 0 }}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <polyline points="3 7 12 13 21 7" />
    </svg>
  )
}

function StatusPill({
  status,
  onChange,
}: {
  status: BsiLead['status']
  onChange: (s: BsiLead['status']) => void
}) {
  const color = STATUS_COLORS[status]
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={status}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value as BsiLead['status'])}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          height: 26,
          padding: '0 24px 0 22px',
          borderRadius: 13,
          background: `${color}1a`,
          border: `1px solid ${color}55`,
          color,
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          letterSpacing: '0.02em',
        }}
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s} style={{ background: 'var(--bg2)', color: 'var(--text)' }}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {/* Status dot inside the pill (left) */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 9,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 6,
          height: 6,
          borderRadius: 3,
          background: color,
          boxShadow: `0 0 0 2px ${color}33`,
          pointerEvents: 'none',
        }}
      />
      {/* Caret */}
      <svg
        aria-hidden="true"
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          opacity: 0.7,
        }}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: 'var(--text2)',
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  )
}

function MetaItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      style={{
        padding: '8px 10px',
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text2)',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--text)',
          fontFamily: mono
            ? 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, monospace'
            : undefined,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={value}
      >
        {value}
      </div>
    </div>
  )
}

function CopyButton({ value }: { value: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // Clipboard write failed — silently ignore (rare on http/insecure ctx).
        }
      }}
      style={{
        height: 32,
        padding: '0 14px',
        background: 'var(--bg3)',
        color: copied ? '#43d9a2' : 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        transition: 'color 0.15s ease',
      }}
    >
      {copied ? (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {t('Disalin')}
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {t('Salin Kontak')}
        </>
      )}
    </button>
  )
}

/* ──────────────────────────────────────────────────────────── */
/* Helpers                                                      */
/* ──────────────────────────────────────────────────────────── */

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Deterministic hue (0-360) from an arbitrary string. */
function hashHue(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h) % 360
}

/** Format submitted_at as a short, human day label. */
function formatDay(d: Date): string {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfThat = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((startOfToday.getTime() - startOfThat.getTime()) / 86400000)
  if (diffDays === 0) return 'Hari ini'
  if (diffDays === 1) return 'Kemarin'
  if (diffDays < 7) return `${diffDays} hari lalu`
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
}
