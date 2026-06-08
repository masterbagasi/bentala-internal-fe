'use client'

import { useState, useRef } from 'react'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { WorkspacePage, type WorkspacePageHandle } from '@/components/WorkSpace'
import BriefInbox from '@/components/AIStudio/BriefInbox'
import { useT } from '@/lib/i18n/LanguageProvider'

export default function FaizalPage() {
  const t = useT()
  const wsRef = useRef<WorkspacePageHandle>(null)
  const [tab, setTab] = useState<TabKey>('list')

  return (
    <>
      <PageHeader
        title="Video Production"
        tabs={['list', 'brief']}
        activeTab={tab}
        onTabChange={setTab}
        action={tab === 'list' ? (
          <button
            onClick={() => wsRef.current?.openAdd()}
            style={{ height: 32, padding: '0 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            {t('+ Tambah Pekerjaan')}
          </button>
        ) : undefined}
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === 'list' && <WorkspacePage ref={wsRef} member="Video Production" memberKey="fz" />}
        {tab === 'brief' && <BriefInbox type="video" />}
      </div>
    </>
  )
}
