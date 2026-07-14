import { PageHeader } from '@/components/shared/PageHeader'
import { ContactsList } from '@/components/CRM2/ContactsList'

export const metadata = { title: 'Contacts' }

export default function ContactsPage() {
  return (
    <>
      <PageHeader title="Contacts" />
      <div className="flex-1 overflow-y-auto min-h-0">
        <ContactsList />
      </div>
    </>
  )
}
