import { PageHeader } from '@/components/shared/PageHeader'
import { PlanView } from '@/components/Social/PlanView'

export default function Page() {
  return (
    <>
      <PageHeader title="Bentala Project — Plan" />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        <PlanView />
      </div>
    </>
  )
}
