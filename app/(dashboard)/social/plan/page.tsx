import { PageHeader } from '@/components/shared/PageHeader'
import { PlanView } from '@/components/Social/PlanView'

export default function SocialPlanPage() {
  return (
    <>
      <PageHeader title="Social Media — Plan" />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        <PlanView />
      </div>
    </>
  )
}
