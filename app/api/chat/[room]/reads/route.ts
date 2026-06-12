import { NextRequest, NextResponse } from 'next/server'
import { chatGate } from '../../_shared'
/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/chat/<room>/reads → every member's read marker for this room, so the
// UI can show who has read up to which message. RLS (chat_reads_select) scopes
// this to rooms the caller may access.
export async function GET(_req: NextRequest, { params }: { params: { room: string } }) {
  const g = await chatGate(params.room)
  if ('error' in g) return g.error
  const { data, error } = await (g.supabase as any).from('chat_reads')
    .select('email, name, last_read_at').eq('room', params.room)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reads: data ?? [] })
}
