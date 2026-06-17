'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import type { BsiVisitor, BsiSession, BsiPageview, BsiEvent, BsiLead } from '@/lib/website-types'
import { PageShell } from '@/components/shared/PageShell'
import { useIsMobile } from '@/hooks/useIsMobile'
import { ListEmpty, ListError } from '@/components/website/SimpleList'
import { useT } from '@/lib/i18n/LanguageProvider'

interface TimelineItem {
  kind: 'session_start' | 'pageview' | 'event'
  occurred_at: string
  session_id: string
  data: BsiSession | BsiPageview | BsiEvent
}

export default function VisitorDetailPage() {
  const t = useT()
  const isMobile = useIsMobile()
  const params = useParams<{ id: string }>()
  const visitorId = decodeURIComponent(params.id)
  const supabase = getSupabase()
  const [visitor, setVisitor] = useState<BsiVisitor | null>(null)
  const [sessions, setSessions] = useState<BsiSession[]>([])
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [lead, setLead] = useState<BsiLead | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [v, s, p, e] = await Promise.all([
          supabase.from('bsi_visitors').select('*').eq('visitor_id', visitorId).maybeSingle(),
          supabase.from('bsi_sessions').select('*').eq('visitor_id', visitorId).order('started_at', { ascending: false }),
          supabase.from('bsi_pageviews').select('*').eq('visitor_id', visitorId).order('viewed_at', { ascending: false }).limit(200),
          supabase.from('bsi_events').select('*').eq('visitor_id', visitorId).order('occurred_at', { ascending: false }).limit(200),
        ])

        if (v.error) throw new Error(v.error.message)
        setVisitor(v.data)
        setSessions((s.data ?? []) as BsiSession[])

        if (v.data?.lead_id) {
          const ld = await supabase.from('bsi_leads').select('*').eq('id', v.data.lead_id).maybeSingle()
          setLead(ld.data)
        }

        const items: TimelineItem[] = [
          ...(s.data ?? []).map((row: BsiSession) => ({
            kind: 'session_start' as const,
            occurred_at: row.started_at,
            session_id: row.session_id,
            data: row,
          })),
          ...(p.data ?? []).map((row: BsiPageview) => ({
            kind: 'pageview' as const,
            occurred_at: row.viewed_at,
            session_id: row.session_id,
            data: row,
          })),
          ...(e.data ?? []).map((row: BsiEvent) => ({
            kind: 'event' as const,
            occurred_at: row.occurred_at,
            session_id: row.session_id,
            data: row,
          })),
        ].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))

        setTimeline(items)
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      }
    }
    load()
  }, [supabase, visitorId])

  return (
    <PageShell title={`Visitor ${visitorId.slice(0, 8)}…`} backHref="/website/visitors">
      <div style={{ padding: isMobile ? '24px 14px' : 24 }}>
        {error && <ListError message={error} />}

        {loading ? (
          <div style={{ color: 'var(--text2)', fontSize: 13 }}>{t('Memuat…')}</div>
        ) : !visitor ? (
          <ListEmpty message={t('Visitor tidak ditemukan.')} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)', gap: 16 }}>
            {/* Left: visitor info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card>
                <CardTitle>{t('Info Visitor')}</CardTitle>
                <Row label={t('Visitor ID')}>
                  <code style={{ fontSize: 11, color: 'var(--accent)', wordBreak: 'break-all' }}>{visitor.visitor_id}</code>
                </Row>
                <Row label={t('Status')}>
                  {visitor.is_lead ? (
                    <span style={{ padding: '2px 8px', background: 'rgba(67,217,162,0.15)', color: '#43d9a2', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                      LEAD
                    </span>
                  ) : (
                    t('Visitor')
                  )}
                </Row>
                <Row label={t('Pertama Datang')}>{formatDate(visitor.first_seen_at)}</Row>
                <Row label={t('Terakhir Aktif')}>{formatDate(visitor.last_seen_at)}</Row>
                <Row label={t('Total Sesi')}>{visitor.total_sessions}</Row>
                <Row label={t('Total Pageviews')}>{visitor.total_pageviews}</Row>
                <Row label={t('Total Events')}>{visitor.total_events}</Row>
              </Card>

              <Card>
                <CardTitle>{t('Perangkat')}</CardTitle>
                <Row label={t('Tipe')}>{visitor.device_type ?? '—'}</Row>
                <Row label="OS">{visitor.os ?? '—'}</Row>
                <Row label="Browser">{visitor.browser ?? '—'}</Row>
                <Row label={t('Lokasi')}>{[visitor.city, visitor.country].filter(Boolean).join(', ') || '—'}</Row>
                {visitor.user_agent && (
                  <Row label="User Agent">
                    <span style={{ fontSize: 10, color: 'var(--text2)', wordBreak: 'break-all' }}>{visitor.user_agent}</span>
                  </Row>
                )}
              </Card>

              {lead && (
                <Card>
                  <CardTitle>Lead</CardTitle>
                  <Row label={t('Nama')}>{lead.full_name}</Row>
                  <Row label="Brand">{lead.brand_name}</Row>
                  <Row label={t('Kontak')}>
                    {lead.contact_type}: {lead.contact_value}
                  </Row>
                  <Row label="Project">{lead.project_type}</Row>
                  {lead.notes && <Row label={t('Catatan')}>{lead.notes}</Row>}
                  <Link href={`/website/leads`} style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>
                    {t('Buka di Leads →')}
                  </Link>
                </Card>
              )}

              <Card>
                <CardTitle>{t('Sesi')} ({sessions.length})</CardTitle>
                {sessions.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{t('Belum ada sesi.')}</div>
                ) : (
                  sessions.slice(0, 10).map((s) => (
                    <div key={s.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                      <div style={{ color: 'var(--text)', fontWeight: 600 }}>{formatDate(s.started_at)}</div>
                      <div style={{ color: 'var(--text2)', marginTop: 2 }}>
                        Landing: <code style={{ color: 'var(--accent)' }}>{s.landing_path}</code>
                      </div>
                      <div style={{ color: 'var(--text2)' }}>
                        {s.pageview_count} pages · {s.event_count} events
                      </div>
                      {(s.utm_source || s.referrer) && (
                        <div style={{ color: 'var(--text2)', marginTop: 2 }}>
                          Source: {s.utm_source ?? hostnameOf(s.referrer ?? '') ?? 'direct'}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </Card>
            </div>

            {/* Right: timeline */}
            <Card>
              <CardTitle>Timeline ({timeline.length})</CardTitle>
              {timeline.length === 0 ? (
                <ListEmpty message={t('Belum ada aktivitas.')} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {timeline.map((item, idx) => (
                    <TimelineRow key={`${item.kind}-${idx}`} item={item} isLast={idx === timeline.length - 1} />
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </PageShell>
  )
}

function TimelineRow({ item, isLast }: { item: TimelineItem; isLast: boolean }) {
  const t = useT()
  const config: Record<TimelineItem['kind'], { icon: string; color: string; bg: string; label: string }> = {
    session_start: { icon: '▶', color: '#ffc542', bg: 'rgba(255,197,66,0.15)', label: t('Sesi dimulai') },
    pageview: { icon: '👁', color: '#00d4ff', bg: 'rgba(0,212,255,0.15)', label: 'View' },
    event: { icon: '⚡', color: '#6c63ff', bg: 'rgba(108,99,255,0.15)', label: 'Event' },
  }
  const cfg = config[item.kind]

  let detail = ''
  let extra: React.ReactNode = null

  if (item.kind === 'pageview') {
    const pv = item.data as BsiPageview
    detail = pv.path
    extra = pv.title ? <span style={{ color: 'var(--text2)', marginLeft: 8 }}>· {pv.title}</span> : null
  } else if (item.kind === 'event') {
    const ev = item.data as BsiEvent
    detail = ev.event_type + (ev.target ? ` · ${ev.target}` : '')
    if (ev.metadata && Object.keys(ev.metadata).length > 0) {
      extra = (
        <span style={{ color: 'var(--text2)', marginLeft: 8, fontSize: 10 }}>
          · {JSON.stringify(ev.metadata)}
        </span>
      )
    }
  } else {
    const s = item.data as BsiSession
    detail = `Landing: ${s.landing_path}`
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 0',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          background: cfg.bg,
          color: cfg.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: 13,
        }}
      >
        {cfg.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--text)' }}>
          <span style={{ fontWeight: 600 }}>{cfg.label}</span>
          <span style={{ color: 'var(--text2)', marginLeft: 8 }}>· {detail}</span>
          {extra}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2, fontFamily: 'monospace' }}>
          {formatDate(item.occurred_at)} · session {item.session_id.slice(0, 8)}
        </div>
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {children}
    </div>
  )
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.12em',
        color: 'var(--text2)',
        textTransform: 'uppercase',
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
      <span style={{ color: 'var(--text2)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text)', textAlign: 'right', minWidth: 0 }}>{children}</span>
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function hostnameOf(url: string): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
