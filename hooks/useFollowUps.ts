'use client'

import { useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useStore } from './useStore'
import type { ClientInteraction, OpenFollowUp } from '@/lib/types'

/**
 * useFollowUps
 * Seeds the open-follow-up slice once, then keeps it live from client_interactions
 * realtime — drives the CRM card badge, the "Perlu Follow-up" panel, and the bell.
 */
export function useFollowUps() {
  const setFollowUps = useStore((s) => s.setFollowUps)
  const upsertFollowUp = useStore((s) => s.upsertFollowUp)
  const removeFollowUp = useStore((s) => s.removeFollowUp)

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabase()

    supabase
      .from('client_interactions')
      .select('id,client_id,next_follow_up')
      .eq('follow_up_done', false)
      .not('next_follow_up', 'is', null)
      .then(({ data }) => { if (!cancelled && data) setFollowUps(data as OpenFollowUp[]) })

    const buildChannel = () => supabase
      .channel('client-followups')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_interactions' }, (payload) => {
        if (cancelled) return
        if (payload.eventType === 'DELETE') removeFollowUp((payload.old as { id: string }).id)
        else upsertFollowUp(payload.new as ClientInteraction)
      })
      .subscribe()

    let channel: ReturnType<typeof buildChannel> | null = null
    const ensure = (token: string) => {
      if (cancelled) return
      ;(supabase.realtime as { setAuth: (t: string) => void }).setAuth(token)
      if (!channel) channel = buildChannel()
    }
    supabase.auth.getSession().then(({ data }) => { if (data.session?.access_token) ensure(data.session.access_token) })
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => { if (session?.access_token) ensure(session.access_token) })

    return () => { cancelled = true; authSub.subscription.unsubscribe(); if (channel) supabase.removeChannel(channel) }
  }, [setFollowUps, upsertFollowUp, removeFollowUp])
}
