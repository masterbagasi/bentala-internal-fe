'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { PageShell } from '@/components/shared/PageShell'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { TEAM, CRM_STAGES } from '@/lib/constants'
import { formatRupiah, timeAgo } from '@/lib/utils'
import { getSupabase } from '@/lib/supabase'

type TabKey = 'website' | 'bpi' | 'bsi' | 'client' | 'projects' | 'team'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'website',  label: 'Website' },
  { key: 'bpi',      label: 'Bentala Project' },
  { key: 'bsi',      label: 'Bentala Studio' },
  { key: 'client',   label: 'Client' },
  { key: 'projects', label: 'Projects' },
  { key: 'team',     label: 'Team' },
]

/**
 * Unified Dashboard — single entry point for all business-unit
 * summaries. Each tab renders a focused view with KPIs + quick
 * lists + deep-links to the detail editors. Replaces the earlier
 * split between the top-level `/` dashboard and the per-section
 * `/website` dashboard, which created two competing "Dashboard"
 * entries in the sidebar.
 */
export default function DashboardPage() {
  // useSearchParams() requires a Suspense boundary during prerender, otherwise
  // the whole route bails out of static generation and the build errors.
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  )
}

function DashboardContent() {
  const router = useRouter()
  const params = useSearchParams()
  const initialTab = (params.get('tab') as TabKey) || 'website'
  const [tab, setTab] = useState<TabKey>(
    TABS.some((t) => t.key === initialTab) ? initialTab : 'website',
  )

  // Reflect tab changes in the URL so deep links work. Replace state
  // (not push) so the back button still exits the dashboard cleanly.
  useEffect(() => {
    const url = tab === 'website' ? '/' : `/?tab=${tab}`
    router.replace(url, { scroll: false })
  }, [tab, router])

  return (
    <PageShell
      title="Dashboard"
      tabs={{
        kind: 'button',
        items: TABS,
        active: tab,
        onChange: (k) => setTab(k as TabKey),
      }}
    >
      <div style={{ padding: 24 }}>
        {tab === 'website' && <WebsiteTab />}
        {tab === 'bpi' && <PostsTab entity="bpi" label="Bentala Project" />}
        {tab === 'bsi' && <PostsTab entity="bsi" label="Bentala Studio" />}
        {tab === 'client' && <ClientTab />}
        {tab === 'projects' && <ProjectsTab />}
        {tab === 'team' && <TeamTab />}
      </div>
    </PageShell>
  )
}

// ─── shared UI primitives ──────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: string
}) {
  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 18,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'var(--text2)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          margin: '6px 0',
          color: accent ?? 'var(--text)',
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>{sub}</div>
      )}
    </div>
  )
}

function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 18,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function QuickLink({
  href,
  label,
  hint,
}: {
  href: string
  label: string
  hint?: string
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        textDecoration: 'none',
        color: 'var(--text)',
        fontSize: 13,
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {hint && <span style={{ fontSize: 11, color: 'var(--text2)' }}>{hint}</span>}
      </span>
      <span style={{ color: 'var(--text2)' }}>→</span>
    </Link>
  )
}

function KpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 14,
        marginBottom: 20,
      }}
    >
      {children}
    </div>
  )
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: 16,
      }}
    >
      {children}
    </div>
  )
}

// ─── Website tab ───────────────────────────────────────────────

interface WebsiteStats {
  visitorsToday: number
  visitors7d: number
  pageviewsToday: number
  leadsToday: number
  topPages: { path: string; count: number }[]
}

function WebsiteTab() {
  const t = useT()
  const supabase = getSupabase()
  const [stats, setStats] = useState<WebsiteStats | null>(null)
  const [tableMissing, setTableMissing] = useState(false)

  useEffect(() => {
    async function load() {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const [visitorsTodayRes, visitors7dRes, pageviewsRes, leadsRes, topPagesRes] =
        await Promise.all([
          supabase
            .from('bsi_visitors')
            .select('id', { count: 'exact', head: true })
            .gte('last_seen_at', todayStart.toISOString()),
          supabase
            .from('bsi_visitors')
            .select('id', { count: 'exact', head: true })
            .gte('last_seen_at', sevenDaysAgo.toISOString()),
          supabase
            .from('bsi_pageviews')
            .select('id', { count: 'exact', head: true })
            .gte('viewed_at', todayStart.toISOString()),
          supabase
            .from('bsi_leads')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', todayStart.toISOString()),
          supabase
            .from('bsi_pageviews')
            .select('path')
            .gte('viewed_at', sevenDaysAgo.toISOString())
            .limit(1000),
        ])

      // If the analytics tables don't exist yet, surface a friendly
      // hint instead of a generic error.
      if (
        visitorsTodayRes.error &&
        /relation .* does not exist|schema cache/i.test(
          visitorsTodayRes.error.message,
        )
      ) {
        setTableMissing(true)
        return
      }

      const pageCounts = new Map<string, number>()
      for (const row of (topPagesRes.data ?? []) as { path: string }[]) {
        pageCounts.set(row.path, (pageCounts.get(row.path) ?? 0) + 1)
      }
      const topPages = Array.from(pageCounts.entries())
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

      setStats({
        visitorsToday: visitorsTodayRes.count ?? 0,
        visitors7d: visitors7dRes.count ?? 0,
        pageviewsToday: pageviewsRes.count ?? 0,
        leadsToday: leadsRes.count ?? 0,
        topPages,
      })
    }
    load()
  }, [supabase])

  if (tableMissing) {
    return (
      <Panel title={t('Analytics belum aktif')}>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>
          {t('Tabel')} <code style={{ background: 'var(--bg3)', padding: '2px 6px', borderRadius: 4 }}>bsi_visitors</code>{' '}
          {t('belum ada di Supabase. Jalankan')}{' '}
          <code style={{ background: 'var(--bg3)', padding: '2px 6px', borderRadius: 4 }}>
            supabase/migration_analytics.sql
          </code>{' '}
          {t('di SQL Editor lalu refresh.')}
        </p>
      </Panel>
    )
  }

  return (
    <>
      <KpiGrid>
        <KpiCard
          label={t('Visitor Hari Ini')}
          value={stats?.visitorsToday ?? '…'}
          sub={t('Unique visitor (24 jam terakhir)')}
          accent="var(--accent)"
        />
        <KpiCard
          label={t('Visitor 7 Hari')}
          value={stats?.visitors7d ?? '…'}
          sub={t('Rolling 7 hari terakhir')}
        />
        <KpiCard
          label={t('Pageview Hari Ini')}
          value={stats?.pageviewsToday ?? '…'}
          sub={t('Total page view')}
        />
        <KpiCard
          label={t('Lead Hari Ini')}
          value={stats?.leadsToday ?? '…'}
          sub={t('Form submission masuk')}
          accent="var(--accent3)"
        />
      </KpiGrid>

      <TwoCol>
        <Panel title={t('Halaman Teratas (7 hari)')}>
          {stats && stats.topPages.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.topPages.map((p) => (
                <li
                  key={p.path}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--bg3)',
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                >
                  <code style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{p.path}</code>
                  <span style={{ color: 'var(--text2)' }}>{p.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>
              {t('Belum ada data pageview.')}
            </p>
          )}
        </Panel>

        <Panel title="Quick Actions">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <QuickLink href="/website/visitors" label={t('Lihat semua visitor')} hint="Detailed visitor list" />
            <QuickLink href="/website/home" label="Edit Home Page" hint="Hero, services, portfolio" />
            <QuickLink href="/website/about" label="Edit About Page" hint="Story, values, team" />
            <QuickLink href="/website/news" label="Manage News Feed" hint="Instagram + TikTok posts" />
            <QuickLink href="/website/seo" label="SEO Settings" hint="Meta titles, OG images" />
            <QuickLink href="/website/navbar" label="Navbar Setting" hint="Logo, menu visibility" />
          </div>
        </Panel>
      </TwoCol>
    </>
  )
}

// ─── BPI / BSI content tab (shared) ─────────────────────────────

function PostsTab({ entity, label }: { entity: 'bpi' | 'bsi'; label: string }) {
  const t = useT()
  const posts = useStore((s) => s.posts)
  const entityPosts = useMemo(
    () => posts.filter((p) => p.entity === entity),
    [posts, entity],
  )

  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const thisMonth = entityPosts.filter(
    (p) => p.date && new Date(p.date) >= thisMonthStart,
  )
  const lastMonth = entityPosts.filter(
    (p) =>
      p.date &&
      new Date(p.date) >= lastMonthStart &&
      new Date(p.date) < thisMonthStart,
  )
  const ready = entityPosts.filter((p) => p.status === 'ready' || p.status === 'review')
  const scheduled = entityPosts.filter((p) => p.status === 'produksi' || p.status === 'brief')

  const recent = [...entityPosts]
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, 6)

  const trend =
    lastMonth.length === 0
      ? '—'
      : `${Math.round(((thisMonth.length - lastMonth.length) / lastMonth.length) * 100)}%`

  const detailHref = entity === 'bpi' ? '/bpi' : '/bsi'
  const calendarHref = entity === 'bpi' ? '/bpi?tab=calendar' : '/bsi?tab=calendar'

  return (
    <>
      <KpiGrid>
        <KpiCard label={t('Bulan Ini')} value={thisMonth.length} sub={t('Post terjadwal')} accent="var(--accent)" />
        <KpiCard label={t('Bulan Lalu')} value={lastMonth.length} sub={t('Perbandingan')} />
        <KpiCard label="Ready to Post" value={ready.length} sub={t('Siap dipublish')} accent="var(--accent3)" />
        <KpiCard label="In Production" value={scheduled.length} sub={t('Masih digarap')} />
        <KpiCard label="Trend MoM" value={trend} sub={t('vs bulan lalu')} />
      </KpiGrid>

      <TwoCol>
        <Panel
          title={t('Post Terbaru')}
          action={
            <span
              style={{
                fontSize: 11,
                color: 'var(--text2)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {entityPosts.length} total
            </span>
          }
        >
          {recent.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recent.map((p) => (
                <li
                  key={p.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    padding: '10px 12px',
                    background: 'var(--bg3)',
                    borderRadius: 6,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.title || '(no title)'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', display: 'flex', gap: 10 }}>
                    <span>{(p.platforms ?? []).join(', ') || '—'}</span>
                    <span>{p.status ?? '—'}</span>
                    <span>{p.date ?? '—'}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>
              {t('Belum ada post untuk')} {label}.
            </p>
          )}
        </Panel>

        <Panel title="Quick Actions">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <QuickLink href={detailHref} label="Manage Content" hint={`${t('Kelola post')} ${label}`} />
            <QuickLink href={calendarHref} label="Content Calendar" hint={t('Jadwal post per tanggal')} />
          </div>
        </Panel>
      </TwoCol>
    </>
  )
}

// ─── Client tab ────────────────────────────────────────────────

function ClientTab() {
  const t = useT()
  const { clients, invoices } = useStore(useShallow((s) => ({ clients: s.clients, invoices: s.invoices })))

  const totalLeads = clients.length
  const active = clients.filter((c) => ['lead', 'pitch', 'close'].includes(c.stage))
  const pipeline = clients.reduce((sum, c) => sum + (c.value || 0), 0)
  const paidInvoices = invoices.filter((i) => i.status === 'paid')
  const unpaidInvoices = invoices.filter((i) => i.status !== 'paid')
  const paidTotal = paidInvoices.reduce((sum, i) => sum + (i.value || 0), 0)

  const recent = [...clients]
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .slice(0, 5)

  return (
    <>
      <KpiGrid>
        <KpiCard label="Total Leads" value={totalLeads} sub="All-time" />
        <KpiCard label="Active Pipeline" value={active.length} sub="Lead + Pitch + Close" accent="var(--accent)" />
        <KpiCard label="Revenue Pipeline" value={formatRupiah(pipeline)} sub="Total deal value" accent="var(--accent4)" />
        <KpiCard label="Paid Revenue" value={formatRupiah(paidTotal)} sub={`${paidInvoices.length} invoice`} accent="var(--accent3)" />
        <KpiCard label="Outstanding Invoice" value={unpaidInvoices.length} sub={t('Belum dibayar')} />
      </KpiGrid>

      <TwoCol>
        <Panel title="CRM Funnel">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CRM_STAGES.map((s) => {
              const count = clients.filter((c) => c.stage === s.key).length
              const ratio = totalLeads ? count / totalLeads : 0
              return (
                <div key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{s.label}</span>
                    <span style={{ color: 'var(--text2)' }}>{count}</span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      background: 'var(--bg3)',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${ratio * 100}%`,
                        background: 'var(--accent)',
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>

        <Panel title={t('Lead Terbaru')}>
          {recent.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recent.map((c) => (
                <li
                  key={c.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    background: 'var(--bg3)',
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>
                    {c.stage} · {timeAgo(c.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>{t('Belum ada lead.')}</p>
          )}
        </Panel>
      </TwoCol>

      <div style={{ marginTop: 16 }}>
        <Panel title="Quick Actions">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 8,
            }}
          >
            <QuickLink href="/website/leads" label="Website Leads" hint={t('Lead masuk dari form')} />
            <QuickLink href="/clients" label="CRM Pipeline" hint={t('Kanban kanban deal')} />
            <QuickLink href="/invoices" label={t('Invoice & Bayar')} hint={t('Status pembayaran')} />
          </div>
        </Panel>
      </div>
    </>
  )
}

// ─── Projects tab ──────────────────────────────────────────────

function ProjectsTab() {
  const t = useT()
  const { projects, tasks } = useStore(useShallow((s) => ({ projects: s.projects, tasks: s.tasks })))

  const active = projects.filter((p) => p.status === 'active')
  const completed = projects.filter((p) => p.status === 'done')

  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  const weekTasks = tasks.filter((t) => !t.due || new Date(t.due) >= weekStart)
  const overdue = tasks.filter((t) => t.due && new Date(t.due) < new Date() && t.status !== 'done')
  const inProgress = tasks.filter((t) => t.status === 'progress')

  const recentTasks = [...tasks]
    .sort((a, b) => (b.due ?? '').localeCompare(a.due ?? ''))
    .slice(0, 6)

  return (
    <>
      <KpiGrid>
        <KpiCard label="Active Projects" value={active.length} sub={t('Sedang berjalan')} accent="var(--accent)" />
        <KpiCard label="Completed" value={completed.length} sub={t('Sudah selesai')} accent="var(--accent3)" />
        <KpiCard label={t('Task Minggu Ini')} value={weekTasks.length} sub={t('Semua tim')} />
        <KpiCard label="In Progress" value={inProgress.length} sub={t('Sedang dikerjakan')} />
        <KpiCard label="Overdue" value={overdue.length} sub={t('Lewat deadline')} accent={overdue.length > 0 ? '#ff6b6b' : undefined} />
      </KpiGrid>

      <TwoCol>
        <Panel title={t('Task Terbaru')}>
          {recentTasks.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentTasks.map((t) => (
                <li
                  key={t.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    padding: '10px 12px',
                    background: 'var(--bg3)',
                    borderRadius: 6,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {t.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', display: 'flex', gap: 10 }}>
                    <span>{t.status}</span>
                    <span>{t.assignee ?? '—'}</span>
                    <span>Due {t.due ?? '—'}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>{t('Belum ada task.')}</p>
          )}
        </Panel>

        <Panel title="Quick Actions">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <QuickLink href="/projects" label="All Projects" hint={t('Semua project aktif')} />
            <QuickLink href="/tasks" label="Task Board" hint={t('Kanban task')} />
            <QuickLink href="/pipeline/vp" label="Video Pipeline" hint="Video production workflow" />
            <QuickLink href="/pipeline/ds" label="Design Pipeline" hint="Design studio workflow" />
          </div>
        </Panel>
      </TwoCol>
    </>
  )
}

// ─── Team tab ──────────────────────────────────────────────────

function TeamTab() {
  const t = useT()
  const { activity, tasks } = useStore(useShallow((s) => ({ activity: s.activity, tasks: s.tasks })))
  const recentActivity = activity.slice(0, 8)

  const tasksByMember = TEAM.map((member) => ({
    member,
    count: tasks.filter((t) => t.assignee === member.name && t.status !== 'done').length,
  }))

  return (
    <>
      <KpiGrid>
        <KpiCard label="Total Team" value={TEAM.length} sub={t('Anggota aktif')} />
        <KpiCard
          label="Total Open Tasks"
          value={tasks.filter((t) => t.status !== 'done').length}
          sub={t('Semua assignee')}
        />
        <KpiCard label={t('Activity Hari Ini')} value={recentActivity.length} sub={t('8 terbaru')} accent="var(--accent)" />
      </KpiGrid>

      <TwoCol>
        <Panel title={t('Workload per Anggota')}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tasksByMember.map(({ member, count }) => (
              <li
                key={member.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: 'var(--bg3)',
                  borderRadius: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: member.color,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#000',
                    }}
                  >
                    {member.initials}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {member.name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text2)' }}>{member.role}</span>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: count > 0 ? 'var(--accent)' : 'var(--text2)',
                  }}
                >
                  {count} task{count === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={t('Aktivitas Tim')}>
          {recentActivity.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentActivity.map((a) => (
                <li
                  key={a.id}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--bg3)',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  <div style={{ color: 'var(--text)' }}>{a.message}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                    {a.user_name} · {timeAgo(a.created_at)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>
              {t('Belum ada aktivitas tim tercatat.')}
            </p>
          )}
        </Panel>
      </TwoCol>

      <div style={{ marginTop: 16 }}>
        <Panel title="Quick Actions">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
            <QuickLink href="/tasks" label="Task Board" hint={t('Lihat semua task')} />
          </div>
        </Panel>
      </div>
    </>
  )
}
