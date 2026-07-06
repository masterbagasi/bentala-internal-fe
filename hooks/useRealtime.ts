'use client'

import { useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useStore } from './useStore'
import type { Post, Client, Task, ActivityLog, Project, Invoice, Contact, Deal, CrmProject, CrmTask, CrmInvoice, CrmInvoiceItem } from '@/lib/types'

/**
 * useRealtime
 * Subscribes to Supabase realtime changes for posts, tasks, clients,
 * projects, invoices, and activity_log. Automatically updates the Zustand store.
 */
export function useRealtime() {
  const {
    upsertPost,    removePost,
    upsertContact, removeContact,
    upsertDeal,    removeDeal,
    upsertCrmProject, removeCrmProject,
    upsertCrmTask,    removeCrmTask,
    upsertCrmInvoice, removeCrmInvoice,
    upsertCrmInvoiceItem, removeCrmInvoiceItem,
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

      // Contacts (CRM v2 master data)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, (payload) => {
        if (payload.eventType === 'DELETE') removeContact(payload.old.id as string)
        else upsertContact(payload.new as Contact)
      })

      // Deals (CRM v2 pipeline)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, (payload) => {
        if (payload.eventType === 'DELETE') removeDeal(payload.old.id as string)
        else upsertDeal(payload.new as Deal)
      })

      // CRM projects + tasks
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_projects' }, (payload) => {
        if (payload.eventType === 'DELETE') removeCrmProject(payload.old.id as string)
        else upsertCrmProject(payload.new as CrmProject)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_tasks' }, (payload) => {
        if (payload.eventType === 'DELETE') removeCrmTask(payload.old.id as string)
        else upsertCrmTask(payload.new as CrmTask)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_invoices' }, (payload) => {
        if (payload.eventType === 'DELETE') removeCrmInvoice(payload.old.id as string)
        else upsertCrmInvoice(payload.new as CrmInvoice)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_invoice_items' }, (payload) => {
        if (payload.eventType === 'DELETE') removeCrmInvoiceItem(payload.old.id as string)
        else upsertCrmInvoiceItem(payload.new as CrmInvoiceItem)
      })

      // Clients
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          removeClient(payload.old.id as string)
        } else {
          const nc = payload.new as Client & { deleted_at?: string | null }
          // Soft-deleted clients drop out of the pipeline; a restore (deleted_at
          // cleared) flows back in as a normal upsert.
          if (nc.deleted_at) removeClient(nc.id)
          else upsertClient(nc)
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
  }, [upsertPost, removePost, upsertContact, removeContact, upsertDeal, removeDeal, upsertCrmProject, removeCrmProject, upsertCrmTask, removeCrmTask, upsertCrmInvoice, removeCrmInvoice, upsertCrmInvoiceItem, removeCrmInvoiceItem, upsertClient, removeClient, upsertTask, removeTask, upsertProject, removeProject, upsertInvoice, removeInvoice, addActivity])
}
