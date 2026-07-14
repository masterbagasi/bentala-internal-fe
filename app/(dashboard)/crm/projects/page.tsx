import { PageHeader } from '@/components/shared/PageHeader'
import { CrmProjectsList } from '@/components/CRM2/CrmProjectsList'

export const metadata = { title: 'Contracts' }

export default function CrmProjectsPage() {
  return (
    <>
      <PageHeader title="Contracts" />
      <div className="flex-1 overflow-y-auto min-h-0">
        <CrmProjectsList />
      </div>
    </>
  )
}
