import { PageHeader } from '@/components/shared/PageHeader'
import { BPIAnalytics } from '@/components/BPI/Analytics'

export default function BPIAnalyticsPage() {
  return (
    <>
      <PageHeader title="Bentala Project Indonesia — Analytics" showDateFilter />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        <BPIAnalytics />
      </div>
    </>
  )
}
