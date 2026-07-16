'use client'

import { useState } from 'react'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { CrmProjectsList } from '@/components/CRM2/CrmProjectsList'
import { useT } from '@/lib/i18n/LanguageProvider'

export default function CrmProjectsPage() {
  const t = useT()
  const [tab, setTab] = useState<TabKey>('board')
  const [addOpen, setAddOpen] = useState(false)
  return (
    <>
      <PageHeader
        title="Order List"
        tabs={['board', 'list']}
        activeTab={tab}
        onTabChange={setTab}
        action={
          <button
            onClick={() => setAddOpen(true)}
            style={{ height: 32, padding: '0 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            + {t('Tambah Project')}
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        <CrmProjectsList view={tab === 'list' ? 'list' : 'board'} addOpen={addOpen} onAddOpenChange={setAddOpen} />
      </div>
    </>
  )
}
