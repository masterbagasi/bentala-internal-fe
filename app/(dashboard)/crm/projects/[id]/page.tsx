import { PageHeader } from '@/components/shared/PageHeader'
import { CrmProjectDetail } from '@/components/CRM2/CrmProjectDetail'

export default function CrmProjectDetailPage({ params }: { params: { id: string } }) {
  return (
    <>
      <PageHeader title="Order List" />
      <div className="flex-1 overflow-y-auto min-h-0">
        <CrmProjectDetail id={params.id} />
      </div>
    </>
  )
}
