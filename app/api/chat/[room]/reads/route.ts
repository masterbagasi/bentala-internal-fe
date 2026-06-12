import { NextRequest, NextResponse } from 'next/server'
import { chatGate } from '../../_shared'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/chat/<room>/reads → every member's read marker for this room. Uses
// the service role (after chatGate authorizes room access) so it works without
// a chat_reads SELECT policy. Names are resolved client-side from messages.
export async function GET(_req: NextRequest, { params }: { params: { room: string } }) {
  const g = await chatGate(params.room)
  if ('error' in g) return g.error
  const admin = createSupabaseAdmin() as any
  const { data, error } = await admin.from('chat_reads')
    .select('email, last_read_at').eq('room', params.room)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reads: data ?? [] })
}
