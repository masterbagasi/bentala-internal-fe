import { PageGroupShell } from '@/components/website/PageGroupShell'

const TABS = [
  { href: '/website/about/content', label: 'About Content' },
  { href: '/website/about/gallery', label: 'Gallery' },
  { href: '/website/about/team',    label: 'Team' },
]

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageGroupShell title="About Page" tabs={TABS}>
      {children}
    </PageGroupShell>
  )
}
