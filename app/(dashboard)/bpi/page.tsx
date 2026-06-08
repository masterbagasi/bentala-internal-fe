'use client'

import { useState, useRef, useEffect } from 'react'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { BPIPage, BoardFilter, useBoardFilter, type BPIPageHandle, type BPITabType } from '@/components/BPI'
import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'

export default function BpiPage() {
  const t = useT()
  const [tab, setTab] = useState<TabKey>('list')
  const bpiRef = useRef<BPIPageHandle>(null)
  const bf = useBoardFilter('bpi')

  // Real logged-in user — column locks apply only to the actual person,
  // not to everyone (previously hardcoded to "Naufal", which blocked all drags).
  const [currentUser, setCurrentUser] = useState('')
  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => {
      if (data.user) {
        const meta = data.user.user_metadata ?? {}
        setCurrentUser(meta.full_name ?? meta.name ?? data.user.email?.split('@')[0] ?? '')
      }
    })
  }, [])

  return (
    <>
      <PageHeader
        title="Projects"
        tabs={['list', 'board', 'calendar', 'files', 'analytics']}
        activeTab={tab}
        onTabChange={setTab}
        showDateFilter={tab === 'analytics'}
        tabsRight={tab !== 'analytics' ? <BoardFilter filters={bf.filters} setFilters={bf.setFilters} accounts={bf.accounts} months={bf.months} /> : undefined}
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
            + {t('Tambah Post')}
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        <BPIPage ref={bpiRef} entity="bpi" currentUser={currentUser} activeTab={tab as BPITabType} filters={bf.filters} />
      </div>
    </>
  )
}
