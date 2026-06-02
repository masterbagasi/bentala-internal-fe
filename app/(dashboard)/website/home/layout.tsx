import { PageGroupShell } from '@/components/website/PageGroupShell'

const TABS = [
  { href: '/website/home/hero',              label: 'Hero Section' },
  { href: '/website/home/services',          label: 'Services' },
  { href: '/website/home/abroad-production', label: 'Abroad Production' },
  { href: '/website/home/collaborations',    label: 'Collaborations' },
  { href: '/website/home/portfolio',         label: 'Portfolio' },
  { href: '/website/home/social',            label: 'Social Links' },
]

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageGroupShell title="Home Page" tabs={TABS}>
      {children}
    </PageGroupShell>
  )
}
