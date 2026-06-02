'use client'

import { useData } from '@/hooks/useData'
import { useRealtime } from '@/hooks/useRealtime'

export function DataProvider({ children }: { children: React.ReactNode }) {
  useData()
  useRealtime()
  return <>{children}</>
}
