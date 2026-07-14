import { PageHeader } from '@/components/shared/PageHeader'
import { DealsPipeline } from '@/components/CRM2/DealsPipeline'

export const metadata = { title: 'Pipeline' }

export default function PipelinePage() {
  return (
    <>
      <PageHeader title="Pipeline" />
      <div className="flex-1 overflow-y-auto min-h-0">
        <DealsPipeline />
      </div>
    </>
  )
}
