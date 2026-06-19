'use client'

import { useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useStore } from './useStore'
import type { Post, Client, Invoice, Project, Task, ActivityLog } from '@/lib/types'

/**
 * useData
 * Initial data fetch from Supabase — runs once on mount.
 */
export function useData() {
  const {
    setPosts, setClients, setInvoices,
    setProjects, setTasks, setActivity,
    setLoading,
  } = useStore()

  useEffect(() => {
    setLoading(true)
    const supabase = getSupabase()
    let cancelled = false

    // Fire every query independently and commit each slice to the store the
    // moment it resolves, rather than awaiting the slowest one. The light
    // tables (clients/invoices/projects) paint immediately while the heavy
    // posts query is still in flight, so the dashboard is interactive far
    // sooner. `loading` flips off once the heaviest slice (posts) lands.
    const run = <T,>(p: PromiseLike<{ data: T | null }>, apply: (rows: T) => void) =>
      Promise.resolve(p).then(({ data }) => {
        if (!cancelled && data) apply(data)
      })

    run(supabase.from('clients').select('*').order('created_at', { ascending: false }), (d) => setClients(d as Client[]))
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
  }, [setPosts, setClients, setInvoices, setProjects, setTasks, setActivity, setLoading])
}

/**
 * useLogActivity
 * Returns a function to log an activity to Supabase.
 */
export function useLogActivity() {
  const supabase = getSupabase()

  return async (message: string, userName = '') => {
    await supabase.from('activity_log').insert({ message, user_name: userName })
  }
}
