'use client'

import { useState, useRef } from 'react'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { BPIPage, BoardFilter, useBoardFilter, type BPIPageHandle, type BPITabType } from '@/components/BPI'

export default function BsiPage() {
  const [tab, setTab] = useState<TabKey>('list')
  const bsiRef = useRef<BPIPageHandle>(null)
  const bf = useBoardFilter('bsi')

  return (
    <>
      <PageHeader
        title="Bentala Studio Indonesia"
        tabs={['list', 'board', 'calendar', 'files', 'analytics']}
        activeTab={tab}
        onTabChange={setTab}
        showDateFilter={tab === 'analytics'}
        tabsRight={tab !== 'analytics' ? <BoardFilter filters={bf.filters} setFilters={bf.setFilters} accounts={bf.accounts} months={bf.months} /> : undefined}
        action={
          <button
            onClick={() => bsiRef.current?.openEdit()}
            style={{
              height: 32,
              padding: '0 14px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            + Tambah Post
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        <BPIPage ref={bsiRef} entity="bsi" activeTab={tab as BPITabType} filters={bf.filters} />
      </div>
    </>
  )
}
