'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { HistoryRow } from '@/lib/post-history'

// Unique channel suffix so two usePostHistory() for the same post don't share a
// realtime topic (which would break on the second subscribe).
let phChanSeq = 0

/**
 * usePostHistory
 * Loads a single post's change-log (post_history) and keeps it live — every
 * create / edit / status move / file attach made by anyone appears instantly.
 * Returns rows oldest→newest.
 */
export function usePostHistory(postId: string | null | undefined): HistoryRow[] {
  const [rows, setRows] = useState<HistoryRow[]>([])

  useEffect(() => {
    if (!postId) { setRows([]); return }
    let cancelled = false
    const supabase = getSupabase()

    supabase
      .from('post_history')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setRows((data as HistoryRow[] | null) ?? [])
      })

    // Set the socket JWT before joining — post_history is RLS-protected, so an
    // anon join would receive no live events (the Activity tab would go stale).
    let channel: ReturnType<typeof supabase.channel> | null = null
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const token = data.session?.access_token
      if (token) (supabase.realtime as unknown as { setAuth: (t: string) => void }).setAuth(token)
      channel = supabase
        .channel(`post-history:${postId}:${++phChanSeq}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'post_history', filter: `post_id=eq.${postId}` },
          payload => {
            if (cancelled) return
            const row = payload.new as HistoryRow
            setRows(prev => (prev.some(r => r.id === row.id) ? prev : [...prev, row]))
          },
        )
        .subscribe()
    })

    return () => { cancelled = true; if (channel) supabase.removeChannel(channel) }
  }, [postId])

  return rows
}
