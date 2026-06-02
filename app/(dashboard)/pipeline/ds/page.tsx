'use client'

import { PageHeader } from '@/components/shared/PageHeader'
import { PipelinePage } from '@/components/Pipeline'
import { DS_STAGES } from '@/lib/constants'

export default function DesignPipelinePage() {
  return (
    <>
      <PageHeader title="Design Pipeline" />
      <div className="flex-1 overflow-hidden min-h-0">
        <PipelinePage member="Design Studio" stages={[...DS_STAGES]} />
      </div>
    </>
  )
}
