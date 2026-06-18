import { PageHeader } from '@/components/shared/PageHeader'
import { ManageProjectsPanel } from '@/components/Socmed/ManageProjectsPanel'

export const metadata = { title: 'Project Socmed — Settings' }

export default function ProjectSocmedPage() {
  return (
    <>
      <PageHeader title="Project Socmed" />
      <div className="flex-1 overflow-y-auto" style={{ padding: 24 }}>
        <ManageProjectsPanel />
      </div>
    </>
  )
}
