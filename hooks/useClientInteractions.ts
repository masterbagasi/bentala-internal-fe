'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { ClientInteraction } from '@/lib/types'

let ciChanSeq = 0

/** One client's interaction timeline, newest-first, kept live. */
export function useClientInteractions(clientId: string | null | undefined): ClientInteraction[] {
  const [rows, setRows] = useState<ClientInteraction[]>([])

  useEffect(() => {
    if (!clientId) { setRows([]); return }
    let cancelled = false
    const supabase = getSupabase()

    supabase
      .from('client_interactions')
      .select('*')
      .eq('client_id', clientId)
      .order('occurred_at', { ascending: false })
      .then(({ data }) => { if (!cancelled) setRows((data as ClientInteraction[] | null) ?? []) })

    const buildChannel = () => supabase
      .channel(`client-interactions:${clientId}:${++ciChanSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_interactions', filter: `client_id=eq.${clientId}` }, (payload) => {
        if (cancelled) return
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id: string }).id
          setRows(prev => prev.filter(r => r.id !== id))
        } else {
          const row = payload.new as ClientInteraction
          setRows(prev => {
            const rest = prev.filter(r => r.id !== row.id)
            return [row, ...rest].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
          })
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
