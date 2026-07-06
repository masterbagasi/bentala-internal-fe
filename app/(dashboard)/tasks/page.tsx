import { PageHeader } from '@/components/shared/PageHeader'
import { TasksPage } from '@/components/Tasks'
import { Section } from '@/components/website/Section'

export default function TasksPageRoute() {
  return (
    <>
      <PageHeader title="Papan Tugas" />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        <Section title="Papan Tugas">
          <TasksPage />
        </Section>
      </div>
    </>
  )
}
