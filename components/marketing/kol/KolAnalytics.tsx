'use client'

import { useState } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { DiscoveryTab } from './tabs/DiscoveryTab'
import { AnalyserTab } from './tabs/AnalyserTab'
import { MyCreatorTab } from './tabs/MyCreatorTab'
import { ReportingTab } from './tabs/ReportingTab'

type TabKey = 'discovery' | 'analyser' | 'my-creator' | 'reporting'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'discovery', label: 'Creator Discovery' },
  { key: 'analyser', label: 'Analyser' },
  { key: 'my-creator', label: 'My Creator' },
  { key: 'reporting', label: 'Reporting' },
]

export function KolAnalytics() {
  const [tab, setTab] = useState<TabKey>('discovery')

  return (
    <PageShell
      title="KOL Analytics"
      tabs={{
        kind: 'button',
        items: TABS,
        active: tab,
        onChange: (k) => setTab(k as TabKey),
      }}
    >
      <div style={{ padding: 24 }}>
        {tab === 'discovery' && <DiscoveryTab />}
        {tab === 'analyser' && <AnalyserTab />}
        {tab === 'my-creator' && <MyCreatorTab />}
        {tab === 'reporting' && <ReportingTab />}
      </div>
    </PageShell>
  )
}
