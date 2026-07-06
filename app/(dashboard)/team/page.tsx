'use client'

import { useState, useEffect, useMemo } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { BPIPage, BoardFilter, useBoardFilter, filterBoardPosts, EMPTY_FILTERS, type PostFilters } from '@/components/BPI'
import { TaskDashboard } from '@/components/BPI/TaskDashboard'
import { PostPreviewModal } from '@/components/BPI/PostPreviewModal'
import { DateRangePicker, presetRange, type DateRange } from '@/components/Social/DateRangePicker'
import { useStore } from '@/hooks/useStore'
import { useT } from '@/lib/i18n/LanguageProvider'
import { timeAgo } from '@/lib/utils'
import { getSupabase } from '@/lib/supabase'
import { isSuperAdmin } from '@/lib/access'
import { AccountAvatar } from '@/components/shared/AccountAvatar'
import type { ActivityLog } from '@/lib/types'

type Acct = { email: string; name: string; avatarUrl?: string | null }

// "Team" — super-admin-only overview across every account. Clicking a row opens
// that account as a popup over the overview; the sidebar items open the same
// account as a full page. A live, all-accounts activity feed fills the screen.
export default function TeamPage() {
  const t = useT()
  const bf = useBoardFilter('all')
  const posts = useStore(s => s.posts)
  // Live activity feed (every account).
  const activity = useStore(s => s.activity)
  const addActivity = useStore(s => s.addActivity)

  const [ready, setReady] = useState(false)
  const [accounts, setAccounts] = useState<Acct[]>([])
  // active = 'overview' or an account email (the popup target).
  const [active, setActive] = useState<string>('overview')
  // Task whose details show in the popup's right-hand split panel.
  const [detailId, setDetailId] = useState<string | null>(null)

  // Overview's own Filter + date (Lifetime = no constraint).
  const [ovFilters, setOvFilters] = useState<PostFilters>(EMPTY_FILTERS)
  const [ovRange, setOvRange] = useState<DateRange>(() => presetRange('Lifetime'))
  const ovEffRange = useMemo(
    () => (ovRange.label === 'Lifetime' ? undefined : { from: ovRange.from, to: ovRange.to }),
    [ovRange],
  )

  // The popup keeps its own range (Lifetime by default).
  const [popRange, setPopRange] = useState<DateRange>(() => presetRange('Lifetime'))
  const popEffRange = useMemo(
    () => (popRange.label === 'Lifetime' ? undefined : { from: popRange.from, to: popRange.to }),
    [popRange],
  )

  // Guard: super admin only. Non-supers are bounced to their own My Task.
  useEffect(() => {
    let cancelled = false
    getSupabase().auth.getUser().then(({ data }) => {
      if (cancelled) return
      if (!isSuperAdmin(data.user?.email)) { window.location.replace('/my-task'); return }
      setReady(true)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    const load = () => fetch('/api/accounts')
      .then(r => (r.ok ? r.json() : { accounts: [] }))
      .then((d: { accounts?: Acct[] }) => { if (!cancelled) setAccounts(d.accounts ?? []) })
      .catch(() => {})
    load()
    // Re-pull periodically so a teammate's new profile photo shows up live.
    const id = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [ready])

  // Resolve an activity actor to a real account (display name + photo). The
  // logged user_name can be the display name, the email, OR the email prefix
  // (e.g. "fzkusuma16"), so all three map back to the same account.
  const actorOf = useMemo(() => {
    const m = new Map<string, { name: string; url?: string | null }>()
    for (const a of accounts) {
      const entry = { name: a.name, url: a.avatarUrl }
      m.set(a.name.toLowerCase(), entry)
      m.set(a.email.toLowerCase(), entry)
      m.set(a.email.split('@')[0].toLowerCase(), entry)
    }
    return (who: string | undefined) => (who ? m.get(who.toLowerCase()) : undefined)
  }, [accounts])

  const activeAcct = useMemo(() => accounts.find(a => a.email === active) ?? null, [accounts, active])

  const overviewPosts = useMemo(
    () => filterBoardPosts(posts, { entity: 'bpi', teamScope: true, filters: ovFilters, dateRange: ovEffRange }),
    [posts, ovFilters, ovEffRange],
  )

  // Keep the activity feed live on this page specifically — a dedicated channel
  // that streams new activity_log rows straight into the store. The JWT must be
  // on the socket BEFORE subscribe for RLS-gated change events to arrive; the
  // store dedupes by id so the global subscription can't double-count.
  useEffect(() => {
    const supabase = getSupabase()
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    const build = (token: string) => {
      if (cancelled || channel) return
      ;(supabase.realtime as { setAuth: (t: string) => void }).setAuth(token)
      channel = supabase
        .channel('team-activity-feed')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, (payload) => {
          addActivity(payload.new as ActivityLog)
        })
        .subscribe()
    }
    supabase.auth.getSession().then(({ data }) => { const tk = data.session?.access_token; if (tk) build(tk) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (s?.access_token) build(s.access_token) })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
      if (channel) supabase.removeChannel(channel)
    }
  }, [addActivity])

  // Closing the popup (or switching accounts) drops any open detail panel.
  useEffect(() => { setDetailId(null) }, [active])

  // Escape closes the detail panel first, then the account popup.
  useEffect(() => {
    if (!activeAcct) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (detailId) setDetailId(null)
      else setActive('overview')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [activeAcct, detailId])

  if (!ready) return null

  return (
    <>
      <PageHeader
        title="Team"
        action={
          <>
            <DateRangePicker value={ovRange} onChange={setOvRange} allowFuture />
            <BoardFilter filters={ovFilters} setFilters={setOvFilters} accounts={bf.accounts} months={bf.months} projects={bf.projects} personal size="lg" />
          </>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <TaskDashboard posts={overviewPosts} accounts={accounts} projects={bf.projects} onAccountClick={a => setActive(a.email)} />

        {/* Activity — a live feed of every account's actions. */}
        <div style={{ padding: '0 24px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text2)' }}>
              {t('Aktivitas Tim')}
            </span>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#43d9a2', boxShadow: '0 0 6px rgba(67,217,162,0.7)' }} title="Live" />
          </div>

          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {activity.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                {t('Belum ada aktivitas tim tercatat.')}
              </div>
            ) : (
              activity.map((a, i) => {
                const actor = actorOf(a.user_name)
                const who = actor?.name || a.user_name || 'Sistem'
                return (
                  <div
                    key={a.id}
                    onMouseOver={e => { e.currentTarget.style.background = 'var(--bg3)' }}
                    onMouseOut={e => { e.currentTarget.style.background = 'transparent' }}
                    style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', transition: 'background .12s ease' }}
                  >
                    <AccountAvatar name={who} url={actor?.url} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who}</span>
                        <span style={{ fontSize: 11.5, color: 'var(--text3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{timeAgo(a.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.message}</div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Account board opens as a popup over the Overview. */}
      {activeAcct && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setActive('overview') }}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div style={{ width: '95vw', maxWidth: 1500, height: '90vh', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <AccountAvatar name={activeAcct.name} url={activeAcct.avatarUrl} size={32} />
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{activeAcct.name}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{activeAcct.email}</span>
              </span>
              <span style={{ flex: 1 }} />
              <DateRangePicker value={popRange} onChange={setPopRange} allowFuture />
              <BoardFilter filters={bf.filters} setFilters={bf.setFilters} accounts={bf.accounts} months={bf.months} projects={bf.projects} personal size="lg" />
              <button
                onClick={() => setActive('overview')}
                aria-label={t('Tutup')}
                onMouseOver={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--text3)' }}
                onMouseOut={e => { e.currentTarget.style.color = 'var(--text2)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                style={{ width: 40, height: 40, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', transition: 'color .14s, border-color .14s' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Split: left column (dashboard + list) shrinks when a detail opens.
                Dashboard and list scroll together so the list gets full height. */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
              <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
                <TaskDashboard posts={filterBoardPosts(posts, { entity: 'bpi', mineScope: activeAcct, filters: bf.filters, dateRange: popEffRange })} projects={bf.projects} />
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  <BPIPage entity="bpi" mineScope={activeAcct} activeTab="list" filters={bf.filters} dateRange={popEffRange} currentUser="" readOnly onPreviewPost={setDetailId} />
                </div>
              </div>

              {detailId && (
                <div style={{ flexShrink: 0, width: 'clamp(360px, 42%, 600px)', borderLeft: '1px solid var(--border)', overflow: 'hidden' }}>
                  <PostPreviewModal
                    open
                    postId={detailId}
                    dock="inline"
                    canEdit={false}
                    restrictStatus
                    onClose={() => setDetailId(null)}
                    onEdit={() => {}}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
