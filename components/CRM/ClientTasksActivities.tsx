'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/lib/i18n/LanguageProvider'

const card: React.CSSProperties = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }
const fmtDay = (s: string | null) => { if (!s) return null; const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) }

type Item = { id: string; kind: 'task' | 'followup'; clientId: string; title: string; due: string | null; meta?: string }

/** One place to see every open to-do and scheduled follow-up across all
 *  contacts, plus the live activity feed. Each row jumps to its contact. */
export function ClientTasksActivities() {
  const t = useT()
  const { clients, clientTasks, followUps, activity } = useStore(useShallow((s) => ({
    clients: s.clients, clientTasks: s.clientTasks, followUps: s.followUps, activity: s.activity,
  })))
  const today = new Date().toISOString().slice(0, 10)
  const nameOf = useMemo(() => {
    const m = new Map(clients.map((c) => [c.id, c.name]))
    return (id: string) => m.get(id) || t('Contact')
  }, [clients, t])

  const items: Item[] = useMemo(() => {
    const tasks: Item[] = clientTasks.map((x) => ({ id: `t:${x.id}`, kind: 'task', clientId: x.client_id, title: x.title, due: x.due_date, meta: x.assignee || undefined }))
    const fus: Item[] = followUps.map((f) => ({ id: `f:${f.id}`, kind: 'followup', clientId: f.client_id, title: t('Follow-up'), due: f.next_follow_up }))
    return [...tasks, ...fus]
  }, [clientTasks, followUps, t])

  const groups = useMemo(() => {
    const sortDue = (a: Item, b: Item) => ((a.due || '9999') < (b.due || '9999') ? -1 : 1)
    return {
      overdue: items.filter((i) => i.due && i.due < today).sort(sortDue),
      today: items.filter((i) => i.due === today).sort(sortDue),
      upcoming: items.filter((i) => !i.due || i.due > today).sort(sortDue),
    }
  }, [items, today])

  return (
    <div style={{ padding: 24, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', alignItems: 'start' }}>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>
          {t('To-do & Follow-up')} <span style={{ color: 'var(--text2)', fontWeight: 400 }}>({items.length})</span>
        </div>
        {items.length === 0 && <div style={{ fontSize: 12, color: 'var(--text2)', padding: '10px 0' }}>{t('Tidak ada task atau follow-up terbuka.')}</div>}
        <Group title={t('Lewat tempo')} tone="#ff6b6b" rows={groups.overdue} nameOf={nameOf} today={today} t={t} />
        <Group title={t('Hari ini')} tone="#ffc542" rows={groups.today} nameOf={nameOf} today={today} t={t} />
        <Group title={t('Mendatang')} tone="var(--text2)" rows={groups.upcoming} nameOf={nameOf} today={today} t={t} />
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>{t('Aktivitas')}</div>
        {activity.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text2)', padding: '10px 0' }}>{t('Belum ada aktivitas.')}</div>
        ) : activity.map((a) => (
          <div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{a.message}</span>
            <span style={{ fontSize: 10.5, color: 'var(--text2)' }}>{a.user_name} · {fmtDay(a.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Group({ title, tone, rows, nameOf, today, t }: {
  title: string; tone: string; rows: Item[]; nameOf: (id: string) => string; today: string; t: (s: string) => string
}) {
  if (rows.length === 0) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tone, marginBottom: 4 }}>
        <span style={{ width: 7, height: 7, borderRadius: 4, background: tone }} />{title} ({rows.length})
      </div>
      {rows.map((i) => {
        const overdue = !!i.due && i.due < today
        return (
          <Link key={i.id} href={`/clients/${i.clientId}`} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5, textDecoration: 'none' }}>
            <span title={i.kind === 'task' ? t('Task') : t('Follow-up')} style={{ flexShrink: 0, fontSize: 11 }}>{i.kind === 'task' ? '✓' : '↻'}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
              {i.title} <span style={{ color: 'var(--text2)' }}>· {nameOf(i.clientId)}</span>
              {i.meta && <span style={{ color: 'var(--text2)' }}> · {i.meta}</span>}
            </span>
            {i.due && <span style={{ fontSize: 11.5, color: overdue ? '#ff6b6b' : 'var(--text2)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtDay(i.due)}</span>}
          </Link>
        )
      })}
    </div>
  )
}
