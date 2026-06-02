import { PageHeader } from '@/components/shared/PageHeader'
import { InvoicesPage } from '@/components/Invoices'
import { Section } from '@/components/website/Section'

export default function InvoicesPageRoute() {
  return (
    <>
      <PageHeader title="Invoice & Pembayaran" />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        <Section title="Daftar Invoice">
          <InvoicesPage />
        </Section>
      </div>
    </>
  )
}
