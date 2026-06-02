import AudioStudio from '@/components/AIStudio/AudioStudio'
import { PageShell } from '@/components/shared/PageShell'

export const metadata = { title: 'Generator Audio — AI Studio' }

export default function AudioPage() {
  return (
    <PageShell title="Generator Audio">
      <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
        <AudioStudio />
      </div>
    </PageShell>
  )
}
