'use client'

import { useState } from 'react'
import { Section } from '@/components/website/Section'
import { ManageProjectsPanel } from '@/components/Socmed/ManageProjectsPanel'
import { useT } from '@/lib/i18n/LanguageProvider'
import AccessControlClient from './AccessControlClient'

type Tab = 'accounts' | 'projects'

export default function AccessTabs() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('accounts')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'accounts', label: t('Akses Akun') },
    { key: 'projects', label: t('Project Socmed') },
  ]

  return (
    <>
      {/* ── Tab bar — local to this settings page, styled like the app's
          board tabs (accent underline) but without PageHeader's fixed
          TabKey union (those are icon/English-label board views). */}
      <div style={{ display: 'flex', gap: 4, padding: '0 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
        {tabs.map(({ key, label }) => {
          const isActive = tab === key
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: '12px 14px',
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                marginBottom: -1,
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                color: isActive ? 'var(--accent)' : 'var(--text2)',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: 24 }}>
        {tab === 'accounts' ? (
          <Section title={t('Akses Menu per Akun')} scrollable>
            <AccessControlClient />
          </Section>
        ) : (
          // ManageProjectsPanel carries its own card + header, so it
          // renders directly (no Section wrapper, to avoid a double card).
          <ManageProjectsPanel />
        )}
      </div>
    </>
  )
}
