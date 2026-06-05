'use client'

import { useState } from 'react'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { AccountsView } from '@/components/Social/AccountsView'
import { AnalyticsView, SocialAnalyticsFilterButton, type PlatformTab } from '@/components/Social/AnalyticsView'
import { ReportsView } from '@/components/Social/ReportsView'
import { PlanView } from '@/components/Social/PlanView'
import { SUBJECTS } from '@/components/Social/mock'

export default function Page() {
  const [tab, setTab] = useState<TabKey>('accounts')
  const [subjectId, setSubjectId] = useState(SUBJECTS[0].id)
  const [platform, setPlatform] = useState<PlatformTab>('all')
  return (
    <>
      <PageHeader
        title="Bentala Studio — Social Media"
        tabs={['accounts', 'analytics', 'reports', 'plan']}
        activeTab={tab}
        onTabChange={setTab}
        tabsRight={tab === 'analytics'
          ? <SocialAnalyticsFilterButton subjectId={subjectId} setSubjectId={setSubjectId} platform={platform} setPlatform={setPlatform} />
          : undefined}
      />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        {tab === 'accounts' && <AccountsView />}
        {tab === 'analytics' && (
          <AnalyticsView subjectId={subjectId} setSubjectId={setSubjectId} platform={platform} setPlatform={setPlatform} />
        )}
        {tab === 'reports' && <ReportsView />}
        {tab === 'plan' && <PlanView />}
      </div>
    </>
  )
}
