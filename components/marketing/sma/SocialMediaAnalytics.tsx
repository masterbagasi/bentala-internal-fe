'use client'

import { useState } from 'react'
import { C } from './theme'
import { ComingSoon } from './ComingSoon'
import { DeepAnalysisTab } from './DeepAnalysisTab'

type TabKey = 'deep' | 'client' | 'reports'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'deep', label: 'Deep Analysis' },
  { key: 'client', label: 'Our Client' },
  { key: 'reports', label: 'Reports' },
]

export function SocialMediaAnalytics() {
  const [tab, setTab] = useState<TabKey>('deep')

  return (
    // Fill the dashboard's fixed-height card; the body below is the scroll
    // container (the card itself is overflow:hidden, like PageShell).
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' }}>
      {/* Page header */}
      <div style={{ padding: '24px 24px 0', flexShrink: 0 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Social Media Analytics</h1>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>Analisa akun, susun strategi konkret, dan kelola klien dalam satu alur kerja</p>
      </div>

      {/* Horizontal scrollable tabs (cyan active underline) */}
      <div style={{ borderBottom: '1px solid var(--border)', padding: '0 24px', marginTop: 16, overflowX: 'auto', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {TABS.map((t) => {
          const on = tab === t.key
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              style={{
                padding: '12px 16px', background: 'none', border: 'none', marginBottom: -1,
                borderBottom: `2px solid ${on ? C.accent : 'transparent'}`,
                color: on ? C.accent : 'var(--text2)', fontSize: 14, fontWeight: on ? 600 : 500,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 24 }}>
        {/* Deep Analysis stays mounted (hidden when inactive) so its
            Langkah 1–4 input is preserved across tab switches. */}
        <div style={{ display: tab === 'deep' ? 'block' : 'none' }}>
          <DeepAnalysisTab onOpenClient={() => setTab('client')} />
        </div>
        {tab === 'client' && (
          <ComingSoon
            title="Our Client"
            desc="Kelola klien yang sudah deal dan pantau progress KPI mereka"
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>}
          />
        )}
        {tab === 'reports' && (
          <ComingSoon
            title="Reports"
            desc="Cetak laporan akhir dan evaluasi hasil kerja per klien"
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>}
          />
        )}
      </div>
    </div>
  )
}
