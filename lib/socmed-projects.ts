'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { SocmedProject } from '@/lib/types'

// Cached client fetch for the socmed project registry. Mirrors the /api/accounts
// caching pattern so the sidebar, board cards and management panel share one
// request instead of each hitting the API.
let cache: { at: number; data: SocmedProject[] } | null = null
let inflight: Promise<SocmedProject[]> | null = null
const TTL_MS = 60_000

// Every mounted useSocmedProjects() registers a refetcher here, so a change
// anywhere (create/edit/archive) — or a realtime event from another tab/user —
// refreshes ALL of them at once (sidebar, Add Task dropdown, calendars).
const listeners = new Set<() => void>()
let channel: ReturnType<ReturnType<typeof getSupabase>['channel']> | null = null
let channelRefs = 0

export async function fetchSocmedProjects(force = false): Promise<SocmedProject[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data
  if (!force && inflight) return inflight
  inflight = fetch('/api/socmed-projects')
    .then(r => (r.ok ? r.json() : { projects: [] }))
    .then((d: { projects?: SocmedProject[] }) => {
      const data = d.projects ?? []
      cache = { at: Date.now(), data }
      return data
    })
    .catch(() => cache?.data ?? [])
    .finally(() => { inflight = null })
  return inflight
}

/** Drop the cache so the next fetch re-reads (call after create/edit/archive). */
export function invalidateSocmedProjects() { cache = null }

/** Clear the cache AND tell every live hook to re-fetch now — call this right
 *  after a create/edit/archive so the whole app updates without a refresh. */
export function notifySocmedProjectsChanged() {
  cache = null
  listeners.forEach(fn => { try { fn() } catch { /* ignore */ } })
}

// One shared realtime subscription for the whole app. Created lazily when the
// first hook mounts; any socmed_projects change refreshes every consumer.
function ensureChannel() {
  if (channel) return
  const sb = getSupabase()
  // RLS on socmed_projects scopes realtime to authenticated sockets — set the
  // token before subscribing (same pattern as chat/posts realtime).
  sb.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token
    if (token) (sb.realtime as { setAuth: (t: string) => void }).setAuth(token)
    if (channel) return
    channel = sb
      .channel('socmed-projects')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'socmed_projects' }, () => {
        notifySocmedProjectsChanged()
      })
      .subscribe()
  })
}

/** Hook returning the project list. `activeOnly` filters out archived ones.
 *  Stays live: re-fetches on any create/edit/archive and on realtime events. */
export function useSocmedProjects(activeOnly = true): SocmedProject[] {
  const [projects, setProjects] = useState<SocmedProject[]>(cache?.data ?? [])
  useEffect(() => {
    let cancelled = false
    const load = (force = false) =>
      fetchSocmedProjects(force).then(list => {
        if (!cancelled) setProjects(activeOnly ? list.filter(p => p.active) : list)
      })
    load()

    const listener = () => load(true)
    listeners.add(listener)
    channelRefs += 1
    ensureChannel()

    return () => {
      cancelled = true
      listeners.delete(listener)
      channelRefs -= 1
      if (channelRefs <= 0 && channel) {
        getSupabase().removeChannel(channel)
        channel = null
      }
    }
  }, [activeOnly])
  return projects
}
