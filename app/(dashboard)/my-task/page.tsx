'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { BPIPage, BoardFilter, BoardSearch, useBoardFilter, isAccountTask, type BPIPageHandle, type BPITabType } from '@/components/BPI'
import { TaskDashboard } from '@/components/BPI/TaskDashboard'
import { useStore } from '@/hooks/useStore'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'
import { PostHistoryButton } from '@/components/shared/PostHistory'
import type { DateRange } from '@/components/Social/DateRangePicker'
import type { Post } from '@/lib/types'

// Keep a post only if it has a date that falls within the selected range.
// Undated tasks are excluded — they belong to no period, so counting them would
// make the range totals invalid. Compares on the date part only.
function inRange(p: Post, r: DateRange): boolean {
  const d = (p.date || '').slice(0, 10)
  return !!d && d >= r.from && d <= r.to
}

// "My Task" — a personal board for the logged-in account: every task that tags
// me (Tag Account) OR that I created, across all projects.
export default function MyTaskPage() {
  const t = useT()
  const [tab, setTab] = useState<TabKey>('dashboard')
  const ref = useRef<BPIPageHandle>(null)
  const bf = useBoardFilter('all')
  const [me, setMe] = useState<{ email: string; name: string } | null>(null)
  const [pendingAdd, setPendingAdd] = useState(false)
  const posts = useStore(s => s.posts)
  const dateRange = useStore(s => s.dateRange)

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => {
      const u = data.user
      if (!u) return
      const meta = u.user_metadata ?? {}
      setMe({
        email: (u.email ?? '').toLowerCase(),
        name: meta.full_name ?? meta.name ?? u.email?.split('@')[0] ?? '',
      })
    })
  }, [])

  // Only briefed tasks enter the worksheet (To Do List = brief), like Video
  // Production / Design Studio — an 'todo' (Idea) hasn't entered yet, so the
  // Dashboard summary excludes it too (stays in sync with the board).
  const myPosts = useMemo(
    () => (me ? posts.filter(p => !p.deleted_at && p.status !== 'todo' && isAccountTask(p, me)) : []),
    [posts, me],
  )
  // Dashboard is filtered by the selected date range (the picker in the header).
  const dashPosts = useMemo(() => myPosts.filter(p => inRange(p, dateRange)), [myPosts, dateRange])

  // The board (which owns the add/edit modal via `ref`) isn't mounted on the
  // Dashboard tab, so "+ Add Task" there switches to the board first, then opens
  // the modal once the ref attaches.
  function handleAdd() {
    if (tab === 'dashboard') { setPendingAdd(true); setTab('board') }
    else ref.current?.openEdit()
  }
  useEffect(() => {
    if (!pendingAdd || tab === 'dashboard') return
    let raf = 0
    const tryOpen = () => {
      if (ref.current) { ref.current.openEdit(); setPendingAdd(false) }
      else raf = requestAnimationFrame(tryOpen)
    }
    tryOpen()
    return () => { if (raf) cancelAnimationFrame(raf) }
  }, [pendingAdd, tab])

  return (
    <>
      <PageHeader
        title="My Task"
        tabs={['dashboard', 'board', 'list', 'calendar', 'files']}
        activeTab={tab}
        onTabChange={setTab}
        showDateFilter={tab === 'dashboard'}
        dateAllowFuture
        tabsRight={
          tab !== 'dashboard'
            ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BoardSearch value={bf.filters.search} onChange={v => bf.setFilters(f => ({ ...f, search: v }))} />
                <BoardFilter filters={bf.filters} setFilters={bf.setFilters} accounts={bf.accounts} months={bf.months} projects={bf.projects} personal />
              </div>
            )
            : undefined
        }
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {me && <PostHistoryButton scope={{ mine: me }} />}
            <button
              onClick={handleAdd}
              style={{ height: 32, padding: '0 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            >
              + {t('Tambah Task')}
            </button>
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        {me && tab === 'dashboard' && <TaskDashboard posts={dashPosts} allPosts={myPosts} projects={bf.projects} />}
        {me && tab !== 'dashboard' && (
          <BPIPage ref={ref} entity="bpi" mineScope={me} activeTab={tab as BPITabType} filters={bf.filters} currentUser="" />
        )}
      </div>
    </>
  )
}
