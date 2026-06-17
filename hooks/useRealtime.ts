'use client'

import { useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useStore } from './useStore'
import type { Post, Client, Task, ActivityLog } from '@/lib/types'

/**
 * useRealtime
 * Subscribes to Supabase realtime changes for posts, tasks, clients,
 * and activity_log. Automatically updates the Zustand store.
 */
export function useRealtime() {
  const {
    upsertPost,   removePost,
    upsertClient, removeClient,
    upsertTask,   removeTask,
    addActivity,
  } = useStore()

  useEffect(() => {
    const supabase = getSupabase()
    let cancelled = false

    const buildChannel = () => supabase
      .channel('bentala-realtime')

      // Posts
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          removePost(payload.old.id as string)
        } else {
          const np = payload.new as Post
          // Soft-deleted posts drop out of the board; restores (deleted_at
          // cleared) flow back in as a normal upsert.
          if (np.deleted_at) removePost(np.id)
          else upsertPost(np)
        }
      })

      // Clients
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          removeClient(payload.old.id as string)
        } else {
          upsertClient(payload.new as Client)
        }
      })

      // Tasks
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          removeTask(payload.old.id as string)
        } else {
          upsertTask(payload.new as Task)
        }
      })

      // Activity
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, (payload) => {
        addActivity(payload.new as ActivityLog)
      })

      .subscribe()

    // CRITICAL: posts / tasks / clients RLS is authenticated-only. Supabase
    // realtime only delivers change-events when the socket carries the user's
    // JWT. Without setAuth the socket is anon and receives NOTHING, so new or
    // updated posts never appear until the user manually refreshes. Set the
    // token BEFORE subscribing, and refresh it on every auth change (token
    // expiry) so the live stream never silently goes stale.
    let channel: ReturnType<typeof buildChannel> | null = null
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const token = data.session?.access_token
      if (token) (supabase.realtime as { setAuth: (t: string) => void }).setAuth(token)
      channel = buildChannel()
    })
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) (supabase.realtime as { setAuth: (t: string) => void }).setAuth(session.access_token)
    })

    return () => {
      cancelled = true
      authSub.subscription.unsubscribe()
      if (channel) supabase.removeChannel(channel)
    }
  }, [upsertPost, removePost, upsertClient, removeClient, upsertTask, removeTask, addActivity])
}
