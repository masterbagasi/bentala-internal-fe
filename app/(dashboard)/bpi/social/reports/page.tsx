import { PageHeader } from '@/components/shared/PageHeader'
import { ReportsView } from '@/components/Social/ReportsView'

export default function Page() {
  return (
    <>
      <PageHeader title="Bentala Project — Reports" />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        <ReportsView />
      </div>
    </>
  )
}
