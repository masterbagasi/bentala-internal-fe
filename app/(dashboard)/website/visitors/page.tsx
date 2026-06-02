'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase'
import type { BsiVisitor } from '@/lib/website-types'
import { PageShell } from '@/components/shared/PageShell'
import { ListEmpty, ListError } from '@/components/website/SimpleList'
import { inputStyle } from '@/components/website/FormField'
import { Section } from '@/components/website/Section'

type Filter = 'all' | 'leads' | 'today' | '7d'

export default function VisitorsPage() {
  const supabase = getSupabase()
  const [items, setItems] = useState<BsiVisitor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  async function load() {
    let query = supabase.from('bsi_visitors').select('*').order('last_seen_at', { ascending: false }).limit(200)

    if (filter === 'leads') query = query.eq('is_lead', true)
    if (filter === 'today') {
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      query = query.gte('last_seen_at', startOfToday.toISOString())
    }
    if (filter === '7d') {
      query = query.gte('last_seen_at', new Date(Date.now() - 7 * 86400000).toISOString())
    }

    const { data, error } = await query
    if (error) setError(error.message)
    else setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [filter])

  const filtered = search
    ? items.filter(
        (v) =>
          v.visitor_id.toLowerCase().includes(search.toLowerCase()) ||
          v.user_agent?.toLowerCase().includes(search.toLowerCase()),
      )
    : items

  return (
    <PageShell title="Visitors" backHref="/?tab=website">
      <div style={{ padding: 24 }}>
        {error && <ListError message={error} />}

        <Section
          title="Daftar Visitor"
          action={
            <input
              placeholder="Cari visitor ID atau user agent…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle, maxWidth: 300 }}
            />
          }
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <FilterChip label="Semua" active={filter === 'all'} onClick={() => setFilter('all')} />
            <FilterChip label="Hari Ini" active={filter === 'today'} onClick={() => setFilter('today')} />
            <FilterChip label="7 Hari" active={filter === '7d'} onClick={() => setFilter('7d')} />
            <FilterChip label="Leads" active={filter === 'leads'} onClick={() => setFilter('leads')} accent="#43d9a2" />
          </div>

          {loading ? (
            <div style={{ color: 'var(--text2)', fontSize: 13 }}>Memuat…</div>
          ) : filtered.length === 0 ? (
            <ListEmpty message={items.length === 0 ? 'Belum ada pengunjung.' : 'Tidak ada hasil untuk pencarian ini.'} />
          ) : (
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
                  <Th>Visitor</Th>
                  <Th>Perangkat</Th>
                  <Th>Lokasi</Th>
                  <Th align="right">Sesi</Th>
                  <Th align="right">Pageviews</Th>
                  <Th align="right">Events</Th>
                  <Th>Status</Th>
                  <Th>Pertama</Th>
                  <Th>Terakhir</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <Td>
                      <Link
                        href={`/website/visitors/${encodeURIComponent(v.visitor_id)}`}
                        style={{ color: 'var(--accent)', textDecoration: 'none', fontFamily: 'monospace', fontSize: 11 }}
                      >
                        {v.visitor_id.slice(0, 12)}…
                      </Link>
                    </Td>
                    <Td>
                      <span style={{ color: 'var(--text)' }}>
                        {v.device_type ?? '?'} · {v.os ?? '?'} · {v.browser ?? '?'}
                      </span>
                    </Td>
                    <Td>{[v.city, v.country].filter(Boolean).join(', ') || '—'}</Td>
                    <Td align="right">{v.total_sessions}</Td>
                    <Td align="right">{v.total_pageviews}</Td>
                    <Td align="right">{v.total_events}</Td>
                    <Td>
                      {v.is_lead ? (
                        <span
                          style={{
                            padding: '2px 8px',
                            background: 'rgba(67,217,162,0.15)',
                            color: '#43d9a2',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 600,
                          }}
                        >
                          LEAD
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text2)' }}>visitor</span>
                      )}
                    </Td>
                    <Td>{relativeTime(v.first_seen_at)}</Td>
                    <Td>{relativeTime(v.last_seen_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Section>
      </div>
    </PageShell>
  )
}

function FilterChip({
  label,
  active,
  accent = 'var(--accent)',
  onClick,
}: {
  label: string
  active: boolean
  accent?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 32,
        padding: '0 14px',
        borderRadius: 16,
        background: active ? `${accent}22` : 'var(--bg3)',
        border: `1px solid ${active ? accent : 'var(--border)'}`,
        color: active ? accent : 'var(--text2)',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return 'baru saja'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m lalu`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}j lalu`
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
}

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      style={{
        textAlign: align ?? 'left',
        padding: '10px 12px',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--text2)',
      }}
    >
      {children}
    </th>
  )
}

function Td({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td style={{ textAlign: align ?? 'left', padding: '10px 12px', color: 'var(--text2)', fontSize: 12 }}>{children}</td>
  )
}
