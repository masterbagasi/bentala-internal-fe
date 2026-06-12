import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { isEffectiveSuperAdmin, canAccessChat, normaliseSections } from '@/lib/access'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Resolve the caller, and whether they may access `room`.
async function gate(room: string) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (isEffectiveSuperAdmin(user.email, user.app_metadata?.role)) return { supabase, user }
  const { data } = await (supabase as any).from('menu_access').select('sections').limit(1).maybeSingle()
  const allowed = normaliseSections((data as { sections?: unknown } | null)?.sections)
  if (!canAccessChat(allowed, room)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase, user }
}

function displayName(user: any): string {
  const m = (user.user_metadata ?? {}) as Record<string, unknown>
  return (m.full_name as string) || (m.name as string) || (user.email as string).split('@')[0]
}

// GET /api/chat/<room>?before=<iso>&limit=50  → messages ascending.
export async function GET(req: NextRequest, { params }: { params: { room: string } }) {
  const g = await gate(params.room)
  if ('error' in g) return g.error
  const url = new URL(req.url)
  const before = url.searchParams.get('before')
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100)
  let q = (g.supabase as any).from('chat_messages').select('*').eq('room', params.room)
    .order('created_at', { ascending: false }).limit(limit)
  if (before) q = q.lt('created_at', before)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Return ascending for the UI.
  return NextResponse.json({ messages: ((data as any[]) ?? []).reverse() })
}

// POST /api/chat/<room>  { body }  → inserts a message authored by the caller.
export async function POST(req: NextRequest, { params }: { params: { room: string } }) {
  const g = await gate(params.room)
  if ('error' in g) return g.error
  const payload = await req.json().catch(() => ({}))
  const text = String(payload.body ?? '').trim()
  const hasAttachment = typeof payload.attachment_path === 'string' && payload.attachment_path.length > 0
  if (!text && !hasAttachment) return NextResponse.json({ error: 'empty' }, { status: 400 })
  const row: Record<string, unknown> = {
    room: params.room,
    author_email: g.user.email,
    author_name: displayName(g.user),
    body: text.slice(0, 4000),
  }
  if (hasAttachment) {
    row.attachment_path = String(payload.attachment_path).slice(0, 500)
    row.attachment_name = String(payload.attachment_name ?? 'file').slice(0, 255)
    row.attachment_type = String(payload.attachment_type ?? 'application/octet-stream').slice(0, 128)
    row.attachment_size = Number(payload.attachment_size) || 0
  }
  const { data, error } = await (g.supabase as any).from('chat_messages').insert(row).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: data })
}
