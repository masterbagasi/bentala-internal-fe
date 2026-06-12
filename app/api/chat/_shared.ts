import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { isEffectiveSuperAdmin, canAccessChat, normaliseSections } from '@/lib/access'
/* eslint-disable @typescript-eslint/no-explicit-any */

// Resolve the caller and whether they may access `room`. Shared by the chat
// mutation routes (upload, file, [id], clear). Mirrors the gate in [room]/route.ts.
export async function chatGate(room: string) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const isSuper = isEffectiveSuperAdmin(user.email, (user as any).app_metadata?.role)
  if (isSuper) return { supabase, user, isSuper }
  const { data } = await (supabase as any).from('menu_access').select('sections').limit(1).maybeSingle()
  const allowed = normaliseSections((data as { sections?: unknown } | null)?.sections)
  if (!canAccessChat(allowed, room)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase, user, isSuper }
}
