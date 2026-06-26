'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { BPIPage, BoardFilter, useBoardFilter, isAccountTask, type BPIPageHandle, type BPITabType } from '@/components/BPI'
import { TaskDashboard } from '@/components/BPI/TaskDashboard'
import { useStore } from '@/hooks/useStore'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'

// "My Task" — a personal board for the logged-in account: every task that tags
// me (Tag Account) OR that I created, across all projects.
export default function MyTaskPage() {
  const t = useT()
  const [tab, setTab] = useState<TabKey>('dashboard')
  const ref = useRef<BPIPageHandle>(null)
  const bf = useBoardFilter('all')
  const [me, setMe] = useState<{ email: string; name: string } | null>(null)
  const posts = useStore(s => s.posts)

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

  return (
    <>
      <PageHeader
        title="My Task"
        tabs={['dashboard', 'board', 'list', 'calendar', 'files']}
        activeTab={tab}
        onTabChange={setTab}
        tabsRight={
          tab !== 'dashboard'
            ? <BoardFilter filters={bf.filters} setFilters={bf.setFilters} accounts={bf.accounts} months={bf.months} projects={bf.projects} personal />
            : undefined
        }
        action={
          <button
            onClick={() => ref.current?.openEdit()}
            style={{ height: 32, padding: '0 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            + {t('Tambah Task')}
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        {me && tab === 'dashboard' && <TaskDashboard posts={myPosts} />}
        {me && tab !== 'dashboard' && (
          <BPIPage ref={ref} entity="bpi" mineScope={me} activeTab={tab as BPITabType} filters={bf.filters} currentUser="" />
        )}
      </div>
    </>
  )
}
