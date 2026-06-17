'use client'

import { PageHeader } from '@/components/shared/PageHeader'
import { ChatHub } from '@/components/Chat/ChatHub'
import { useIsMobile } from '@/hooks/useIsMobile'

// Unified chat: one tab listing every Socmed Management room (replaces the
// per-project Chat entries) with the conversation inline. ChatRoom is reused
// as-is, so all existing chat features keep working.
export default function ChatHubPage() {
  const isMobile = useIsMobile()
  return (
    <>
      <PageHeader title="Chat" />
      <div className="flex-1 overflow-hidden min-h-0" style={{ padding: isMobile ? 0 : 24, display: 'flex', flexDirection: 'column' }}>
        <ChatHub />
      </div>
    </>
  )
}
