import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/chat/unread → { counts: { <room>: number } } for the caller.
// RLS scopes chat_messages to rooms the caller may access, so a plain query is
// already correct without re-deriving access here.
export async function GET() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: reads }, { data: msgs }] = await Promise.all([
    (supabase as any).from('chat_reads').select('room,last_read_at').eq('email', user.email),
    (supabase as any).from('chat_messages').select('room,created_at,author_email'),
  ])
  const lastRead = new Map<string, string>()
  for (const r of (reads as any[]) ?? []) lastRead.set(r.room, r.last_read_at)
  const counts: Record<string, number> = {}
  for (const m of (msgs as any[]) ?? []) {
    if (m.author_email === user.email) continue            // own messages never unread
    const lr = lastRead.get(m.room)
    if (!lr || m.created_at > lr) counts[m.room] = (counts[m.room] ?? 0) + 1
  }
  return NextResponse.json({ counts })
}
