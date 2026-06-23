import { PageHeader } from '@/components/shared/PageHeader'
import { SalesReport } from '@/components/CRM/SalesReport'

export default function SalesReportPage() {
  return (
    <>
      <PageHeader title="Laporan Sales" />
      <div className="flex-1 overflow-y-auto min-h-0">
        <SalesReport />
      </div>
    </>
  )
}
