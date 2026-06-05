'use client'

import { useState } from 'react'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { AccountsView } from '@/components/Social/AccountsView'
import { AnalyticsView } from '@/components/Social/AnalyticsView'
import { ReportsView } from '@/components/Social/ReportsView'
import { PlanView } from '@/components/Social/PlanView'

export default function Page() {
  const [tab, setTab] = useState<TabKey>('accounts')
  return (
    <>
      <PageHeader
        title="Bentala Project — Social Media"
        tabs={['accounts', 'analytics', 'reports', 'plan']}
        activeTab={tab}
        onTabChange={setTab}
      />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        {tab === 'accounts' && <AccountsView />}
        {tab === 'analytics' && <AnalyticsView />}
        {tab === 'reports' && <ReportsView />}
        {tab === 'plan' && <PlanView />}
      </div>
    </>
  )
}
