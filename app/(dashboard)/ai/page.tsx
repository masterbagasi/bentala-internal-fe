import AIStudioHub from '@/components/AIStudio/AIStudioHub'
import { FloatingBell } from '@/components/shared/FloatingBell'

export const metadata = { title: 'AI Studio — Bentala Internal' }

export default function AIHubPage() {
  return (
    <>
      <FloatingBell />
      <AIStudioHub />
    </>
  )
}
