'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { BPIPage, useBoardFilter, isAccountTask, type BPIPageHandle, type BPITabType } from '@/components/BPI'
import { TaskDashboard } from '@/components/BPI/TaskDashboard'
import { useStore } from '@/hooks/useStore'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'
import { isSuperAdmin } from '@/lib/access'

type Acct = { email: string; name: string }

// "Team" — super-admin-only window into every account's board. Overview = a
// summary across all accounts; each account tab = that account's full board.
export default function TeamPage() {
  const t = useT()
  const router = useRouter()
  const ref = useRef<BPIPageHandle>(null)
  const bf = useBoardFilter('all')
  const posts = useStore(s => s.posts)

  const [ready, setReady] = useState(false)
  const [accounts, setAccounts] = useState<Acct[]>([])
  // active = 'overview' or an account email
  const [active, setActive] = useState<string>('overview')
  const [innerTab, setInnerTab] = useState<TabKey>('board')

  // Guard: super admin only. Non-supers are bounced to their own My Task.
  useEffect(() => {
    let cancelled = false
    getSupabase().auth.getUser().then(({ data }) => {
      if (cancelled) return
      if (!isSuperAdmin(data.user?.email)) { router.replace('/my-task'); return }
      setReady(true)
    })
    return () => { cancelled = true }
  }, [router])

  // Accounts list drives the per-account tabs.
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    fetch('/api/accounts')
      .then(r => (r.ok ? r.json() : { accounts: [] }))
      .then((d: { accounts?: Acct[] }) => { if (!cancelled) setAccounts(d.accounts ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [ready])

  const activeAcct = useMemo(
    () => accounts.find(a => a.email === active) ?? null,
    [accounts, active],
  )

  // Only briefed tasks count (To Do List = brief), matching the WS boards.
  const allPosts = useMemo(
    () => posts.filter(p => !p.deleted_at && p.status !== 'todo' && accounts.some(a => isAccountTask(p, a))),
    [posts, accounts],
  )

  if (!ready) return null

  return (
    <>
      <PageHeader
        title="Team"
        action={
          activeAcct
            ? <button onClick={() => ref.current?.openEdit()} style={{ height: 32, padding: '0 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>+ {t('Tambah Task')}</button>
            : undefined
        }
      />

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Overview is the single landing — drill into a person by clicking their
            row in the By-account table (no per-account tab strip). */}
        {active === 'overview' && (
          <TaskDashboard posts={allPosts} accounts={accounts} projects={bf.projects} onAccountClick={a => { setInnerTab('board'); setActive(a.email) }} />
        )}
        {activeAcct && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
              <button onClick={() => setActive('overview')} style={backBtn}>← {t('Kembali ke Overview')}</button>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{activeAcct.name}</span>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>{activeAcct.email}</span>
              <span style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['dashboard', 'board', 'list', 'calendar', 'files'] as TabKey[]).map(tk => (
                  <button key={tk} onClick={() => setInnerTab(tk)} style={chip(innerTab === tk)}>{tk}</button>
                ))}
              </div>
            </div>
            {innerTab === 'dashboard'
              ? <TaskDashboard posts={posts.filter(p => !p.deleted_at && p.status !== 'todo' && isAccountTask(p, activeAcct))} projects={bf.projects} />
              : <BPIPage ref={ref} entity="bpi" mineScope={activeAcct} activeTab={innerTab as BPITabType} filters={bf.filters} currentUser="" />}
          </>
        )}
      </div>
    </>
  )
}

const backBtn: React.CSSProperties = {
  height: 30, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
  border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text2)',
  fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
}

function chip(activeState: boolean): React.CSSProperties {
  return {
    height: 30, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${activeState ? 'var(--accent)' : 'var(--border)'}`,
    background: activeState ? 'rgba(108,99,255,0.15)' : 'var(--bg3)',
    color: activeState ? 'var(--accent)' : 'var(--text2)',
    fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', textTransform: 'capitalize',
  }
}
