'use client'

import { useStore } from '@/hooks/useStore'
import { formatRupiah, formatDate, timeAgo } from '@/lib/utils'
import { TEAM, CRM_STAGES, PROJ_TYPE } from '@/lib/constants'
import { StatusBadge, TeamAvatar } from '@/components/shared/StatusBadge'
import { useEffect, useRef } from 'react'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

export function DashboardContent() {
  const { posts, clients, invoices, projects, tasks, activity, dateRange } = useStore()

  // Filter by date range
  const from = new Date(dateRange.from)
  const to   = new Date(dateRange.to + 'T23:59:59')

  const activeProjects = projects.filter(p => p.status === 'active')
  const activeClients  = clients.filter(c => ['lead','pitch','close'].includes(c.stage))
  const revenuePipeline = clients.reduce((sum, c) => sum + (c.value || 0), 0)
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  const weekTasks = tasks.filter(t => !t.due || new Date(t.due) >= weekStart)

  const bpiPosts = posts.filter(p => {
    if (p.entity !== 'bpi') return false
    if (!p.date) return true
    const d = new Date(p.date)
    return d >= from && d <= to
  })
  const bsiPosts = posts.filter(p => {
    if (p.entity !== 'bsi') return false
    if (!p.date) return true
    const d = new Date(p.date)
    return d >= from && d <= to
  })

  // KPI cards
  const kpis = [
    { label: 'Active Projects',     value: activeProjects.length, color: 'var(--accent)',  border: 'var(--accent)',  sub: 'Total project berjalan' },
    { label: 'Active Clients',      value: activeClients.length,  color: 'var(--accent3)', border: 'var(--accent3)', sub: 'Client aktif' },
    { label: 'Revenue Pipeline',    value: formatRupiah(revenuePipeline), color: 'var(--accent4)', border: 'var(--accent4)', sub: 'Total deal pipeline', isRp: true },
    { label: 'Tasks This Week',     value: weekTasks.length,      color: 'var(--text)',    border: 'var(--border)',  sub: 'Task aktif tim' },
    { label: 'Bentala Project Post',value: bpiPosts.length,       color: 'var(--text)',    border: 'var(--border)',  sub: 'IG + TikTok' },
    { label: 'Bentala Studio Post', value: bsiPosts.length,       color: 'var(--text)',    border: 'var(--border)',  sub: 'IG' },
  ]

  return (
    <div>
      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 14, marginBottom: 24 }}>
        {kpis.map(k => (
          <div key={k.label}
            style={{ background: 'var(--bg2)', border: `1px solid ${k.border}`, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{k.label}</div>
            <div style={{ fontSize: k.isRp ? 20 : 28, fontWeight: 700, margin: '4px 0', color: k.color }}>
              {k.value}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Grid 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* CRM Pipeline */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            CRM Pipeline
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text2)' }}>Total leads</span>
          </div>
          <div style={{ display: 'flex', gap: 0, marginBottom: 16 }}>
            {CRM_STAGES.map((s, i) => {
              const count = clients.filter(c => c.stage === s.key).length
              const total = clients.length || 1
              return (
                <div
                  key={s.key}
                  style={{
                    flex: 1, textAlign: 'center', padding: '8px 4px',
                    background: 'var(--bg3)', border: '1px solid var(--border)',
                    fontSize: 12, cursor: 'pointer',
                    borderRadius: i === 0 ? '6px 0 0 6px' : i === CRM_STAGES.length-1 ? '0 6px 6px 0' : 0,
                    borderLeft: i > 0 ? 'none' : '1px solid var(--border)',
                  }}
                >
                  <span style={{ display: 'block', fontSize: 20, fontWeight: 700, color: s.color }}>{count}</span>
                  <span style={{ fontSize: 10, color: 'var(--text2)' }}>{s.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Projects */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Project Progress</div>
          {projects.slice(0, 4).map(p => {
            const ptasks = tasks.filter(t => t.project_id === p.id)
            const done = ptasks.filter(t => t.status === 'done').length
            const prog = ptasks.length ? Math.round(done / ptasks.length * 100) : p.progress || 0
            return (
              <div key={p.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                  <span>{p.name}</span>
                  <span style={{ color: 'var(--text2)' }}>{prog}%</span>
                </div>
                <div style={{ background: 'var(--bg3)', borderRadius: 10, height: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 10, background: 'var(--accent)', width: `${prog}%`, transition: 'width 0.3s' }} />
                </div>
              </div>
            )
          })}
          {projects.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', padding: '20px 0' }}>
              Belum ada project
            </div>
          )}
        </div>
      </div>

      {/* Grid 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Activity */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Recent Activity</div>
          {activity.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', padding: '20px 0' }}>Belum ada aktivitas</div>
          ) : activity.slice(0, 8).map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 5 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>{a.message}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{timeAgo(a.created_at)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Upcoming Deadlines */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Upcoming Deadlines</div>
          <UpcomingDeadlines projects={projects} tasks={tasks} />
        </div>
      </div>
    </div>
  )
}

function UpcomingDeadlines({ projects, tasks }: {
  projects: ReturnType<typeof useStore>['projects']
  tasks: ReturnType<typeof useStore>['tasks']
}) {
  const now = new Date()
  const in14 = new Date(now.getTime() + 14 * 86400000)

  const items: Array<{ label: string; date: string; type: string; color: string }> = []

  projects
    .filter(p => p.deadline && new Date(p.deadline) >= now && new Date(p.deadline) <= in14 && p.status === 'active')
    .forEach(p => items.push({ label: p.name, date: p.deadline!, type: 'Project', color: 'var(--accent)' }))

  tasks
    .filter(t => t.due && new Date(t.due) >= now && new Date(t.due) <= in14 && t.status !== 'done')
    .forEach(t => items.push({ label: t.title, date: t.due!, type: 'Task', color: 'var(--accent4)' }))

  items.sort((a, b) => a.date.localeCompare(b.date))

  if (!items.length) {
    return <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', padding: '20px 0' }}>
      Tidak ada deadline dalam 14 hari ke depan 🎉
    </div>
  }

  return (
    <div>
      {items.slice(0, 6).map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
              <span style={{ marginRight: 6 }}>{item.type}</span>
              <span>{formatDate(item.date)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
