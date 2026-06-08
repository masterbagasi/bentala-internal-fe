'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { AccountsView } from '@/components/Social/AccountsView'
import { NotConnected } from '@/components/Social/NotConnected'
import { MiniAnalytics, type MiniAccount } from '@/components/Social/MiniAnalytics'

// Real snapshot of @bentalastudioindonesia (via Composio 2026-06-05). The
// account is < 1.000 followers, so Instagram doesn't expose per-post insights
// or demographics — we show the available real figures.
const STUDIO: MiniAccount = {
  name: 'Bentala Studio Indonesia',
  username: 'bentalastudioindonesia',
  asOf: '5 Jun 2026',
  followers: 77,
  following: 1,
  mediaCount: 21,
  videoCount: 13,
  designCount: 8,
  reach28: 58,
  views28: 75,
  interactions28: 2,
  posts: [
    { title: 'Masalah – Solusi', date: '3 Jun', likes: 4, comments: 1, kind: 'feed' },
    { title: 'Nikmat lepas tanpa perlu kupas', date: '31 Mei', likes: 1, comments: 0, kind: 'reel' },
    { title: 'Jaket dari Celana Studio — gaya Paris', date: '28 Mei', likes: 7, comments: 0, kind: 'reel' },
    { title: "Behind 'Bolehkah Aku Pergi?'", date: '27 Mei', likes: 6, comments: 0, kind: 'reel' },
    { title: "BTS 'Bolehkah Aku Pergi?'", date: '24 Mei', likes: 12, comments: 0, kind: 'feed' },
    { title: 'Mushome Chips: tepat di segala tempat', date: '23 Mei', likes: 5, comments: 0, kind: 'reel' },
    { title: 'Snack Emak CW', date: '21 Mei', likes: 25, comments: 3, kind: 'reel' },
    { title: 'Kenapa konten penting untuk brand?', date: '21 Mei', likes: 8, comments: 0, kind: 'feed' },
  ],
}

export default function Page() {
  const t = useT()
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
        {tab === 'analytics' && <MiniAnalytics account={STUDIO} />}
        {tab === 'reports' && <NotConnected brandLabel="Bentala Studio" feature={t('Laporan')} />}
        {tab === 'plan' && <NotConnected brandLabel="Bentala Studio" feature="Content plan" />}
      </div>
    </>
  )
}
