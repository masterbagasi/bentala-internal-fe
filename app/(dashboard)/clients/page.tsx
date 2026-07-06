'use client'

import { useState, useRef } from 'react'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { CRMPage, StageFilter, useCrmMeta, type CRMPageHandle } from '@/components/CRM'
import { ActivityButton } from '@/components/CRM/ActivityButton'
import { useT } from '@/lib/i18n/LanguageProvider'

// CRM Pipeline — same page chrome as All Project: the view tabs, filter and
// "+ Add" all live in the sticky PageHeader, with the board/list/follow-up
// content rendered flush below.
export default function ClientsPage() {
  const t = useT()
  const [tab, setTab] = useState<TabKey>('list')
  const ref = useRef<CRMPageHandle>(null)
  const { crmFilter, setCrmFilter, stageCounts, followUpDueCount } = useCrmMeta()
  const showFilter = tab === 'list' || tab === 'board'

  return (
    <>
      <PageHeader
        title="CRM Pipeline"
        tabs={['list', 'board', 'followup']}
        activeTab={tab}
        onTabChange={setTab}
        tabBadges={{ followup: followUpDueCount }}
        tabsRight={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ActivityButton scope="pipeline" />
            {showFilter && (
              <StageFilter t={t} crmFilter={crmFilter} setCrmFilter={setCrmFilter} counts={stageCounts} />
            )}
          </div>
        }
        action={
          <button
            onClick={() => ref.current?.openAdd()}
            style={{ height: 32, padding: '0 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            + {t('Tambah Client')}
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        <CRMPage ref={ref} activeTab={tab as 'list' | 'board' | 'followup'} />
      </div>
    </>
  )
}
