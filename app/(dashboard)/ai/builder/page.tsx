import { Suspense } from 'react'
import ContentBuilder from '@/components/AIStudio/ContentBuilder'
import { PageShell } from '@/components/shared/PageShell'

export const metadata = { title: 'Content Builder — AI Studio' }

export default function BuilderPage() {
  return (
    <PageShell title="Content Builder">
      <div style={{ padding: '24px 32px', maxWidth: 900, margin: '0 auto' }}>
        <Suspense fallback={null}>
          <ContentBuilder />
        </Suspense>
      </div>
    </PageShell>
  )
}
