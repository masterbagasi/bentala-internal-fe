import { PageHeader } from '@/components/shared/PageHeader'
import { TeamPage } from '@/components/Team'
import { Section } from '@/components/website/Section'

export default function TeamPageRoute() {
  return (
    <>
      <PageHeader title="Team & Roles" />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        <Section title="Anggota Tim">
          <TeamPage />
        </Section>
      </div>
    </>
  )
}
