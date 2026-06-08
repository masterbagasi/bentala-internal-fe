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

    const channel = supabase
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

    return () => {
      supabase.removeChannel(channel)
    }
  }, [upsertPost, removePost, upsertClient, removeClient, upsertTask, removeTask, addActivity])
}
