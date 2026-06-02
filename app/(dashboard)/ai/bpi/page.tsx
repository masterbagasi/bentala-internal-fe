import BPIIntelligence from '@/components/AIStudio/BPIIntelligence'
import { PageShell } from '@/components/shared/PageShell'

export const metadata = { title: 'BPI Intelligence — AI Studio' }

export default function BPIPage() {
  return (
    <PageShell title="BPI Intelligence">
      <div style={{ padding: '24px 32px' }}>
        <BPIIntelligence />
      </div>
    </PageShell>
  )
}
