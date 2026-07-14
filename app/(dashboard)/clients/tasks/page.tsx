import { PageHeader } from '@/components/shared/PageHeader'
import { ClientTasksActivities } from '@/components/CRM/ClientTasksActivities'

export default function ClientTasksPage() {
  return (
    <>
      <PageHeader title="Tugas & Aktivitas" />
      <div className="flex-1 overflow-y-auto min-h-0">
        <ClientTasksActivities />
      </div>
    </>
  )
}
