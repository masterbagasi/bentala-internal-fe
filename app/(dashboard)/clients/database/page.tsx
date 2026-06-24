import { PageHeader } from '@/components/shared/PageHeader'
import { ClientDatabase } from '@/components/CRM/ClientDatabase'

export default function ClientDatabasePage() {
  return (
    <>
      <PageHeader title="Database Client" />
      <div className="flex-1 overflow-y-auto min-h-0">
        <ClientDatabase />
      </div>
    </>
  )
}
