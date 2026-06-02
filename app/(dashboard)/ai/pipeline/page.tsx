import PipelineHub from '@/components/AIStudio/PipelineHub'
import { PageShell } from '@/components/shared/PageShell'

export const metadata = { title: 'Pipeline Konten — AI Studio' }

export default function PipelinePage() {
  return (
    <PageShell title="Pipeline Konten">
      <div style={{ padding: '24px 28px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <PipelineHub />
        </div>
      </div>
    </PageShell>
  )
}
