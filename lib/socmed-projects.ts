'use client'

import { useEffect, useState } from 'react'
import type { SocmedProject } from '@/lib/types'

// Cached client fetch for the socmed project registry. Mirrors the /api/accounts
// caching pattern so the sidebar, board cards and management panel share one
// request instead of each hitting the API.
let cache: { at: number; data: SocmedProject[] } | null = null
let inflight: Promise<SocmedProject[]> | null = null
const TTL_MS = 60_000

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

/** Hook returning the project list. `activeOnly` filters out archived ones. */
export function useSocmedProjects(activeOnly = true): SocmedProject[] {
  const [projects, setProjects] = useState<SocmedProject[]>(cache?.data ?? [])
  useEffect(() => {
    let cancelled = false
    fetchSocmedProjects().then(list => {
      if (!cancelled) setProjects(activeOnly ? list.filter(p => p.active) : list)
    })
    return () => { cancelled = true }
  }, [activeOnly])
  return projects
}
