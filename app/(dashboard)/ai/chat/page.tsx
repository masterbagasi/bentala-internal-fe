import ChatInterface from '@/components/AIStudio/ChatInterface'
import { PageShell } from '@/components/shared/PageShell'

export const metadata = { title: 'Chat AI — AI Studio' }

export default function ChatPage() {
  return (
    <PageShell title="Chat AI">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <ChatInterface />
      </div>
    </PageShell>
  )
}
