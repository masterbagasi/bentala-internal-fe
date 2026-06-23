'use client'

import { useData } from '@/hooks/useData'
import { useRealtime } from '@/hooks/useRealtime'
import { useChatUnread } from '@/hooks/useChatUnread'
import { useFollowUps } from '@/hooks/useFollowUps'
import { useClientTasks } from '@/hooks/useClientTasks'

export function DataProvider({ children }: { children: React.ReactNode }) {
  useData()
  useRealtime()
  useChatUnread()
  useFollowUps()
  useClientTasks()
  return <>{children}</>
}
