'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { SalesTarget } from '@/lib/types'

let stChanSeq = 0

export function useSalesTargets(): SalesTarget[] {
  const [rows, setRows] = useState<SalesTarget[]>([])

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabase()

    supabase.from('sales_targets').select('*')
      .then(({ data }) => { if (!cancelled) setRows((data as SalesTarget[] | null) ?? []) })

    const buildChannel = () => supabase
      .channel(`sales-targets:${++stChanSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_targets' }, (payload) => {
        if (cancelled) return
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id: string }).id
          setRows(prev => prev.filter(r => r.id !== id))
        } else {
          const row = payload.new as SalesTarget
          setRows(prev => { const rest = prev.filter(r => r.id !== row.id); return [...rest, row] })
        }
      })
      .subscribe()

    let channel: ReturnType<typeof buildChannel> | null = null
    const ensure = (token: string) => {
      if (cancelled) return
      ;(supabase.realtime as unknown as { setAuth: (t: string) => void }).setAuth(token)
      if (!channel) channel = buildChannel()
    }
    supabase.auth.getSession().then(({ data }) => { if (data.session?.access_token) ensure(data.session.access_token) })
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => { if (session?.access_token) ensure(session.access_token) })

    return () => { cancelled = true; authSub.subscription.unsubscribe(); if (channel) supabase.removeChannel(channel) }
  }, [])

  return rows
}
