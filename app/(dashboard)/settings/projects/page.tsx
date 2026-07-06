import { PageHeader } from '@/components/shared/PageHeader'
import { ManageProjectsPanel } from '@/components/Socmed/ManageProjectsPanel'

export const metadata = { title: 'Pengaturan Project' }

export default function ProjectSocmedPage() {
  return (
    <>
      <PageHeader title="Pengaturan Project" />
      <div className="flex-1 overflow-y-auto" style={{ padding: 24 }}>
        <ManageProjectsPanel />
      </div>
    </>
  )
}
