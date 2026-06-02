import { PageHeader } from '@/components/shared/PageHeader'
import { ProjectsPage } from '@/components/Projects'
import { Section } from '@/components/website/Section'

export default function ProjectsPageRoute() {
  return (
    <>
      <PageHeader title="All Projects" />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        <Section title="Daftar Project">
          <ProjectsPage />
        </Section>
      </div>
    </>
  )
}
