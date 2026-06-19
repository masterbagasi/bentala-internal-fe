'use client'

import { useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { playNotificationSound } from '@/lib/notificationSound'
import { useStore } from './useStore'

/**
 * useChatUnread
 * Keeps the per-room unread chat counts in the store, live. A task is marked
 * when its chat room has new messages from someone else; the mark clears the
 * moment that room is read.
 *
 * The counts are driven STRAIGHT from the realtime payloads — a new message
 * bumps its room, a read clears it — rather than re-fetching /api/chat/unread on
 * every event. That makes the markers update instantly and, crucially, means a
 * slow/stale refetch can't resurrect a marker the user just cleared. The API is
 * only hit once, to seed the initial counts.
 */
export function useChatUnread() {
  const setChatUnread = useStore((s) => s.setChatUnread)
  const bumpChatUnread = useStore((s) => s.bumpChatUnread)
  const clearChatUnread = useStore((s) => s.clearChatUnread)
  const meEmail = useStore((s) => s.meEmail)

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabase() as unknown as import('@supabase/supabase-js').SupabaseClient

    // Seed once (no-store so we never start from a stale cached body).
    fetch('/api/chat/unread', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { counts: {} }))
      .then((d: { counts?: Record<string, number> }) => { if (!cancelled) setChatUnread(d.counts ?? {}) })
      .catch(() => {})

    // The socket must carry the user's JWT BEFORE the channel joins, or these
    // RLS-protected tables deliver nothing.
    let channel: ReturnType<typeof supabase.channel> | null = null
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const token = data.session?.access_token
      if (token) (supabase.realtime as unknown as { setAuth: (t: string) => void }).setAuth(token)

      channel = supabase
        .channel('chat-unread-board')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
          const row = payload.new as { room?: string; author_email?: string | null }
          if (!row?.room) return
          // Don't mark or chime the sender's own messages.
          if (meEmail && (row.author_email ?? '').toLowerCase() === meEmail.toLowerCase()) return
          bumpChatUnread(row.room)
          playNotificationSound()
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads' }, (payload) => {
          const row = (payload.new ?? payload.old) as { email?: string; room?: string }
          if (!row?.room) return
          // Only my own read clears my marker (covers reading on another device).
          if (meEmail && (row.email ?? '').toLowerCase() === meEmail.toLowerCase()) clearChatUnread(row.room)
        })
        .subscribe()
    })

    return () => { cancelled = true; if (channel) supabase.removeChannel(channel) }
  }, [setChatUnread, bumpChatUnread, clearChatUnread, meEmail])
}
