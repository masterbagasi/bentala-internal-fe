'use client'

import { useState } from 'react'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { AccountsView } from '@/components/Social/AccountsView'
import { NotConnected } from '@/components/Social/NotConnected'

// Bentala Studio's account (bentalastudioindonesia) isn't connected to a live
// data source, so Analytics/Reports/Plan show a "not connected" state instead
// of another account's data. Accounts is real (per-brand registry in Supabase).
export default function Page() {
  const [tab, setTab] = useState<TabKey>('accounts')
  return (
    <>
      <PageHeader
        title="Social Media"
        tabs={['accounts', 'analytics', 'reports', 'plan']}
        activeTab={tab}
        onTabChange={setTab}
      />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        {tab === 'accounts' && <AccountsView brand="bsi" />}
        {tab === 'analytics' && <NotConnected brandLabel="Bentala Studio" feature="Analitik" />}
        {tab === 'reports' && <NotConnected brandLabel="Bentala Studio" feature="Laporan" />}
        {tab === 'plan' && <NotConnected brandLabel="Bentala Studio" feature="Content plan" />}
      </div>
    </>
  )
}
