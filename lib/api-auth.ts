import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { isEffectiveSuperAdmin, normaliseSections } from '@/lib/access'
/* eslint-disable @typescript-eslint/no-explicit-any */

// Server-side API guards. Use these in route handlers that touch the service-role
// (admin) client, since those bypass RLS and the middleware does NOT section-gate
// /api paths — it only blocks unauthenticated users. Always re-check here.

/** Require an authenticated user. Returns the email or a 401 response. */
export async function requireUser(): Promise<{ email: string } | NextResponse> {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return { email: user.email }
}

/** Require super admin (hardcoded email or promoted role). Returns email or 403. */
export async function requireSuperAdmin(): Promise<{ email: string } | NextResponse> {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isEffectiveSuperAdmin(user.email, (user as any).app_metadata?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return { email: user.email }
}

/** Require super admin OR a specific granted section. Returns email or 401/403. */
export async function requireSectionOrSuper(section: string): Promise<{ email: string } | NextResponse> {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isEffectiveSuperAdmin(user.email, (user as any).app_metadata?.role)) return { email: user.email }
  const { data } = await (supabase as any).from('menu_access').select('sections').limit(1).maybeSingle()
  const allowed = normaliseSections((data as { sections?: unknown } | null)?.sections)
  if (!allowed.includes(section)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return { email: user.email }
}
