'use client'

import { useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useStore } from './useStore'
import type { Post, Client, Invoice, Project, Task, ActivityLog, Contact, Deal, CrmProject, CrmTask, CrmInvoice, CrmInvoiceItem } from '@/lib/types'

/**
 * useData
 * Initial data fetch from Supabase — runs once on mount.
 */
export function useData() {
  const {
    setPosts, setClients, setInvoices,
    setProjects, setTasks, setActivity,
    setContacts, setDeals, setCrmProjects, setCrmTasks, setCrmInvoices, setCrmInvoiceItems,
    setLoading, setMeEmail, setMeName, setPostSeen,
  } = useStore()

  useEffect(() => {
    setLoading(true)
    const supabase = getSupabase()
    let cancelled = false

    // Identify the current user (so their own changes are never flagged) and
    // load their per-task "seen" timestamps for the unread-change markers.
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      const u = data.user
      const email = u?.email?.toLowerCase() ?? null
      setMeEmail(email)
      // Name is used alongside email so a name-based last_actor (older/edge
      // changes) is still recognised as "me" and never marked.
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>
      setMeName(((meta.full_name as string) || (meta.name as string) || u?.email?.split('@')[0] || '') || null)
    })
    Promise.resolve(
      (supabase as unknown as { from: (t: string) => { select: (c: string) => PromiseLike<{ data: { post_id: string; seen_at: string }[] | null }> } })
        .from('post_reads').select('post_id,seen_at'),
    ).then(({ data }) => {
      if (cancelled || !data) return
      const map: Record<string, number> = {}
      for (const r of data) map[r.post_id] = Date.parse(r.seen_at)
      setPostSeen(map)
    })

    // Fire every query independently and commit each slice to the store the
    // moment it resolves, rather than awaiting the slowest one. The light
    // tables (clients/invoices/projects) paint immediately while the heavy
    // posts query is still in flight, so the dashboard is interactive far
    // sooner. `loading` flips off once the heaviest slice (posts) lands.
    const run = <T,>(p: PromiseLike<{ data: T | null }>, apply: (rows: T) => void) =>
      Promise.resolve(p).then(({ data }) => {
        if (!cancelled && data) apply(data)
      })

    run(supabase.from('contacts').select('*').order('created_at', { ascending: false }), (d) => setContacts(d as Contact[]))
    run(supabase.from('deals').select('*').order('created_at', { ascending: false }), (d) => setDeals(d as Deal[]))
    run(supabase.from('crm_projects').select('*').order('created_at', { ascending: false }), (d) => setCrmProjects(d as CrmProject[]))
    run(supabase.from('crm_tasks').select('*').order('created_at', { ascending: false }), (d) => setCrmTasks(d as CrmTask[]))
    run(supabase.from('crm_invoices').select('*').order('created_at', { ascending: false }), (d) => setCrmInvoices(d as CrmInvoice[]))
    run(supabase.from('crm_invoice_items').select('*').order('sort_order', { ascending: true }), (d) => setCrmInvoiceItems(d as CrmInvoiceItem[]))
    run(supabase.from('clients').select('*').is('deleted_at', null).order('created_at', { ascending: false }), (d) => setClients(d as Client[]))
    run(supabase.from('invoices').select('*').order('created_at', { ascending: false }), (d) => setInvoices(d as Invoice[]))
    run(supabase.from('projects').select('*').order('created_at', { ascending: false }), (d) => setProjects(d as Project[]))
    run(supabase.from('tasks').select('*').order('created_at', { ascending: false }), (d) => setTasks(d as Task[]))
    run(supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(50), (d) => setActivity(d as ActivityLog[]))
    run(
      supabase.from('posts').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
      (d) => setPosts(d as Post[]),
    ).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [setPosts, setContacts, setDeals, setCrmProjects, setCrmTasks, setCrmInvoices, setCrmInvoiceItems, setClients, setInvoices, setProjects, setTasks, setActivity, setLoading, setMeEmail, setPostSeen])
}

/**
 * useLogActivity
 * Returns a function to log an activity to Supabase.
 */
export function useLogActivity() {
  const supabase = getSupabase()

  return async (message: string, scope?: string, meta?: ActivityLog['meta']) => {
    let name: string | undefined
    {
      // Attribute to whoever performed the action, so the team feed shows their
      // name + photo instead of an anonymous entry. Name derived exactly like
      // /api/accounts (full_name → name → email prefix) so it matches an account.
      const { data } = await supabase.auth.getUser()
      const u = data.user
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>
      name = (meta.full_name as string) || (meta.name as string) || (u?.email?.split('@')[0]) || ''
    }
    // Never write an anonymous row — the feed must always show who acted.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('activity_log').insert({ message, user_name: name || 'Sistem', scope: scope ?? null, meta: meta ?? null })
  }
}
