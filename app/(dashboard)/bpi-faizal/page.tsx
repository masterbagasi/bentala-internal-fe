'use client'

import { useState, useRef } from 'react'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { BPIPage, BoardFilter, useBoardFilter, type BPIPageHandle, type BPITabType } from '@/components/BPI'
import { PostHistoryButton } from '@/components/shared/PostHistory'

const PIC = 'Video Production'

export default function FaizalPage() {
  const [tab, setTab] = useState<TabKey>('list')
  const ref = useRef<BPIPageHandle>(null)
  const bf = useBoardFilter({ pic: PIC })

  return (
    <>
      <PageHeader
        title="Video Production"
        tabs={['analytics', 'list', 'board', 'calendar', 'files']}
        activeTab={tab}
        onTabChange={setTab}
        showDateFilter={tab === 'analytics'}
        tabsRight={tab !== 'analytics' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PostHistoryButton scope={{ pic: PIC }} />
            <BoardFilter filters={bf.filters} setFilters={bf.setFilters} accounts={bf.accounts} months={bf.months} />
          </div>
        ) : undefined}
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        <BPIPage ref={ref} entity="ws" picScope={PIC} calEntity="ws-fz" currentUser="" activeTab={tab as BPITabType} filters={bf.filters} />
      </div>
    </>
  )
}
