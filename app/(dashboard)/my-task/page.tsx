'use client'

import { useState, useRef, useEffect } from 'react'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { BPIPage, BoardFilter, BoardSearch, useBoardFilter, type BPIPageHandle, type BPITabType } from '@/components/BPI'
import { MyTaskDashboardView } from '@/components/BPI/MyTaskDashboardView'
import { useAccess } from '@/hooks/useAccess'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'
import { PostHistoryButton } from '@/components/shared/PostHistory'

// "My Task" — a personal board for the logged-in account: every task that tags
// me (Tag Account) OR that I created, across all projects.
export default function MyTaskPage() {
  const t = useT()
  // Personal-only accounts (no general Dashboard grant, no project board) get the
  // dashboard promoted to a top-level sidebar item, so it's dropped from here.
  const { personalOnly, loading: accessLoading } = useAccess()
  const [tab, setTab] = useState<TabKey>('dashboard')
  const ref = useRef<BPIPageHandle>(null)
  const bf = useBoardFilter('all')
  const [me, setMe] = useState<{ email: string; name: string } | null>(null)
  const [pendingAdd, setPendingAdd] = useState(false)

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

  // Hold the tab strip + body until BOTH auth (me) and access resolve, so the
  // dashboard tab never flashes in for personal-only accounts (who must not see
  // it at all) while non-personal accounts still land straight on it.
  const ready = !!me && !accessLoading
  const tabList: TabKey[] = personalOnly
    ? ['board', 'list', 'calendar', 'files']
    : ['dashboard', 'board', 'list', 'calendar', 'files']
  // Derived active tab: fall back to the first available tab when the stored one
  // isn't in the set (e.g. 'dashboard' for a personal-only account) — no state
  // mutation, so there's never an intermediate frame showing the wrong tab.
  const activeTab: TabKey = tabList.includes(tab) ? tab : tabList[0]

  // The board (which owns the add/edit modal via `ref`) isn't mounted on the
  // Dashboard tab, so "+ Add Task" there switches to the board first, then opens
  // the modal once the ref attaches.
  function handleAdd() {
    if (activeTab === 'dashboard') { setPendingAdd(true); setTab('board') }
    else ref.current?.openEdit()
  }
  useEffect(() => {
    if (!pendingAdd || activeTab === 'dashboard') return
    let raf = 0
    const tryOpen = () => {
      if (ref.current) { ref.current.openEdit(); setPendingAdd(false) }
      else raf = requestAnimationFrame(tryOpen)
    }
    tryOpen()
    return () => { if (raf) cancelAnimationFrame(raf) }
  }, [pendingAdd, activeTab])

  return (
    <>
      <PageHeader
        title="My Task"
        tabs={ready ? tabList : []}
        activeTab={activeTab}
        onTabChange={setTab}
        showDateFilter={ready && activeTab === 'dashboard'}
        dateAllowFuture
        tabsRight={
          ready && activeTab !== 'dashboard'
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
        {ready && me && activeTab === 'dashboard' && <MyTaskDashboardView me={me} />}
        {ready && me && activeTab !== 'dashboard' && (
          <BPIPage ref={ref} entity="bpi" mineScope={me} activeTab={activeTab as BPITabType} filters={bf.filters} currentUser="" />
        )}
      </div>
    </>
  )
}
