'use client'

import { useEffect, useRef } from 'react'
import { getSupabase } from '@/lib/supabase'

// Monotonic id so two hook instances watching the SAME table+brand (e.g. the
// connected-gate and AnalyticsView both watching social_connections) get
// distinct channel topics. Same-named channels on one client share a topic, so
// unmounting one would tear down the other's subscription.
let channelSeq = 0

/**
 * useBrandRealtime
 * Subscribe to Postgres changes for one or more tables, scoped to a single
 * brand, and invoke `onChange` whenever a matching row is inserted, updated, or
 * deleted. The Social views use this so connected-account state (the accounts
 * list, connection status, and the logged-in gate) updates live across tabs,
 * devices and users — no manual refresh.
 *
 * Notes:
 *  - The realtime socket must carry the user's JWT or RLS-protected tables
 *    deliver NOTHING. The global useRealtime() already sets it, but we set it
 *    here too so a Social page that mounts in isolation still streams.
 *  - Brand-filtered DELETE/UPDATE events require REPLICA IDENTITY FULL on the
 *    tables (see migration realtime_social_connections) so the old row carries
 *    `brand` for the server-side `brand=eq.X` filter to match.
 *  - `onChange` is held in a ref so callers can pass an inline closure without
 *    re-subscribing on every render; the channel only rebuilds when the brand
 *    or table set changes.
 */
export function useBrandRealtime(
  brand: string | undefined,
  tables: string[],
  onChange: () => void,
) {
  const cb = useRef(onChange)
  useEffect(() => { cb.current = onChange }, [onChange])

  // Stable per-instance suffix, assigned once on first render.
  const instanceId = useRef<number>(0)
  if (instanceId.current === 0) instanceId.current = ++channelSeq

  const tablesKey = tables.join(',')

  useEffect(() => {
    if (!brand) return
    const supabase = getSupabase() as unknown as import('@supabase/supabase-js').SupabaseClient
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const token = data.session?.access_token
      if (token) (supabase.realtime as unknown as { setAuth: (t: string) => void }).setAuth(token)

      let ch = supabase.channel(`brand-${tablesKey}-${brand}-${instanceId.current}`)
      for (const table of tablesKey.split(',')) {
        ch = ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `brand=eq.${brand}` },
          () => cb.current(),
        )
      }
      channel = ch.subscribe()
    })

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [brand, tablesKey])
}
