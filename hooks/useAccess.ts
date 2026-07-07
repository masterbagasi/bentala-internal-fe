'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { isEffectiveSuperAdmin, normaliseSections, isPersonalOnly } from '@/lib/access'

// Unique realtime channel name per hook instance. Several components can mount
// useAccess at once (Sidebar + a page), and two channels sharing a name make
// Supabase throw "subscribe multiple times", so each gets its own topic.
let accessChannelSeq = 0

export interface AccessState {
  /** True until the first resolution completes — render nothing gated meanwhile. */
  loading: boolean
  /** May manage access + reach the Manage-Access escape hatch. */
  isSuper: boolean
  /** Super admin with NO menu_access row yet → sees everything (not configured). */
  fullBypass: boolean
  /** Granular grant ids this account holds (normalised). */
  allowed: Set<string>
  /** Caller's lowercased email, or null. */
  meEmail: string | null
  /** No general Dashboard and no project board access → home is the personal
   *  My Task dashboard. Always false for a fullBypass super (sees everything). */
  personalOnly: boolean
}

/**
 * Resolve the caller's per-account menu access, live. Mirrors the DENY-by-default
 * gate in middleware.ts, and re-resolves on realtime `menu_access` changes so a
 * grant edit updates the UI with no reload. Shared by the Sidebar, the My Task
 * page, and the personal dashboard route so they can never disagree.
 */
export function useAccess(): AccessState {
  const [state, setState] = useState<AccessState>({
    loading: true, isSuper: false, fullBypass: false,
    allowed: new Set(), meEmail: null, personalOnly: false,
  })

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabase()
    const channelName = `menu-access:self:${accessChannelSeq++}`

    const loadAccess = async () => {
      const { data } = await supabase.auth.getUser()
      const email = data.user?.email
      const meEmail = (email ?? '').toLowerCase() || null
      const isSuper = isEffectiveSuperAdmin(email, data.user?.app_metadata?.role)
      let row: { sections?: unknown } | null = null
      try {
        const res = await supabase.from('menu_access').select('sections').limit(1).maybeSingle()
        row = (res.data as { sections?: unknown } | null) ?? null
      } catch {
        row = null
      }
      // Super admin not yet configured (no row) → full access; otherwise gated by
      // their own grants like everyone else.
      const fullBypass = isSuper && row === null
      const allowed = new Set(normaliseSections(row?.sections))
      // A fullBypass super sees everything, so it's never "personal-only".
      const personalOnly = !fullBypass && isPersonalOnly(allowed)
      if (!cancelled) setState({ loading: false, isSuper, fullBypass, allowed, meEmail, personalOnly })
    }

    loadAccess()

    // Realtime: when an admin saves new grants for THIS account, re-evaluate
    // immediately. menu_access RLS scopes to the caller's own row, so only their
    // change arrives. setAuth is required for the socket to receive RLS events.
    let channel: ReturnType<typeof supabase.channel> | null = null
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const token = data.session?.access_token
      if (token) (supabase.realtime as { setAuth: (t: string) => void }).setAuth(token)
      channel = supabase
        .channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_access' }, () => loadAccess())
        .subscribe()
    })
    const authSub = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.access_token) (supabase.realtime as { setAuth: (t: string) => void }).setAuth(s.access_token)
    })

    return () => {
      cancelled = true
      authSub.data.subscription.unsubscribe()
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  return state
}
