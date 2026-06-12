import { PageHeader } from '@/components/shared/PageHeader'
import AccessTabs from './AccessTabs'

export const metadata = { title: 'Hak Akses — Settings' }

export default function AccessControlPage() {
  return (
    <>
      <PageHeader title="Hak Akses" />
      <AccessTabs />
    </>
  )
}
