import { PageHeader } from '@/components/shared/PageHeader'
import { ContactDetail } from '@/components/CRM2/ContactDetail'

export default function ContactDetailPage({ params }: { params: { id: string } }) {
  return (
    <>
      <PageHeader title="Contacts" />
      <div className="flex-1 overflow-y-auto min-h-0">
        <ContactDetail id={params.id} />
      </div>
    </>
  )
}
