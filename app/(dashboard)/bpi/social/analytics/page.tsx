import { PageHeader } from '@/components/shared/PageHeader'
import { AnalyticsView } from '@/components/Social/AnalyticsView'

export default function Page() {
  return (
    <>
      <PageHeader title="Bentala Project — Analytics" />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        <AnalyticsView />
      </div>
    </>
  )
}
