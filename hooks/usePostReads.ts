'use client'

import { useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useStore } from './useStore'

/**
 * useMarkPostRead
 * Returns a function to mark a task (post) as seen by the current user — called
 * when they open the task's preview/detail. It clears the unread marker locally
 * right away and persists the seen timestamp to post_reads so the cleared state
 * survives a reload and other tabs.
 */
export function useMarkPostRead() {
  const markPostSeen = useStore((s) => s.markPostSeen)
  const meEmail = useStore((s) => s.meEmail)

  return useCallback((postId: string, lastChangeAt?: string | null) => {
    // Seen "now", but never earlier than the change we're acknowledging — guards
    // against client/server clock skew leaving a just-opened task still marked.
    const base = Date.now()
    const changed = lastChangeAt ? Date.parse(lastChangeAt) : 0
    const at = Number.isNaN(changed) ? base : Math.max(base, changed + 1000)
    markPostSeen(postId, at)
    if (!meEmail) return
    // supabase-js query builders are lazy thenables: the request is only sent
    // once the builder is awaited / `.then()`d. Discarding it with `void` (as
    // before) built the query but never fired it, so post_reads stayed empty and
    // the unread dots reappeared on every refresh. Wrap in Promise.resolve to
    // actually execute it, and surface (don't swallow) any error.
    void Promise.resolve(
      (getSupabase() as unknown as {
        from: (t: string) => { upsert: (v: unknown, o?: unknown) => PromiseLike<{ error: { message: string } | null }> }
      })
        .from('post_reads')
        .upsert(
          { email: meEmail, post_id: postId, seen_at: new Date(at).toISOString() },
          { onConflict: 'email,post_id' },
        ),
    ).then(({ error }) => {
      if (error) console.error('post_reads upsert failed:', error.message)
    })
  }, [markPostSeen, meEmail])
}
