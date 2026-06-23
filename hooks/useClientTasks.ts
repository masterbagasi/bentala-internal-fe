'use client'

import { useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useStore } from './useStore'
import type { ClientTask, OpenTask } from '@/lib/types'

/** Seeds + keeps live the open-task slice (done=false) — drives the bell + #5 dashboard. */
export function useClientTasks() {
  const setClientTasks = useStore((s) => s.setClientTasks)
  const upsertClientTask = useStore((s) => s.upsertClientTask)
  const removeClientTask = useStore((s) => s.removeClientTask)

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabase()

    supabase
      .from('client_tasks')
      .select('id,client_id,title,due_date,assignee')
      .eq('done', false)
      .then(({ data }) => { if (!cancelled && data) setClientTasks(data as OpenTask[]) })

    const buildChannel = () => supabase
      .channel('client-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_tasks' }, (payload) => {
        if (cancelled) return
        if (payload.eventType === 'DELETE') removeClientTask((payload.old as { id: string }).id)
        else upsertClientTask(payload.new as ClientTask)
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
  }, [setClientTasks, upsertClientTask, removeClientTask])
}
