import { PageHeader } from '@/components/shared/PageHeader'
import { Section } from '@/components/website/Section'
import AccessControlClient from './AccessControlClient'

export const metadata = { title: 'Hak Akses — Settings' }

export default function AccessControlPage() {
  return (
    <>
      <PageHeader title="Hak Akses" />
      <div className="flex-1 overflow-y-auto" style={{ padding: 24 }}>
        <Section title="Akses Menu per Akun" scrollable>
          <AccessControlClient />
        </Section>
      </div>
    </>
  )
}
