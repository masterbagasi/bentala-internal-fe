'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams, notFound } from 'next/navigation'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { BPIPage, BoardFilter, useBoardFilter, type BPIPageHandle, type BPITabType } from '@/components/BPI'
import { PostHistoryButton } from '@/components/shared/PostHistory'
import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useSocmedProjects } from '@/lib/socmed-projects'

export default function SmmProjectBoardPage() {
  const t = useT()
  const params = useParams<{ project: string }>()
  const slug = params.project
  const projects = useSocmedProjects(false) // include archived so we can detect "exists"
  // Tolerate the first paint before the project list has loaded.
  const known = projects.length === 0 || projects.some(p => p.slug === slug)
  const [tab, setTab] = useState<TabKey>('list')
  const ref = useRef<BPIPageHandle>(null)
  const bf = useBoardFilter(slug)

  const [currentUser, setCurrentUser] = useState('')
  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => {
      if (data.user) {
        const meta = data.user.user_metadata ?? {}
        setCurrentUser(meta.full_name ?? meta.name ?? data.user.email?.split('@')[0] ?? '')
      }
    })
  }, [])

  if (!known) notFound()

  return (
    <>
      <PageHeader
        title="Projects"
        tabs={['list', 'board', 'calendar', 'files', 'analytics']}
        activeTab={tab}
        onTabChange={setTab}
        showDateFilter={tab === 'analytics'}
        tabsRight={tab !== 'analytics' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PostHistoryButton scope={{ entity: slug }} />
            <BoardFilter filters={bf.filters} setFilters={bf.setFilters} accounts={bf.accounts} months={bf.months} />
          </div>
        ) : undefined}
        action={
          <button
            onClick={() => ref.current?.openEdit()}
            style={{ height: 32, padding: '0 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            {t('+ Tambah Post')}
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        <BPIPage ref={ref} entity={slug} currentUser={currentUser} activeTab={tab as BPITabType} filters={bf.filters} />
      </div>
    </>
  )
}
