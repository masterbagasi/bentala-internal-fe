'use client'

import { useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useStore } from './useStore'
import type { Post, Client, Task, ActivityLog, Project, Invoice } from '@/lib/types'

/**
 * useRealtime
 * Subscribes to Supabase realtime changes for posts, tasks, clients,
 * projects, invoices, and activity_log. Automatically updates the Zustand store.
 */
export function useRealtime() {
  const {
    upsertPost,    removePost,
    upsertClient,  removeClient,
    upsertTask,    removeTask,
    upsertProject, removeProject,
    upsertInvoice, removeInvoice,
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

      // Projects — keep the CRM client-360 lists + project views live.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          removeProject(payload.old.id as string)
        } else {
          upsertProject(payload.new as Project)
        }
      })

      // Invoices — keep the CRM client-360 financial summary + invoice views live.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          removeInvoice(payload.old.id as string)
        } else {
          upsertInvoice(payload.new as Invoice)
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
    // updated posts never appear until the user manually refreshes.
    //
    // For RLS-gated postgres_changes the JWT must be on the socket BEFORE the
    // channel subscribes — a setAuth that lands AFTER subscribe does not
    // re-authorize an already-bound subscription, so the board would stay dead
    // (no live posts) for the whole session. On a cold load getSession can
    // resolve before the session has hydrated; building the channel anyway then
    // subscribes as anon and never recovers. So gate the build on a real token
    // and let whichever source delivers it first (getSession OR the auth-state
    // change) create the channel. Subsequent tokens (expiry refresh) just call
    // setAuth on the live socket — no rebuild needed.
    let channel: ReturnType<typeof buildChannel> | null = null
    const ensureChannel = (token: string) => {
      if (cancelled) return
      ;(supabase.realtime as { setAuth: (t: string) => void }).setAuth(token)
      if (!channel) channel = buildChannel()
    }
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token
      if (token) ensureChannel(token)
    })
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) ensureChannel(session.access_token)
    })

    return () => {
      cancelled = true
      authSub.subscription.unsubscribe()
      if (channel) supabase.removeChannel(channel)
    }
  }, [upsertPost, removePost, upsertClient, removeClient, upsertTask, removeTask, upsertProject, removeProject, upsertInvoice, removeInvoice, addActivity])
}
