'use client'

import { useState, useRef } from 'react'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { BPIPage, BoardFilter, useBoardFilter, type BPIPageHandle, type BPITabType } from '@/components/BPI'
import { PostHistoryButton } from '@/components/shared/PostHistory'
import { useT } from '@/lib/i18n/LanguageProvider'

// "All Project" — same as a Projects board but combining posts from every
// socmed project (Bentala Project + Studio + workspace).
export default function AllProjectsPage() {
  const t = useT()
  const [tab, setTab] = useState<TabKey>('list')
  const ref = useRef<BPIPageHandle>(null)
  const bf = useBoardFilter('all')

  return (
    <>
      <PageHeader
        title="All Project"
        tabs={['analytics', 'list', 'board', 'calendar', 'files']}
        activeTab={tab}
        onTabChange={setTab}
        showDateFilter={tab === 'analytics'}
        tabsRight={tab !== 'analytics' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PostHistoryButton scope={{ all: true }} />
            <BoardFilter filters={bf.filters} setFilters={bf.setFilters} accounts={bf.accounts} months={bf.months} />
          </div>
        ) : undefined}
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
        <BPIPage ref={ref} entity="bpi" allProjects activeTab={tab as BPITabType} filters={bf.filters} currentUser="" />
      </div>
    </>
  )
}
