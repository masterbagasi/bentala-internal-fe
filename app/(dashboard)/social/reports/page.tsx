import { PageHeader } from '@/components/shared/PageHeader'
import { ReportsView } from '@/components/Social/ReportsView'

export default function SocialReportsPage() {
  return (
    <>
      <PageHeader title="Social Media — Reports" />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        <ReportsView />
      </div>
    </>
  )
}
