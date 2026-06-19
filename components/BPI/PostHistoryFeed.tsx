'use client'

import { useMemo } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'
import { type HistoryRow, describeHistory, historyDetails, fmtHistoryTime } from '@/lib/post-history'

const AVATAR_COLORS = ['#6c63ff', '#43d9a2', '#ffc542', '#ff6b6b', '#3b9dff', '#c084fc', '#f97316', '#14b8a6']
function colorFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
function initialsFor(name: string): string {
  const label = name.includes('@') ? name.split('@')[0] : name
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return label.slice(0, 2).toUpperCase()
}

/**
 * PostHistoryFeed — the task's full change history (create / edit / status move
 * / file attach), newest first and realtime. A plain, always-on log: no unread
 * markers here (those live on the individual sections instead).
 */
export function PostHistoryFeed({
  rows, accounts,
}: {
  rows: HistoryRow[]
  accounts: { email: string; name: string }[]
}) {
  const t = useT()
  const nameOf = useMemo(() => {
    const m = new Map(accounts.map(a => [a.email.toLowerCase(), a.name]))
    return (email: string | null) => {
      if (!email) return t('Seseorang')
      return m.get(email.toLowerCase()) ?? email.split('@')[0]
    }
  }, [accounts, t])

  const ordered = useMemo(
    () => rows.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [rows],
  )

  if (ordered.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--text2)', padding: '4px 0' }}>{t('Belum ada aktivitas.')}</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {ordered.map(r => {
        const author = nameOf(r.actor)
        const details = historyDetails(r)
        return (
          <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span
              style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: '#fff', background: colorFor(author),
              }}
            >
              {initialsFor(author)}
            </span>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{author}</span>{' '}
                <span style={{ color: 'var(--text2)' }}>{describeHistory(r)}</span>
                <span style={{ color: 'var(--text3)' }}> · {fmtHistoryTime(r.created_at)}</span>
              </div>
              {details.length > 0 && (
                <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {details.map((d, i) => (
                    <div key={i} style={{ fontSize: 12, lineHeight: 1.4, wordBreak: 'break-word' }}>
                      <span style={{ color: 'var(--text2)' }}>{t(d.label)}: </span>
                      <span style={{ color: 'var(--text2)' }}>{d.from}</span>
                      <span style={{ color: 'var(--text2)' }}> → </span>
                      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{d.to}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
