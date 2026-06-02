import { PageHeader } from '@/components/shared/PageHeader'
import { TasksPage } from '@/components/Tasks'
import { Section } from '@/components/website/Section'

export default function TasksPageRoute() {
  return (
    <>
      <PageHeader title="Task Board" />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        <Section title="Task Board">
          <TasksPage />
        </Section>
      </div>
    </>
  )
}
