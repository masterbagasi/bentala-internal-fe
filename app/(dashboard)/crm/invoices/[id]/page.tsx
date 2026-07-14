import { PageHeader } from '@/components/shared/PageHeader'
import { InvoiceDetail } from '@/components/CRM2/InvoiceDetail'

export default function CrmInvoiceDetailPage({ params }: { params: { id: string } }) {
  return (
    <>
      <PageHeader title="Invoices" />
      <div className="flex-1 overflow-y-auto min-h-0">
        <InvoiceDetail id={params.id} />
      </div>
    </>
  )
}
