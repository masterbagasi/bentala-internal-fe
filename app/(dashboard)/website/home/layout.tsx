'use client'

import { PageGroupShell } from '@/components/website/PageGroupShell'
import { useT } from '@/lib/i18n/LanguageProvider'

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  const t = useT()
  const tabs = [
    { href: '/website/home/hero',              label: t('Bagian Hero') },
    { href: '/website/home/services',          label: t('Layanan') },
    { href: '/website/home/abroad-production', label: 'Abroad Production' },
    { href: '/website/home/collaborations',    label: t('Kolaborasi') },
    { href: '/website/home/portfolio',         label: t('Portofolio') },
    { href: '/website/home/social',            label: t('Tautan Sosial') },
  ]
  return (
    <PageGroupShell title={t('Halaman Home')} tabs={tabs}>
      {children}
    </PageGroupShell>
  )
}
