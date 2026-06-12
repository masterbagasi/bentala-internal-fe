import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { isEffectiveSuperAdmin, canAccessChat, normaliseSections } from '@/lib/access'

/* eslint-disable @typescript-eslint/no-explicit-any */

// POST /api/chat/<room>/read  → mark the room read (last_read_at = now) for caller.
export async function POST(_req: NextRequest, { params }: { params: { room: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isEffectiveSuperAdmin(user.email, user.app_metadata?.role)) {
    const { data } = await (supabase as any).from('menu_access').select('sections').limit(1).maybeSingle()
    const allowed = normaliseSections((data as { sections?: unknown } | null)?.sections)
    if (!canAccessChat(allowed, params.room)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const name = (meta.full_name as string) || (meta.name as string) || user.email.split('@')[0]
  const { error } = await (supabase as any).from('chat_reads')
    .upsert({ email: user.email, room: params.room, name, last_read_at: new Date().toISOString() }, { onConflict: 'email,room' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
