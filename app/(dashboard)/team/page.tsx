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

  // Team tasks = briefed (To Do List = brief), non-deleted, and either assigned
  // to someone (tagged) or a personal task. Independent of the accounts list, so
  // the overview totals show immediately even before /api/accounts resolves.
  const allPosts = useMemo(
    () => posts.filter(p => !p.deleted_at && p.status !== 'todo' && ((p.tagged && p.tagged.length > 0) || p.entity === 'personal')),
    [posts],
  )

  // Close the account popup on Escape.
  useEffect(() => {
    if (!activeAcct) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActive('overview') }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [activeAcct])

  if (!ready) return null

  return (
    <>
      <PageHeader title="Team" />

      <div className="flex-1 overflow-y-auto min-h-0">
        <TaskDashboard posts={allPosts} accounts={accounts} projects={bf.projects} onAccountClick={a => { setInnerTab('board'); setActive(a.email) }} />
      </div>

      {/* Account board opens as a popup over the Overview. */}
      {activeAcct && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setActive('overview') }}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div style={{ width: '95vw', maxWidth: 1500, height: '90vh', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: '50%', background: `hsl(${hue(activeAcct.name)} 42% 30%)`, color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{(activeAcct.name[0] || '?').toUpperCase()}</span>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{activeAcct.name}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{activeAcct.email}</span>
              </span>
              <span style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['dashboard', 'board', 'list', 'calendar', 'files'] as TabKey[]).map(tk => (
                  <button key={tk} onClick={() => setInnerTab(tk)} style={chip(innerTab === tk)}>{tk}</button>
                ))}
              </div>
              <button onClick={() => ref.current?.openEdit()} style={{ height: 30, padding: '0 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>+ {t('Tambah Task')}</button>
              <button onClick={() => setActive('overview')} aria-label={t('Tutup')} style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 15 }}>✕</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
              {innerTab === 'dashboard'
                ? <TaskDashboard posts={posts.filter(p => !p.deleted_at && p.status !== 'todo' && isAccountTask(p, activeAcct))} projects={bf.projects} />
                : <BPIPage ref={ref} entity="bpi" mineScope={activeAcct} activeTab={innerTab as BPITabType} filters={bf.filters} currentUser="" />}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function hue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
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
