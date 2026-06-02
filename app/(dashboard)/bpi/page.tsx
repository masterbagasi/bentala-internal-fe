'use client'

import { useState, useRef } from 'react'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { BPIPage, type BPIPageHandle, type BPITabType } from '@/components/BPI'

export default function BpiPage() {
  const [tab, setTab] = useState<TabKey>('list')
  const bpiRef = useRef<BPIPageHandle>(null)

  return (
    <>
      <PageHeader
        title="Bentala Project Indonesia"
        tabs={['list', 'board', 'calendar', 'files', 'analytics']}
        activeTab={tab}
        onTabChange={setTab}
        showDateFilter={tab === 'analytics'}
        action={
          <button
            onClick={() => bpiRef.current?.openEdit()}
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
        <BPIPage ref={bpiRef} entity="bpi" currentUser="Naufal" activeTab={tab as BPITabType} />
      </div>
    </>
  )
}
