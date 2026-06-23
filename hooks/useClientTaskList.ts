'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { ClientTask } from '@/lib/types'

let ctChanSeq = 0

export function useClientTaskList(clientId: string | null | undefined): ClientTask[] {
  const [rows, setRows] = useState<ClientTask[]>([])

  useEffect(() => {
    if (!clientId) { setRows([]); return }
    let cancelled = false
    const supabase = getSupabase()

    supabase.from('client_tasks').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
      .then(({ data }) => { if (!cancelled) setRows((data as ClientTask[] | null) ?? []) })

    const buildChannel = () => supabase
      .channel(`client-tasks:${clientId}:${++ctChanSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_tasks', filter: `client_id=eq.${clientId}` }, (payload) => {
        if (cancelled) return
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id: string }).id
          setRows(prev => prev.filter(r => r.id !== id))
        } else {
          const row = payload.new as ClientTask
          setRows(prev => { const rest = prev.filter(r => r.id !== row.id); return [row, ...rest].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)) })
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
  }, [clientId])

  return rows
}
