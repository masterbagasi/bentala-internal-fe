'use client'

import { PageGroupShell } from '@/components/website/PageGroupShell'
import { useT } from '@/lib/i18n/LanguageProvider'

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  const t = useT()
  const tabs = [
    { href: '/website/about/content', label: t('Konten About') },
    { href: '/website/about/gallery', label: t('Galeri') },
  ]
  return (
    <PageGroupShell title={t('Halaman About')} tabs={tabs}>
      {children}
    </PageGroupShell>
  )
}
