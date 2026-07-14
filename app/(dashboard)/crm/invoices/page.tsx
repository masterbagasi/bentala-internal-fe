import { PageHeader } from '@/components/shared/PageHeader'
import { InvoicesList } from '@/components/CRM2/InvoicesList'

export const metadata = { title: 'Invoices' }

export default function CrmInvoicesPage() {
  return (
    <>
      <PageHeader title="Invoices" />
      <div className="flex-1 overflow-y-auto min-h-0">
        <InvoicesList />
      </div>
    </>
  )
}
