'use client'

import { Section } from '@/components/website/Section'
import { useT } from '@/lib/i18n/LanguageProvider'
import AccessControlClient from './AccessControlClient'

// Project Socmed management now lives in its own Settings page
// (/settings/projects), so this page is just per-account menu access.
export default function AccessTabs() {
  const t = useT()
  return (
    <div className="flex-1 overflow-y-auto" style={{ padding: 24 }}>
      <Section title={t('Akses Menu per Akun')} scrollable>
        <AccessControlClient />
      </Section>
    </div>
  )
}
