'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

/**
 * Per-user task status for the "My Task" board. A task you're tagged on is a
 * SHARED post, so its overall `status` belongs to the owner's board — moving it
 * there must not drag your card, and vice-versa. This tracks each account's OWN
 * status per post (table `post_task_status`), scoped to the current user, and
 * kept live over realtime. Only meaningful on My Task; idle when `me` is absent.
 */
export function useMyTaskStatus(me: { email: string } | null | undefined) {
  const email = (me?.email || '').toLowerCase()
  const [statusMap, setStatusMap] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!email) { setStatusMap({}); return }
    let cancelled = false
    const supabase = getSupabase()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any).from('post_task_status').select('post_id, status').eq('email', email)
      .then(({ data }: { data: { post_id: string; status: string }[] | null }) => {
        if (cancelled) return
        const m: Record<string, string> = {}
        ;(data ?? []).forEach((r) => { m[r.post_id] = r.status })
        setStatusMap(m)
      })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apply = (payload: any) => {
      if (cancelled) return
      const row = payload.new ?? payload.old
      if (!row || (row.email || '').toLowerCase() !== email) return
      if (payload.eventType === 'DELETE') {
        setStatusMap((m) => { const n = { ...m }; delete n[row.post_id]; return n })
      } else {
        setStatusMap((m) => ({ ...m, [payload.new.post_id]: payload.new.status }))
      }
    }
    const build = () => (supabase as unknown as { channel: (n: string) => any }).channel('my-task-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_task_status' }, apply)
      .subscribe()
    const ensure = (token: string) => {
      if (cancelled) return
      ;(supabase.realtime as unknown as { setAuth: (t: string) => void }).setAuth(token)
      if (!channel) channel = build()
    }
    supabase.auth.getSession().then(({ data }) => { const tok = data.session?.access_token; if (tok) ensure(tok) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (s?.access_token) ensure(s.access_token) })

    return () => { cancelled = true; sub.subscription.unsubscribe(); if (channel) supabase.removeChannel(channel) }
  }, [email])

  const setStatus = async (postId: string, status: string) => {
    if (!email) return
    setStatusMap((m) => ({ ...m, [postId]: status })) // optimistic
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (getSupabase() as any)
      .from('post_task_status')
      .upsert({ post_id: postId, email, status, updated_at: new Date().toISOString() }, { onConflict: 'post_id,email' })
  }

  return { statusMap, setStatus }
}

/**
 * EVERY account's per-task status, keyed post_id → { email → status }. Powers the
 * per-assignee status chips on the My Task board (so the creator can see where
 * each tagged account is). Loads all rows once and stays live over realtime.
 * `enabled` gates it to the boards that need it (idle otherwise).
 */
export function useAllTaskStatuses(enabled: boolean) {
  const [map, setMap] = useState<Record<string, Record<string, string>>>({})

  useEffect(() => {
    if (!enabled) { setMap({}); return }
    let cancelled = false
    const supabase = getSupabase()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any).from('post_task_status').select('post_id, email, status')
      .then(({ data }: { data: { post_id: string; email: string; status: string }[] | null }) => {
        if (cancelled) return
        const m: Record<string, Record<string, string>> = {}
        ;(data ?? []).forEach((r) => {
          const em = (r.email || '').toLowerCase()
          ;(m[r.post_id] ??= {})[em] = r.status
        })
        setMap(m)
      })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apply = (payload: any) => {
      if (cancelled) return
      const row = payload.new ?? payload.old
      if (!row) return
      const pid = row.post_id as string
      const em = (row.email || '').toLowerCase()
      setMap((prev) => {
        const inner = { ...(prev[pid] ?? {}) }
        if (payload.eventType === 'DELETE') delete inner[em]
        else inner[em] = payload.new.status
        const next = { ...prev }
        if (Object.keys(inner).length) next[pid] = inner
        else delete next[pid]
        return next
      })
    }
    const build = () => (supabase as unknown as { channel: (n: string) => any }).channel('all-task-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_task_status' }, apply)
      .subscribe()
    const ensure = (token: string) => {
      if (cancelled) return
      ;(supabase.realtime as unknown as { setAuth: (t: string) => void }).setAuth(token)
      if (!channel) channel = build()
    }
    supabase.auth.getSession().then(({ data }) => { const tok = data.session?.access_token; if (tok) ensure(tok) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (s?.access_token) ensure(s.access_token) })

    return () => { cancelled = true; sub.subscription.unsubscribe(); if (channel) supabase.removeChannel(channel) }
  }, [enabled])

  return map
}
