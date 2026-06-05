import { PageHeader } from '@/components/shared/PageHeader'
import { BPIAnalytics } from '@/components/BPI/Analytics'

export default function BSIAnalyticsPage() {
  return (
    <>
      <PageHeader title="Analytics" showDateFilter />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        <BPIAnalytics entity="bsi" />
      </div>
    </>
  )
}
