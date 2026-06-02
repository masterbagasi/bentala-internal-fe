import { PageHeader } from '@/components/shared/PageHeader'
import { CRMPage } from '@/components/CRM'
import { Section } from '@/components/website/Section'

export default function ClientsPage() {
  return (
    <>
      <PageHeader title="CRM Pipeline" />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        <Section title="CRM Pipeline">
          <CRMPage />
        </Section>
      </div>
    </>
  )
}
