import IdeaExplorer from '@/components/AIStudio/IdeaExplorer'
import { PageShell } from '@/components/shared/PageShell'

export const metadata = { title: 'Pencari Ide — AI Studio' }

export default function IdeasPage() {
  return (
    <PageShell title="Pencari Ide">
      <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
        <IdeaExplorer />
      </div>
    </PageShell>
  )
}
