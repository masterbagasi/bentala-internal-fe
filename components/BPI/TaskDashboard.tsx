'use client'

import { useMemo } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'
import { WS_STATUS_COLS } from '@/lib/constants'
import type { Post } from '@/lib/types'
import { isAccountTask, mineColKey } from './index'

type Acct = { email: string; name: string }

function tally(posts: Post[]) {
  const counts: Record<string, number> = { brief: 0, revisi: 0, produksi: 0, review: 0, done: 0 }
  for (const p of posts) {
    const col = mineColKey(p)
    if (col in counts) counts[col] += 1
  }
  const total = posts.length
  const done = counts.done
  return { counts, total, done, open: total - done }
}

function dueSoon(posts: Post[]): number {
  // Tasks with a date within the next 7 days that aren't Done yet.
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

export function TaskDashboard({ posts, accounts }: { posts: Post[]; accounts?: Acct[] }) {
  const t = useT()
  const agg = useMemo(() => tally(posts), [posts])
  const soon = useMemo(() => dueSoon(posts), [posts])

  const perAccount = useMemo(() => {
    if (!accounts) return null
    return accounts
      .map(a => ({ account: a, ...tally(posts.filter(p => isAccountTask(p, a))) }))
      .filter(r => r.total > 0)
      .sort((x, y) => y.open - x.open)
  }, [accounts, posts])

  const card = (label: string, value: number, color: string) => (
    <div style={{ flex: '1 1 120px', minWidth: 120, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {card(t('Total Task'), agg.total, 'var(--text)')}
        {card(t('Belum selesai'), agg.open, '#5b9bd5')}
        {card(t('Selesai'), agg.done, '#43d9a2')}
        {card(t('Due 7 hari'), soon, '#ffc542')}
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 8 }}>{t('Per Status')}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {WS_STATUS_COLS.map(c => (
            <div key={c.key} style={{ flex: '1 1 110px', minWidth: 110, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{agg.counts[c.key] ?? 0}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>{c.label}</div>
            </div>
          ))}
        </div>
      </div>

      {perAccount && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 8 }}>{t('Per Akun')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {perAccount.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3)' }}>{t('Belum ada task.')}</div>}
            {perAccount.map(r => (
              <div key={r.account.email} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.account.name}</div>
                {WS_STATUS_COLS.map(c => (
                  <div key={c.key} title={c.label} style={{ fontSize: 12, color: 'var(--text2)', minWidth: 34, textAlign: 'center' }}>
                    <span style={{ color: c.color, fontWeight: 700 }}>{r.counts[c.key] ?? 0}</span>
                  </div>
                ))}
                <div style={{ fontSize: 12, color: 'var(--text3)', minWidth: 56, textAlign: 'right' }}>{r.open}/{r.total}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
