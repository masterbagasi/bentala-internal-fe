'use client'

import { useState } from 'react'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { AccountsView } from '@/components/Social/AccountsView'
import { AnalyticsView, SocialAnalyticsFilterButton, SocialAnalyticsSubBar, type PlatformTab, type SubView } from '@/components/Social/AnalyticsView'
import { ReportsView } from '@/components/Social/ReportsView'
import { PlanView } from '@/components/Social/PlanView'
import { SUBJECTS } from '@/components/Social/mock'
import { presetRange, type DateRange } from '@/components/Social/DateRangePicker'

export default function Page() {
  const [tab, setTab] = useState<TabKey>('accounts')
  const [subjectId, setSubjectId] = useState(SUBJECTS[0].id)
  const [platform, setPlatform] = useState<PlatformTab>('all')
  const [view, setView] = useState<SubView>('overview')
  const [range, setRange] = useState<DateRange>(presetRange('Last 90 days'))
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
      {/* Fixed sub-header for Analytics — stays put while content scrolls */}
      {tab === 'analytics' && (
        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <SocialAnalyticsSubBar view={view} setView={setView} range={range} setRange={setRange} />
        </div>
      )}
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        {tab === 'accounts' && <AccountsView />}
        {tab === 'analytics' && (
          <AnalyticsView
            subjectId={subjectId} setSubjectId={setSubjectId}
            platform={platform} setPlatform={setPlatform}
            view={view} setView={setView} range={range} setRange={setRange}
          />
        )}
        {tab === 'reports' && <ReportsView />}
        {tab === 'plan' && <PlanView />}
      </div>
    </>
  )
}
