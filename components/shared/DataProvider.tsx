'use client'

import { useData } from '@/hooks/useData'
import { useRealtime } from '@/hooks/useRealtime'
import { useChatUnread } from '@/hooks/useChatUnread'

export function DataProvider({ children }: { children: React.ReactNode }) {
  useData()
  useRealtime()
  useChatUnread()
  return <>{children}</>
}
