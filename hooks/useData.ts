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
    async function fetchAll() {
      setLoading(true)
      const supabase = getSupabase()

      const [
        { data: posts },
        { data: clients },
        { data: invoices },
        { data: projects },
        { data: tasks },
        { data: activity },
      ] = await Promise.all([
        supabase.from('posts').select('*').order('created_at', { ascending: false }),
        supabase.from('clients').select('*').order('created_at', { ascending: false }),
        supabase.from('invoices').select('*').order('created_at', { ascending: false }),
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
        supabase.from('tasks').select('*').order('created_at', { ascending: false }),
        supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(50),
      ])

      if (posts)    setPosts(posts as Post[])
      if (clients)  setClients(clients as Client[])
      if (invoices) setInvoices(invoices as Invoice[])
      if (projects) setProjects(projects as Project[])
      if (tasks)    setTasks(tasks as Task[])
      if (activity) setActivity(activity as ActivityLog[])

      setLoading(false)
    }

    fetchAll()
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
