'use client'

import { PageHeader } from '@/components/shared/PageHeader'
import { PipelinePage } from '@/components/Pipeline'
import { VP_STAGES } from '@/lib/constants'

export default function VideoPipelinePage() {
  return (
    <>
      <PageHeader title="Video Pipeline" />
      <div className="flex-1 overflow-hidden min-h-0">
        <PipelinePage member="Video Production" stages={[...VP_STAGES]} />
      </div>
    </>
  )
}
