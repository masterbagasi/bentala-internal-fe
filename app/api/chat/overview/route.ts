import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/chat/overview → per-room summary for the caller:
//   { rooms: { <room>: { lastBody, lastAt, lastAuthorEmail, lastAuthorName,
//                         lastIsAttachment, unread } } }
// RLS scopes chat_messages / chat_reads to rooms the caller may access, so a
// plain query is already correct without re-deriving access here. Mirrors
// /api/chat/unread but also carries the last message for the room list preview.
export async function GET() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const meLower = user.email.toLowerCase()

  const [{ data: reads }, { data: msgs }] = await Promise.all([
    (supabase as any).from('chat_reads').select('room,last_read_at').eq('email', user.email),
    (supabase as any).from('chat_messages')
      .select('room,body,attachment_name,attachment_type,created_at,author_email,author_name,mentions')
      .order('created_at', { ascending: true }),
  ])

  const lastRead = new Map<string, string>()
  for (const r of (reads as any[]) ?? []) lastRead.set(r.room, r.last_read_at)

  type Row = {
    lastBody: string; lastAt: string | null; lastAuthorEmail: string
    lastAuthorName: string; lastIsAttachment: boolean; unread: number; mentions: number
  }
  const rooms: Record<string, Row> = {}
  const blank = (): Row => ({ lastBody: '', lastAt: null, lastAuthorEmail: '', lastAuthorName: '', lastIsAttachment: false, unread: 0, mentions: 0 })
  // Ascending order → the final overwrite per room is its newest message.
  for (const m of (msgs as any[]) ?? []) {
    const r = (rooms[m.room] ??= blank())
    r.lastBody = (m.body as string) ?? ''
    r.lastAt = m.created_at
    r.lastAuthorEmail = (m.author_email as string) ?? ''
    r.lastAuthorName = (m.author_name as string) ?? ''
    r.lastIsAttachment = !!m.attachment_name
    if (m.author_email !== user.email) {
      const lr = lastRead.get(m.room)
      if (!lr || m.created_at > lr) {
        r.unread += 1
        if (((m.mentions as string[]) ?? []).map(x => x.toLowerCase()).includes(meLower)) r.mentions += 1
      }
    }
  }

  return NextResponse.json({ rooms })
}
