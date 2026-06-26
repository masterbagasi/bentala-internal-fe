'use client'

import { useMemo } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'
import { WS_STATUS_COLS } from '@/lib/constants'
import type { Post } from '@/lib/types'
import { isAccountTask, mineColKey } from './index'

type Acct = { email: string; name: string }

// Short column headers for the per-account table (the full labels are too wide
// for the narrow count columns).
const SHORT: Record<string, string> = {
  brief: 'To Do', produksi: 'Prod', review: 'Review', revisi: 'Revisi', done: 'Done',
}

function tally(posts: Post[]) {
  const counts: Record<string, number> = { brief: 0, produksi: 0, review: 0, revisi: 0, done: 0 }
  for (const p of posts) {
    const col = mineColKey(p)
    if (col in counts) counts[col] += 1
  }
  const total = posts.length
  const done = counts.done
  return { counts, total, done, open: total - done }
}

function dueSoon(posts: Post[]): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const limit = new Date(today); limit.setDate(limit.getDate() + 7)
  let n = 0
  for (const p of posts) {
    if (mineColKey(p) === 'done') continue
    if (!p.date) continue
    const d = new Date(p.date)
    if (d >= today && d <= limit) n += 1
  }
  return n
}

// Deterministic avatar tint from the name — gives each person a stable colour
// without needing their uploaded photo here.
function avatarHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

// A thin segmented bar showing how a set of tasks is distributed across the WS
// statuses — the dashboard's signature, used both globally and per account.
function StatusBar({ counts, total, height = 10 }: { counts: Record<string, number>; total: number; height?: number }) {
  return (
    <div style={{ display: 'flex', gap: 2, height, borderRadius: height, overflow: 'hidden', background: 'var(--bg3)' }}>
      {total === 0
        ? null
        : WS_STATUS_COLS.map(c => {
            const v = counts[c.key] ?? 0
            if (v === 0) return null
            return <div key={c.key} title={`${c.label}: ${v}`} style={{ flex: v, background: c.color, opacity: c.key === 'done' ? 0.85 : 1 }} />
          })}
    </div>
  )
}

export function TaskDashboard({ posts, accounts, projects, onAccountClick }: { posts: Post[]; accounts?: Acct[]; projects?: { slug: string; name: string }[]; onAccountClick?: (a: Acct) => void }) {
  const t = useT()
  const agg = useMemo(() => tally(posts), [posts])
  const soon = useMemo(() => dueSoon(posts), [posts])

  const perAccount = useMemo(() => {
    if (!accounts) return null
    return accounts
      .map(a => ({ account: a, ...tally(posts.filter(p => isAccountTask(p, a))) }))
      .filter(r => r.total > 0)
      .sort((x, y) => y.open - x.open || y.total - x.total)
  }, [accounts, posts])

  // Task source: how many of the tasks come from each project (Master Bagasi,
  // Bagasian, …) vs Personal. Columns are built from the live projects list, so
  // a new project shows up automatically once it has tasks.
  const sourceKey = (p: Post) => (p.entity === 'personal' ? 'personal' : (p.entity || 'other'))
  const sourceCols = useMemo(() => {
    if (!projects) return null
    const m = new Map<string, string>()
    m.set('personal', t('Personal'))
    for (const p of projects) m.set(p.slug, p.name)
    for (const p of posts) { const k = sourceKey(p); if (!m.has(k)) m.set(k, k === 'other' ? t('Other') : k) }
    return Array.from(m.entries()).map(([key, name]) => ({ key, name }))
  }, [projects, posts, t])

  const sourceRows = useMemo(() => {
    if (!sourceCols || !accounts) return null
    return accounts
      .map(a => {
        const mine = posts.filter(p => isAccountTask(p, a))
        const counts: Record<string, number> = {}
        for (const p of mine) { const k = sourceKey(p); counts[k] = (counts[k] || 0) + 1 }
        return { account: a, counts, total: mine.length }
      })
      .filter(r => r.total > 0)
      .sort((x, y) => y.total - x.total)
  }, [sourceCols, accounts, posts])

  const sourceSingle = useMemo(() => {
    if (!sourceCols || accounts) return null
    const counts: Record<string, number> = {}
    for (const p of posts) { const k = sourceKey(p); counts[k] = (counts[k] || 0) + 1 }
    return counts
  }, [sourceCols, accounts, posts])

  const kpis = [
    { label: t('Total Task'),    value: agg.total, color: 'var(--text)' },
    { label: t('Belum selesai'), value: agg.open,  color: '#5b9bd5' },
    { label: t('Selesai'),       value: agg.done,  color: '#43d9a2' },
    { label: t('Due 7 hari'),    value: soon,      color: '#ffc542' },
  ]

  // Compact fixed count columns; the name and (especially) the workload bar
  // absorb the extra width so a full-screen layout stays purposeful, not sparse.
  const grid = 'minmax(200px, 1.4fr) repeat(5, 64px) minmax(260px, 2.4fr)'
  const srcGrid = sourceCols ? `minmax(160px, 1.4fr) repeat(${sourceCols.length}, minmax(56px, 0.8fr)) 70px` : ''

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* KPIs — each tile carries a hairline accent in its metric colour. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderTop: `2px solid ${k.color}`, borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: k.color, letterSpacing: '-0.02em' }}>{k.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Status spread — the signature bar + a counted legend. */}
      <div>
        <SectionLabel>{t('Sebaran Status')}</SectionLabel>
        <StatusBar counts={agg.counts} total={agg.total} height={12} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
          {WS_STATUS_COLS.map(c => (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: c.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{c.label}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{agg.counts[c.key] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Per account — labelled count columns (fixes the bare-number table) plus
          a completion bar. Only rendered in the Team overview. */}
      {perAccount && (
        <div>
          <SectionLabel>{t('Per Akun')}</SectionLabel>
          {perAccount.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text3)', padding: '6px 2px' }}>{t('Belum ada task.')}</div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 760 }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 8, alignItems: 'center', padding: '9px 14px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                <span style={hStyle}>{t('Akun')}</span>
                {WS_STATUS_COLS.map(c => (
                  <span key={c.key} style={{ ...hStyle, textAlign: 'center', display: 'inline-flex', gap: 5, alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: c.color }} />{SHORT[c.key]}
                  </span>
                ))}
                <span style={{ ...hStyle, textAlign: 'right' }}>{t('Beban kerja')}</span>
              </div>
              {/* Rows */}
              {perAccount.map((r, i) => {
                const pct = r.total ? Math.round((r.done / r.total) * 100) : 0
                return (
                  <div
                    key={r.account.email}
                    onClick={onAccountClick ? () => onAccountClick(r.account) : undefined}
                    onKeyDown={onAccountClick ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAccountClick(r.account) } }) : undefined}
                    role={onAccountClick ? 'button' : undefined}
                    tabIndex={onAccountClick ? 0 : undefined}
                    title={onAccountClick ? `${t('Lihat board')} ${r.account.name}` : undefined}
                    onMouseOver={onAccountClick ? (e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg2)' }) : undefined}
                    onMouseOut={onAccountClick ? (e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }) : undefined}
                    style={{ display: 'grid', gridTemplateColumns: grid, gap: 8, alignItems: 'center', padding: '11px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', cursor: onAccountClick ? 'pointer' : 'default' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: '50%', background: `hsl(${avatarHue(r.account.name)} 42% 30%)`, color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {(r.account.name[0] || '?').toUpperCase()}
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.account.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.account.email}</span>
                      </span>
                    </div>
                    {WS_STATUS_COLS.map(c => {
                      const v = r.counts[c.key] ?? 0
                      return (
                        <span key={c.key} style={{ textAlign: 'center', fontSize: 13, fontWeight: v ? 700 : 400, color: v ? c.color : 'var(--text3)' }}>{v}</span>
                      )
                    })}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'stretch', minWidth: 0 }}>
                      <span style={{ fontSize: 11.5, color: 'var(--text2)', textAlign: 'right' }}><b style={{ color: 'var(--text)' }}>{r.done}</b>/{r.total} · {pct}%</span>
                      <StatusBar counts={r.counts} total={r.total} height={7} />
                    </div>
                  </div>
                )
              })}
              </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Task source per account — Personal vs each project (Team overview). */}
      {sourceRows && sourceCols && sourceRows.length > 0 && (
        <div>
          <SectionLabel>{t('Sumber Task')}</SectionLabel>
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 240 + sourceCols.length * 76 }}>
                <div style={{ display: 'grid', gridTemplateColumns: srcGrid, gap: 8, alignItems: 'center', padding: '9px 14px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                  <span style={hStyle}>{t('Akun')}</span>
                  {sourceCols.map(c => <span key={c.key} style={{ ...hStyle, textAlign: 'center' }}>{c.name}</span>)}
                  <span style={{ ...hStyle, textAlign: 'right' }}>{t('Total')}</span>
                </div>
                {sourceRows.map((r, i) => (
                  <div key={r.account.email} style={{ display: 'grid', gridTemplateColumns: srcGrid, gap: 8, alignItems: 'center', padding: '10px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.account.name}</span>
                    {sourceCols.map(c => {
                      const v = r.counts[c.key] ?? 0
                      return <span key={c.key} style={{ textAlign: 'center', fontSize: 13, fontWeight: v ? 700 : 400, color: v ? (c.key === 'personal' ? '#a78bfa' : 'var(--text)') : 'var(--text3)' }}>{v}</span>
                    })}
                    <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{r.total}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task source — single account (My Task). */}
      {sourceSingle && sourceCols && (
        <div>
          <SectionLabel>{t('Sumber Task')}</SectionLabel>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {sourceCols.map(c => (
              <div key={c.key} style={{ flex: '1 1 120px', minWidth: 120, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: c.key === 'personal' ? '#a78bfa' : 'var(--text)' }}>{sourceSingle[c.key] ?? 0}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>{c.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const hStyle: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text3)',
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text2)', marginBottom: 10 }}>{children}</div>
  )
}
