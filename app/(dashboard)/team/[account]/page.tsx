'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { BPIPage, BoardFilter, useBoardFilter, filterBoardPosts } from '@/components/BPI'
import { TaskDashboard } from '@/components/BPI/TaskDashboard'
import { DateRangePicker, presetRange, type DateRange } from '@/components/Social/DateRangePicker'
import { useStore } from '@/hooks/useStore'
import { getSupabase } from '@/lib/supabase'
import { isSuperAdmin } from '@/lib/access'

type Acct = { email: string; name: string }

// One account's board, opened from the sidebar — the same summary + read-only
// list as the old popup, but laid out as a normal page. Task details open as a
// popup (BPIPage's built-in preview modal). Super-admin only.
export default function AccountBoardPage() {
  const router = useRouter()
  const params = useParams()
  const email = useMemo(() => {
    const raw = params?.account
    return decodeURIComponent(Array.isArray(raw) ? raw[0] : (raw ?? '')).toLowerCase()
  }, [params])

  const bf = useBoardFilter('all')
  const posts = useStore(s => s.posts)
  const [ready, setReady] = useState(false)
  const [accounts, setAccounts] = useState<Acct[]>([])

  // Lifetime by default (no date constraint); any other range filters by task date.
  const [dateRange, setDateRange] = useState<DateRange>(() => presetRange('Lifetime'))
  const effRange = useMemo(
    () => (dateRange.label === 'Lifetime' ? undefined : { from: dateRange.from, to: dateRange.to }),
    [dateRange],
  )

  // Guard: super admin only.
  useEffect(() => {
    let cancelled = false
    getSupabase().auth.getUser().then(({ data }) => {
      if (cancelled) return
      if (!isSuperAdmin(data.user?.email)) { router.replace('/my-task'); return }
      setReady(true)
    })
    return () => { cancelled = true }
  }, [router])

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    fetch('/api/accounts')
      .then(r => (r.ok ? r.json() : { accounts: [] }))
      .then((d: { accounts?: Acct[] }) => { if (!cancelled) setAccounts(d.accounts ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [ready])

  // Resolve the account's display name; fall back to the email prefix until the
  // accounts list arrives so the header never flashes empty.
  const account: Acct = useMemo(() => {
    const found = accounts.find(a => a.email.toLowerCase() === email)
    return found ?? { email, name: email.split('@')[0] }
  }, [accounts, email])

  const dashPosts = useMemo(
    () => filterBoardPosts(posts, { entity: 'bpi', mineScope: account, filters: bf.filters, dateRange: effRange }),
    [posts, account, bf.filters, effRange],
  )

  if (!ready) return null

  return (
    <>
      <PageHeader
        title={account.name}
        action={
          <>
            <DateRangePicker value={dateRange} onChange={setDateRange} allowFuture />
            <BoardFilter filters={bf.filters} setFilters={bf.setFilters} accounts={bf.accounts} months={bf.months} projects={bf.projects} personal size="lg" />
          </>
        }
      />

      {/* Summary + list scroll together, so the list gets the full page height. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <TaskDashboard posts={dashPosts} projects={bf.projects} />
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <BPIPage entity="bpi" mineScope={account} activeTab="list" filters={bf.filters} dateRange={effRange} currentUser="" readOnly />
        </div>
      </div>
    </>
  )
}
